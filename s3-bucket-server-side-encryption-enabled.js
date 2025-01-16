require('dotenv').config();
const {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  PutBucketEncryptionCommand,
  GetBucketEncryptionCommand,
  DeleteBucketEncryptionCommand,
  ListBucketsCommand,
  PutObjectCommand,
  DeleteObjectCommand
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

// Track created resources
const createdResources = [];

// Create non-compliant S3 bucket (without default encryption)
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

    createdResources.push({
      type: 'BUCKET',
      name: bucketName
    });

    console.log(`Created bucket: ${bucketName}`);

    // Try to remove default encryption (this might not work as S3 now enforces encryption)
    try {
      await s3Client.send(
        new DeleteBucketEncryptionCommand({
          Bucket: bucketName
        })
      );
      console.log('Attempted to remove default encryption');
    } catch (error) {
      console.log('Note: Could not remove default encryption (this is expected as S3 now enforces encryption)');
    }

    return bucketName;
  } catch (error) {
    console.error('Error creating non-compliant bucket:', error);
    throw error;
  }
}

// Check bucket encryption
async function checkBucketEncryption(bucketName) {
  try {
    const response = await s3Client.send(
      new GetBucketEncryptionCommand({
        Bucket: bucketName
      })
    );

    console.log('\nAnalyzing Bucket:', bucketName);
    console.log('Encryption Configuration:');
    
    const rules = response.ServerSideEncryptionConfiguration?.Rules || [];
    if (rules.length > 0) {
      for (const rule of rules) {
        const applyServerSideEncryptionByDefault = rule.ApplyServerSideEncryptionByDefault;
        if (applyServerSideEncryptionByDefault) {
          console.log(`SSE Algorithm: ${applyServerSideEncryptionByDefault.SSEAlgorithm}`);
          if (applyServerSideEncryptionByDefault.KMSMasterKeyID) {
            console.log(`KMS Key ID: ${applyServerSideEncryptionByDefault.KMSMasterKeyID}`);
          }
        }
        if (rule.BucketKeyEnabled !== undefined) {
          console.log(`Bucket Key Enabled: ${rule.BucketKeyEnabled}`);
        }
      }
      console.log('\nCompliance Status: COMPLIANT');
      return true;
    } else {
      console.log('No encryption configuration found');
      console.log('\nCompliance Status: NON_COMPLIANT');
      return false;
    }
  } catch (error) {
    if (error.name === 'ServerSideEncryptionConfigurationNotFoundError') {
      console.log('\nNo encryption configuration found');
      console.log('\nCompliance Status: NON_COMPLIANT');
      return false;
    }
    console.error('Error checking bucket encryption:', error);
    throw error;
  }
}

// List and check all buckets
async function listBucketsAndCheckEncryption() {
  try {
    const response = await s3Client.send(new ListBucketsCommand({}));
    
    console.log('\nChecking all S3 buckets in account:');
    for (const bucket of response.Buckets) {
      try {
        console.log(`\nBucket: ${bucket.Name}`);
        await checkBucketEncryption(bucket.Name);
      } catch (error) {
        console.error(`Error checking bucket ${bucket.Name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing buckets:', error);
  }
}

// Test bucket with an object upload
async function testBucketWithObject(bucketName) {
  const testObjectKey = 'test-object.txt';
  
  try {
    console.log('\nTesting bucket with object upload...');
    
    // Upload object without explicit encryption
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: testObjectKey,
        Body: 'Test content'
      })
    );
    console.log('Uploaded test object without explicit encryption');

    // Clean up test object
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: testObjectKey
      })
    );
    console.log('Cleaned up test object');
  } catch (error) {
    console.error('Error during bucket testing:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'BUCKET':
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
    console.log('Starting S3 bucket encryption check...');
    
    // Create non-compliant bucket
    console.log('\nCreating non-compliant bucket...');
    const bucketName = await createNonCompliantBucket();
    
    // Check encryption configuration
    await checkBucketEncryption(bucketName);
    
    // Test bucket with object upload
    await testBucketWithObject(bucketName);
    
    // List all buckets and check their encryption
    await listBucketsAndCheckEncryption();
    
    // Wait before cleanup
    console.log('\nWaiting before cleanup...');
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
