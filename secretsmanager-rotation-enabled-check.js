const {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  RotateSecretCommand,
  ListSecretsCommand
} = require("@aws-sdk/client-secrets-manager");


require('dotenv').config();

const {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand
} = require("@aws-sdk/client-iam");

// Initialize clients
const secretsClient = new SecretsManagerClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const iamClient = new IAMClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create a non-compliant secret (without rotation)
async function createNonCompliantSecret() {
  const secretName = `test-secret-${Date.now()}`;
  
  try {
    // Create a basic secret without rotation
    const createSecretResponse = await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: "test-user",
          password: "test-password"
        })
      })
    );

    createdResources.push({
      type: 'SECRET',
      name: secretName
    });

    console.log(`Created non-compliant secret: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating secret:', error);
    throw error;
  }
}

// Optional: Create a compliant secret for comparison
async function createCompliantSecret() {
  const secretName = `test-compliant-secret-${Date.now()}`;
  const roleName = `test-rotation-role-${Date.now()}`;

  try {
    // Create IAM role for rotation
    const assumeRolePolicyDocument = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Service: 'secretsmanager.amazonaws.com'
        },
        Action: 'sts:AssumeRole'
      }]
    };

    // Create role
    const createRoleResponse = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument)
      })
    );

    createdResources.push({
      type: 'ROLE',
      name: roleName
    });

    // Add permissions to the role
    const rolePolicyDocument = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Action: [
          'secretsmanager:DescribeSecret',
          'secretsmanager:GetSecretValue',
          'secretsmanager:PutSecretValue',
          'secretsmanager:UpdateSecretVersionStage'
        ],
        Resource: '*'
      }]
    };

    await iamClient.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: `${roleName}-policy`,
        PolicyDocument: JSON.stringify(rolePolicyDocument)
      })
    );

    createdResources.push({
      type: 'ROLE_POLICY',
      roleName: roleName,
      policyName: `${roleName}-policy`
    });

    // Create secret with rotation enabled
    const createSecretResponse = await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: "test-user",
          password: "test-password"
        })
      })
    );

    createdResources.push({
      type: 'SECRET',
      name: secretName
    });

    // Wait for role to propagate
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Enable rotation
    await secretsClient.send(
      new RotateSecretCommand({
        SecretId: secretName,
        RotationLambdaARN: process.env.ROTATION_LAMBDA_ARN, // Would need a Lambda ARN
        RotationRules: {
          AutomaticallyAfterDays: 30
        }
      })
    );

    console.log(`Created compliant secret with rotation: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating compliant secret:', error);
    throw error;
  }
}

// List all secrets and their rotation status
async function listSecretsRotationStatus() {
  try {
    const response = await secretsClient.send(new ListSecretsCommand({}));
    console.log('\nSecrets Rotation Status:');
    response.SecretList.forEach(secret => {
      console.log(`Secret: ${secret.Name}`);
      console.log(`Rotation Enabled: ${secret.RotationEnabled || false}`);
      if (secret.RotationEnabled) {
        console.log(`Rotation Rules: ${JSON.stringify(secret.RotationRules)}`);
      }
      console.log('---');
    });
  } catch (error) {
    console.error('Error listing secrets:', error);
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

        case 'ROLE_POLICY':
          await iamClient.send(
            new DeleteRolePolicyCommand({
              RoleName: resource.roleName,
              PolicyName: resource.policyName
            })
          );
          console.log(`Deleted role policy: ${resource.policyName}`);
          break;

        case 'ROLE':
          await iamClient.send(
            new DeleteRoleCommand({
              RoleName: resource.name
            })
          );
          console.log(`Deleted role: ${resource.name}`);
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
    
    // Create non-compliant secret (without rotation)
    await createNonCompliantSecret();
    
    // Optional: Create compliant secret for comparison
    // Uncomment if you want to create a compliant secret
    // Note: Requires ROTATION_LAMBDA_ARN environment variable
    // await createCompliantSecret();
    
    // List all secrets and their rotation status
    await listSecretsRotationStatus();
    
    // Wait for a moment to simulate testing
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
