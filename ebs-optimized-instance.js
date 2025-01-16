const {
    EC2Client,
    RunInstancesCommand,
    TerminateInstancesCommand,
    DescribeInstancesCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize AWS client
const getClient = () => {
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

        return new EC2Client(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create non-compliant EC2 instance (EBS optimization disabled)
const createNonCompliantInstance = async () => {
    const client = getClient();

    try {
        console.log('Creating non-compliant EC2 instance (EBS optimization disabled)...');
        
        // Using m5.large which supports EBS optimization but we'll disable it
        const response = await client.send(
            new RunInstancesCommand({
                ImageId:   `${process.env.EC2_AMI_ID}`, // Amazon Linux 2023 AMI (adjust for your region)
                InstanceType: 'm5.large',
                MinCount: 1,
                MaxCount: 1,
                EbsOptimized: false, // Explicitly disable EBS optimization
                BlockDeviceMappings: [
                    {
                        DeviceName: '/dev/xvda',
                        Ebs: {
                            VolumeSize: 30,
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
                                Value: 'NonCompliant-EBSOptimization'
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
        
        // Wait for instance to be running
        await waitForInstanceStatus(instanceId, 'running');
        
        return instanceId;
    } catch (error) {
        console.error('Error creating EC2 instance:', error);
        throw error;
    }
};

// Wait for instance status
const waitForInstanceStatus = async (instanceId, targetState, timeoutMinutes = 5) => {
    const client = getClient();
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

// Cleanup resources
const cleanup = async (instanceId) => {
    if (!instanceId) return;

    const client = getClient();
    try {
        console.log('\nStarting cleanup...');
        console.log(`Terminating EC2 instance: ${instanceId}`);
        
        await client.send(
            new TerminateInstancesCommand({
                InstanceIds: [instanceId]
            })
        );

        await waitForInstanceStatus(instanceId, 'terminated');
        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Display instance details
const displayInstanceDetails = async (instanceId) => {
    const client = getClient();
    try {
        const response = await client.send(
            new DescribeInstancesCommand({
                InstanceIds: [instanceId]
            })
        );

        const instance = response.Reservations[0].Instances[0];
        console.log('\nInstance Details:');
        console.log('----------------');
        console.log(`Instance ID: ${instance.InstanceId}`);
        console.log(`Instance Type: ${instance.InstanceType}`);
        console.log(`EBS Optimized: ${instance.EbsOptimized}`);
        console.log(`State: ${instance.State.Name}`);
        console.log('\nNon-compliant configuration:');
        console.log('- EBS optimization is disabled when it should be enabled');
        console.log('- This instance type (m5.large) supports EBS optimization');
    } catch (error) {
        console.error('Error fetching instance details:', error);
    }
};

// Main function
const main = async () => {
    let instanceId;

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

        // Display instance details
        await displayInstanceDetails(instanceId);

        // Wait period to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (instanceId) {
            try {
                await cleanup(instanceId);
            } catch (cleanupError) {
                console.error('Error during cleanup:', cleanupError);
            }
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
