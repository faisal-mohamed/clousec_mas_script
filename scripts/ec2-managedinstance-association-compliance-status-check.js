const {
    EC2Client,
    RunInstancesCommand,
    DescribeInstancesCommand,
    CreateTagsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");
require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({
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

async function createNonCompliantInstance(vpcId) {
    try {
        const timestamp = Date.now();
        const subnetId = await getSubnetFromVpc(vpcId);

        // Create instance with non-compliant settings
        const createParams = {
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1,
            SubnetId: subnetId,

            // Non-compliant metadata options
            MetadataOptions: {
                HttpTokens: 'optional',    // Non-compliant: IMDSv2 not required
                HttpEndpoint: 'enabled',
                HttpPutResponseHopLimit: 1
            },

            // User data to disable automatic updates and create non-compliant configuration
            UserData: Buffer.from(`#!/bin/bash
# Disable automatic updates
sudo sed -i 's/1/0/g' /etc/yum/yum-cron.conf
sudo systemctl stop yum-cron
sudo systemctl disable yum-cron

# Create a non-compliant configuration file
echo "SELINUX=disabled" > /etc/selinux/config
echo "SELINUXTYPE=targeted" >> /etc/selinux/config

# Disable and stop SSM agent (if exists)
sudo systemctl stop amazon-ssm-agent || true
sudo systemctl disable amazon-ssm-agent || true

# Create some non-compliant file permissions
touch /tmp/non-compliant-file
chmod 777 /tmp/non-compliant-file

# Disable automatic security updates
sudo sed -i 's/TRUE/FALSE/g' /etc/yum/yum-cron-hourly.conf || true
`).toString('base64'),

            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `non-compliant-instance-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'compliance-status',
                            Value: 'non-compliant'
                        },
                        {
                            Key: 'patch-group',
                            Value: 'non-compliant-group'
                        }
                    ]
                },
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `non-compliant-volume-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        }
                    ]
                }
            ]
        };

        console.log('Creating non-compliant EC2 instance...');
        console.log(`Using VPC: ${vpcId}`);
        console.log(`Using Subnet: ${subnetId}`);

        const createResponse = await ec2Client.send(new RunInstancesCommand(createParams));
        const instanceId = createResponse.Instances[0].InstanceId;
        
        console.log(`Instance creation initiated: ${instanceId}`);

        // Wait for instance to be running
        const instance = await waitForInstanceStatus(instanceId, 'running');

        // Add compliance-related warning tags
        await ec2Client.send(new CreateTagsCommand({
            Resources: [instanceId],
            Tags: [
                {
                    Key: 'Warning',
                    Value: 'Non-Compliant-Configuration'
                },
                {
                    Key: 'SecurityRisk',
                    Value: 'Critical'
                },
                {
                    Key: 'ComplianceStatus',
                    Value: 'Failed'
                },
                {
                    Key: 'PatchingStatus',
                    Value: 'Disabled'
                },
                {
                    Key: 'SSMStatus',
                    Value: 'Disabled'
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
            publicIp: instance.PublicIpAddress
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

        const result = await createNonCompliantInstance(process.env.VPC_ID);
        
        console.log('\nNon-compliant instance created successfully:');
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

        console.log('\nNon-compliant Configurations:');
        console.log('1. SSM Agent disabled');
        console.log('2. Automatic updates disabled');
        console.log('3. SELinux disabled');
        console.log('4. Non-compliant file permissions');
        console.log('5. Security updates disabled');

        console.log('\nCompliance Issues:');
        console.log('1. Patch management non-compliant');
        console.log('2. Security configurations non-compliant');
        console.log('3. System hardening non-compliant');
        console.log('4. Update management non-compliant');
        console.log('5. SSM management non-compliant');

        console.log('\nSecurity Implications:');
        console.log('1. Missing security patches');
        console.log('2. Weak security controls');
        console.log('3. No automated management');
        console.log('4. Compliance violations');
        console.log('5. Increased security risks');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
