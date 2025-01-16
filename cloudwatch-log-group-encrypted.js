require('dotenv').config();
const {
  CloudWatchLogsClient,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogGroupsCommand,
  AssociateKmsKeyCommand,
  DisassociateKmsKeyCommand,
  PutRetentionPolicyCommand
} = require("@aws-sdk/client-cloudwatch-logs");

const {
  KMSClient,
  ListKeysCommand,
  DescribeKeyCommand,
  ListAliasesCommand
} = require("@aws-sdk/client-kms");

// Initialize clients
const logsClient = new CloudWatchLogsClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const kmsClient = new KMSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// List available KMS keys
async function listKMSKeys() {
  try {
    const keysResponse = await kmsClient.send(new ListKeysCommand({}));
    const aliasesResponse = await kmsClient.send(new ListAliasesCommand({}));
    
    console.log('\nAvailable KMS Keys:');
    
    for (const key of keysResponse.Keys) {
      try {
        const keyDetails = await kmsClient.send(
          new DescribeKeyCommand({
            KeyId: key.KeyId
          })
        );
        
        // Find alias for this key
        const alias = aliasesResponse.Aliases.find(a => a.TargetKeyId === key.KeyId);
        
        console.log(`\nKey ID: ${key.KeyId}`);
        console.log(`Alias: ${alias ? alias.AliasName : 'No alias'}`);
        console.log(`Description: ${keyDetails.KeyMetadata.Description || 'No description'}`);
        console.log(`State: ${keyDetails.KeyMetadata.KeyState}`);
        console.log(`Key Manager: ${keyDetails.KeyMetadata.KeyManager}`);
        console.log('---');
      } catch (error) {
        console.error(`Error getting key details for ${key.KeyId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing KMS keys:', error);
  }
}

// Create non-compliant log group (without encryption)
async function createNonCompliantLogGroup() {
  try {
    // Generate unique name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const logGroupName = `/test/non-compliant-${timestamp}`;

    // Create log group without encryption
    await logsClient.send(
      new CreateLogGroupCommand({
        logGroupName: logGroupName
      })
    );

    // Set retention policy (30 days)
    await logsClient.send(
      new PutRetentionPolicyCommand({
        logGroupName: logGroupName,
        retentionInDays: 30
      })
    );

    createdResources.push({
      type: 'LOG_GROUP',
      name: logGroupName
    });

    console.log(`Created non-compliant log group: ${logGroupName}`);
    return logGroupName;
  } catch (error) {
    console.error('Error creating non-compliant log group:', error);
    throw error;
  }
}

// Check log group encryption
async function checkLogGroupEncryption(logGroupName) {
  try {
    const response = await logsClient.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: logGroupName
      })
    );

    if (!response.logGroups || response.logGroups.length === 0) {
      throw new Error('Log group not found');
    }

    const logGroup = response.logGroups[0];
    console.log('\nAnalyzing Log Group:', logGroup.logGroupName);
    console.log('Log Group Details:');
    console.log(`ARN: ${logGroup.arn}`);
    console.log(`Created: ${logGroup.creationTime}`);
    console.log(`Retention Period: ${logGroup.retentionInDays || 'Never expire'} days`);
    
    console.log('\nEncryption Settings:');
    console.log(`KMS Key ID: ${logGroup.kmsKeyId || 'Not configured'}`);

    const isCompliant = logGroup.kmsKeyId != null;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking log group encryption:', error);
    throw error;
  }
}

// List and check all log groups
async function listLogGroupsAndCheckEncryption() {
  try {
    const response = await logsClient.send(
      new DescribeLogGroupsCommand({})
    );
    
    console.log('\nChecking all log groups in region:');
    for (const logGroup of response.logGroups) {
      console.log(`\nLog Group: ${logGroup.logGroupName}`);
      console.log(`ARN: ${logGroup.arn}`);
      console.log(`Created: ${new Date(logGroup.creationTime).toISOString()}`);
      console.log(`Retention Period: ${logGroup.retentionInDays || 'Never expire'} days`);
      console.log(`KMS Key ID: ${logGroup.kmsKeyId || 'Not configured'}`);
      
      const isCompliant = logGroup.kmsKeyId != null;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing log groups:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'LOG_GROUP':
          // Remove KMS key if associated
          try {
            await logsClient.send(
              new DisassociateKmsKeyCommand({
                logGroupName: resource.name
              })
            );
            console.log(`Removed KMS key from log group: ${resource.name}`);
          } catch (error) {
            // Ignore if no KMS key was associated
            if (error.name !== 'ResourceNotFoundException') {
              console.error(`Error removing KMS key from ${resource.name}:`, error);
            }
          }

          // Delete log group
          await logsClient.send(
            new DeleteLogGroupCommand({
              logGroupName: resource.name
            })
          );
          console.log(`Deleted log group: ${resource.name}`);
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
    console.log('Starting CloudWatch log group encryption check...');
    
    // List available KMS keys
    await listKMSKeys();
    
    // Create non-compliant log group
    console.log('\nCreating non-compliant log group...');
    const logGroupName = await createNonCompliantLogGroup();
    
    // Check encryption configuration
    await checkLogGroupEncryption(logGroupName);
    
    // List all log groups and check their encryption
    await listLogGroupsAndCheckEncryption();
    
    // Wait before cleanup
    console.log('\nWaiting before cleanup...');
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
