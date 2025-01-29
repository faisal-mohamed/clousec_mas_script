const {
  SageMakerClient,
  CreateNotebookInstanceCommand,
  DescribeNotebookInstanceCommand
} = require("@aws-sdk/client-sagemaker");

const {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const sagemakerClient = new SageMakerClient({
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

async function createSageMakerRole() {
  try {
    const roleName = `sagemaker-notebook-role-${Date.now()}`;

    // Create IAM role
    const createRoleResponse = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'sagemaker.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }]
        }),
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    const roleArn = createRoleResponse.Role.Arn;

    // Attach required policies
    const policies = [
      'arn:aws:iam::aws:policy/AmazonSageMakerFullAccess',
      'arn:aws:iam::aws:policy/AmazonS3FullAccess'
    ];

    for (const policyArn of policies) {
      await iamClient.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: policyArn
        })
      );
    }

    // Wait for role to be available
    await waitForRole(roleName);

    console.log(`Created SageMaker role: ${roleArn}`);
    return roleArn;
  } catch (error) {
    console.error('Error creating SageMaker role:', error);
    throw error;
  }
}

async function waitForRole(roleName) {
  console.log('Waiting for role to be available...');
  await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds for role propagation

  try {
    await iamClient.send(
      new GetRoleCommand({
        RoleName: roleName
      })
    );
  } catch (error) {
    console.error('Error waiting for role:', error);
    throw error;
  }
}

async function createNotebookInstance(roleArn) {
  try {
    const notebookName = `notebook-${Date.now()}`;

    const createNotebookResponse = await sagemakerClient.send(
      new CreateNotebookInstanceCommand({
        NotebookInstanceName: notebookName,
        InstanceType: 'ml.t2.medium',
        RoleArn: roleArn,
        // Explicitly not configuring KMS key
        DirectInternetAccess: 'Enabled',
        RootAccess: 'Enabled',
        PlatformIdentifier: 'notebook-al2-v2',
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    console.log(`Created notebook instance: ${notebookName}`);
    console.log('Waiting for notebook instance to be in service...');

    await waitForNotebookInService(notebookName);

    return notebookName;
  } catch (error) {
    console.error('Error creating notebook instance:', error);
    throw error;
  }
}

async function waitForNotebookInService(notebookName) {
  while (true) {
    try {
      const response = await sagemakerClient.send(
        new DescribeNotebookInstanceCommand({
          NotebookInstanceName: notebookName
        })
      );

      const status = response.NotebookInstanceStatus;
      console.log(`Current notebook status: ${status}`);
      
      if (status === 'InService') {
        console.log('Notebook instance is now in service!');
        console.log(`Notebook URL: ${response.Url}`);
        break;
      } else if (status === 'Failed') {
        throw new Error('Notebook instance creation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
    } catch (error) {
      console.error('Error checking notebook instance status:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    console.log('Creating SageMaker notebook instance without KMS key configuration...');

    // Create IAM role
    console.log('\nStep 1: Creating IAM role...');
    const roleArn = await createSageMakerRole();

    // Create notebook instance
    console.log('\nStep 2: Creating notebook instance...');
    const notebookName = await createNotebookInstance(roleArn);

    console.log('\nNotebook instance creation completed successfully!');
    console.log('------------------------');
    console.log(`IAM Role ARN: ${roleArn}`);
    console.log(`Notebook Name: ${notebookName}`);
    console.log('Instance Type: ml.t2.medium');
    console.log('KMS Key: Not configured');
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
  createSageMakerRole,
  createNotebookInstance
};
