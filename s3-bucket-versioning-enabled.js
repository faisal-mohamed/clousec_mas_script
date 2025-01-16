const {
    S3Client,
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
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

// Cleanup resources
const cleanup = async (bucketName) => {
    const s3Client = getClient();

    try {
        console.log('\nStarting cleanup...');

        // List and delete all objects
        const listResponse = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucketName
            })
        );

        if (listResponse.Contents && listResponse.Contents.length > 0) {
            await s3Client.send(
                new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: listResponse.Contents.map(obj => ({
                            Key: obj.Key
                        }))
                    }
                })
            );
        }

        // Delete bucket
        await s3Client.send(
            new DeleteBucketCommand({
                Bucket: bucketName
            })
        );

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let bucketName;

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
        bucketName = await createNonCompliantBucket();

        // Check initial versioning status
        await checkVersioningStatus(bucketName);

        // Upload test objects to demonstrate lack of versioning
        await uploadTestObjects(bucketName);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Bucket created without versioning enabled.');
        console.log('In this state:');
        console.log('1. New uploads overwrite existing objects');
        console.log('2. Deleted objects cannot be recovered');
        console.log('3. No version history is maintained');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the bucket compliant
        // await makeCompliant(bucketName);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await checkVersioningStatus(bucketName);
        // await uploadTestObjects(bucketName); // Now with versioning
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (bucketName) {
            try {
                await cleanup(bucketName);
            } catch (cleanupError) {
                console.error('Error during cleanup:', cleanupError);
            }
        }
    }
};

// Run the program
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
