const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    UpdateTableCommand
} = require("@aws-sdk/client-dynamodb");

const {
    ApplicationAutoScalingClient,
    DescribeScalableTargetsCommand
} = require("@aws-sdk/client-application-auto-scaling");


require('dotenv').config();

// Initialize clients
const dynamodbClient = new DynamoDBClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const autoScalingClient = new ApplicationAutoScalingClient({
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

async function verifyAutoScalingDisabled(tableName) {
    try {
        const response = await autoScalingClient.send(new DescribeScalableTargetsCommand({
            ServiceNamespace: 'dynamodb',
            ResourceIds: [`table/${tableName}`]
        }));

        return response.ScalableTargets.length === 0;
    } catch (error) {
        console.error('Error verifying auto scaling configuration:', error);
        throw error;
    }
}

async function createNonCompliantTable() {
    const timestamp = Date.now();
    const tableName = `no-autoscaling-table-${timestamp}`;

    try {
        // Create table with fixed provisioned capacity
        const createParams = {
            TableName: tableName,
            AttributeDefinitions: [
                {
                    AttributeName: "id",
                    AttributeType: "S"
                }
            ],
            KeySchema: [
                {
                    AttributeName: "id",
                    KeyType: "HASH"
                }
            ],
            // Non-compliant: Using PROVISIONED without auto scaling
            BillingMode: "PROVISIONED",
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            },
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
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

        // Verify auto scaling is disabled
        const isAutoScalingDisabled = await verifyAutoScalingDisabled(tableName);

        console.log('\nTable Details:');
        console.log(`Name: ${table.TableName}`);
        console.log(`Status: ${table.TableStatus}`);
        console.log(`ARN: ${table.TableArn}`);
        console.log(`Billing Mode: ${table.BillingModeSummary?.BillingMode || 'PROVISIONED'}`);
        console.log(`Read Capacity Units: ${table.ProvisionedThroughput.ReadCapacityUnits}`);
        console.log(`Write Capacity Units: ${table.ProvisionedThroughput.WriteCapacityUnits}`);
        console.log(`Auto Scaling: ${isAutoScalingDisabled ? 'Disabled' : 'Enabled'}`);

        console.log('\nNon-compliant configuration:');
        console.log('- Auto scaling is disabled');
        console.log('- Fixed provisioned capacity');
        console.log('- No automatic capacity adjustment');
        console.log('- May lead to throttling under high load');
        console.log('- May result in over-provisioning during low usage');

        return {
            tableName: table.TableName,
            tableArn: table.TableArn,
            readCapacityUnits: table.ProvisionedThroughput.ReadCapacityUnits,
            writeCapacityUnits: table.ProvisionedThroughput.WriteCapacityUnits,
            autoScalingDisabled: isAutoScalingDisabled
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
        console.log(`Read Capacity Units: ${result.readCapacityUnits}`);
        console.log(`Write Capacity Units: ${result.writeCapacityUnits}`);
        console.log(`Auto Scaling: ${result.autoScalingDisabled ? 'Disabled' : 'Enabled'}`);

        console.log('\nWarning:');
        console.log('This table configuration:');
        console.log('1. Does not automatically adjust capacity');
        console.log('2. May experience throttling under high load');
        console.log('3. May be over-provisioned during low usage');
        console.log('4. Requires manual capacity adjustments');
        console.log('5. Is not recommended for production workloads');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
