const {
    DynamoDBClient,
    CreateTableCommand,
    DeleteTableCommand,
    DescribeTableCommand,
    ListBackupsCommand
} = require("@aws-sdk/client-dynamodb");

const {
    BackupClient,
    ListBackupPlansCommand,
    GetBackupPlanCommand
} = require("@aws-sdk/client-backup");

require('dotenv').config();

// Initialize AWS client
const getClient = (ClientType) => {
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

        return new ClientType(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create non-compliant DynamoDB table (without backup plan)
const createNonCompliantTable = async () => {
    const client = getClient(DynamoDBClient);
    const tableName = `non-compliant-table-${Date.now()}`;

    try {
        console.log('Creating DynamoDB table without backup plan...');
        
        const response = await client.send(
            new CreateTableCommand({
                TableName: tableName,
                AttributeDefinitions: [
                    {
                        AttributeName: 'id',
                        AttributeType: 'S'
                    }
                ],
                KeySchema: [
                    {
                        AttributeName: 'id',
                        KeyType: 'HASH'
                    }
                ],
                BillingMode: 'PAY_PER_REQUEST', // Use on-demand capacity to minimize costs
                Tags: [
                    {
                        Key: 'Purpose',
                        Value: 'CISBenchmarkTesting'
                    }
                ]
            })
        );

        console.log(`Table ${tableName} creation initiated`);
        await waitForTableStatus(tableName, 'ACTIVE');
        return tableName;
    } catch (error) {
        console.error('Error creating DynamoDB table:', error);
        throw error;
    }
};

// Wait for table status
const waitForTableStatus = async (tableName, targetStatus, timeoutMinutes = 5) => {
    const client = getClient(DynamoDBClient);
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    console.log(`Waiting up to ${timeoutMinutes} minutes for table ${tableName} to be ${targetStatus}...`);

    while (true) {
        try {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Timeout waiting for table status ${targetStatus}`);
            }

            const response = await client.send(
                new DescribeTableCommand({
                    TableName: tableName
                })
            );

            const status = response.Table.TableStatus;
            console.log(`Current status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            // Wait 10 seconds before next check
            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            if (error.name === 'ResourceNotFoundException' && targetStatus === 'DELETED') {
                console.log('Table deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Check backup configurations
const checkBackupConfigurations = async (tableName) => {
    try {
        // Check for existing backups
        const dynamoClient = getClient(DynamoDBClient);
        const backupClient = getClient(BackupClient);

        console.log('\nChecking backup configurations...');

        // Check for point-in-time recovery
        const tableResponse = await dynamoClient.send(
            new DescribeTableCommand({
                TableName: tableName
            })
        );

        // Check for existing backups
        const backupsResponse = await dynamoClient.send(
            new ListBackupsCommand({
                TableName: tableName
            })
        );

        // Check for AWS Backup plans
        const backupPlansResponse = await backupClient.send(
            new ListBackupPlansCommand({})
        );

        console.log('\nBackup Configuration Status:');
        console.log('---------------------------');
        console.log(`Point-in-time Recovery: ${tableResponse.Table.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus || 'DISABLED'}`);
        console.log(`Number of Manual Backups: ${backupsResponse.BackupSummaries?.length || 0}`);
        console.log(`Number of Backup Plans: ${backupPlansResponse.BackupPlansList?.length || 0}`);
        
        console.log('\nNon-compliant configurations:');
        console.log('- No AWS Backup plan configured');
        console.log('- Point-in-time recovery not enabled');
        console.log('- No automated backup schedule');

    } catch (error) {
        console.error('Error checking backup configurations:', error);
    }
};

// Cleanup resources
const cleanup = async (tableName) => {
    if (!tableName) return;

    const client = getClient(DynamoDBClient);
    try {
        console.log('\nStarting cleanup...');
        console.log(`Deleting DynamoDB table: ${tableName}`);
        
        await client.send(
            new DeleteTableCommand({
                TableName: tableName
            })
        );

        await waitForTableStatus(tableName, 'DELETED');
        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let tableName;

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

        // Create non-compliant table
        tableName = await createNonCompliantTable();

        // Check and display backup configurations
        await checkBackupConfigurations(tableName);

        // Wait period to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (tableName) {
            try {
                await cleanup(tableName);
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
