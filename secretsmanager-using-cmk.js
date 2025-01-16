require('dotenv').config();
const {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  DescribeSecretCommand,
  ListSecretsCommand,
  GetSecretValueCommand
} = require("@aws-sdk/client-secrets-manager");

const {
  KMSClient,
  ListKeysCommand,
  DescribeKeyCommand,
  ListAliasesCommand
} = require("@aws-sdk/client-kms");

// Initialize clients
const secretsClient = new SecretsManagerClient({
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

// Create non-compliant secret (without CMK)
async function createNonCompliantSecret() {
  try {
    // Generate unique name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secretName = `test-secret-${timestamp}`;

    // Create secret with default encryption (aws/secretsmanager)
    const response = await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: 'test-user',
          password: 'test-password'
        })
        // Not specifying KmsKeyId makes this use the default aws/secretsmanager key
      })
    );

    createdResources.push({
      type: 'SECRET',
      name: secretName
    });

    console.log(`Created non-compliant secret: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating non-compliant secret:', error);
    throw error;
  }
}

// Check secret encryption
async function checkSecretEncryption(secretName) {
  try {
    const response = await secretsClient.send(
      new DescribeSecretCommand({
        SecretId: secretName
      })
    );

    console.log('\nAnalyzing Secret:', secretName);
    console.log('Secret Details:');
    console.log(`ARN: ${response.ARN}`);
    console.log(`Name: ${response.Name}`);
    console.log(`Last Changed: ${response.LastChangedDate}`);
    
    console.log('\nEncryption Settings:');
    const kmsKeyId = response.KmsKeyId;
    console.log(`KMS Key ID: ${kmsKeyId || 'Using default aws/secretsmanager key'}`);

    // Check if using CMK
    const isUsingCMK = kmsKeyId && !kmsKeyId.includes('aws/secretsmanager');
    console.log(`\nCompliance Status: ${isUsingCMK ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isUsingCMK;
  } catch (error) {
    console.error('Error checking secret encryption:', error);
    throw error;
  }
}

// List and check all secrets
async function listSecretsAndCheckEncryption() {
  try {
    const response = await secretsClient.send(new ListSecretsCommand({}));
    
    console.log('\nChecking all secrets in region:');
    for (const secret of response.SecretList) {
      console.log(`\nSecret Name: ${secret.Name}`);
      console.log(`ARN: ${secret.ARN}`);
      console.log(`Last Changed: ${secret.LastChangedDate}`);
      
      const kmsKeyId = secret.KmsKeyId;
      console.log(`KMS Key ID: ${kmsKeyId || 'Using default aws/secretsmanager key'}`);
      
      const isUsingCMK = kmsKeyId && !kmsKeyId.includes('aws/secretsmanager');
      console.log(`Compliance Status: ${isUsingCMK ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing secrets:', error);
  }
}

// Test secret retrieval
async function testSecretRetrieval(secretName) {
  try {
    console.log('\nTesting secret retrieval...');
    
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName
      })
    );

    console.log('Successfully retrieved secret value');
    console.log('Secret version stages:', response.VersionStages);
  } catch (error) {
    console.error('Error retrieving secret:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'SECRET':
          await secretsClient.send(
            new DeleteSecretCommand({
              SecretId: resource.name,
              ForceDeleteWithoutRecovery: true
            })
          );
          console.log(`Deleted secret: ${resource.name}`);
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
    console.log('Starting Secrets Manager CMK check...');
    
    // List available KMS keys
    await listKMSKeys();
    
    // Create non-compliant secret
    console.log('\nCreating non-compliant secret...');
    const secretName = await createNonCompliantSecret();
    
    // Check encryption configuration
    await checkSecretEncryption(secretName);
    
    // Test secret retrieval
    await testSecretRetrieval(secretName);
    
    // List all secrets and check their encryption
    await listSecretsAndCheckEncryption();
    
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
