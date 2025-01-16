require('dotenv').config();

const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutPublicAccessBlockCommand,
  GetPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  DeletePublicAccessBlockCommand,
  PutBucketAclCommand,
  DeleteBucketPolicyCommand,
  HeadBucketCommand,
  PutBucketOwnershipControlsCommand
} = require("@aws-sdk/client-s3");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const s3Client = new S3Client({ credentials, region });

// Generate a unique bucket name with timestamp
const bucketName = `public-read-bucket-${Date.now()}`;

async function createPublicReadBucket() {
  try {
    // Create bucket
    console.log(`Creating bucket: ${bucketName}`);
    await s3Client.send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: region
      }
    }));

    // Wait for bucket to be available
    await waitForBucketToExist(bucketName);
    console.log("Bucket created successfully");

    // Configure bucket ownership controls to allow ACLs
    console.log("Configuring bucket ownership controls...");
    await s3Client.send(new PutBucketOwnershipControlsCommand({
      Bucket: bucketName,
      OwnershipControls: {
        Rules: [
          {
            ObjectOwnership: "ObjectWriter"
          }
        ]
      }
    }));

    // Disable bucket-level public access blocks
    console.log("Disabling bucket-level public access blocks...");
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false
      }
    }));

    // Set bucket ACL to public-read (non-compliant)
    console.log("Setting bucket ACL to public-read...");
    await s3Client.send(new PutBucketAclCommand({
      Bucket: bucketName,
      ACL: 'public-read'
    }));

    // Add public read bucket policy (non-compliant)
    console.log("Adding public read bucket policy...");
    const publicReadPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: [
            "s3:GetObject",
            "s3:ListBucket"
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`
          ]
        }
      ]
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(publicReadPolicy)
    }));

    console.log("Non-compliant bucket configuration completed");
    return bucketName;
  } catch (error) {
    console.error("Error creating public read bucket:", error);
    throw error;
  }
}

// ... rest of the code remains the same ...


async function waitForBucketToExist(bucket, maxAttempts = 10) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
      return true;
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

async function cleanup() {
  try {
    console.log(`Starting cleanup for bucket: ${bucketName}`);

    // Remove bucket policy
    try {
      console.log("Removing bucket policy...");
      await s3Client.send(new DeleteBucketPolicyCommand({
        Bucket: bucketName
      }));
    } catch (error) {
      console.log("No bucket policy to remove");
    }

    // Remove public access block configuration
    try {
      console.log("Removing public access block configuration...");
      await s3Client.send(new DeletePublicAccessBlockCommand({
        Bucket: bucketName
      }));
    } catch (error) {
      console.log("No public access block configuration to remove");
    }

    // Delete the bucket
    console.log("Deleting bucket...");
    await s3Client.send(new DeleteBucketCommand({
      Bucket: bucketName
    }));

    console.log("Cleanup completed successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
}

async function monitorBucketAccess() {
  try {
    // Check public access block configuration
    const publicAccessConfig = await s3Client.send(new GetPublicAccessBlockCommand({
      Bucket: bucketName
    }));

    console.log("Current Bucket Configuration:");
    console.log("Public Access Block Configuration:");
    console.log(JSON.stringify(publicAccessConfig.PublicAccessBlockConfiguration, null, 2));

    return {
      publicAccessConfig: publicAccessConfig.PublicAccessBlockConfiguration
    };
  } catch (error) {
    console.error("Error monitoring bucket access:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting S3 bucket public read simulation in region ${region}`);

  try {
    // Create non-compliant bucket
    await createPublicReadBucket();

    // Monitor the configuration
    await monitorBucketAccess();

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
  createPublicReadBucket,
  cleanup,
  monitorBucketAccess
};
