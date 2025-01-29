const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    DescribeContinuousBackupsCommand,
    UpdateContinuousBackupsCommand
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

async function verifyPITRStatus(tableName) {
    try {
        const response = await dynamodbClient.send(new DescribeContinuousBackupsCommand({
            TableName: tableName
        }));

        return response.ContinuousBackupsDescription
            ?.PointInTimeRecoveryDescription
            ?.PointInTimeRecoveryStatus === 'ENABLED';
    } catch (error) {
        console.error('Error verifying PITR status:', error);
        throw error;
    }
}

async function createNonCompliantTable() {
    const timestamp = Date.now();
    const tableName = `no-pitr-table-${timestamp}`;

    try {
        // Create table with basic configuration
        const createParams = {
            TableName: tableName,
            AttributeDefinitions: [
                {
                    AttributeName: "id",
                    AttributeType: "S"
                },
                {
                    AttributeName: "sortKey",
                    AttributeType: "S"
                }
            ],
            KeySchema: [
                {
                    AttributeName: "id",
                    KeyType: "HASH"
                },
                {
                    AttributeName: "sortKey",
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
                    Key: "pitr-status",
                    Value: "disabled"
                }
            ]
        };

        console.log('Creating DynamoDB table...');
        const createResponse = await dynamodbClient.send(new CreateTableCommand(createParams));
        
        console.log('\nTable creation initiated:');
        console.log(`Table Name: ${createResponse.TableDescription.TableName}`);
        console.log(`Status: ${createResponse.TableDescription.TableStatus}`);

        // Wait for table to be active
        const table = await waitForTableStatus(tableName, 'ACTIVE');

        // Explicitly disable PITR (although it's disabled by default)
        try {
            await dynamodbClient.send(new UpdateContinuousBackupsCommand({
                TableName: tableName,
                PointInTimeRecoverySpecification: {
                    PointInTimeRecoveryEnabled: false
                }
            }));
            console.log('PITR explicitly disabled');
        } catch (error) {
            console.log('Note: PITR is already disabled by default');
        }

        // Verify PITR status
        const isPITREnabled = await verifyPITRStatus(tableName);

        console.log('\nTable Details:');
        console.log(`Name: ${table.TableName}`);
        console.log(`Status: ${table.TableStatus}`);
        console.log(`ARN: ${table.TableArn}`);
        console.log(`Billing Mode: ${table.BillingModeSummary?.BillingMode || 'PAY_PER_REQUEST'}`);
        console.log(`Point-in-Time Recovery: ${isPITREnabled ? 'Enabled' : 'Disabled'}`);

        console.log('\nTable Schema:');
        console.log('- Partition Key: id (String)');
        console.log('- Sort Key: sortKey (String)');

        console.log('\nNon-compliant configuration:');
        console.log('- Point-in-Time Recovery (PITR) is disabled');
        console.log('- No continuous backup capability');
        console.log('- No point-in-time restore capability');
        console.log('- Limited recovery options');
        console.log('- No protection against accidental writes/deletes');

        console.log('\nSecurity Implications:');
        console.log('1. Cannot restore to a specific point in time');
        console.log('2. Risk of data loss from accidental operations');
        console.log('3. Limited recovery options in case of incidents');
        console.log('4. No continuous backup protection');
        console.log('5. May not meet compliance requirements');

        return {
            tableName: table.TableName,
            tableArn: table.TableArn,
            pitrEnabled: isPITREnabled
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
        console.log(`PITR Enabled: ${result.pitrEnabled}`);

        console.log('\nWarning:');
        console.log('This table configuration:');
        console.log('1. Cannot restore to any point in time');
        console.log('2. Has no continuous backup protection');
        console.log('3. Requires manual backup procedures');
        console.log('4. Has increased risk of data loss');
        console.log('5. May not meet regulatory requirements');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
