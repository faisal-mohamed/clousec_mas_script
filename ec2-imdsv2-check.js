const { 
    EC2Client, 
    RunInstancesCommand, 
    DescribeInstancesCommand,
    ModifyInstanceMetadataOptionsCommand,
    TerminateInstancesCommand,
    DescribeImagesCommand
} = require('@aws-sdk/client-ec2');
require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

// Function to get latest Amazon Linux 2 AMI ID
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

        // Sort by creation date and get the latest
        const images = response.Images.sort((a, b) => {
            return new Date(b.CreationDate) - new Date(a.CreationDate);
        });

        return images[0].ImageId;
    } catch (error) {
        console.error('Error getting AMI ID:', error);
        throw error;
    }
}

// Function to create non-compliant EC2 instance (IMDSv1 enabled)
async function createNonCompliantInstance() {
    try {
        const amiId = await getLatestAL2AmiId();
        console.log('Using AMI:', amiId);

        const response = await ec2Client.send(new RunInstancesCommand({
            ImageId: amiId,
            InstanceType: 't2.micro',
            MinCount: 1,
            MaxCount: 1,
            MetadataOptions: {
                HttpTokens: 'optional', // This makes it non-compliant
                HttpEndpoint: 'enabled'
            },
            TagSpecifications: [{
                ResourceType: 'instance',
                Tags: [{
                    Key: 'Name',
                    Value: 'IMDSv2-Test-Instance'
                }]
            }]
        }));

        const instanceId = response.Instances[0].InstanceId;
        console.log('Created instance:', instanceId);
        return instanceId;
    } catch (error) {
        console.error('Error creating instance:', error);
        throw error;
    }
}

// Function to wait for instance to be running
async function waitForInstance(instanceId) {
    try {
        let state = '';
        do {
            const response = await ec2Client.send(new DescribeInstancesCommand({
                InstanceIds: [instanceId]
            }));
            
            state = response.Reservations[0].Instances[0].State.Name;
            console.log(`Instance state: ${state}`);
            
            if (state === 'pending') {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } while (state === 'pending');

        return state === 'running';
    } catch (error) {
        console.error('Error waiting for instance:', error);
        throw error;
    }
}

// Function to make instance compliant
async function makeInstanceCompliant(instanceId) {
    try {
        await ec2Client.send(new ModifyInstanceMetadataOptionsCommand({
            InstanceId: instanceId,
            HttpTokens: 'required', // This makes it compliant
            HttpEndpoint: 'enabled'
        }));
        console.log('Made instance compliant');
    } catch (error) {
        console.error('Error modifying instance:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupInstance(instanceId) {
    try {
        await ec2Client.send(new TerminateInstancesCommand({
            InstanceIds: [instanceId]
        }));
        console.log('Terminated instance:', instanceId);
    } catch (error) {
        console.error('Error terminating instance:', error);
    }
}

// Function to check instance metadata options
async function checkInstanceMetadataOptions(instanceId) {
    try {
        const response = await ec2Client.send(new DescribeInstancesCommand({
            InstanceIds: [instanceId]
        }));
        
        const instance = response.Reservations[0].Instances[0];
        console.log('\nInstance Metadata Options:');
        console.log('- HTTP Tokens:', instance.MetadataOptions.HttpTokens);
        console.log('- HTTP Endpoint:', instance.MetadataOptions.HttpEndpoint);
        console.log('- Instance ID:', instance.InstanceId);
        console.log('- State:', instance.State.Name);
    } catch (error) {
        console.error('Error checking instance metadata:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let instanceId = null;

    try {
        console.log('Starting IMDSv2 non-compliance simulation...');

        // Create non-compliant instance
        instanceId = await createNonCompliantInstance();

        // Wait for instance to be running
        console.log('Waiting for instance to be running...');
        const isRunning = await waitForInstance(instanceId);
        
        if (!isRunning) {
            throw new Error('Instance failed to reach running state');
        }

        // Check initial metadata options
        console.log('\nChecking initial (non-compliant) configuration:');
        await checkInstanceMetadataOptions(instanceId);

        // Wait to simulate testing period
        console.log('\nWaiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Optional: Make instance compliant
        console.log('\nMaking instance compliant...');
        await makeInstanceCompliant(instanceId);

        // Check final metadata options
        console.log('\nChecking final (compliant) configuration:');
        await checkInstanceMetadataOptions(instanceId);

        // Wait a bit to see the final state
        await new Promise(resolve => setTimeout(resolve, 5000));

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        if (instanceId) {
            console.log('\nCleaning up resources...');
            await cleanupInstance(instanceId);
        }
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
