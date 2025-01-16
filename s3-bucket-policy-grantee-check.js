require('dotenv').config();
const {
  S3Client,
  CreateBucketCommand,
  PutBucketPolicyCommand,
  DeleteBucketCommand,
  DeleteBucketPolicyCommand,
  GetBucketPolicyCommand
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

// Create non-compliant bucket with policy granting access to unauthorized principals
async function createNonCompliantBucket() {
  const bucketName = `test-bucket-${Date.now()}`;
  
  try {
    // Create bucket
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: bucketName
      })
    );

    createdResources.push({
      type: 'BUCKET',
      name: bucketName
    });

    console.log(`Created bucket: ${bucketName}`);

    // Wait for bucket to be available
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Create non-compliant bucket policy
    const bucketPolicy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "NonCompliantPolicy1",
          Effect: "Allow",
          Principal: "*",
          Action: [
            "s3:GetObject",
            "s3:PutObject",
            "s3:ListBucket"
          ],
          Resource: [
            `arn:aws:s3:::${bucketName}`,
            `arn:aws:s3:::${bucketName}/*`
          ],
          Condition: {
            StringNotEquals: {
              "aws:PrincipalArn": `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:root`
            }
          }
        },
        {
          Sid: "NonCompliantPolicy2",
          Effect: "Allow",
          Principal:"*",
          Action: "s3:GetObject",
          Resource: `arn:aws:s3:::${bucketName}/*`
        }
      ]
    };

    // Apply the non-compliant policy
    await s3Client.send(
      new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(bucketPolicy)
      })
    );

    console.log('Applied non-compliant bucket policy');
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

    console.log('\nCurrent Bucket Policy:');
    console.log(JSON.stringify(JSON.parse(response.Policy), null, 2));

    // Analyze policy for unauthorized principals
    const policy = JSON.parse(response.Policy);
    const unauthorizedPrincipals = [];

    policy.Statement.forEach(statement => {
      if (statement.Effect === 'Allow') {
        if (statement.Principal === '*') {
          unauthorizedPrincipals.push('* (Any Principal)');
        } else if (statement.Principal.AWS) {
          if (Array.isArray(statement.Principal.AWS)) {
            unauthorizedPrincipals.push(...statement.Principal.AWS);
          } else {
            unauthorizedPrincipals.push(statement.Principal.AWS);
          }
        }
      }
    });

    console.log('\nUnauthorized Principals Found:');
    unauthorizedPrincipals.forEach(principal => {
      console.log(`- ${principal}`);
    });

  } catch (error) {
    console.error('Error checking bucket policy:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'BUCKET':
          // Remove bucket policy first
          try {
            await s3Client.send(
              new DeleteBucketPolicyCommand({
                Bucket: resource.name
              })
            );
            console.log(`Deleted bucket policy for: ${resource.name}`);
          } catch (error) {
            console.error(`Error deleting bucket policy: ${error.message}`);
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
    
    // Create non-compliant bucket
    const nonCompliantBucketName = await createNonCompliantBucket();
    console.log('\nChecking non-compliant bucket policy:');
    await checkBucketPolicy(nonCompliantBucketName);

    // Wait for a moment to simulate testing
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
