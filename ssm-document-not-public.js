require('dotenv').config();

const {
  SSMClient,
  CreateDocumentCommand,
  DeleteDocumentCommand,
  DescribeDocumentCommand,
  ModifyDocumentPermissionCommand,
  GetDocumentCommand
} = require("@aws-sdk/client-ssm");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const ssmClient = new SSMClient({ credentials, region });

// Generate unique document name with timestamp
const documentName = `non-compliant-document-${Date.now()}`;

async function createNonCompliantDocument() {
  try {
    console.log(`Creating SSM document: ${documentName}`);

    // Sample SSM document content
    const documentContent = {
      schemaVersion: "2.2",
      description: "Sample document for testing public sharing",
      parameters: {
        Message: {
          type: "String",
          description: "Message to display",
          default: "Hello World"
        }
      },
      mainSteps: [
        {
          action: "aws:runShellScript",
          name: "displayMessage",
          inputs: {
            runCommand: ["echo \"{{Message}}\""]
          }
        }
      ]
    };

    // Create the document
    await ssmClient.send(new CreateDocumentCommand({
      Name: documentName,
      Content: JSON.stringify(documentContent),
      DocumentType: "Command",
      DocumentFormat: "JSON"
    }));

    console.log("Waiting for document to be created...");
    await waitForDocumentStatus('Active');
    console.log("Document created successfully");

    // Make the document public (non-compliant)
    console.log("Making document public...");
    await ssmClient.send(new ModifyDocumentPermissionCommand({
      Name: documentName,
      PermissionType: 'Share',
      AccountIdsToAdd: ['All']
    }));

    console.log("Document made public successfully");
    return documentName;
  } catch (error) {
    console.error("Error creating SSM document:", error);
    throw error;
  }
}

async function waitForDocumentStatus(desiredStatus, maxAttempts = 30) {
  console.log(`Waiting for document to reach ${desiredStatus} status...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await ssmClient.send(new DescribeDocumentCommand({
        Name: documentName
      }));

      const currentStatus = response.Document.Status;
      console.log(`Current status: ${currentStatus}`);

      if (currentStatus === desiredStatus) {
        return true;
      }

      if (currentStatus === 'Failed') {
        throw new Error('Document creation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error(`Timeout waiting for document to reach ${desiredStatus} status`);
}

async function cleanup() {
    try {
      console.log(`Starting cleanup for document: ${documentName}`);
  
      // Remove public sharing first
      try {
        console.log("Removing public sharing...");
        await ssmClient.send(new ModifyDocumentPermissionCommand({
          Name: documentName,
          PermissionType: 'Share',
          AccountIdsToRemove: ['All']
        }));
        console.log("Public sharing removed successfully");
      } catch (error) {
        console.error("Error removing public sharing:", error);
        // Continue with cleanup even if unsharing fails
      }
  
      // Wait a short time for the unshare operation to complete
      await new Promise(resolve => setTimeout(resolve, 5000));
  
      // Delete the document
      console.log("Deleting document...");
      await ssmClient.send(new DeleteDocumentCommand({
        Name: documentName
      }));
  
      console.log("Document deleted successfully");
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }
  

async function monitorDocumentPermissions() {
  try {
    // Get document details
    const documentDetails = await ssmClient.send(new GetDocumentCommand({
      Name: documentName
    }));

    // Get document content
    console.log("Current Document Configuration:");
    console.log(JSON.stringify({
      Name: documentDetails.Name,
      DocumentVersion: documentDetails.DocumentVersion,
      Status: documentDetails.Status,
      DocumentFormat: documentDetails.DocumentFormat,
      DocumentType: documentDetails.DocumentType
    }, null, 2));

    return documentDetails;
  } catch (error) {
    console.error("Error monitoring document:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting SSM document public sharing simulation in region ${region}`);

  try {
    // Create non-compliant document
    await createNonCompliantDocument();

    // Monitor the configuration
    await monitorDocumentPermissions();

    // Wait for a short period to simulate the test scenario
    console.log("Waiting for 2 minutes before cleanup...");
    await new Promise(resolve => setTimeout(resolve, 120000));

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
  createNonCompliantDocument,
  cleanup,
  monitorDocumentPermissions
};
