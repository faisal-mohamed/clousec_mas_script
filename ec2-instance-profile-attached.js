const {
    EC2Client,
    RunInstancesCommand,
    TerminateInstancesCommand,
    DescribeInstancesCommand,
    AssociateIamInstanceProfileCommand,
    DescribeIamInstanceProfileAssociationsCommand
} = require("@aws-sdk/client-ec2");

const {
    IAMClient,
    CreateRoleCommand,
    CreateInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    DeleteRoleCommand,
    DeleteInstanceProfileCommand,
    RemoveRoleFromInstanceProfileCommand,
    GetInstanceProfileCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize AWS client
const getClient = (ClientType) => {
    try {
        const credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        };

        const config = {
            credentials: credentials,
            region: process.env.AWS_REGION || 'ap-southeast-1'
        };

        return new ClientType(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create EC2 instance without instance profile
const createNonCompliantInstance = async () => {
    const client = getClient(EC2Client);

    try {
        console.log('Creating EC2 instance without instance profile...');
        
        const response = await client.send(
            new RunInstancesCommand({
                ImageId: `${process.env.EC2_AMI_ID}`, // Amazon Linux 2023 AMI (adjust for your region)
                InstanceType: 't2.micro',
                MinCount: 1,
                MaxCount: 1,
                TagSpecifications: [
                    {
                        ResourceType: 'instance',
                        Tags: [
                            {
                                Key: 'Name',
                                Value: 'NonCompliant-NoInstanceProfile'
                            },
                            {
                                Key: 'Purpose',
                                Value: 'CISBenchmarkTesting'
                            }
                        ]
                    }
                ]
            })
        );

        const instanceId = response.Instances[0].InstanceId;
        console.log(`Instance created with ID: ${instanceId}`);
        
        await waitForInstanceStatus(instanceId, 'running');
        return instanceId;
    } catch (error) {
        console.error('Error creating EC2 instance:', error);
        throw error;
    }
};

// Create IAM role and instance profile (for demonstration)
const createRoleAndProfile = async () => {
    const client = getClient(IAMClient);
    const roleName = `demo-role-${Date.now()}`;
    const profileName = `demo-profile-${Date.now()}`;

    try {
        console.log('\nCreating IAM role and instance profile...');

        // Create IAM role
        await client.send(
            new CreateRoleCommand({
                RoleName: roleName,
                AssumeRolePolicyDocument: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Allow',
                            Principal: {
                                Service: 'ec2.amazonaws.com'
                            },
                            Action: 'sts:AssumeRole'
                        }
                    ]
                }),
                Description: 'Demo role for CIS benchmark testing'
            })
        );

        // Create instance profile
        await client.send(
            new CreateInstanceProfileCommand({
                InstanceProfileName: profileName
            })
        );

        // Add role to instance profile
        await client.send(
            new AddRoleToInstanceProfileCommand({
                InstanceProfileName: profileName,
                RoleName: roleName
            })
        );

        // Wait for instance profile to be ready
        await waitForInstanceProfile(profileName);

        return { roleName, profileName };
    } catch (error) {
        console.error('Error creating role and profile:', error);
        throw error;
    }
};

// Wait for instance profile to be ready
const waitForInstanceProfile = async (profileName, retries = 10) => {
    const client = getClient(IAMClient);
    
    for (let i = 0; i < retries; i++) {
        try {
            await client.send(
                new GetInstanceProfileCommand({
                    InstanceProfileName: profileName
                })
            );
            return;
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
};

// Wait for instance status
const waitForInstanceStatus = async (instanceId, targetState, timeoutMinutes = 5) => {
    const client = getClient(EC2Client);
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    console.log(`Waiting up to ${timeoutMinutes} minutes for instance ${instanceId} to be ${targetState}...`);

    while (true) {
        try {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Timeout waiting for instance status ${targetState}`);
            }

            const response = await client.send(
                new DescribeInstancesCommand({
                    InstanceIds: [instanceId]
                })
            );

            const state = response.Reservations[0]?.Instances[0]?.State?.Name;
            console.log(`Current state: ${state}`);

            if (state === targetState) {
                break;
            }

            // Wait 10 seconds before next check
            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            if (error.name === 'InvalidInstanceID.NotFound' && targetState === 'terminated') {
                console.log('Instance terminated successfully');
                break;
            }
            throw error;
        }
    }
};

// Check instance profile status
const checkInstanceProfileStatus = async (instanceId) => {
    const client = getClient(EC2Client);
    try {
        const response = await client.send(
            new DescribeIamInstanceProfileAssociationsCommand({
                Filters: [
                    {
                        Name: 'instance-id',
                        Values: [instanceId]
                    }
                ]
            })
        );

        console.log('\nInstance Profile Status:');
        console.log('----------------------');
        if (response.IamInstanceProfileAssociations?.length > 0) {
            const association = response.IamInstanceProfileAssociations[0];
            console.log(`Profile ARN: ${association.IamInstanceProfile.Arn}`);
            console.log(`Association State: ${association.State}`);
        } else {
            console.log('No instance profile attached (Non-compliant)');
        }

        console.log('\nNon-compliant configuration:');
        console.log('- EC2 instance has no IAM instance profile attached');
        console.log('- This violates the principle of least privilege');
        console.log('- Instance cannot assume any IAM role for AWS service access');
    } catch (error) {
        console.error('Error checking instance profile status:', error);
    }
};

// Cleanup resources
const cleanup = async (instanceId, roleName, profileName) => {
    const ec2Client = getClient(EC2Client);
    const iamClient = getClient(IAMClient);

    try {
        console.log('\nStarting cleanup...');

        // Terminate EC2 instance
        if (instanceId) {
            console.log(`Terminating EC2 instance: ${instanceId}`);
            await ec2Client.send(
                new TerminateInstancesCommand({
                    InstanceIds: [instanceId]
                })
            );
            await waitForInstanceStatus(instanceId, 'terminated');
        }

        // Clean up IAM resources
        if (roleName && profileName) {
            console.log('Cleaning up IAM resources...');
            
            try {
                // Remove role from instance profile
                await iamClient.send(
                    new RemoveRoleFromInstanceProfileCommand({
                        InstanceProfileName: profileName,
                        RoleName: roleName
                    })
                );
            } catch (error) {
                console.log('Role already removed from profile or not found');
            }

            try {
                // Delete instance profile
                await iamClient.send(
                    new DeleteInstanceProfileCommand({
                        InstanceProfileName: profileName
                    })
                );
            } catch (error) {
                console.log('Instance profile already deleted or not found');
            }

            try {
                // Delete role
                await iamClient.send(
                    new DeleteRoleCommand({
                        RoleName: roleName
                    })
                );
            } catch (error) {
                console.log('Role already deleted or not found');
            }
        }

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let instanceId;
    let roleName;
    let profileName;

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_ACCOUNT_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Create non-compliant instance
        instanceId = await createNonCompliantInstance();

        // Create role and profile (but don't attach them)
        const roleProfile = await createRoleAndProfile();
        roleName = roleProfile.roleName;
        profileName = roleProfile.profileName;

        // Check and display instance profile status
        await checkInstanceProfileStatus(instanceId);

        // Wait period to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        try {
            await cleanup(instanceId, roleName, profileName);
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
};

// Run the program
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
