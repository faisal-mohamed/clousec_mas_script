const {
    S3Client,
    CreateBucketCommand,
    PutBucketPolicyCommand,
    HeadBucketCommand,
    PutPublicAccessBlockCommand,
    PutBucketTaggingCommand
} = require("@aws-sdk/client-s3");

require('dotenv').config();

// Initialize AWS client
const getClient = () => {
    try {
        const credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        };

        const config = {
            credentials: credentials,
            region: process.env.AWS_REGION || 'ap-southeast-1'
        };

        return new S3Client(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Disable Block Public Access for the bucket
const disableBlockPublicAccess = async (client, bucketName) => {
    console.log('Disabling Block Public Access...');
    try {
        await client.send(
            new PutPublicAccessBlockCommand({
                Bucket: bucketName,
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: false,
                    IgnorePublicAcls: false,
                    BlockPublicPolicy: false,
                    RestrictPublicBuckets: false
                }
            })
        );
        console.log('Block Public Access disabled successfully.');
    } catch (error) {
        console.error('Error disabling Block Public Access:', error);
        throw error;
    }
};

// Create a non-compliant S3 bucket
const createNonCompliantBucket = async () => {
    const client = getClient();
    const bucketName = `non-compliant-bucket-${Date.now()}`;

    try {
        // Create bucket
        console.log(`Creating bucket: ${bucketName}`);
        await client.send(
            new CreateBucketCommand({
                Bucket: bucketName,
                CreateBucketConfiguration: {
                    LocationConstraint: process.env.AWS_REGION || 'ap-southeast-1'
                }
            })
        );

        // Wait for bucket to be created
        await waitForBucketExists(client, bucketName);
        console.log('Bucket created successfully.');

        // Add simulation-mas tag
        await client.send(
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
        console.log('Added simulation-mas tag.');

        // Disable Block Public Access
        await disableBlockPublicAccess(client, bucketName);

        // Apply a bucket policy that does NOT enforce SSL
        const bucketPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'AllowAllRequests',
                    Effect: 'Allow',
                    Principal: '*',
                    Action: 's3:GetObject',
                    Resource: `arn:aws:s3:::${bucketName}/*`
                }
            ]
        };

        console.log('Applying non-compliant bucket policy...');
        await client.send(
            new PutBucketPolicyCommand({
                Bucket: bucketName,
                Policy: JSON.stringify(bucketPolicy)
            })
        );

        console.log('Non-compliant bucket policy applied successfully.');
        return bucketName;
    } catch (error) {
        console.error('Error creating bucket:', error);
        throw error;
    }
};

// Wait for bucket to exist
const waitForBucketExists = async (client, bucketName) => {
    console.log('Waiting for bucket to be created...');
    while (true) {
        try {
            await client.send(
                new HeadBucketCommand({
                    Bucket: bucketName
                })
            );
            break;
        } catch (error) {
            if (error.name === 'NotFound') {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                continue;
            }
            throw error;
        }
    }
};

// Main function
const main = async () => {
    try {
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN'
        ];

        const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
        if (missingEnvVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
        }

        const bucketName = await createNonCompliantBucket();
        console.log('Non-compliant bucket created successfully:', bucketName);
    } catch (error) {
        console.error('Error in main function:', error);
        process.exitCode = 1;
    }
};

if (require.main === module) {
    main();
}
