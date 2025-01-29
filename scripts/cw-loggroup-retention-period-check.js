const {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    DescribeLogGroupsCommand
} = require("@aws-sdk/client-cloudwatch-logs");


require('dotenv').config();

// Initialize CloudWatch Logs client
const logsClient = new CloudWatchLogsClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createNonCompliantLogGroup() {
    const resourcePrefix = 'non-compliant';
    const timestamp = Date.now();
    const logGroupName = `/${resourcePrefix}/no-retention-${timestamp}`;

    try {
        // Create log group without retention period
        await logsClient.send(new CreateLogGroupCommand({
            logGroupName: logGroupName,
            tags: {
                'simulation-mas': 'true',
                'retention': 'not-configured'
            }
        }));

        console.log(`Created log group without retention period: ${logGroupName}`);

        // Verify the log group configuration
        const response = await logsClient.send(new DescribeLogGroupsCommand({
            logGroupNamePrefix: logGroupName
        }));

        if (response.logGroups && response.logGroups.length > 0) {
            const logGroup = response.logGroups[0];
            
            console.log('\nLog Group Details:');
            console.log(`Name: ${logGroup.logGroupName}`);
            console.log(`ARN: ${logGroup.arn}`);
            console.log(`Retention Period: ${logGroup.retentionInDays || 'Never Expire (non-compliant)'}`);
            console.log(`Created: ${new Date(logGroup.creationTime).toISOString()}`);
            console.log(`Storage Size: ${logGroup.storedBytes || 0} bytes`);
            
            console.log('\nConfiguration Warning:');
            console.log('- No retention period configured');
            console.log('- Logs will be stored indefinitely');
            console.log('- This may lead to unnecessary storage costs');
            console.log('- Consider setting an appropriate retention period');
            console.log('- Logs older than needed will continue to accumulate');
        }

    } catch (error) {
        console.error('Error creating log group:', error);
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

        await createNonCompliantLogGroup();
    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
