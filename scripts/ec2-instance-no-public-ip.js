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

async function getPublicSubnetFromVpc(vpcId) {
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

        // Try to find a subnet with MapPublicIpOnLaunch enabled
        const publicSubnet = response.Subnets.find(subnet => subnet.MapPublicIpOnLaunch);
        if (!publicSubnet) {
            console.log('No subnet with auto-assign public IP found, using first available subnet');
            return response.Subnets[0].SubnetId;
        }

        console.log(`Found public subnet ${publicSubnet.SubnetId} in VPC ${vpcId}`);
        return publicSubnet.SubnetId;
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

async function createPublicInstance(vpcId) {
    try {
        const timestamp = Date.now();
        const subnetId = await getPublicSubnetFromVpc(vpcId);

        const createParams = {
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1,

            // Network interface configuration
            NetworkInterfaces: [{
                AssociatePublicIpAddress: true,
                DeleteOnTermination: true,
                DeviceIndex: 0,
                SubnetId: subnetId,
                Groups: [] // You can add security group IDs here if needed
            }],

            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `public-instance-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'public-ip',
                            Value: 'enabled'
                        }
                    ]
                },
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `public-instance-volume-${timestamp}`
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

        console.log('Creating EC2 instance with public IP...');
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
                    Value: 'Public-IP-Enabled'
                },
                {
                    Key: 'SecurityRisk',
                    Value: 'High'
                },
                {
                    Key: 'RequiresRemediation',
                    Value: 'PublicAccessReview'
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
            publicDnsName: instance.PublicDnsName
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

        const result = await createPublicInstance(process.env.VPC_ID);
        
        console.log('\nInstance created successfully:');
        console.log(`Instance ID: ${result.instanceId}`);
        console.log(`Instance Type: ${result.instanceType}`);
        console.log(`State: ${result.state}`);
        console.log(`VPC ID: ${result.vpcId}`);
        console.log(`Subnet ID: ${result.subnetId}`);
        console.log(`Availability Zone: ${result.az}`);
        console.log(`Private IP: ${result.privateIp}`);
        console.log(`Public IP: ${result.publicIp}`);
        if (result.publicDnsName) {
            console.log(`Public DNS: ${result.publicDnsName}`);
        }

        console.log('\nNetwork Configuration:');
        console.log('- Public IP address assigned');
        console.log('- Directly accessible from internet');
        console.log('- No NAT gateway required');
        console.log('- Public subnet placement');
        console.log('- Internet gateway route available');

        console.log('\nNon-compliant settings:');
        console.log('1. Instance has public IP');
        console.log('2. Directly accessible from internet');
        console.log('3. Increased attack surface');
        console.log('4. No private network isolation');
        console.log('5. Higher security risk');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
