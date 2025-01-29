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

        const createParams = {
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1,
            SubnetId: subnetId,

            // Configure metadata options to use IMDSv1
            MetadataOptions: {
                HttpTokens: 'optional',    // This allows IMDSv1
                HttpEndpoint: 'enabled',   // Enable the HTTP endpoint
                HttpPutResponseHopLimit: 1 // Default hop limit
            },

            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `imdsv1-instance-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'imdsv2-status',
                            Value: 'disabled'
                        }
                    ]
                },
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        }
                    ]
                }
            ]
        };

        console.log('Creating EC2 instance with IMDSv1...');
        console.log(`Using VPC: ${vpcId}`);
        console.log(`Using Subnet: ${subnetId}`);

        const createResponse = await ec2Client.send(new RunInstancesCommand(createParams));
        const instanceId = createResponse.Instances[0].InstanceId;
        
        console.log(`Instance creation initiated: ${instanceId}`);

        // Wait for instance to be running
        const instance = await waitForInstanceStatus(instanceId, 'running');

        // Add additional warning tags
        await ec2Client.send(new CreateTagsCommand({
            Resources: [instanceId],
            Tags: [
                {
                    Key: 'Warning',
                    Value: 'IMDSv1-Enabled'
                },
                {
                    Key: 'SecurityRisk',
                    Value: 'High'
                },
                {
                    Key: 'RequiresRemediation',
                    Value: 'IMDSv2Required'
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
            metadataOptions: instance.MetadataOptions
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

        console.log('\nMetadata Service Configuration:');
        console.log(`HTTP Tokens: ${result.metadataOptions.HttpTokens}`);
        console.log(`HTTP Endpoint: ${result.metadataOptions.HttpEndpoint}`);
        console.log(`HTTP Put Response Hop Limit: ${result.metadataOptions.HttpPutResponseHopLimit}`);

        console.log('\nNon-compliant settings:');
        console.log('1. IMDSv2 not required (using IMDSv1)');
        console.log('2. No token-based authentication');
        console.log('3. Vulnerable to SSRF attacks');
        console.log('4. Not following AWS security best practices');
        console.log('5. Requires security remediation');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
