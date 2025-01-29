const {
    S3Client,
    CreateBucketCommand,
    PutBucketVersioningCommand,
    GetBucketVersioningCommand,
    PutObjectCommand
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

// Create non-compliant bucket (without versioning)
const createNonCompliantBucket = async () => {
    const s3Client = getClient();
    const bucketName = `non-compliant-bucket-${Date.now()}`;

    try {
        console.log(`Creating bucket: ${bucketName}`);
        await s3Client.send(
            new CreateBucketCommand({
                Bucket: bucketName,
                CreateBucketConfiguration: {
                    LocationConstraint: process.env.AWS_REGION || 'ap-southeast-1'
                },
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

        console.log('Bucket created successfully');
        return bucketName;
    } catch (error) {
        console.error('Error creating bucket:', error);
        throw error;
    }
};

// Check bucket versioning status
const checkVersioningStatus = async (bucketName) => {
    const s3Client = getClient();

    try {
        const response = await s3Client.send(
            new GetBucketVersioningCommand({
                Bucket: bucketName
            })
        );
        
        // Status will be undefined if versioning was never enabled
        const status = response.Status || 'Disabled';
        console.log(`Bucket versioning status: ${status}`);
        return status === 'Enabled';
    } catch (error) {
        console.error('Error checking versioning status:', error);
        throw error;
    }
};

// Upload test objects to demonstrate versioning impact
const uploadTestObjects = async (bucketName) => {
    const s3Client = getClient();
    const key = 'test-object.txt';

    try {
        console.log('Uploading test objects...');

        // Upload first version
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: 'Version 1 content'
            })
        );
        console.log('Uploaded version 1');

        // Upload second version
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: 'Version 2 content'
            })
        );
        console.log('Uploaded version 2');

        console.log('Test objects uploaded successfully');
    } catch (error) {
        console.error('Error uploading test objects:', error);
        throw error;
    }
};

// Make bucket compliant by enabling versioning
const makeCompliant = async (bucketName) => {
    const s3Client = getClient();

    try {
        console.log('Enabling bucket versioning...');
        await s3Client.send(
            new PutBucketVersioningCommand({
                Bucket: bucketName,
                VersioningConfiguration: {
                    Status: 'Enabled'
                }
            })
        );
        console.log('Bucket versioning enabled successfully');
    } catch (error) {
        console.error('Error enabling bucket versioning:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Create non-compliant bucket
        const bucketName = await createNonCompliantBucket();

        // Check initial versioning status
        await checkVersioningStatus(bucketName);

        // Upload test objects to demonstrate lack of versioning
        await uploadTestObjects(bucketName);

        // Make the bucket compliant
        await makeCompliant(bucketName);

        // Check final versioning status
        await checkVersioningStatus(bucketName);

        // Upload more test objects to demonstrate versioning
        await uploadTestObjects(bucketName);

    } catch (error) {
        console.error('Error in main function:', error);
        process.exit(1);
    }
};

main();