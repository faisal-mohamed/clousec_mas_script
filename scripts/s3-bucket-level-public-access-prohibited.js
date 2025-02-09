require('dotenv').config();

const {
  S3Client,
  CreateBucketCommand,
  PutPublicAccessBlockCommand,
  GetPublicAccessBlockCommand,
  PutBucketPolicyCommand,
  PutBucketTaggingCommand,
  HeadBucketCommand
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
const bucketName = `non-compliant-bucket-${Date.now()}`;

async function getCurrentBucketConfig() {
  try {
    console.log(`Checking current bucket configuration for ${bucketName}...`);
    const response = await s3Client.send(new GetPublicAccessBlockCommand({
      Bucket: bucketName
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

async function createNonCompliantBucket() {
  try {
    // Create bucket
    console.log(`Creating bucket: ${bucketName}`);
    await s3Client.send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: region
      }
    }));

    // Add simulation tag
    console.log("Adding simulation tag to bucket...");
    await s3Client.send(new PutBucketTaggingCommand({
      Bucket: bucketName,
      Tagging: {
        TagSet: [
          {
            Key: "simulation-mas",
            Value: "true"
          }
        ]
      }
    }));

    // Wait for bucket to be available
    await waitForBucketToExist(bucketName);
    console.log("Bucket created successfully");

    // Disable bucket-level public access blocks (non-compliant)
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

    // Add public bucket policy (non-compliant)
    console.log("Adding public bucket policy...");
    const publicPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicReadGetObject",
          Effect: "Allow",
          Principal: "*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketName}/*`
        }
      ]
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(publicPolicy)
    }));

    console.log("Non-compliant bucket configuration completed");
  } catch (error) {
    console.error("Error creating non-compliant bucket:", error);
    throw error;
  }
}

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

async function monitorBucketAccess() {
  try {
    const config = await getCurrentBucketConfig();
    console.log("Current Bucket Public Access Configuration:");
    console.log(JSON.stringify(config, null, 2));
    return config;
  } catch (error) {
    console.error("Error monitoring bucket access:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting S3 bucket public access simulation in region ${region}`);

  try {
    // Create non-compliant bucket
    await createNonCompliantBucket();

    // Monitor the configuration
    await monitorBucketAccess();

    console.log("Non-compliant bucket created and configured successfully");
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

main();