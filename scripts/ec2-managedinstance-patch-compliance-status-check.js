const {
    EC2Client,
    RunInstancesCommand,
    DescribeInstancesCommand,
    CreateTagsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

const {
    SSMClient,
    CreatePatchBaselineCommand,
    RegisterPatchBaselineForPatchGroupCommand
} = require("@aws-sdk/client-ssm");

require('dotenv').config();

// Initialize clients
const ec2Client = new EC2Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const ssmClient = new SSMClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function getSubnetFromVpc(vpcId) {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId]
                }
            ]
        }));

        if (!response.Subnets || response.Subnets.length === 0) {
            throw new Error(`No subnets found in VPC ${vpcId}`);
        }

        console.log(`Found subnet ${response.Subnets[0].SubnetId} in VPC ${vpcId}`);
        return response.Subnets[0].SubnetId;
    } catch (error) {
        console.error('Error getting subnet from VPC:', error);
        throw error;
    }
}

async function createOutdatedPatchBaseline() {
    try {
        const timestamp = Date.now();
        const patchBaselineName = `outdated-baseline-${timestamp}`;

        // Create a patch baseline with very delayed approval times
        const createBaselineResponse = await ssmClient.send(new CreatePatchBaselineCommand({
            Name: patchBaselineName,
            OperatingSystem: 'AMAZON_LINUX_2',
            ApprovalRules: {
                PatchRules: [
                    {
                        PatchFilterGroup: {
                            PatchFilters: [
                                {
                                    Key: 'CLASSIFICATION',
                                    Values: ['Security']
                                }
                            ]
                        },
                        ApproveAfterDays: 365 // Very long delay for patch approval
                    }
                ]
            },
            Description: 'Baseline for creating instances with missing patches',
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        // Register the baseline with a patch group
        await ssmClient.send(new RegisterPatchBaselineForPatchGroupCommand({
            BaselineId: createBaselineResponse.BaselineId,
            PatchGroup: 'missing-patches-group'
        }));

        return createBaselineResponse.BaselineId;
    } catch (error) {
        console.error('Error creating patch baseline:', error);
        throw error;
    }
}

async function waitForInstanceStatus(instanceId, desiredState) {
    console.log(`Waiting for instance ${instanceId} to be ${desiredState}...`);
    
    while (true) {
        try {
            const response = await ec2Client.send(new DescribeInstancesCommand({
                InstanceIds: [instanceId]
            }));

            const instance = response.Reservations[0].Instances[0];
            const state = instance.State.Name;
            console.log(`Current state: ${state}`);

            if (state === desiredState) {
                return instance;
            } else if (state === 'terminated' || state === 'failed') {
                throw new Error(`Instance entered ${state} state`);
            }

            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            console.error('Error checking instance status:', error);
            throw error;
        }
    }
}

async function createInstanceWithMissingPatches(vpcId) {
    try {
        const timestamp = Date.now();
        const subnetId = await getSubnetFromVpc(vpcId);

        // Create outdated patch baseline
        console.log('Creating outdated patch baseline...');
        const baselineId = await createOutdatedPatchBaseline();

        // Create instance with configurations that will result in missing patches
        const createParams = {
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1,
            SubnetId: subnetId,

            // User data to configure instance for missing patches
            UserData: Buffer.from(`#!/bin/bash
# Disable automatic updates
sudo sed -i 's/1/0/g' /etc/yum/yum-cron.conf
sudo systemctl stop yum-cron
sudo systemctl disable yum-cron

# Disable security updates
sudo sed -i 's/apply_updates = yes/apply_updates = no/' /etc/yum/yum-cron.conf
sudo sed -i 's/update_cmd = security/update_cmd = minimal/' /etc/yum/yum-cron.conf

# Create marker file for missing patches
echo "PATCH_AUTO_UPDATE=false" | sudo tee /etc/sysconfig/patch-settings

# Configure yum to exclude security updates
echo "exclude=*security* *patches*" | sudo tee -a /etc/yum.conf

# Stop and disable patch management services
sudo systemctl stop yum-cron || true
sudo systemctl disable yum-cron || true
`).toString('base64'),

            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `missing-patches-instance-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'Patch Group',
                            Value: 'missing-patches-group'
                        },
                        {
                            Key: 'PatchingStatus',
                            Value: 'Outdated'
                        }
                    ]
                },
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `missing-patches-volume-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        }
                    ]
                }
            ]
        };

        console.log('Creating EC2 instance with missing patches configuration...');
        const createResponse = await ec2Client.send(new RunInstancesCommand(createParams));
        const instanceId = createResponse.Instances[0].InstanceId;
        
        console.log(`Instance creation initiated: ${instanceId}`);

        // Wait for instance to be running
        const instance = await waitForInstanceStatus(instanceId, 'running');

        // Add warning tags
        await ec2Client.send(new CreateTagsCommand({
            Resources: [instanceId],
            Tags: [
                {
                    Key: 'Warning',
                    Value: 'Missing-Patches'
                },
                {
                    Key: 'SecurityRisk',
                    Value: 'Critical'
                },
                {
                    Key: 'PatchCompliance',
                    Value: 'Non-Compliant'
                },
                {
                    Key: 'PatchBaseline',
                    Value: baselineId
                }
            ]
        }));

        return {
            instanceId: instance.InstanceId,
            instanceType: instance.InstanceType,
            state: instance.State.Name,
            subnetId: instance.SubnetId,
            vpcId: instance.VpcId,
            az: instance.Placement.AvailabilityZone,
            privateIp: instance.PrivateIpAddress,
            publicIp: instance.PublicIpAddress,
            patchBaselineId: baselineId
        };

    } catch (error) {
        console.error('Error creating EC2 instance:', error);
        throw error;
    }
}

async function main() {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'EC2_AMI_ID',
            'VPC_ID'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`${envVar} environment variable is required`);
            }
        }

        const result = await createInstanceWithMissingPatches(process.env.VPC_ID);
        
        console.log('\nInstance created successfully:');
        console.log(`Instance ID: ${result.instanceId}`);
        console.log(`Instance Type: ${result.instanceType}`);
        console.log(`State: ${result.state}`);
        console.log(`VPC ID: ${result.vpcId}`);
        console.log(`Subnet ID: ${result.subnetId}`);
        console.log(`Availability Zone: ${result.az}`);
        console.log(`Private IP: ${result.privateIp}`);
        if (result.publicIp) {
            console.log(`Public IP: ${result.publicIp}`);
        }
        console.log(`Patch Baseline ID: ${result.patchBaselineId}`);

        console.log('\nPatch Configuration:');
        console.log('1. Automatic updates disabled');
        console.log('2. Security updates disabled');
        console.log('3. Custom patch baseline with delayed approval');
        console.log('4. Patch management services disabled');
        console.log('5. Security updates excluded');

        console.log('\nNon-compliant settings:');
        console.log('1. Missing security patches');
        console.log('2. Outdated system packages');
        console.log('3. Delayed patch approval times');
        console.log('4. Disabled update services');
        console.log('5. No automated patching');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
