require('dotenv').config();

const {
  S3Client,
  CreateBucketCommand,
  PutBucketAclCommand,
  PutBucketPolicyCommand,
  PutBucketOwnershipControlsCommand,
  GetPublicAccessBlockCommand,
  PutPublicAccessBlockCommand
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
const bucketName = `public-write-bucket-${Date.now()}`;

async function createPublicWriteBucket() {
  try {
    // Create bucket
    console.log(`Creating bucket: ${bucketName}`);
    await s3Client.send(new CreateBucketCommand({
      Bucket: bucketName,
      TagSet: [
        {
          Key: "simulation-mas",
          Value: "true"
        }
      ]
    }));

    // Disable BlockPublicAcls to allow setting public ACLs
    console.log("Disabling BlockPublicAcls to allow public ACLs...");
    await s3Client.send(new PutPublicAccessBlockCommand({
      Bucket: bucketName,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false
      }
    }));

    // Set ownership controls to "BucketOwnerPreferred"
    console.log("Setting bucket ownership controls...");
    await s3Client.send(new PutBucketOwnershipControlsCommand({
      Bucket: bucketName,
      OwnershipControls: {
        Rules: [
          {
            ObjectOwnership: "BucketOwnerPreferred"
          }
        ]
      }
    }));

    // Allow public write via ACL
    console.log("Setting bucket ACL to allow public write...");
    await s3Client.send(new PutBucketAclCommand({
      Bucket: bucketName,
      ACL: "public-read-write"
    }));

    // Put bucket policy to allow public write
    console.log("Putting bucket policy to allow public write...");
    const bucketPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "PublicWriteAccess",
          Effect: "Allow",
          Principal: "*",
          Action: ["s3:PutObject"],
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };

    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy)
    }));

    console.log("Public write access has been enabled, making the bucket non-compliant with the 's3-bucket-public-write-prohibited' rule.");
  } catch (error) {
    console.error("Error creating bucket:", error);
    throw error;
  }
}

async function monitorBucketAccess() {
  try {
    console.log("Checking bucket public access block configuration...");
    const { PublicAccessBlockConfiguration } = await s3Client.send(new GetPublicAccessBlockCommand({
      Bucket: bucketName
    }));
    console.log("Public Access Block Configuration:", PublicAccessBlockConfiguration);
  } catch (error) {
    if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
      console.log("No public access block configuration found");
    } else {
      throw error;
    }
  }
}

async function main() {
  console.log(`Starting S3 bucket public write simulation in region ${region}`);

  try {
    // Create non-compliant bucket
    await createPublicWriteBucket();

    // Monitor the configuration
    await monitorBucketAccess();

    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
  }
}

// Validate environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN', 'AWS_REGION'];
  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
}

// Run the script
validateEnvironmentVariables();
main();
