const { 
    S3Client, 
    CreateBucketCommand,
    PutBucketLoggingCommand,
    GetBucketLoggingCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    PutBucketPolicyCommand
} = require("@aws-sdk/client-s3");

// Configure credentials
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || 'ap-southeast-1'
};

// Initialize client
const s3Client = new S3Client(credentials);

// Configuration
const config = {
    sourceBucketName: `source-bucket-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    logBucketName: `log-bucket-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    createdResources: false
};

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function createLogBucket() {
    try {
        console.log('Creating logging bucket...');

        const createBucketCommand = new CreateBucketCommand({
            Bucket: config.logBucketName,
            ACL: 'private'
        });
        
        await s3Client.send(createBucketCommand);
        console.log(`Created logging bucket: ${config.logBucketName}`);

        // Add bucket policy for S3 logging
        const bucketPolicy = {
            Version: '2012-10-17',
            Statement: [{
                Sid: 'S3ServerAccessLogsPolicy',
                Effect: 'Allow',
                Principal: {
                    Service: 'logging.s3.amazonaws.com'
                },
                Action: 's3:PutObject',
                Resource: `arn:aws:s3:::${config.logBucketName}/*`,
                Condition: {
                    StringEquals: {
                        'aws:SourceAccount': process.env.AWS_ACCOUNT_ID
                    }
                }
            }]
        };

        const putBucketPolicyCommand = new PutBucketPolicyCommand({
            Bucket: config.logBucketName,
            Policy: JSON.stringify(bucketPolicy)
        });

        await s3Client.send(putBucketPolicyCommand);
        console.log('Added bucket policy for S3 logging');

    } catch (error) {
        console.error('Error creating logging bucket:', error);
        throw error;
    }
}

async function createNonCompliantBucket() {
    try {
        console.log('Creating non-compliant source bucket...');

        const createBucketCommand = new CreateBucketCommand({
            Bucket: config.sourceBucketName,
            ACL: 'private'
        });
        
        await s3Client.send(createBucketCommand);
        config.createdResources = true;
        console.log(`Created source bucket: ${config.sourceBucketName}`);

        // By default, the bucket is created without logging enabled (non-compliant)
        console.log('Bucket created without logging enabled (non-compliant)');

    } catch (error) {
        console.error('Error creating source bucket:', error);
        throw error;
    }
}

async function verifyConfiguration() {
    try {
        console.log('\nVerifying bucket logging configuration...');

        // Check logging configuration
        const getLoggingCommand = new GetBucketLoggingCommand({
            Bucket: config.sourceBucketName
        });
        
        const loggingResponse = await s3Client.send(getLoggingCommand);
        
        console.log('\nLogging Configuration:');
        if (loggingResponse.LoggingEnabled) {
            console.log(JSON.stringify({
                TargetBucket: loggingResponse.LoggingEnabled.TargetBucket,
                TargetPrefix: loggingResponse.LoggingEnabled.TargetPrefix
            }, null, 2));
        } else {
            console.log('No logging configuration found (non-compliant)');
        }

    } catch (error) {
        console.error('Error verifying configuration:', error);
    }
}

async function enableLogging() {
    try {
        console.log('\nEnabling logging (optional step)...');

        const putLoggingCommand = new PutBucketLoggingCommand({
            Bucket: config.sourceBucketName,
            BucketLoggingStatus: {
                LoggingEnabled: {
                    TargetBucket: config.logBucketName,
                    TargetPrefix: 'logs/'
                }
            }
        });

        await s3Client.send(putLoggingCommand);
        console.log('Enabled logging for source bucket');

    } catch (error) {
        console.error('Error enabling logging:', error);
    }
}

async function cleanupBucket(bucketName) {
    try {
        // Delete all objects in the bucket
        const listObjectsCommand = new ListObjectsV2Command({
            Bucket: bucketName
        });
        
        const listedObjects = await s3Client.send(listObjectsCommand);

        if (listedObjects.Contents && listedObjects.Contents.length > 0) {
            const deleteObjectsCommand = new DeleteObjectsCommand({
                Bucket: bucketName,
                Delete: {
                    Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
                }
            });

            await s3Client.send(deleteObjectsCommand);
            console.log(`Deleted all objects from bucket: ${bucketName}`);
        }

        // Delete the bucket
        const deleteBucketCommand = new DeleteBucketCommand({
            Bucket: bucketName
        });
        
        await s3Client.send(deleteBucketCommand);
        console.log(`Deleted bucket: ${bucketName}`);

    } catch (error) {
        console.error(`Error cleaning up bucket ${bucketName}:`, error);
    }
}

async function cleanup() {
    try {
        if (config.createdResources) {
            console.log('\nStarting cleanup process...');

            // Clean up source bucket
            await cleanupBucket(config.sourceBucketName);

            // Clean up logging bucket
            await cleanupBucket(config.logBucketName);

            console.log('Cleanup completed');
        } else {
            console.log('No resources to clean up');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
}

async function main() {
    try {
        console.log('Starting S3 bucket logging non-compliance simulation...');
        
        // Create buckets
        await createLogBucket();
        await createNonCompliantBucket();

        // Verify the non-compliant configuration
        await verifyConfiguration();

        // Optional: Enable logging to demonstrate compliant state
        // Uncomment the next line to enable logging
        // await enableLogging();

        console.log('\nWaiting for 5 seconds...');
        await wait(5000);

        // Clean up resources
        await cleanup();
        
        console.log('\nScript execution completed successfully');

    } catch (error) {
        console.error('Error in main execution:', error);
        try {
            await cleanup();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

// Execute the script
main();
