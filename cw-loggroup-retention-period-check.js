const {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    DeleteLogGroupCommand,
    DescribeLogGroupsCommand,
    PutRetentionPolicyCommand,
    DeleteRetentionPolicyCommand
} = require("@aws-sdk/client-cloudwatch-logs");

// Configure credentials
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || 'ap-southeast-1'
};

// Initialize client
const logsClient = new CloudWatchLogsClient(credentials);

// Configuration
const config = {
    logGroups: [
        {
            name: `/aws/test/non-compliant-retention-7-${Date.now()}`,
            retention: 7 // Non-compliant: Less than 365 days
        },
        {
            name: `/aws/test/non-compliant-retention-30-${Date.now()}`,
            retention: 30 // Non-compliant: Less than 365 days
        },
        {
            name: `/aws/test/non-compliant-retention-90-${Date.now()}`,
            retention: 90 // Non-compliant: Less than 365 days
        },
        {
            name: `/aws/test/compliant-retention-365-${Date.now()}`,
            retention: 365 // Compliant: 365 days
        },
        {
            name: `/aws/test/non-compliant-no-retention-${Date.now()}`,
            retention: null // Non-compliant: No retention policy
        }
    ],
    createdGroups: []
};

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function createLogGroups() {
    try {
        console.log('Creating CloudWatch log groups...');

        for (const group of config.logGroups) {
            try {
                // Create log group
                const createCommand = new CreateLogGroupCommand({
                    logGroupName: group.name
                });
                await logsClient.send(createCommand);
                config.createdGroups.push(group.name);

                // Set retention policy if specified
                if (group.retention) {
                    const retentionCommand = new PutRetentionPolicyCommand({
                        logGroupName: group.name,
                        retentionInDays: group.retention
                    });
                    await logsClient.send(retentionCommand);
                }

                console.log(`Created log group: ${group.name} with retention: ${group.retention || 'Never Expire'}`);
            } catch (error) {
                console.error(`Error creating log group ${group.name}:`, error);
            }
        }

        // Wait for log groups to be fully created
        await wait(5000);
    } catch (error) {
        console.error('Error creating log groups:', error);
        throw error;
    }
}

async function verifyConfiguration() {
    try {
        console.log('\nVerifying CloudWatch log groups configuration...');

        const describeCommand = new DescribeLogGroupsCommand({
            logGroupNamePrefix: '/aws/test/'
        });

        const response = await logsClient.send(describeCommand);
        
        console.log('\nLog Groups Configuration:');
        for (const group of response.logGroups) {
            console.log(`\nLog Group: ${group.logGroupName}`);
            console.log(`Retention Period: ${group.retentionInDays || 'Never Expire'} days`);
            console.log(`Compliant: ${(group.retentionInDays >= 365 || group.retentionInDays === undefined) ? 'Yes' : 'No'}`);
        }

    } catch (error) {
        console.error('Error verifying configuration:', error);
    }
}

async function makeCompliant() {
    try {
        console.log('\nUpdating log groups to be compliant...');

        for (const groupName of config.createdGroups) {
            try {
                const retentionCommand = new PutRetentionPolicyCommand({
                    logGroupName: groupName,
                    retentionInDays: 365
                });
                await logsClient.send(retentionCommand);
                console.log(`Updated retention to 365 days for: ${groupName}`);
            } catch (error) {
                console.error(`Error updating retention for ${groupName}:`, error);
            }
        }

    } catch (error) {
        console.error('Error making log groups compliant:', error);
    }
}

async function cleanup() {
    try {
        console.log('\nStarting cleanup process...');

        for (const groupName of config.createdGroups) {
            try {
                const deleteCommand = new DeleteLogGroupCommand({
                    logGroupName: groupName
                });
                await logsClient.send(deleteCommand);
                console.log(`Deleted log group: ${groupName}`);
            } catch (error) {
                console.error(`Error deleting log group ${groupName}:`, error);
            }
        }

    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
}

async function main() {
    try {
        console.log('Starting CloudWatch log group retention period non-compliance simulation...');
        
        await createLogGroups();
        await verifyConfiguration();

        // Optional: Make log groups compliant
        // Uncomment the next line to update all log groups to be compliant
        // await makeCompliant();
        // await verifyConfiguration();

        console.log('\nWaiting for 5 seconds...');
        await wait(5000);

        await cleanup();
        
        console.log('\nScript execution completed successfully');

    } catch (error) {
        console.error('Error in main execution:', error);
        try {
            await cleanup();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

// Execute the script
main();
