require('dotenv').config();
const {
  CloudTrailClient,
  CreateTrailCommand,
  DeleteTrailCommand,
  GetTrailCommand,
  ListTrailsCommand,
  StartLoggingCommand,
  StopLoggingCommand
} = require("@aws-sdk/client-cloudtrail");

const {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command
} = require("@aws-sdk/client-s3");

// Initialize clients
const cloudTrailClient = new CloudTrailClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create S3 bucket for CloudTrail logs
async function createS3Bucket() {
  const bucketName = `cloudtrail-logs-${Date.now()}`;
  
  try {
    // Create bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
        CreateBucketConfiguration: {
          LocationConstraint: process.env.AWS_REGION
        }
      })
    );

    createdResources.push({
      type: 'BUCKET',
      name: bucketName
    });

    // Create bucket policy for CloudTrail
    const bucketPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AWSCloudTrailAclCheck",
          Effect: "Allow",
          Principal: {
            Service: "cloudtrail.amazonaws.com"
          },
          Action: "s3:GetBucketAcl",
          Resource: `arn:aws:s3:::${bucketName}`
        },
        {
          Sid: "AWSCloudTrailWrite",
          Effect: "Allow",
          Principal: {
            Service: "cloudtrail.amazonaws.com"
          },
          Action: "s3:PutObject",
          Resource: `arn:aws:s3:::${bucketName}/AWSLogs/${process.env.AWS_ACCOUNT_ID}/*`,
          Condition: {
            StringEquals: {
              "s3:x-amz-acl": "bucket-owner-full-control"
            }
          }
        }
      ]
    };

    // Apply bucket policy
    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(bucketPolicy)
      })
    );

    console.log(`Created S3 bucket: ${bucketName}`);
    return bucketName;
  } catch (error) {
    console.error('Error creating S3 bucket:', error);
    throw error;
  }
}

// Create non-compliant trail (without encryption)
async function createNonCompliantTrail(bucketName) {
  const trailName = `test-trail-${Date.now()}`;
  
  try {
    const createTrailResponse = await cloudTrailClient.send(
      new CreateTrailCommand({
        Name: trailName,
        S3BucketName: bucketName,
        IsMultiRegionTrail: true,
        EnableLogging: true,
        IncludeGlobalServiceEvents: true
      })
    );

    createdResources.push({
      type: 'TRAIL',
      name: trailName
    });

    // Start logging for the trail
    await cloudTrailClient.send(
      new StartLoggingCommand({
        Name: trailName
      })
    );

    console.log(`Created non-compliant trail: ${trailName}`);
    return trailName;
  } catch (error) {
    console.error('Error creating trail:', error);
    throw error;
  }
}

// Check trail encryption status
async function checkTrailEncryption() {
  try {
    const response = await cloudTrailClient.send(new ListTrailsCommand({}));
    
    console.log('\nChecking Trails Encryption Status:');
    for (const trail of response.Trails) {
      const trailDetails = await cloudTrailClient.send(
        new GetTrailCommand({
          Name: trail.TrailARN
        })
      );

      console.log(`\nTrail Name: ${trail.Name}`);
      console.log(`KMS Key Id: ${trailDetails.Trail.KmsKeyId || 'Not encrypted'}`);
      console.log(`Multi Region: ${trailDetails.Trail.IsMultiRegionTrail}`);
      console.log(`Logging Enabled: ${trailDetails.Trail.IsLogging}`);
      console.log(`Encryption Status: ${trailDetails.Trail.KmsKeyId ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error checking trail encryption:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'TRAIL':
          // Stop logging first
          await cloudTrailClient.send(
            new StopLoggingCommand({
              Name: resource.name
            })
          );
          
          // Delete trail
          await cloudTrailClient.send(
            new DeleteTrailCommand({
              Name: resource.name
            })
          );
          console.log(`Deleted trail: ${resource.name}`);
          break;

        case 'BUCKET':
          // Delete all objects in the bucket first
          try {
            const listObjectsResponse = await s3Client.send(
              new ListObjectsV2Command({
                Bucket: resource.name
              })
            );

            if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
              await s3Client.send(
                new DeleteObjectsCommand({
                  Bucket: resource.name,
                  Delete: {
                    Objects: listObjectsResponse.Contents.map(obj => ({
                      Key: obj.Key
                    }))
                  }
                })
              );
            }
          } catch (error) {
            console.error(`Error deleting bucket contents: ${error.message}`);
          }

          // Delete bucket
          await s3Client.send(
            new DeleteBucketCommand({
              Bucket: resource.name
            })
          );
          console.log(`Deleted bucket: ${resource.name}`);
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting non-compliant scenario creation...');
    
    // Create S3 bucket for CloudTrail logs
    const bucketName = await createS3Bucket();
    
    // Create non-compliant trail
    const trailName = await createNonCompliantTrail(bucketName);
    
    // Wait for trail to be fully created
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check encryption status
    await checkTrailEncryption();
    
    // Wait a moment before cleanup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
