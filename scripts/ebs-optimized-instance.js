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

        // Return the first subnet ID
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

            // Wait for 10 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            console.error('Error checking instance status:', error);
            throw error;
        }
    }
}

async function createNonOptimizedInstance(vpcId) {
    try {
        const timestamp = Date.now();
        const subnetId = await getSubnetFromVpc(vpcId);

        // Using t2.large as it supports but doesn't require EBS optimization
        const createParams = {
            ImageId: process.env.EC2_AMI_ID,
            InstanceType: 't2.large',
            MinCount: 1,
            MaxCount: 1,
            
            // VPC Configuration
            SubnetId: subnetId,
            
            // Explicitly disable EBS optimization
            EbsOptimized: false,

            // Basic EBS volume configuration
            BlockDeviceMappings: [
                {
                    DeviceName: '/dev/xvda',
                    Ebs: {
                        VolumeSize: 8,
                        VolumeType: 'gp3',
                        DeleteOnTermination: true
                    }
                }
            ],

            TagSpecifications: [
                {
                    ResourceType: 'instance',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `non-optimized-instance-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'ebs-optimization',
                            Value: 'disabled'
                        }
                    ]
                },
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `non-optimized-volume-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        }
                    ]
                }
            ]
        };

        console.log('Creating EC2 instance without EBS optimization...');
        console.log(`VPC ID: ${vpcId}`);
        console.log(`Subnet ID: ${subnetId}`);

        const createResponse = await ec2Client.send(new RunInstancesCommand(createParams));
        const instanceId = createResponse.Instances[0].InstanceId;
        
        console.log(`Instance creation initiated: ${instanceId}`);

        // Wait for instance to be running
        const instance = await waitForInstanceStatus(instanceId, 'running');

        console.log('\nInstance Details:');
        console.log(`Instance ID: ${instance.InstanceId}`);
        console.log(`State: ${instance.State.Name}`);
        console.log(`Instance Type: ${instance.InstanceType}`);
        console.log(`EBS Optimized: ${instance.EbsOptimized}`);
        console.log(`VPC ID: ${instance.VpcId}`);
        console.log(`Subnet ID: ${instance.SubnetId}`);
        console.log(`Availability Zone: ${instance.Placement.AvailabilityZone}`);
        console.log(`Private IP: ${instance.PrivateIpAddress}`);
        if (instance.PublicIpAddress) {
            console.log(`Public IP: ${instance.PublicIpAddress}`);
        }

        console.log('\nNon-compliant configuration:');
        console.log('- EBS optimization is disabled');
        console.log('- No dedicated bandwidth for EBS');
        console.log('- Potential I/O performance impact');
        console.log('- Shared network bandwidth');
        console.log('- No guaranteed IOPS');

        // Add additional warning tags
        await ec2Client.send(new CreateTagsCommand({
            Resources: [instanceId],
            Tags: [
                {
                    Key: 'Warning',
                    Value: 'EBS-Optimization-Disabled'
                },
                {
                    Key: 'RequiresOptimization',
                    Value: 'true'
                }
            ]
        }));

        return {
            instanceId: instance.InstanceId,
            instanceType: instance.InstanceType,
            ebsOptimized: instance.EbsOptimized,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            availabilityZone: instance.Placement.AvailabilityZone,
            state: instance.State.Name,
            privateIp: instance.PrivateIpAddress,
            publicIp: instance.PublicIpAddress
        };

    } catch (error) {
        console.error('Error creating EC2 instance:', error);
        throw error;
    }
}

// Execute the script
async function main() {
    try {
        // Validate required environment variables
        if (!process.env.AWS_ACCESS_KEY_ID || 
            !process.env.AWS_SECRET_ACCESS_KEY || 
            !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }

        if (!process.env.EC2_AMI_ID) {
            throw new Error('AMI_ID environment variable is required');
        }

        if (!process.env.VPC_ID) {
            throw new Error('VPC_ID environment variable is required');
        }

        const result = await createNonOptimizedInstance(process.env.VPC_ID);
        
        console.log('\nInstance created successfully:');
        console.log(`Instance ID: ${result.instanceId}`);
        console.log(`Instance Type: ${result.instanceType}`);
        console.log(`EBS Optimized: ${result.ebsOptimized}`);
        console.log(`VPC ID: ${result.vpcId}`);
        console.log(`Subnet ID: ${result.subnetId}`);
        console.log(`Availability Zone: ${result.availabilityZone}`);
        console.log(`State: ${result.state}`);
        console.log(`Private IP: ${result.privateIp}`);
        if (result.publicIp) {
            console.log(`Public IP: ${result.publicIp}`);
        }

        console.log('\nWarning:');
        console.log('This instance configuration:');
        console.log('1. Has reduced EBS performance');
        console.log('2. Shares network bandwidth');
        console.log('3. May experience I/O bottlenecks');
        console.log('4. Not suitable for I/O intensive workloads');
        console.log('5. Does not follow EBS performance best practices');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
