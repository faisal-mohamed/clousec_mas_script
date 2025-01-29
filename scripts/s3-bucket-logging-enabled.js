const { 
    S3Client, 
    CreateBucketCommand,
    waitUntilBucketExists
} = require("@aws-sdk/client-s3");

// Configure credentials from environment variables
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || 'us-east-1' // Default region if not specified
};

// Initialize S3 client
const s3Client = new S3Client(credentials);

// Function to create bucket
async function createBucket(bucketName) {
    try {
        // Create the bucket
        const createBucketCommand = new CreateBucketCommand({
            Bucket: bucketName,
            // If your region is not us-east-1, you need to specify LocationConstraint
            ...(credentials.region !== 'us-east-1' && {
                CreateBucketConfiguration: {
                    LocationConstraint: credentials.region
                }
            })
        });

        const response = await s3Client.send(createBucketCommand);
        
        // Wait until the bucket exists
        await waitUntilBucketExists(
            { client: s3Client },
            { Bucket: bucketName }
        );

        console.log(`Successfully created bucket: ${bucketName}`);
        console.log(`Bucket location: ${response.Location}`);
        return response;

    } catch (error) {
        if (error.name === 'BucketAlreadyExists') {
            console.error(`Bucket ${bucketName} already exists in another AWS account`);
        } else if (error.name === 'BucketAlreadyOwnedByYou') {
            console.error(`Bucket ${bucketName} already exists in your account`);
        } else {
            console.error('Error creating bucket:', error);
        }
        throw error;
    }
}

// Example usage
const bucketName = `my-test-bucket-${Date.now()}`; // Adding timestamp to make name unique
createBucket(bucketName);
