require('dotenv').config();
const {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  GetSecretValueCommand,
  DescribeSecretCommand,
  ListSecretsCommand,
  PutSecretValueCommand, // Added this command for updating secret value
} = require("@aws-sdk/client-secrets-manager");

// Initialize Secrets Manager client
const secretsClient = new SecretsManagerClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  },
  region: process.env.AWS_REGION || 'ap-southeast-1',
});

// Track created resources
const createdResources = [];

// Create non-compliant secret (without rotation)
async function createNonCompliantSecret() {
  const secretName = `test-secret-${Date.now()}-${Math.random()}`;
  try {
    // Create a secret without rotation configuration
    const createSecretResponse = await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: "test-user",
          password: "test-password-initial",
        }),
        Description: "Test secret for periodic rotation check",
        Tags: [{
          Key: "simulation-mas",
          Value: "true"
        }],
      })
    );

    createdResources.push({
      type: 'SECRET',
      name: secretName,
    });

    console.log(`Created non-compliant secret: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating secret:', error);
    throw error;
  }
}

// Check secret rotation status
async function checkSecretRotationStatus() {
  try {
    const response = await secretsClient.send(new ListSecretsCommand({}));

    console.log('\nChecking Secrets Rotation Status:');
    for (const secret of response.SecretList) {
      console.log(`\nSecret Name: ${secret.Name}`);
      console.log(`Last Changed Date: ${secret.LastChangedDate}`);
      console.log(`Last Rotated Date: ${secret.LastRotatedDate || 'Never rotated'}`);

      // Calculate days since last rotation or creation
      const lastRotatedDate = secret.LastRotatedDate || secret.CreatedDate;
      const daysSinceRotation = Math.floor(
        (new Date() - lastRotatedDate) / (1000 * 60 * 60 * 24)
      );

      console.log(`Days since last rotation: ${daysSinceRotation}`);

      // Check compliance (default threshold is 90 days)
      const rotationThreshold = 90;
      console.log(`Rotation Status: ${daysSinceRotation > rotationThreshold ? 'NON_COMPLIANT' : 'COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error checking rotation status:', error);
  }
}

// Get secret details
async function getSecretDetails(secretName) {
  try {
    const response = await secretsClient.send(
      new DescribeSecretCommand({
        SecretId: secretName,
      })
    );

    console.log('\nSecret Details:');
    console.log(`Name: ${response.Name}`);
    console.log(`Description: ${response.Description}`);
    console.log(`Last Changed Date: ${response.LastChangedDate}`);
    console.log(`Last Rotated Date: ${response.LastRotatedDate || 'Never rotated'}`);
    console.log(`Rotation Enabled: ${response.RotationEnabled || false}`);

    if (response.RotationRules) {
      console.log('Rotation Rules:', response.RotationRules);
    }

    return response;
  } catch (error) {
    console.error('Error getting secret details:', error);
  }
}

// Simulate secret value change without proper rotation
async function simulateSecretChange(secretName) {
  try {
    // Get current secret value
    const getCurrentValue = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    const currentSecret = JSON.parse(getCurrentValue.SecretString);

    // Update secret with new value (simulating manual change without rotation)
    await secretsClient.send(
      new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify({
          ...currentSecret,
          password: `test-password-changed-${Date.now()}`,
        }),
      })
    );

    console.log('\nSimulated manual secret change (without proper rotation)');
  } catch (error) {
    console.error('Error simulating secret change:', error);
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
              ForceDeleteWithoutRecovery: true,
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
    console.log('Starting non-compliant scenario creation...');

    // Create non-compliant secret
    const secretName = await createNonCompliantSecret();

    // Get initial secret details
    console.log('\nInitial secret state:');
    await getSecretDetails(secretName);

    // Simulate some time passing and manual changes
    console.log('\nSimulating manual secret changes...');
    await simulateSecretChange(secretName);

    // Check secret details after changes
    console.log('\nSecret state after changes:');
    await getSecretDetails(secretName);

    // Check overall rotation status
    await checkSecretRotationStatus();

    // Wait for a moment to simulate testing
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
   // await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
