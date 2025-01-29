const {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    DescribeLogGroupsCommand,
    PutRetentionPolicyCommand
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
    const logGroupName = `/${resourcePrefix}/unencrypted-logs-${timestamp}`;

    try {
        // Create log group without encryption
        await logsClient.send(new CreateLogGroupCommand({
            logGroupName: logGroupName,
            // Intentionally omitting kmsKeyId to make it non-compliant
            tags: {
                'simulation-mas': 'true',
                'encryption': 'disabled'
            }
        }));

        console.log(`Created unencrypted log group: ${logGroupName}`);

        // Set retention period (optional, but helps manage storage costs)
        await logsClient.send(new PutRetentionPolicyCommand({
            logGroupName: logGroupName,
            retentionInDays: 30  // Retain logs for 30 days
        }));

        console.log('Set retention period to 30 days');

        // Verify the log group configuration
        const response = await logsClient.send(new DescribeLogGroupsCommand({
            logGroupNamePrefix: logGroupName
        }));

        if (response.logGroups && response.logGroups.length > 0) {
            const logGroup = response.logGroups[0];
            
            console.log('\nLog Group Details:');
            console.log(`Name: ${logGroup.logGroupName}`);
            console.log(`ARN: ${logGroup.arn}`);
            console.log(`Retention Period: ${logGroup.retentionInDays} days`);
            console.log(`Created: ${new Date(logGroup.creationTime).toISOString()}`);
            console.log(`KMS Key: ${logGroup.kmsKeyId || 'Not configured (non-compliant)'}`);
            console.log(`Storage Size: ${logGroup.storedBytes || 0} bytes`);
            
            console.log('\nSecurity Warning:');
            console.log('- This log group is not encrypted with KMS');
            console.log('- Sensitive data in logs may be at risk');
            console.log('- This configuration is not recommended for production use');
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
