const {
  CloudTrailClient,
  CreateTrailCommand,
  StartLoggingCommand,
} = require("@aws-sdk/client-cloudtrail");

const {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} = require("@aws-sdk/client-s3");

require('dotenv').config();

// Common credentials configuration
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

// Initialize clients
const cloudTrailClient = new CloudTrailClient({
  credentials: credentials,
  region: process.env.AWS_REGION || 'us-east-1'
});

const s3Client = new S3Client({
  credentials: credentials,
  region: process.env.AWS_REGION || 'us-east-1'
});

async function createNonCompliantCloudTrail() {
  const resourcePrefix = 'non-compliant-demo';
  const timestamp = Date.now();

  // Validate required environment variables
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_SESSION_TOKEN) {
    throw new Error('AWS credentials environment variables are required');
  }

  try {
    // Create S3 bucket for CloudTrail logs
    const bucketName = `${resourcePrefix}-bucket-${timestamp}`;
    await s3Client.send(new CreateBucketCommand({
      Bucket: bucketName,
      CreateBucketConfiguration: {
        LocationConstraint: process.env.AWS_REGION || 'us-east-1'
      }
    }));

    console.log(`Created S3 bucket: ${bucketName}`);

    // Create bucket policy for CloudTrail
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'AWSCloudTrailAclCheck',
          Effect: 'Allow',
          Principal: {
            Service: 'cloudtrail.amazonaws.com'
          },
          Action: 's3:GetBucketAcl',
          Resource: `arn:aws:s3:::${bucketName}`
        },
        {
          Sid: 'AWSCloudTrailWrite',
          Effect: 'Allow',
          Principal: {
            Service: 'cloudtrail.amazonaws.com'
          },
          Action: 's3:PutObject',
          Resource: `arn:aws:s3:::${bucketName}/AWSLogs/*`,
          Condition: {
            StringEquals: {
              's3:x-amz-acl': 'bucket-owner-full-control'
            }
          }
        }
      ]
    };

    // Apply bucket policy
    await s3Client.send(new PutBucketPolicyCommand({
      Bucket: bucketName,
      Policy: JSON.stringify(bucketPolicy)
    }));

    console.log('Applied bucket policy');

    // Create CloudTrail trail without CloudWatch Logs integration
    const trailName = `${resourcePrefix}-trail-${timestamp}`;
    const createTrailResponse = await cloudTrailClient.send(new CreateTrailCommand({
      Name: trailName,
      S3BucketName: bucketName,
      IsMultiRegionTrail: true,
      EnableLogFileValidation: true,
      IncludeGlobalServiceEvents: true,
      Tags: [
        {
          Key: 'simulation-mas',
          Value: 'true'
        }
      ]
      // Intentionally omitting CloudWatchLogsLogGroupArn and CloudWatchLogsRoleArn
      // to make it non-compliant
    }));

    console.log(`Created CloudTrail: ${trailName}`);

    // Start logging for the trail
    await cloudTrailClient.send(new StartLoggingCommand({
      Name: trailName
    }));

    console.log('Started CloudTrail logging');

    console.log('Created non-compliant CloudTrail:');
    console.log(`Trail Name: ${trailName}`);
    console.log(`S3 Bucket: ${bucketName}`);
    console.log(`Trail ARN: ${createTrailResponse.TrailARN}`);

  } catch (error) {
    console.error('Error creating non-compliant CloudTrail:', error);
    throw error;
  }
}

// Execute the script
async function main() {
  try {
    await createNonCompliantCloudTrail();
  } catch (error) {
    console.error('Script execution failed:', error);
  }
}

main();
