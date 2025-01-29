require('dotenv').config();
const {
  SecretsManagerClient,
  CreateSecretCommand,
  GetSecretValueCommand,
  DescribeSecretCommand,
  ListSecretsCommand,
  PutSecretValueCommand
} = require("@aws-sdk/client-secrets-manager");

// Initialize Secrets Manager client
const secretsClient = new SecretsManagerClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

async function createUnusedSecret() {
  const secretName = `test-unused-secret-${Date.now()}`;
  
  try {
    const createSecretResponse = await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: "test-user",
          password: "test-password-initial"
        }),
        Description: "Test secret for unused check",
        Tags: [
          {
            Key: "simulation-mas",
            Value: "true"
          }
        ]
      })
    );

    console.log(`Created unused secret: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating unused secret:', error);
    throw error;
  }
}

async function createUsedSecret() {
  const secretName = `test-used-secret-${Date.now()}`;
  
  try {
    // Create secret
    await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: "test-user",
          password: "test-password-initial"
        }),
        Description: "Test secret that will be accessed",
        Tags: [
          {
            Key: "simulation-mas",
            Value: "true"
          }
        ]
      })
    );

    // Simulate usage by getting the secret value
    await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName
      })
    );

    console.log(`Created and accessed secret: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating used secret:', error);
    throw error;
  }
}

async function checkSecretUsage() {
  try {
    const response = await secretsClient.send(new ListSecretsCommand({}));
    
    console.log('\nChecking Secrets Usage Status:');
    for (const secret of response.SecretList) {
      console.log(`\nSecret Name: ${secret.Name}`);
      console.log(`Last Accessed Date: ${secret.LastAccessedDate || 'Never accessed'}`);
      
      // Calculate days since last access or creation
      const lastAccessedDate = secret.LastAccessedDate || secret.CreatedDate;
      const daysSinceAccess = Math.floor(
        (new Date() - lastAccessedDate) / (1000 * 60 * 60 * 24)
      );
      
      console.log(`Days since last access: ${daysSinceAccess}`);
      
      // Check compliance (default threshold is 90 days)
      const unusedThreshold = 90;
      console.log(`Usage Status: ${daysSinceAccess > unusedThreshold ? 'NON_COMPLIANT (Unused)' : 'COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error checking secret usage:', error);
  }
}

async function getSecretDetails(secretName) {
  try {
    const response = await secretsClient.send(
      new DescribeSecretCommand({
        SecretId: secretName
      })
    );

    console.log('\nSecret Details:');
    console.log(`Name: ${response.Name}`);
    console.log(`Description: ${response.Description}`);
    console.log(`Last Changed Date: ${response.LastChangedDate}`);
    console.log(`Last Accessed Date: ${response.LastAccessedDate || 'Never accessed'}`);
    
    return response;
  } catch (error) {
    console.error('Error getting secret details:', error);
  }
}

async function simulateSecretUpdate(secretName) {
  try {
    await secretsClient.send(
      new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify({
          username: "test-user",
          password: `test-password-updated-${Date.now()}`
        })
      })
    );

    console.log(`\nUpdated secret value for ${secretName} (without accessing it)`);
  } catch (error) {
    console.error('Error updating secret:', error);
  }
}

async function main() {
  try {
    console.log('Starting non-compliant scenario creation...');
    
    // Create unused secret
    const unusedSecretName = await createUnusedSecret();
    
    // Create and use another secret for comparison
    const usedSecretName = await createUsedSecret();
    
    // Get initial details
    console.log('\nInitial state of unused secret:');
    await getSecretDetails(unusedSecretName);
    
    console.log('\nInitial state of used secret:');
    await getSecretDetails(usedSecretName);
    
    // Simulate some updates without accessing the unused secret
    await simulateSecretUpdate(unusedSecretName);
    
    // Wait a moment to ensure changes are reflected
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Check final status
    console.log('\nFinal status after operations:');
    await checkSecretUsage();
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main();