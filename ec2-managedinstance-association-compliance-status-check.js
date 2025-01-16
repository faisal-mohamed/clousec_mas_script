const { 
    EC2Client, 
    RunInstancesCommand, 
    DescribeInstancesCommand,
    TerminateInstancesCommand,
    DescribeImagesCommand
} = require('@aws-sdk/client-ec2');

const { 
    SSMClient, 
    CreateAssociationCommand,
    DeleteAssociationCommand,
    DescribeInstanceInformationCommand,
    DescribeAssociationCommand
} = require('@aws-sdk/client-ssm');

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
} = require('@aws-sdk/client-iam');

require('dotenv').config();

// Initialize clients
const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const ssmClient = new SSMClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    INSTANCE_TYPE: 't2.micro',
    ROLE_NAME: `SSMInstanceRole-Test-${Date.now()}`,
    ASSOCIATION_NAME: `TestNonCompliantAssociation-${Date.now()}`
};

// Function to create IAM role for Systems Manager
async function createIAMRole() {
    try {
        // Create role
        const roleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'ec2.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Attach SSM policy
        await iamClient.send(new AttachRolePolicyCommand({
            RoleName: CONFIG.ROLE_NAME,
            PolicyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
        }));

        // Create instance profile
        await iamClient.send(new CreateInstanceProfileCommand({
            InstanceProfileName: CONFIG.ROLE_NAME
        }));

        // Add role to instance profile
        await iamClient.send(new AddRoleToInstanceProfileCommand({
            InstanceProfileName: CONFIG.ROLE_NAME,
            RoleName: CONFIG.ROLE_NAME
        }));

        // Wait for role propagation
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        return CONFIG.ROLE_NAME;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
}

// Function to get latest Amazon Linux 2 AMI
async function getLatestAL2AmiId() {
    try {
        const response = await ec2Client.send(new DescribeImagesCommand({
            Filters: [
                {
                    Name: 'name',
                    Values: ['amzn2-ami-hvm-*-x86_64-gp2']
                },
                {
                    Name: 'state',
                    Values: ['available']
                }
            ],
            Owners: ['amazon']
        }));

        const images = response.Images.sort((a, b) => {
            return new Date(b.CreationDate) - new Date(a.CreationDate);
        });

        return images[0].ImageId;
    } catch (error) {
        console.error('Error getting AMI ID:', error);
        throw error;
    }
}

// Function to create EC2 instance with Systems Manager
async function createInstance(roleName) {
    try {
        const amiId = await getLatestAL2AmiId();
        
        const response = await ec2Client.send(new RunInstancesCommand({
            ImageId: amiId,
            InstanceType: CONFIG.INSTANCE_TYPE,
            MinCount: 1,
            MaxCount: 1,
            IamInstanceProfile: {
                Name: roleName
            },
            TagSpecifications: [{
                ResourceType: 'instance',
                Tags: [{
                    Key: 'Name',
                    Value: 'SSM-Association-Test'
                }]
            }]
        }));

        return response.Instances[0].InstanceId;
    } catch (error) {
        console.error('Error creating instance:', error);
        throw error;
    }
}

// Function to wait for instance to be managed by Systems Manager
async function waitForSSMInstance(instanceId) {
    try {
        let isManaged = false;
        let attempts = 0;
        
        while (!isManaged && attempts < 12) {
            try {
                const response = await ssmClient.send(new DescribeInstanceInformationCommand({
                    Filters: [{
                        Key: 'InstanceIds',
                        Values: [instanceId]
                    }]
                }));

                if (response.InstanceInformationList.length > 0) {
                    isManaged = true;
                    break;
                }
            } catch (error) {
                console.log('Waiting for instance to be managed by SSM...');
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        return isManaged;
    } catch (error) {
        console.error('Error waiting for SSM instance:', error);
        throw error;
    }
}

// Function to create non-compliant association
async function createNonCompliantAssociation(instanceId) {
    try {
        const response = await ssmClient.send(new CreateAssociationCommand({
            Name: 'AWS-RunShellScript',
            Targets: [{
                Key: 'InstanceIds',
                Values: [instanceId]
            }],
            Parameters: {
                commands: ['invalid_command_to_force_failure', 'another_invalid_command'],
                workingDirectory: ['/invalid/directory'],
                executionTimeout: ['1']  // Very short timeout to ensure failure
            },
            AssociationName: CONFIG.ASSOCIATION_NAME,
            MaxErrors: '100%',  // Non-recommended setting
            MaxConcurrency: '100%',  // Non-recommended setting
            ComplianceSeverity: 'UNSPECIFIED'  // Non-recommended severity
        }));

        console.log('Created association with ID:', response.AssociationDescription.AssociationId);
        return response.AssociationDescription.AssociationId;
    } catch (error) {
        console.error('Error creating association:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(instanceId, associationId, roleName) {
    try {
        // Delete association
        if (associationId) {
            try {
                await ssmClient.send(new DeleteAssociationCommand({
                    AssociationId: associationId
                }));
                console.log('Deleted association');
            } catch (error) {
                console.error('Error deleting association:', error);
            }
        }

        // Terminate instance
        if (instanceId) {
            try {
                await ec2Client.send(new TerminateInstancesCommand({
                    InstanceIds: [instanceId]
                }));
                console.log('Terminated instance');
            } catch (error) {
                console.error('Error terminating instance:', error);
            }
        }

        // Cleanup IAM role
        if (roleName) {
            try {
                await iamClient.send(new RemoveRoleFromInstanceProfileCommand({
                    InstanceProfileName: roleName,
                    RoleName: roleName
                }));

                await iamClient.send(new DeleteInstanceProfileCommand({
                    InstanceProfileName: roleName
                }));

                await iamClient.send(new DetachRolePolicyCommand({
                    RoleName: roleName,
                    PolicyArn: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore'
                }));

                await iamClient.send(new DeleteRoleCommand({
                    RoleName: roleName
                }));

                console.log('Cleaned up IAM resources');
            } catch (error) {
                console.error('Error cleaning up IAM resources:', error);
            }
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

async function waitForAssociationExecution(associationId) {
    try {
        let attempts = 0;
        const maxAttempts = 6;  // Maximum 30 seconds (5 seconds * 6)

        while (attempts < maxAttempts) {
            const status = await ssmClient.send(new DescribeAssociationCommand({
                AssociationId: associationId
            }));

            if (status.AssociationDescription.Status?.Name !== 'Pending') {
                return status.AssociationDescription.Status?.Name;
            }

            attempts++;
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        return 'Timeout waiting for execution';
    } catch (error) {
        console.error('Error waiting for association execution:', error);
        return 'Error';
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let instanceId = null;
    let associationId = null;
    let roleName = null;

    try {
        console.log('Starting association compliance simulation...');

        // Create IAM role
        console.log('Creating IAM role...');
        roleName = await createIAMRole();

        // Create EC2 instance
        console.log('Creating EC2 instance...');
        instanceId = await createInstance(roleName);

        // Wait for instance to be managed by Systems Manager
        console.log('Waiting for instance to be managed by Systems Manager...');
        const isManaged = await waitForSSMInstance(instanceId);

        if (!isManaged) {
            throw new Error('Instance failed to register with Systems Manager');
        }

        // Create non-compliant association
        console.log('Creating non-compliant association...');
        associationId = await createNonCompliantAssociation(instanceId);

        // Wait for association to run
        console.log('Waiting for association to run (30 seconds)...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Check association status
        try {
            const associationStatus = await ssmClient.send(new DescribeAssociationCommand({
                AssociationId: associationId
            }));

            // Add detailed status check
            if (associationStatus.AssociationDescription) {
                console.log('\nDetailed Association Status:');
                console.log('- Status:', associationStatus.AssociationDescription.Status?.Name || 'Unknown');
                console.log('- Last Execution Date:', associationStatus.AssociationDescription.LastExecutionDate);
                console.log('- Overview:', associationStatus.AssociationDescription.Overview || 'No overview available');
            }
        } catch (error) {
            console.error('Error checking association status:', error);
        }

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('Cleaning up resources...');
        await cleanupResources(instanceId, associationId, roleName);
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
