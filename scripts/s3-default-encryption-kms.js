require('dotenv').config();
const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutBucketEncryptionCommand,
  GetBucketEncryptionCommand,
  ListBucketsCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  PutBucketTaggingCommand
} = require("@aws-sdk/client-s3");

const {
  KMSClient,
  ListKeysCommand,
  DescribeKeyCommand
} = require("@aws-sdk/client-kms");

// Initialize clients
const s3Client = new S3Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const kmsClient = new KMSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Create non-compliant S3 bucket (with SSE-S3 instead of SSE-KMS)
async function createNonCompliantBucket() {
  try {
    // Generate unique bucket name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const bucketName = `test-bucket-${timestamp}`;

    // Create bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName,
        CreateBucketConfiguration: {
          LocationConstraint: process.env.AWS_REGION || 'ap-southeast-1'
        }
      })
    );

    console.log(`Created bucket: ${bucketName}`);

    // Configure bucket with SSE-S3 encryption (non-compliant with s3-default-encryption-kms)
    await s3Client.send(
      new PutBucketEncryptionCommand({
        Bucket: bucketName,
        ServerSideEncryptionConfiguration: {
          Rules: [
            {
              ApplyServerSideEncryptionByDefault: {
                SSEAlgorithm: 'AES256' // Using SSE-S3 instead of SSE-KMS
              },
              BucketKeyEnabled: false
            }
          ]
        }
      })
    );

    // Add simulation tag
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

    console.log('Configured bucket with SSE-S3 encryption and added simulation tag');
    return bucketName;
  } catch (error) {
    console.error('Error creating non-compliant bucket:', error);
    throw error;
  }
}

async function checkBucketEncryption(bucketName) {
  try {
    const response = await s3Client.send(
      new GetBucketEncryptionCommand({
        Bucket: bucketName
      })
    );
    
    const encryptionRule = response.ServerSideEncryptionConfiguration.Rules[0];
    console.log(`\nEncryption configuration for bucket ${bucketName}:`);
    console.log('- SSE Algorithm:', encryptionRule.ApplyServerSideEncryptionByDefault.SSEAlgorithm);
    if (encryptionRule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID) {
      console.log('- KMS Key ID:', encryptionRule.ApplyServerSideEncryptionByDefault.KMSMasterKeyID);
    }
    console.log('- Bucket Key Enabled:', encryptionRule.BucketKeyEnabled);
    
  } catch (error) {
    if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
      console.log(`\nNo encryption configuration found for bucket ${bucketName}`);
    } else {
      console.error('Error checking bucket encryption:', error);
    }
  }
}

async function listBucketsAndCheckEncryption() {
  try {
    const response = await s3Client.send(new ListBucketsCommand({}));
    console.log('\nChecking encryption for all buckets...');
    
    for (const bucket of response.Buckets) {
      await checkBucketEncryption(bucket.Name);
    }
  } catch (error) {
    console.error('Error listing buckets:', error);
  }
}

async function listKMSKeys() {
  try {
    const response = await kmsClient.send(new ListKeysCommand({}));
    console.log('\nAvailable KMS Keys:');
    
    for (const key of response.Keys) {
      try {
        const keyDetails = await kmsClient.send(
          new DescribeKeyCommand({
            KeyId: key.KeyId
          })
        );
        
        console.log(`- Key ID: ${key.KeyId}`);
        console.log(`  Description: ${keyDetails.KeyMetadata.Description}`);
        console.log(`  State: ${keyDetails.KeyMetadata.KeyState}`);
        console.log();
      } catch (error) {
        console.error(`Error getting details for key ${key.KeyId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing KMS keys:', error);
  }
}

async function testBucketWithObject(bucketName) {
  try {
    const objectKey = 'test-object.txt';
    const objectContent = 'This is a test object';
    
    console.log('\nUploading test object...');
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: objectContent
      })
    );
    console.log('Test object uploaded successfully');
    
  } catch (error) {
    console.error('Error testing bucket with object:', error);
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting S3 bucket KMS encryption check...');
    
    // List available KMS keys
    await listKMSKeys();
    
    // Create non-compliant bucket
    console.log('\nCreating non-compliant bucket...');
    const bucketName = await createNonCompliantBucket();
    
    // Check encryption configuration
    await checkBucketEncryption(bucketName);
    
    // Test bucket with object upload
    await testBucketWithObject(bucketName);
    
    // List all buckets and check their encryption
    await listBucketsAndCheckEncryption();
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main().catch(console.error);