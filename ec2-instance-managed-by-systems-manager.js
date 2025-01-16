// const { 
//     EC2Client, 
//     RunInstancesCommand, 
//     TerminateInstancesCommand,
//     DescribeInstancesCommand,
//     CreateTagsCommand
// } = require("@aws-sdk/client-ec2");

// const { 
//     SSMClient,
//     DescribeInstanceInformationCommand
// } = require("@aws-sdk/client-ssm");

// const { 
//     STSClient, 
//     GetCallerIdentityCommand 
// } = require("@aws-sdk/client-sts");

// const { 
//     IAMClient,
//     CreateRoleCommand,
//     DeleteRoleCommand,
//     PutRolePolicyCommand,
//     DeleteRolePolicyCommand,
//     AttachRolePolicyCommand,
//     DetachRolePolicyCommand
// } = require("@aws-sdk/client-iam");

// require('dotenv').config();

// const createAwsClient = (ClientClass) => {
//     return new ClientClass({
//         region: process.env.AWS_REGION || 'us-east-1',
//         credentials: {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         }
//     });
// };

// async function waitForInstance(ec2Client, instanceId, targetState) {
//     console.log(`Waiting for instance ${instanceId} to be ${targetState}...`);
    
//     while (true) {
//         const describeCommand = new DescribeInstancesCommand({
//             InstanceIds: [instanceId]
//         });
        
//         const response = await ec2Client.send(describeCommand);
//         const state = response.Reservations[0].Instances[0].State.Name;
        
//         if (state === targetState) {
//             break;
//         }
        
//         await new Promise(resolve => setTimeout(resolve, 5000));
//     }
// }

// async function checkSSMManagement(ssmClient, instanceId) {
//     try {
//         const command = new DescribeInstanceInformationCommand({
//             Filters: [{
//                 Key: 'InstanceIds',
//                 Values: [instanceId]
//             }]
//         });
        
//         const response = await ssmClient.send(command);
//         return response.InstanceInformationList.length > 0;
//     } catch (error) {
//         console.log('Error checking SSM management status:', error);
//         return false;
//     }
// }

// async function createIAMRole(iamClient, roleName) {
//     const assumeRolePolicy = {
//         Version: '2012-10-17',
//         Statement: [{
//             Effect: 'Allow',
//             Principal: {
//                 Service: 'ec2.amazonaws.com'
//             },
//             Action: 'sts:AssumeRole'
//         }]
//     };

//     try {
//         // Create role
//         await iamClient.send(new CreateRoleCommand({
//             RoleName: roleName,
//             AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
//         }));

//         // Attach SSM policy (but we'll intentionally not attach it for non-compliance)
//         // In a compliant setup, you would attach AmazonSSMManagedInstanceCore
        
//         return true;
//     } catch (error) {
//         console.error('Error creating IAM role:', error);
//         throw error;
//     }
// }

// async function cleanupIAMRole(iamClient, roleName) {
//     try {
//         // Detach policies if any were attached
//         try {
//             await iamClient.send(new DetachRolePolicyCommand({
//                 RoleName: roleName,
//                 PolicyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
//             }));
//         } catch (error) {
//             // Ignore policy detachment errors
//         }

//         // Delete role
//         await iamClient.send(new DeleteRoleCommand({
//             RoleName: roleName
//         }));
//     } catch (error) {
//         console.error('Error cleaning up IAM role:', error);
//     }
// }

// async function simulateNonCompliance() {
//     const ec2Client = createAwsClient(EC2Client);
//     const ssmClient = createAwsClient(SSMClient);
//     const iamClient = createAwsClient(IAMClient);
    
//     const instanceName = 'non-compliant-ssm-instance';
//     const roleName = 'non-compliant-ssm-role';
//     let instanceId;

//     try {
//         console.log('Starting simulation for ec2-instance-managed-by-systems-manager...');

//         // Create IAM role without SSM permissions (non-compliant)
//         console.log('Creating IAM role without SSM permissions...');
//         await createIAMRole(iamClient, roleName);

//         // Launch EC2 instance without SSM agent
//         // Using Amazon Linux 2 AMI but without proper SSM configuration
//         const runInstancesParams = {
//             ImageId: 'ami-0e48a8a6b7dc1d30b', // Amazon Linux 2 AMI ID (update for your region)
//             InstanceType: 't2.micro',
//             MinCount: 1,
//             MaxCount: 1,
//             TagSpecifications: [{
//                 ResourceType: 'instance',
//                 Tags: [{
//                     Key: 'Name',
//                     Value: instanceName
//                 }]
//             }]
//             // Intentionally not adding IAM role or user data for SSM
//         };

//         console.log('Launching non-compliant EC2 instance...');
//         const runInstanceResponse = await ec2Client.send(new RunInstancesCommand(runInstancesParams));
//         instanceId = runInstanceResponse.Instances[0].InstanceId;

//         // Wait for instance to be running
//         await waitForInstance(ec2Client, instanceId, 'running');
//         console.log(`Instance ${instanceId} is running`);

//         // Check SSM management status
//         const isManaged = await checkSSMManagement(ssmClient, instanceId);
        
//         console.log('\nNon-compliant state verification:');
//         console.log(`- Instance ID: ${instanceId}`);
//         console.log(`- SSM Management Status: ${isManaged ? 'Managed (Unexpected)' : 'Not Managed (Expected)'}`);
//         console.log('- Instance launched without SSM agent configuration');
//         console.log('- This violates the CIS benchmark requirement');

//     } catch (error) {
//         console.error('Error during simulation:', error);
//         throw error;
//     } finally {
//         // Cleanup
//         console.log('\nCleaning up resources...');
//         try {
//             if (instanceId) {
//                 console.log(`Terminating instance ${instanceId}...`);
//                 await ec2Client.send(new TerminateInstancesCommand({
//                     InstanceIds: [instanceId]
//                 }));
//                 await waitForInstance(ec2Client, instanceId, 'terminated');
//             }
//             await cleanupIAMRole(iamClient, roleName);
//             console.log('Cleanup completed successfully');
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// }

// async function main() {
//     try {
//         // Verify credentials
//         const stsClient = createAwsClient(STSClient);
//         const identity = await stsClient.send(new GetCallerIdentityCommand({}));
//         console.log('Credentials verified for account:', identity.Account);

//         // Run simulation
//         await simulateNonCompliance();
//     } catch (error) {
//         console.error('Error in main execution:', error);
//         process.exit(1);
//     }
// }

// main().catch(console.error);





const { 
    EC2Client, 
    RunInstancesCommand, 
    TerminateInstancesCommand,
    DescribeInstancesCommand,
    ModifyInstanceAttributeCommand
} = require("@aws-sdk/client-ec2");

const { 
    IAMClient,
    CreateRoleCommand,
    DeleteRoleCommand,
    AttachRolePolicyCommand,
    DetachRolePolicyCommand,
    CreateInstanceProfileCommand,
    DeleteInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    RemoveRoleFromInstanceProfileCommand
} = require("@aws-sdk/client-iam");

const { 
    SSMClient, 
    DescribeInstanceInformationCommand 
} = require("@aws-sdk/client-ssm");

require('dotenv').config();

// Configuration
const CONFIG = {
    EC2: {
        INSTANCE_TYPE: 't2.micro',
        INSTANCE_NAME: 'test-ssm-non-compliant-2'
    },
    IAM: {
        ROLE_NAME: 'test-ssm-role-2',
        // Intentionally not using SSM policy to create non-compliant state
        BASIC_POLICY_ARN: 'arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM'
    }
};

const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

async function createIAMRole(iamClient) {
    const assumeRolePolicy = {
        Version: '2012-10-17',
        Statement: [{
            Effect: 'Allow',
            Principal: {
                Service: 'ec2.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
        }]
    };

    try {
        // Create role without SSM permissions
        await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.IAM.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
        }));

        // Create instance profile
        await iamClient.send(new CreateInstanceProfileCommand({
            InstanceProfileName: CONFIG.IAM.ROLE_NAME
        }));

        // Add role to instance profile
        await iamClient.send(new AddRoleToInstanceProfileCommand({
            InstanceProfileName: CONFIG.IAM.ROLE_NAME,
            RoleName: CONFIG.IAM.ROLE_NAME
        }));

        // Wait for role and instance profile to propagate
        await new Promise(resolve => setTimeout(resolve, 10000));

        return CONFIG.IAM.ROLE_NAME;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
}

async function waitForInstance(ec2Client, instanceId, targetState) {
    console.log(`Waiting for instance ${instanceId} to be ${targetState}...`);
    
    while (true) {
        const response = await ec2Client.send(new DescribeInstancesCommand({
            InstanceIds: [instanceId]
        }));
        
        const state = response.Reservations[0].Instances[0].State.Name;
        if (state === targetState) break;
        
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

async function checkSSMRegistration(ssmClient, instanceId) {
    try {
        const response = await ssmClient.send(new DescribeInstanceInformationCommand({
            Filters: [{
                Key: 'InstanceIds',
                Values: [instanceId]
            }]
        }));
        return response.InstanceInformationList.length > 0;
    } catch (error) {
        return false;
    }
}

async function createNonCompliantInstance() {
    const ec2Client = createAwsClient(EC2Client);
    const iamClient = createAwsClient(IAMClient);
    const ssmClient = createAwsClient(SSMClient);

    let instanceId;

    try {
        // Create IAM role without SSM permissions
        console.log('Creating IAM role without SSM permissions...');
        await createIAMRole(iamClient);

        // Launch EC2 instance without SSM agent
        console.log('Launching EC2 instance...');
        const instanceResponse = await ec2Client.send(new RunInstancesCommand({
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: CONFIG.EC2.INSTANCE_TYPE,
            MinCount: 1,
            MaxCount: 1,
            IamInstanceProfile: {
                Name: CONFIG.IAM.ROLE_NAME
            },
            TagSpecifications: [{
                ResourceType: 'instance',
                Tags: [{
                    Key: 'Name',
                    Value: CONFIG.EC2.INSTANCE_NAME
                }]
            }],
            // UserData to disable SSM agent
            UserData: Buffer.from(`
                #!/bin/bash
                systemctl stop amazon-ssm-agent
                systemctl disable amazon-ssm-agent
            `).toString('base64')
        }));

        instanceId = instanceResponse.Instances[0].InstanceId;
        console.log(`EC2 instance created: ${instanceId}`);

        // Wait for instance to be running
        await waitForInstance(ec2Client, instanceId, 'running');

        // Wait a bit for the UserData script to execute
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Verify instance is not managed by Systems Manager
        const isManaged = await checkSSMRegistration(ssmClient, instanceId);
        console.log('\nNon-compliant state verification:');
        console.log(`Instance ID: ${instanceId}`);
        console.log(`Managed by Systems Manager: ${isManaged ? 'Yes' : 'No'}`);
        console.log('This instance should be flagged as non-compliant by AWS Config');

        return instanceId;

    } catch (error) {
        console.error('Error creating non-compliant instance:', error);
        throw error;
    }
}

async function cleanupResources(instanceId) {
    const ec2Client = createAwsClient(EC2Client);
    const iamClient = createAwsClient(IAMClient);

    console.log('\nCleaning up resources...');

    try {
        // Terminate EC2 instance
        if (instanceId) {
            await ec2Client.send(new TerminateInstancesCommand({
                InstanceIds: [instanceId]
            }));
            await waitForInstance(ec2Client, instanceId, 'terminated');
        }

        // Cleanup IAM resources
        try {
            // Remove role from instance profile
            await iamClient.send(new RemoveRoleFromInstanceProfileCommand({
                InstanceProfileName: CONFIG.IAM.ROLE_NAME,
                RoleName: CONFIG.IAM.ROLE_NAME
            }));

            // Delete instance profile
            await iamClient.send(new DeleteInstanceProfileCommand({
                InstanceProfileName: CONFIG.IAM.ROLE_NAME
            }));

            // Delete role
            await iamClient.send(new DeleteRoleCommand({
                RoleName: CONFIG.IAM.ROLE_NAME
            }));
        } catch (error) {
            console.error('Error cleaning up IAM resources:', error);
        }

        console.log('Cleanup completed');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

async function main() {
    let instanceId;
    try {
        console.log('Creating non-compliant state for ec2-instance-managed-by-systems-manager...');
        instanceId = await createNonCompliantInstance();
        
        // Wait for a while to allow AWS Config to evaluate
        console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('Error in main execution:', error);
    } finally {
        // Cleanup
        if (instanceId) {
            await cleanupResources(instanceId);
        }
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createNonCompliantState: main
};
