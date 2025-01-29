const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand
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

async function createNonCompliantTable() {
    const timestamp = Date.now();
    const tableName = `no-kms-table-${timestamp}`;

    try {
        // Create table with default encryption (not using KMS)
        const createParams = {
            TableName: tableName,
            AttributeDefinitions: [
                {
                    AttributeName: "PK",
                    AttributeType: "S"
                },
                {
                    AttributeName: "SK",
                    AttributeType: "S"
                }
            ],
            KeySchema: [
                {
                    AttributeName: "PK",
                    KeyType: "HASH"
                },
                {
                    AttributeName: "SK",
                    KeyType: "RANGE"
                }
            ],
            BillingMode: "PAY_PER_REQUEST",
            
            // Not specifying SSESpecification will use default AWS owned key encryption
            
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                },
                {
                    Key: "encryption",
                    Value: "default"
                }
            ]
        };

        console.log('Creating DynamoDB table with default encryption...');
        const createResponse = await dynamodbClient.send(new CreateTableCommand(createParams));
        
        console.log('\nTable creation initiated:');
        console.log(`Table Name: ${createResponse.TableDescription.TableName}`);
        console.log(`Status: ${createResponse.TableDescription.TableStatus}`);

        // Wait for table to be active
        const table = await waitForTableStatus(tableName, 'ACTIVE');

        console.log('\nTable Details:');
        console.log(`Name: ${table.TableName}`);
        console.log(`Status: ${table.TableStatus}`);
        console.log(`ARN: ${table.TableArn}`);
        console.log(`Billing Mode: ${table.BillingModeSummary?.BillingMode || 'PAY_PER_REQUEST'}`);

        // Display encryption details
        const sseDescription = table.SSEDescription || {};
        console.log('\nEncryption Configuration:');
        console.log(`Status: ${sseDescription.Status || 'ENABLED'}`);
        console.log(`Type: Default (AWS owned key)`);
        console.log('KMS Master Key: Not using KMS');

        console.log('\nTable Schema:');
        console.log('- Partition Key: PK (String)');
        console.log('- Sort Key: SK (String)');

        console.log('\nNon-compliant configuration:');
        console.log('- Using default AWS owned key encryption');
        console.log('- Not using AWS KMS');
        console.log('- No customer-managed key');
        console.log('- No AWS managed key');
        console.log('- Limited encryption key management');

        console.log('\nSecurity Implications:');
        console.log('1. No control over encryption key lifecycle');
        console.log('2. Cannot audit key usage through CloudTrail');
        console.log('3. Cannot rotate encryption key');
        console.log('4. Cannot restrict key usage through IAM');
        console.log('5. May not meet compliance requirements');

        return {
            tableName: table.TableName,
            tableArn: table.TableArn,
            encryptionType: 'Default (AWS owned key)',
            encryptionStatus: sseDescription.Status || 'ENABLED'
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
        console.log(`Encryption Type: ${result.encryptionType}`);
        console.log(`Encryption Status: ${result.encryptionStatus}`);

        console.log('\nWarning:');
        console.log('This table configuration:');
        console.log('1. Uses AWS owned keys (default encryption)');
        console.log('2. Provides no key management capabilities');
        console.log('3. Offers limited encryption controls');
        console.log('4. May not satisfy security requirements');
        console.log('5. Has reduced encryption flexibility');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
