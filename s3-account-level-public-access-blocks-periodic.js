require('dotenv').config();

const {
  S3ControlClient,
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand,
  DeletePublicAccessBlockCommand
} = require("@aws-sdk/client-s3-control");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const accountId = process.env.AWS_ACCOUNT_ID;

const s3ControlClient = new S3ControlClient({ credentials, region });

// Store original configuration for restoration
let originalConfig = null;

async function getCurrentPublicAccessBlockConfig() {
  try {
    console.log("Checking current public access block configuration...");
    const response = await s3ControlClient.send(new GetPublicAccessBlockCommand({
      AccountId: accountId
    }));
    return response.PublicAccessBlockConfiguration;
  } catch (error) {
    if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
      console.log("No existing public access block configuration found");
      return null;
    }
    throw error;
  }
}

async function createNonCompliantConfiguration() {
  try {
    // Store current configuration for later restoration
    originalConfig = await getCurrentPublicAccessBlockConfig();
    console.log("Original configuration:", originalConfig);

    // Create non-compliant configuration (all blocks disabled)
    console.log("Setting non-compliant public access block configuration...");
    await s3ControlClient.send(new PutPublicAccessBlockCommand({
      AccountId: accountId,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,      // Non-compliant
        IgnorePublicAcls: false,     // Non-compliant
        BlockPublicPolicy: false,     // Non-compliant
        RestrictPublicBuckets: false  // Non-compliant
      }
    }));

    console.log("Non-compliant configuration applied successfully");
  } catch (error) {
    console.error("Error creating non-compliant configuration:", error);
    throw error;
  }
}

async function removePublicAccessBlocks() {
  try {
    console.log("Removing public access blocks completely...");
    await s3ControlClient.send(new DeletePublicAccessBlockCommand({
      AccountId: accountId
    }));
    console.log("Public access blocks removed successfully");
  } catch (error) {
    if (error.name !== 'NoSuchPublicAccessBlockConfiguration') {
      console.error("Error removing public access blocks:", error);
      throw error;
    }
  }
}

async function restoreOriginalConfiguration() {
  try {
    console.log("Restoring original configuration...");
    
    if (originalConfig) {
      await s3ControlClient.send(new PutPublicAccessBlockCommand({
        AccountId: accountId,
        PublicAccessBlockConfiguration: originalConfig
      }));
      console.log("Original configuration restored successfully");
    } else {
      // If there was no original configuration, remove the public access block
      await removePublicAccessBlocks();
      console.log("Removed public access blocks as no original configuration existed");
    }
  } catch (error) {
    console.error("Error restoring original configuration:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting S3 public access blocks simulation in region ${region}`);
  console.log(`Using Account ID: ${accountId}`);

  try {
    // Store original configuration and create non-compliant setup
    await createNonCompliantConfiguration();

    // Wait for a short period to simulate the test scenario
    console.log("Waiting for 2 minutes before restoration...");
    await new Promise(resolve => setTimeout(resolve, 120000));

    // Restore original configuration
    await restoreOriginalConfiguration();
    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
    if (originalConfig) {
      try {
        await restoreOriginalConfiguration();
      } catch (restoreError) {
        console.error("Restoration after error failed:", restoreError);
      }
    }
  }
}

// Validate environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION',
    'AWS_ACCOUNT_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Add monitoring function
async function monitorPublicAccessBlocks() {
  try {
    const config = await getCurrentPublicAccessBlockConfig();
    console.log("Current Public Access Block Configuration:");
    console.log(JSON.stringify(config, null, 2));
    return config;
  } catch (error) {
    console.error("Error monitoring public access blocks:", error);
    throw error;
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
  createNonCompliantConfiguration,
  restoreOriginalConfiguration,
  monitorPublicAccessBlocks,
  getCurrentPublicAccessBlockConfig
};
