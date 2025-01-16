const {
    DynamoDBClient,
    CreateTableCommand,
    DeleteTableCommand,
    UpdateContinuousBackupsCommand,
    DescribeContinuousBackupsCommand,
    DescribeTableCommand,
    ListTablesCommand
} = require("@aws-sdk/client-dynamodb");

require('dotenv').config();

// Initialize AWS client with temporary credentials
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

        return new DynamoDBClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create DynamoDB table with PITR disabled (non-compliant)
const createNonCompliantTable = async () => {
    const client = getClient();
    const tableName = `temp-table-${Date.now()}`;

    try {
        // Create table with minimal configuration
        const createParams = {
            TableName: tableName,
            AttributeDefinitions: [{
                AttributeName: 'id',
                AttributeType: 'S'
            }],
            KeySchema: [{
                AttributeName: 'id',
                KeyType: 'HASH'
            }],
            BillingMode: 'PAY_PER_REQUEST' // Use on-demand capacity for cost efficiency
        };

        console.log('Creating DynamoDB table...');
        await client.send(new CreateTableCommand(createParams));

        // Wait for table to be active
        await waitForTableStatus(client, tableName, 'ACTIVE');
        console.log('Table created successfully');

        // Verify PITR status (should be disabled by default)
        const pitrStatus = await checkPITRStatus(client, tableName);
        console.log(`PITR Status: ${pitrStatus}`);

        return tableName;
    } catch (error) {
        console.error('Error creating DynamoDB table:', error);
        throw error;
    }
};

// Wait for table status
const waitForTableStatus = async (client, tableName, targetStatus) => {
    while (true) {
        try {
            const response = await client.send(
                new DescribeTableCommand({
                    TableName: tableName
                })
            );

            const status = response.Table.TableStatus;
            console.log(`Current table status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
        } catch (error) {
            if (error.name === 'ResourceNotFoundException' && targetStatus === 'DELETED') {
                console.log('Table deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Check PITR status
const checkPITRStatus = async (client, tableName) => {
    try {
        const response = await client.send(
            new DescribeContinuousBackupsCommand({
                TableName: tableName
            })
        );

        const pitrStatus = response.ContinuousBackupsDescription
            .PointInTimeRecoveryDescription
            .PointInTimeRecoveryStatus;

        return pitrStatus;
    } catch (error) {
        console.error('Error checking PITR status:', error);
        throw error;
    }
};

// Enable PITR (make compliant)
const enablePITR = async (tableName) => {
    const client = getClient();

    try {
        console.log('Enabling PITR...');
        await client.send(
            new UpdateContinuousBackupsCommand({
                TableName: tableName,
                PointInTimeRecoverySpecification: {
                    PointInTimeRecoveryEnabled: true
                }
            })
        );

        // Verify PITR is enabled
        const pitrStatus = await checkPITRStatus(client, tableName);
        console.log(`Updated PITR Status: ${pitrStatus}`);
    } catch (error) {
        console.error('Error enabling PITR:', error);
        throw error;
    }
};

// Delete DynamoDB table
const deleteTable = async (tableName) => {
    const client = getClient();

    try {
        console.log('Deleting DynamoDB table...');
        await client.send(
            new DeleteTableCommand({
                TableName: tableName
            })
        );

        // Wait for table to be deleted
        await waitForTableStatus(client, tableName, 'DELETED');
    } catch (error) {
        console.error('Error deleting DynamoDB table:', error);
        throw error;
    }
};

// List existing tables (optional utility function)
const listTables = async () => {
    const client = getClient();

    try {
        const response = await client.send(new ListTablesCommand({}));
        console.log('Existing tables:', response.TableNames);
    } catch (error) {
        console.error('Error listing tables:', error);
    }
};

// Main function
const main = async () => {
    let tableName = null;

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Optional: List existing tables
        await listTables();

        // Create non-compliant table (PITR disabled)
        tableName = await createNonCompliantTable();

        // Wait to observe the non-compliant state
        console.log('\nWaiting 30 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Optional: Make the table compliant
        // await enablePITR(tableName);
        // console.log('\nWaiting 30 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (tableName) {
            console.log('\nStarting cleanup...');
            try {
                await deleteTable(tableName);
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
