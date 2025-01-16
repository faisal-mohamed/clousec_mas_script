const {
  SecretsManagerClient,
  CreateSecretCommand,
  DeleteSecretCommand,
  RotateSecretCommand,
  UpdateSecretCommand,
  ListSecretsCommand,
  DescribeSecretCommand
} = require("@aws-sdk/client-secrets-manager");

const {
  LambdaClient,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  AddPermissionCommand
} = require("@aws-sdk/client-lambda");
require('dotenv').config()
const {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  AttachRolePolicyCommand
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

const lambdaClient = new LambdaClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create IAM role for rotation Lambda
async function createRotationLambdaRole() {
  const roleName = `test-rotation-role-${Date.now()}`;

  try {
    // Create role
    const assumeRolePolicyDocument = {
      Version: '2012-10-17',
      Statement: [{
        Effect: 'Allow',
        Principal: {
          Service: ['lambda.amazonaws.com', 'secretsmanager.amazonaws.com']
        },
        Action: 'sts:AssumeRole'
      }]
    };

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

    // Add permissions
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

    // Attach basic Lambda execution role
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      })
    );

    createdResources.push({
      type: 'ROLE_POLICY',
      roleName: roleName,
      policyName: `${roleName}-policy`
    });

    // Wait for role to propagate
    await new Promise(resolve => setTimeout(resolve, 10000));

    return createRoleResponse.Role.Arn;
  } catch (error) {
    console.error('Error creating rotation Lambda role:', error);
    throw error;
  }
}

// Create a non-compliant secret (rotation will fail)
async function createNonCompliantSecret(roleArn) {
  const secretName = `test-secret-${Date.now()}`;
  
  try {
    // Create basic secret
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

    // Create a minimal rotation Lambda function
    const functionName = `test-rotation-function-${Date.now()}`;
    const lambdaCode = `
      exports.handler = async (event, context) => {
        // This function intentionally fails rotation
        throw new Error('Simulated rotation failure');
      };
    `;

    const buffer = Buffer.from(lambdaCode);
    const zipBuffer = buffer;

    const createFunctionResponse = await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs18.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: {
          ZipFile: zipBuffer
        },
        Timeout: 30
      })
    );

    createdResources.push({
      type: 'LAMBDA',
      name: functionName
    });

    // Wait for Lambda to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Add permission for Secrets Manager to invoke Lambda
    await lambdaClient.send(
      new AddPermissionCommand({
        FunctionName: functionName,
        StatementId: 'SecretsManagerAccess',
        Action: 'lambda:InvokeFunction',
        Principal: 'secretsmanager.amazonaws.com'
      })
    );

    // Enable rotation with short rotation period
    await secretsClient.send(
      new RotateSecretCommand({
        SecretId: secretName,
        RotationLambdaARN: createFunctionResponse.FunctionArn,
        RotationRules: {
          AutomaticallyAfterDays: 1 // Set to 1 day for quick testing
        }
      })
    );

    console.log(`Created non-compliant secret with failing rotation: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating non-compliant secret:', error);
    throw error;
  }
}

// Monitor rotation status
async function monitorRotationStatus(secretName) {
  try {
    const response = await secretsClient.send(
      new DescribeSecretCommand({
        SecretId: secretName
      })
    );

    console.log('\nRotation Status:');
    console.log(`Secret: ${secretName}`);
    console.log(`Rotation Enabled: ${response.RotationEnabled}`);
    console.log(`Last Rotated Date: ${response.LastRotatedDate || 'Never'}`);
    if (response.LastRotationStatus) {
      console.log(`Last Rotation Status: ${response.LastRotationStatus}`);
    }
  } catch (error) {
    console.error('Error monitoring rotation status:', error);
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

        case 'LAMBDA':
          await lambdaClient.send(
            new DeleteFunctionCommand({
              FunctionName: resource.name
            })
          );
          console.log(`Deleted Lambda function: ${resource.name}`);
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
    
    // Create IAM role for rotation Lambda
    const roleArn = await createRotationLambdaRole();
    
    // Create non-compliant secret with failing rotation
    const secretName = await createNonCompliantSecret(roleArn);
    
    // Monitor rotation status
    console.log('\nInitial status:');
    await monitorRotationStatus(secretName);
    
    // Wait for rotation attempt
    console.log('\nWaiting for rotation attempt...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('\nStatus after rotation attempt:');
    await monitorRotationStatus(secretName);
    
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
