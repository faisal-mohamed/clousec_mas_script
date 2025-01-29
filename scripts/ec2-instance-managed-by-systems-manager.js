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

async function getFirstSubnetFromVpc(vpcId) {
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
        const subnetId = await getFirstSubnetFromVpc(vpcId);

        // Create instance without SSM configuration
        const createParams = {
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1,
            SubnetId: subnetId,

            // Do not include IAM role for Systems Manager
            // Do not include SSM agent in user data

            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `non-ssm-instance-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'ssm-managed',
                            Value: 'false'
                        }
                    ]
                },
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `non-ssm-volume-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        }
                    ]
                }
            ],

            // Basic metadata options
            MetadataOptions: {
                HttpTokens: 'required',
                HttpEndpoint: 'enabled',
                HttpPutResponseHopLimit: 1
            }
        };

        console.log('Creating EC2 instance without Systems Manager...');
        console.log(`Using VPC: ${vpcId}`);
        console.log(`Using Subnet: ${subnetId}`);

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
                    Value: 'No-SSM-Management'
                },
                {
                    Key: 'SecurityRisk',
                    Value: 'High'
                },
                {
                    Key: 'RequiresRemediation',
                    Value: 'SSMRequired'
                },
                {
                    Key: 'simulation-mas',
                    Value: 'true'
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
            iamInstance: instance.IamInstanceProfile
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

        console.log('\nSystems Manager Configuration:');
        console.log('- No IAM role for Systems Manager');
        console.log('- No SSM agent configuration');
        console.log('- Instance not manageable via Systems Manager');
        console.log('- No automated patching capability');
        console.log('- No centralized management');

        console.log('\nNon-compliant settings:');
        console.log('1. No Systems Manager integration');
        console.log('2. Cannot use Session Manager for access');
        console.log('3. No automated patch management');
        console.log('4. Limited monitoring capabilities');
        console.log('5. Manual management required');

        console.log('\nSecurity Implications:');
        console.log('1. No centralized management');
        console.log('2. Manual patching required');
        console.log('3. Limited operational visibility');
        console.log('4. No automated compliance checks');
        console.log('5. Increased operational overhead');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
