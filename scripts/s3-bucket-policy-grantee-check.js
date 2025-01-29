require('dotenv').config();
const {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  GetBucketPolicyCommand,
  PutBucketTaggingCommand
} = require("@aws-sdk/client-s3");

// Initialize S3 client
const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Create non-compliant bucket with policy granting access to unauthorized principals
async function createNonCompliantBucket() {
  const bucketName = `non-compliant-bucket-${Date.now()}`;

  try {
    // Create bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName
      })
    );
    console.log(`Created bucket: ${bucketName}`);

    // Add simulation-mas tag
    await s3Client.send(
      new PutBucketTaggingCommand({
        Bucket: bucketName,
        Tagging: {
          TagSet: [
            {
              Key: "simulation-mas",
              Value: "true"
            }
          ]
        }
      })
    );
    console.log(`Added simulation-mas tag to bucket: ${bucketName}`);

    // Add non-compliant bucket policy
    const bucketPolicy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: {
            AWS: '*'  // Non-compliant: allows access to any AWS principal
          },
          Action: 's3:*',
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };

    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(bucketPolicy)
      })
    );
    console.log(`Added non-compliant policy to bucket: ${bucketName}`);

    return bucketName;
  } catch (error) {
    console.error('Error creating non-compliant bucket:', error);
    throw error;
  }
}

// Check bucket policy
async function checkBucketPolicy(bucketName) {
  try {
    const response = await s3Client.send(
      new GetBucketPolicyCommand({
        Bucket: bucketName
      })
    );
    
    const policy = JSON.parse(response.Policy);
    console.log('Bucket policy:', JSON.stringify(policy, null, 2));
    
    return policy;
  } catch (error) {
    console.error('Error getting bucket policy:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting non-compliant scenario creation...');
    
    // Create non-compliant bucket
    const nonCompliantBucketName = await createNonCompliantBucket();
    console.log('\nChecking non-compliant bucket policy:');
    await checkBucketPolicy(nonCompliantBucketName);

    // Wait for a moment to simulate testing
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main();