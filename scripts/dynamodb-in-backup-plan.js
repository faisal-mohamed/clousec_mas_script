const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    UpdateTableCommand,
    DescribeContinuousBackupsCommand
} = require("@aws-sdk/client-dynamodb");


require('dotenv').config();

// Initialize DynamoDB client
const dynamodbClient = new DynamoDBClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function waitForTableStatus(tableName, desiredStatus) {
    console.log(`Waiting for table to be ${desiredStatus}...`);
    
    while (true) {
        try {
            const response = await dynamodbClient.send(new DescribeTableCommand({
                TableName: tableName
            }));

            const status = response.Table.TableStatus;
            console.log(`Current status: ${status}`);

            if (status === desiredStatus) {
                return response.Table;
            }

            // Wait for 10 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            console.error('Error checking table status:', error);
            throw error;
        }
    }
}

async function verifyBackupSettings(tableName) {
    try {
        const response = await dynamodbClient.send(new DescribeContinuousBackupsCommand({
            TableName: tableName
        }));

        return {
            pointInTimeRecoveryEnabled: response.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus === 'ENABLED',
            continuousBackupsEnabled: response.ContinuousBackupsDescription?.ContinuousBackupsStatus === 'ENABLED'
        };
    } catch (error) {
        console.error('Error verifying backup settings:', error);
        throw error;
    }
}

async function createNonCompliantTable() {
    const timestamp = Date.now();
    const tableName = `no-backup-table-${timestamp}`;

    try {
        // Create table without backup configuration
        const createParams = {
            TableName: tableName,
            AttributeDefinitions: [
                {
                    AttributeName: "id",
                    AttributeType: "S"
                },
                {
                    AttributeName: "timestamp",
                    AttributeType: "N"
                }
            ],
            KeySchema: [
                {
                    AttributeName: "id",
                    KeyType: "HASH"
                },
                {
                    AttributeName: "timestamp",
                    KeyType: "RANGE"
                }
            ],
            BillingMode: "PAY_PER_REQUEST", // Using on-demand capacity
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                },
                {
                    Key: "backup-status",
                    Value: "disabled"
                }
            ]
        };

        console.log('Creating DynamoDB table without backup...');
        const createResponse = await dynamodbClient.send(new CreateTableCommand(createParams));
        
        console.log('\nTable creation initiated:');
        console.log(`Table Name: ${createResponse.TableDescription.TableName}`);
        console.log(`Status: ${createResponse.TableDescription.TableStatus}`);

        // Wait for table to be active
        const table = await waitForTableStatus(tableName, 'ACTIVE');

        // Verify backup settings
        const backupSettings = await verifyBackupSettings(tableName);

        console.log('\nTable Details:');
        console.log(`Name: ${table.TableName}`);
        console.log(`Status: ${table.TableStatus}`);
        console.log(`ARN: ${table.TableArn}`);
        console.log(`Billing Mode: ${table.BillingModeSummary?.BillingMode || 'PAY_PER_REQUEST'}`);
        console.log(`Point-in-Time Recovery: ${backupSettings.pointInTimeRecoveryEnabled ? 'Enabled' : 'Disabled'}`);
        console.log(`Continuous Backups: ${backupSettings.continuousBackupsEnabled ? 'Enabled' : 'Disabled'}`);

        console.log('\nTable Schema:');
        console.log('- Partition Key: id (String)');
        console.log('- Sort Key: timestamp (Number)');

        console.log('\nNon-compliant configuration:');
        console.log('- Point-in-Time Recovery (PITR) is disabled');
        console.log('- No automated backup plan configured');
        console.log('- No AWS Backup integration');
        console.log('- No backup retention policy');
        console.log('- Manual backups required if needed');

        console.log('\nSecurity Warning:');
        console.log('1. No automated data recovery options');
        console.log('2. Risk of data loss in case of accidental deletion');
        console.log('3. No point-in-time restore capability');
        console.log('4. Manual intervention required for backups');
        console.log('5. No protection against accidental writes/deletes');

        return {
            tableName: table.TableName,
            tableArn: table.TableArn,
            backupSettings: backupSettings
        };

    } catch (error) {
        console.error('Error creating DynamoDB table:', error);
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

        const result = await createNonCompliantTable();
        
        console.log('\nTable created successfully:');
        console.log(`Table Name: ${result.tableName}`);
        console.log(`Table ARN: ${result.tableArn}`);
        console.log(`PITR Enabled: ${result.backupSettings.pointInTimeRecoveryEnabled}`);
        console.log(`Continuous Backups: ${result.backupSettings.continuousBackupsEnabled}`);

        console.log('\nWarning:');
        console.log('This table configuration:');
        console.log('1. Has no automated backup mechanism');
        console.log('2. Cannot restore to a point in time');
        console.log('3. Requires manual backup procedures');
        console.log('4. May not meet compliance requirements');
        console.log('5. Has increased risk of data loss');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
