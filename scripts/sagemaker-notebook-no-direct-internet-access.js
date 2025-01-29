require('dotenv').config();

const {
  SageMakerClient,
  CreateNotebookInstanceCommand,
  DescribeNotebookInstanceCommand
} = require("@aws-sdk/client-sagemaker");

const {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  AttachRolePolicyCommand
} = require("@aws-sdk/client-iam");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const sagemakerClient = new SageMakerClient({ credentials, region });
const iamClient = new IAMClient({ credentials, region });

// Generate unique names with timestamp
const timestamp = Date.now();
const notebookName = `non-compliant-notebook-${timestamp}`;
const roleName = `sagemaker-role-${timestamp}`;
const policyName = `sagemaker-policy-${timestamp}`;
let roleArn = '';

async function createIAMRole() {
  try {
    console.log("Creating IAM role for SageMaker...");

    // Create role
    const createRoleResponse = await iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: {
            Service: "sagemaker.amazonaws.com"
          },
          Action: "sts:AssumeRole"
        }]
      }),
      Tags: [
        {
          Key: 'simulation-mas',
          Value: 'true'
        }
      ]
    }));

    roleArn = createRoleResponse.Role.Arn;

    // Attach managed policy
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
    }));

    // Add inline policy
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: [
            "s3:*"
          ],
          Resource: "*"
        }]
      })
    }));

    console.log("IAM role created successfully");
    return roleArn;
  } catch (error) {
    console.error("Error creating IAM role:", error);
    throw error;
  }
}

async function createNonCompliantNotebook() {
  try {
    console.log(`Creating SageMaker notebook instance: ${notebookName}`);

    const params = {
      NotebookInstanceName: notebookName,
      InstanceType: 'ml.t2.medium',
      RoleArn: roleArn,
      DirectInternetAccess: 'Enabled', // Non-compliant
      RootAccess: 'Enabled',
      VolumeSizeInGB: 5,
      Tags: [
        {
          Key: 'simulation-mas',
          Value: 'true'
        }
      ]
    };

    await sagemakerClient.send(new CreateNotebookInstanceCommand(params));
    console.log("Waiting for notebook instance to be created...");
    
    await waitForNotebookStatus('InService');
    console.log("Notebook instance created successfully");

    return notebookName;
  } catch (error) {
    console.error("Error creating notebook instance:", error);
    throw error;
  }
}

async function waitForNotebookStatus(desiredStatus, maxAttempts = 60) {
  console.log(`Waiting for notebook instance to reach ${desiredStatus} status...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await sagemakerClient.send(new DescribeNotebookInstanceCommand({
        NotebookInstanceName: notebookName
      }));

      const currentStatus = response.NotebookInstanceStatus;
      console.log(`Current status: ${currentStatus}`);

      if (currentStatus === desiredStatus) {
        return true;
      }

      if (currentStatus === 'Failed') {
        throw new Error('Notebook instance creation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds between checks
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  throw new Error(`Timeout waiting for notebook instance to reach ${desiredStatus} status`);
}

async function monitorNotebookInstance() {
  try {
    const response = await sagemakerClient.send(new DescribeNotebookInstanceCommand({
      NotebookInstanceName: notebookName
    }));

    console.log("Notebook Instance Configuration:");
    console.log("Status:", response.NotebookInstanceStatus);
    console.log("Instance Type:", response.InstanceType);
    console.log("Direct Internet Access:", response.DirectInternetAccess);
    console.log("Root Access:", response.RootAccess);
  } catch (error) {
    console.error("Error monitoring notebook instance:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting SageMaker notebook simulation in region ${region}`);

  try {
    // Create IAM role first
    await createIAMRole();

    // Create non-compliant notebook instance
    await createNonCompliantNotebook();

    // Monitor the configuration
    await monitorNotebookInstance();

    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
  }
}

// Validate environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Run the script
validateEnvironmentVariables();
main();