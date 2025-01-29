const {
  SecretsManagerClient,
  CreateSecretCommand,
  PutSecretValueCommand,
  RotateSecretCommand,
  DescribeSecretCommand
} = require("@aws-sdk/client-secrets-manager");

const {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

const {
  LambdaClient,
  CreateFunctionCommand
} = require("@aws-sdk/client-lambda");

// Initialize clients
const secretsClient = new SecretsManagerClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION
});

const iamClient = new IAMClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION
});

const lambdaClient = new LambdaClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION
});

async function createSecret() {
  try {
    const secretName = `test-secret-${Date.now()}`;
    
    const createSecretResponse = await secretsClient.send(
      new CreateSecretCommand({
        Name: secretName,
        SecretString: JSON.stringify({
          username: 'initial-user',
          password: 'initial-password'
        }),
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    console.log(`Created secret: ${secretName}`);
    return secretName;
  } catch (error) {
    console.error('Error creating secret:', error);
    throw error;
  }
}

async function createRotationLambda() {
  try {
    const roleName = `rotation-lambda-role-${Date.now()}`;
    
    // Create IAM role for Lambda
    const createRoleResponse = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }]
        })
      })
    );

    const roleArn = createRoleResponse.Role.Arn;

    // Wait for role to be available
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Create Lambda function with intentionally broken rotation code
    const functionName = `rotation-lambda-${Date.now()}`;

    // Create proper ZIP file content
    const zipContent = Buffer.from(
      'UEsDBAoAAAAAAOZwBVYAAAAAAAAAAAAAAAAJAAAAaW5kZXguanN5S87PS8tMTlXISU1LzcnJT' +
      'FYoSC0qzszPAwBQSwECPwAKAAAAAADmcAVWAAAAAAAAAAAAAAAACQAkAAAAAAAAACAAAAAAAAAA' +
      'aW5kZXguanMKACAAAAAAAAEAGABp1qhB/n/YAQAA6EH+f9gBAGnWqEH+f9gBUEsFBgAAAAABAA' +
      'EAWwAAAC0AAAAAAA==',
      'base64'
    );

    const createFunctionResponse = await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs18.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: {
          ZipFile: zipContent
        },
        Environment: {
          Variables: {
            SECRETS_MANAGER_ENDPOINT: `https://secretsmanager.${process.env.AWS_REGION}.amazonaws.com`
          }
        },
        Timeout: 30,
        MemorySize: 128,
        Tags: {
          'simulation-mas': 'true'
        }
      })
    );

    // Attach necessary policies
    const policies = [
      'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
      'arn:aws:iam::aws:policy/SecretsManagerReadWrite'
    ];

    for (const policyArn of policies) {
      await iamClient.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: policyArn
        })
      );
    }

    console.log(`Created rotation Lambda: ${functionName}`);
    return createFunctionResponse.FunctionArn;
  } catch (error) {
    console.error('Error creating rotation Lambda:', error);
    throw error;
  }
}

async function configureRotation(secretName, lambdaArn) {
  try {
    await secretsClient.send(
      new RotateSecretCommand({
        SecretId: secretName,
        RotationLambdaARN: lambdaArn,
        RotationRules: {
          AutomaticallyAfterDays: 1
        }
      })
    );

    console.log('Configured rotation with intentionally failing Lambda');
  } catch (error) {
    console.error('Error configuring rotation:', error);
    throw error;
  }
}

async function checkRotationStatus(secretName) {
  try {
    const response = await secretsClient.send(
      new DescribeSecretCommand({
        SecretId: secretName
      })
    );

    console.log('\nRotation Status:');
    console.log('------------------------');
    console.log(`Last Rotation Date: ${response.LastRotationDate || 'N/A'}`);
    console.log(`Next Rotation Date: ${response.NextRotationDate || 'N/A'}`);
    console.log(`Last Changed Date: ${response.LastChangedDate || 'N/A'}`);
    console.log(`Last Access Date: ${response.LastAccessedDate || 'N/A'}`);
    console.log(`Rotation Enabled: ${response.RotationEnabled || false}`);
    console.log(`Rotation Lambda ARN: ${response.RotationLambdaARN || 'N/A'}`);
    
    if (response.LastRotationDate) {
      console.log('Last rotation attempt failed as expected');
    }
  } catch (error) {
    console.error('Error checking rotation status:', error);
    throw error;
  }
}

async function main() {
  try {
    console.log('Creating secret with failing rotation...');

    // Create secret
    console.log('\nStep 1: Creating secret...');
    const secretName = await createSecret();

    // Create rotation Lambda
    console.log('\nStep 2: Creating rotation Lambda...');
    const lambdaArn = await createRotationLambda();

    // Configure rotation
    console.log('\nStep 3: Configuring rotation...');
    await configureRotation(secretName, lambdaArn);

    // Wait for rotation attempt
    console.log('\nWaiting for rotation attempt...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Check rotation status
    console.log('\nStep 4: Checking rotation status...');
    await checkRotationStatus(secretName);

    console.log('\nSecret creation and failed rotation completed!');
    console.log('------------------------');
    console.log(`Secret Name: ${secretName}`);
    console.log(`Lambda ARN: ${lambdaArn}`);
    console.log('------------------------');

  } catch (error) {
    console.error('Error in main execution:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createSecret,
  createRotationLambda,
  configureRotation,
  checkRotationStatus
};
