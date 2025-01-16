require('dotenv').config();

const {
  SageMakerClient,
  CreateNotebookInstanceCommand,
  DeleteNotebookInstanceCommand,
  DescribeNotebookInstanceCommand,
  StopNotebookInstanceCommand
} = require("@aws-sdk/client-sagemaker");

const {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand
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
      })
    }));

    roleArn = createRoleResponse.Role.Arn;
    console.log(`Role created with ARN: ${roleArn}`);

    // Attach AmazonSageMakerFullAccess policy
    await iamClient.send(new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
    }));

    // Add inline policy for additional permissions
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: [
            "s3:*",
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents"
          ],
          Resource: "*"
        }]
      })
    }));

    // Wait for role to propagate
    console.log("Waiting for role to propagate...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    return roleArn;
  } catch (error) {
    console.error("Error creating IAM role:", error);
    throw error;
  }
}

async function cleanupIAMRole() {
  try {
    console.log(`Cleaning up IAM role: ${roleName}`);

    // Detach managed policy
    try {
      await iamClient.send(new DetachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: "arn:aws:iam::aws:policy/AmazonSageMakerFullAccess"
      }));
    } catch (error) {
      console.log("Error detaching managed policy:", error);
    }

    // Delete inline policy
    try {
      await iamClient.send(new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName
      }));
    } catch (error) {
      console.log("Error deleting inline policy:", error);
    }

    // Delete role
    try {
      await iamClient.send(new DeleteRoleCommand({
        RoleName: roleName
      }));
    } catch (error) {
      console.log("Error deleting role:", error);
    }

    console.log("IAM role cleanup completed");
  } catch (error) {
    console.error("Error during IAM role cleanup:", error);
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
      VolumeSizeInGB: 5
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

async function waitForDeletion(maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await sagemakerClient.send(new DescribeNotebookInstanceCommand({
        NotebookInstanceName: notebookName
      }));
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      if (error.name === 'ResourceNotFound') {
        return true;
      }
      throw error;
    }
  }
  throw new Error('Timeout waiting for notebook instance deletion');
}

async function cleanup() {
  try {
    console.log(`Starting cleanup for notebook instance: ${notebookName}`);

    // Check current status
    const response = await sagemakerClient.send(new DescribeNotebookInstanceCommand({
      NotebookInstanceName: notebookName
    }));

    // Stop the notebook instance if it's running
    if (response.NotebookInstanceStatus === 'InService') {
      console.log("Stopping notebook instance...");
      await sagemakerClient.send(new StopNotebookInstanceCommand({
        NotebookInstanceName: notebookName
      }));
      await waitForNotebookStatus('Stopped');
    }

    // Delete the notebook instance
    console.log("Deleting notebook instance...");
    await sagemakerClient.send(new DeleteNotebookInstanceCommand({
      NotebookInstanceName: notebookName
    }));

    // Wait for deletion to complete
    console.log("Waiting for notebook instance to be deleted...");
    await waitForDeletion();

    // Clean up IAM role
    await cleanupIAMRole();

    console.log("Cleanup completed successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
}

async function monitorNotebookInstance() {
  try {
    const response = await sagemakerClient.send(new DescribeNotebookInstanceCommand({
      NotebookInstanceName: notebookName
    }));

    console.log("Current Notebook Instance Configuration:");
    console.log(JSON.stringify({
      NotebookInstanceName: response.NotebookInstanceName,
      InstanceType: response.InstanceType,
      DirectInternetAccess: response.DirectInternetAccess,
      NotebookInstanceStatus: response.NotebookInstanceStatus,
      Url: response.Url
    }, null, 2));

    return response;
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

    // Wait for a short period to simulate the test scenario
    console.log("Waiting for 5 minutes before cleanup...");
    await new Promise(resolve => setTimeout(resolve, 300000));

    // Cleanup
    await cleanup();
    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("Cleanup after error failed:", cleanupError);
    }
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

// Execute the script with environment validation
if (require.main === module) {
  try {
    validateEnvironmentVariables();
    main();
  } catch (error) {
    console.error("Initialization error:", error.message);
    process.exit(1);
  }
}

module.exports = {
  createNonCompliantNotebook,
  cleanup,
  monitorNotebookInstance
};
