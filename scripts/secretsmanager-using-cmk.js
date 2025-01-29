require('dotenv').config();
const {
  SecretsManagerClient,
  CreateSecretCommand,
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
    const listKeysResponse = await kmsClient.send(new ListKeysCommand({}));
    const listAliasesResponse = await kmsClient.send(new ListAliasesCommand({}));

    console.log('\nAvailable KMS Keys:');
    for (const key of listKeysResponse.Keys) {
      const describeKeyResponse = await kmsClient.send(
        new DescribeKeyCommand({ KeyId: key.KeyId })
      );

      const keyAlias = listAliasesResponse.Aliases.find(
        alias => alias.TargetKeyId === key.KeyId
      );

      console.log(`- Key ID: ${key.KeyId}`);
      console.log(`  Description: ${describeKeyResponse.KeyMetadata.Description}`);
      if (keyAlias) {
        console.log(`  Alias: ${keyAlias.AliasName}`);
      }
    }
  } catch (error) {
    console.error('Error listing KMS keys:', error);
    throw error;
  }
}

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
        }),
        Tags: [
          {
            Key: 'simulation-mas',
            Value: 'true'
          }
        ]
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

    console.log('\nSecret encryption details:');
    console.log(`- Secret Name: ${secretName}`);
    console.log(`- KMS Key ID: ${response.KmsKeyId || 'Using default aws/secretsmanager key'}`);
    
    return response;
  } catch (error) {
    console.error('Error checking secret encryption:', error);
    throw error;
  }
}

async function listSecretsAndCheckEncryption() {
  try {
    const response = await secretsClient.send(new ListSecretsCommand({}));
    
    console.log('\nAll Secrets and their encryption:');
    for (const secret of response.SecretList) {
      console.log(`- Secret Name: ${secret.Name}`);
      console.log(`  KMS Key ID: ${secret.KmsKeyId || 'Using default aws/secretsmanager key'}`);
    }
  } catch (error) {
    console.error('Error listing secrets:', error);
    throw error;
  }
}

async function testSecretRetrieval(secretName) {
  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName
      })
    );

    console.log('\nSuccessfully retrieved secret value');
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
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

  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main();