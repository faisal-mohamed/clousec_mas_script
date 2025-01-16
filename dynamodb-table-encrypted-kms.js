require('dotenv').config();
const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
  ListTablesCommand,
  UpdateTableCommand
} = require("@aws-sdk/client-dynamodb");

// Initialize DynamoDB client
const dynamodbClient = new DynamoDBClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create non-compliant DynamoDB table (without KMS encryption)
async function createNonCompliantTable() {
  const tableName = `test-table-non-compliant-${Date.now()}`;
  
  try {
    // Create table without KMS encryption
    const createTableResponse = await dynamodbClient.send(
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
        BillingMode: 'PAY_PER_REQUEST',
        SSESpecification: {
          Enabled: false // Disable server-side encryption with KMS
        }
      })
    );

    createdResources.push({
      type: 'TABLE',
      name: tableName
    });

    console.log(`Created non-compliant table: ${tableName}`);
    
    // Wait for table to be active
    await waitForTableActive(tableName);
    
    return tableName;
  } catch (error) {
    console.error('Error creating non-compliant table:', error);
    throw error;
  }
}

// Wait for table to be active
async function waitForTableActive(tableName) {
  console.log('Waiting for table to be active...');
  
  while (true) {
    try {
      const response = await dynamodbClient.send(
        new DescribeTableCommand({
          TableName: tableName
        })
      );

      if (response.Table.TableStatus === 'ACTIVE') {
        break;
      }
    } catch (error) {
      console.error('Error checking table status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Check table encryption
async function checkTableEncryption(tableName) {
  try {
    const response = await dynamodbClient.send(
      new DescribeTableCommand({
        TableName: tableName
      })
    );

    const table = response.Table;
    console.log(`\nAnalyzing Table: ${table.TableName}`);
    
    // Check SSE settings
    const sseDescription = table.SSEDescription || {};
    const isKmsEncrypted = sseDescription.SSEType === 'KMS';
    const kmsKeyArn = sseDescription.KMSMasterKeyArn;

    console.log('Encryption Settings:');
    console.log(`SSE Type: ${sseDescription.SSEType || 'Not specified (using default encryption)'}`);
    console.log(`KMS Key ARN: ${kmsKeyArn || 'Not using KMS'}`);
    console.log(`Status: ${sseDescription.Status || 'Not using KMS encryption'}`);
    console.log(`Compliance Status: ${isKmsEncrypted ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isKmsEncrypted;
  } catch (error) {
    console.error('Error checking table encryption:', error);
    throw error;
  }
}

// List all tables and check their encryption
async function listTablesAndCheckEncryption() {
  try {
    const response = await dynamodbClient.send(new ListTablesCommand({}));
    
    console.log('\nChecking all tables in region:');
    for (const tableName of response.TableNames) {
      await checkTableEncryption(tableName);
    }
  } catch (error) {
    console.error('Error listing tables:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'TABLE':
          await dynamodbClient.send(
            new DeleteTableCommand({
              TableName: resource.name
            })
          );
          console.log(`Deleted table: ${resource.name}`);
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting DynamoDB table encryption check...');
    
    // Create non-compliant table
    console.log('\nCreating non-compliant table...');
    const tableName = await createNonCompliantTable();
    
    // Check encryption configuration
    await checkTableEncryption(tableName);
    
    // List all tables and check their encryption
    await listTablesAndCheckEncryption();
    
    // Wait before cleanup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
