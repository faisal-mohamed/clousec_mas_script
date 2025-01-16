const { 
    EC2Client, 
    RunInstancesCommand, 
    TerminateInstancesCommand,
    DescribeInstancesCommand,
    CreateTagsCommand
} = require("@aws-sdk/client-ec2");

const { 
    SSMClient,
    CreatePatchBaselineCommand,
    DeletePatchBaselineCommand,
    DescribeInstancePatchStatesCommand,
    RegisterPatchBaselineForPatchGroupCommand,
    DeregisterPatchBaselineForPatchGroupCommand
} = require("@aws-sdk/client-ssm");

const { 
    STSClient, 
    GetCallerIdentityCommand 
} = require("@aws-sdk/client-sts");

const { 
    IAMClient,
    CreateRoleCommand,
    DeleteRoleCommand,
    PutRolePolicyCommand,
    DeleteRolePolicyCommand,
    AttachRolePolicyCommand,
    DetachRolePolicyCommand,
    GetRoleCommand,
    CreateInstanceProfileCommand,
    DeleteInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    RemoveRoleFromInstanceProfileCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION',
    'EC2_AMI_ID'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
    console.error('Missing required environment variables:', missingEnvVars.join(', '));
    process.exit(1);
}

// Configuration constants
const CONFIG = {
    EC2: {
        INSTANCE_TYPE: 't2.micro',
        INSTANCE_NAME: 'non-compliant-patch-instance'
    },
    IAM: {
        ROLE_NAME: 'non-compliant-patch-role',
        SSM_MANAGED_POLICY_ARN: 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
        SSM_PATCH_POLICY_ARN: 'arn:aws:iam::aws:policy/AmazonSSMPatchAssociation'
    },
    PATCH: {
        BASELINE_NAME: 'non-compliant-baseline',
        GROUP_NAME: 'non-compliant-patch-group',
        APPROVAL_DELAY_DAYS: 30
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

async function waitForInstance(ec2Client, instanceId, targetState) {
    console.log(`Waiting for instance ${instanceId} to be ${targetState}...`);
    
    while (true) {
        const describeCommand = new DescribeInstancesCommand({
            InstanceIds: [instanceId]
        });
        
        const response = await ec2Client.send(describeCommand);
        const state = response.Reservations[0].Instances[0].State.Name;
        
        if (state === targetState) {
            break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

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
        // Create role
        await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.IAM.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
        }));

        // Attach required policies
        await iamClient.send(new AttachRolePolicyCommand({
            RoleName: CONFIG.IAM.ROLE_NAME,
            PolicyArn: CONFIG.IAM.SSM_MANAGED_POLICY_ARN
        }));

        await iamClient.send(new AttachRolePolicyCommand({
            RoleName: CONFIG.IAM.ROLE_NAME,
            PolicyArn: CONFIG.IAM.SSM_PATCH_POLICY_ARN
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

        // Wait for role to propagate
        await new Promise(resolve => setTimeout(resolve, 10000));

        const getRoleResponse = await iamClient.send(new GetRoleCommand({
            RoleName: CONFIG.IAM.ROLE_NAME
        }));

        return getRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
}

async function cleanupIAMRole(iamClient) {
    try {
        // First remove role from instance profile
        try {
            await iamClient.send(new RemoveRoleFromInstanceProfileCommand({
                InstanceProfileName: CONFIG.IAM.ROLE_NAME,
                RoleName: CONFIG.IAM.ROLE_NAME
            }));
        } catch (error) {
            console.error('Error removing role from instance profile:', error);
        }

        // Delete instance profile
        try {
            await iamClient.send(new DeleteInstanceProfileCommand({
                InstanceProfileName: CONFIG.IAM.ROLE_NAME
            }));
        } catch (error) {
            console.error('Error deleting instance profile:', error);
        }

        // Detach policies
        await iamClient.send(new DetachRolePolicyCommand({
            RoleName: CONFIG.IAM.ROLE_NAME,
            PolicyArn: CONFIG.IAM.SSM_MANAGED_POLICY_ARN
        }));

        await iamClient.send(new DetachRolePolicyCommand({
            RoleName: CONFIG.IAM.ROLE_NAME,
            PolicyArn: CONFIG.IAM.SSM_PATCH_POLICY_ARN
        }));

        // Delete role
        await iamClient.send(new DeleteRoleCommand({
            RoleName: CONFIG.IAM.ROLE_NAME
        }));
    } catch (error) {
        console.error('Error cleaning up IAM role:', error);
    }
}


async function createNonCompliantPatchBaseline(ssmClient) {
    try {
        const createPatchBaselineParams = {
            Name: CONFIG.PATCH.BASELINE_NAME,
            OperatingSystem: 'AMAZON_LINUX_2',
            ApprovalRules: {
                PatchRules: [{
                    PatchFilterGroup: {
                        PatchFilters: [{
                            Key: 'CLASSIFICATION',
                            Values: ['Security']
                        }]
                    },
                    ApproveAfterDays: CONFIG.PATCH.APPROVAL_DELAY_DAYS
                }]
            },
            Description: 'Non-compliant patch baseline for testing'
        };

        const response = await ssmClient.send(new CreatePatchBaselineCommand(createPatchBaselineParams));
        return response.BaselineId;
    } catch (error) {
        console.error('Error creating patch baseline:', error);
        throw error;
    }
}

async function tagInstanceWithPatchGroup(ec2Client, instanceId) {
    try {
        await ec2Client.send(new CreateTagsCommand({
            Resources: [instanceId],
            Tags: [{
                Key: 'Patch Group',
                Value: CONFIG.PATCH.GROUP_NAME
            }]
        }));
    } catch (error) {
        console.error('Error tagging instance:', error);
        throw error;
    }
}

async function checkPatchCompliance(ssmClient, instanceId) {
    try {
        const response = await ssmClient.send(new DescribeInstancePatchStatesCommand({
            InstanceIds: [instanceId]
        }));

        if (response.InstancePatchStates && response.InstancePatchStates.length > 0) {
            return response.InstancePatchStates[0];
        }
        return null;
    } catch (error) {
        console.error('Error checking patch compliance:', error);
        return null;
    }
}

async function simulateNonCompliance() {
    const ec2Client = createAwsClient(EC2Client);
    const ssmClient = createAwsClient(SSMClient);
    const iamClient = createAwsClient(IAMClient);
    
    let instanceId;
    let baselineId;

    try {
        console.log('Starting simulation for ec2-managedinstance-patch-compliance-status-check...');

        // Create IAM role
        console.log('Creating IAM role...');
        const roleArn = await createIAMRole(iamClient);

        // Create non-compliant patch baseline
        console.log('Creating non-compliant patch baseline...');
        baselineId = await createNonCompliantPatchBaseline(ssmClient);

        // Launch EC2 instance
        const runInstancesParams = {
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
            UserData: Buffer.from(`
                #!/bin/bash
                yum update -y amazon-ssm-agent
                systemctl enable amazon-ssm-agent
                systemctl start amazon-ssm-agent
            `).toString('base64')
        };

        console.log('Launching EC2 instance...');
        const runInstanceResponse = await ec2Client.send(new RunInstancesCommand(runInstancesParams));
        instanceId = runInstanceResponse.Instances[0].InstanceId;

        // Wait for instance to be running
        await waitForInstance(ec2Client, instanceId, 'running');

        // Tag instance with patch group
        await tagInstanceWithPatchGroup(ec2Client, instanceId);

        // Register patch baseline with patch group
        await ssmClient.send(new RegisterPatchBaselineForPatchGroupCommand({
            BaselineId: baselineId,
            PatchGroup: CONFIG.PATCH.GROUP_NAME
        }));

        // Wait for patch compliance status
        console.log('Waiting for patch compliance status...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Check patch compliance
        const complianceStatus = await checkPatchCompliance(ssmClient, instanceId);
        
        console.log('\nNon-compliant state verification:');
        console.log(`- Instance ID: ${instanceId}`);
        console.log(`- Baseline ID: ${baselineId}`);
        console.log(`- Patch Group: ${CONFIG.PATCH.GROUP_NAME}`);
        console.log('- Patch Compliance Status:', complianceStatus ? JSON.stringify(complianceStatus, null, 2) : 'Not available yet');

    } catch (error) {
        console.error('Error during simulation:', error);
        throw error;
    } finally {
        // Cleanup
        console.log('\nCleaning up resources...');
        try {
            if (baselineId) {
                await ssmClient.send(new DeregisterPatchBaselineForPatchGroupCommand({
                    BaselineId: baselineId,
                    PatchGroup: CONFIG.PATCH.GROUP_NAME
                }));
                await ssmClient.send(new DeletePatchBaselineCommand({
                    BaselineId: baselineId
                }));
            }
            
            if (instanceId) {
                await ec2Client.send(new TerminateInstancesCommand({
                    InstanceIds: [instanceId]
                }));
                await waitForInstance(ec2Client, instanceId, 'terminated');
            }
            
            await cleanupIAMRole(iamClient);
            console.log('Cleanup completed successfully');
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

async function main() {
    try {
        // Verify credentials
        const stsClient = createAwsClient(STSClient);
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        console.log('Credentials verified for account:', identity.Account);

        // Run simulation
        await simulateNonCompliance();
    } catch (error) {
        console.error('Error in main execution:', error);
        process.exit(1);
    }
}

main().catch(console.error);
