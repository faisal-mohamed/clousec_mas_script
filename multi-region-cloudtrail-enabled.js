const { 
    CloudTrailClient, 
    CreateTrailCommand,
    DeleteTrailCommand,
    StartLoggingCommand,
    StopLoggingCommand,
    DescribeTrailsCommand,
    UpdateTrailCommand,
    GetTrailStatusCommand
} = require("@aws-sdk/client-cloudtrail");

const { 
    S3Client, 
    CreateBucketCommand,
    PutBucketPolicyCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    HeadBucketCommand
} = require("@aws-sdk/client-s3");

// Configure credentials
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || 'ap-southeast-1'
};

// Initialize clients
const cloudTrailClient = new CloudTrailClient(credentials);
const s3Client = new S3Client(credentials);

// Configuration
const config = {
    trailName: 'test-non-compliant-trail',
    bucketName: `cloudtrail-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    createdResources: false
};

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function createS3Bucket() {
    try {
        const createBucketCommand = new CreateBucketCommand({
            Bucket: config.bucketName,
            ACL: 'private'
        });
        
        await s3Client.send(createBucketCommand);
        console.log(`Created S3 bucket: ${config.bucketName}`);

        await wait(2000);

        // Add bucket policy for CloudTrail
        const bucketPolicy = {
            Version: '2012-10-17',
            Statement: [{
                Sid: 'AWSCloudTrailAclCheck',
                Effect: 'Allow',
                Principal: {
                    Service: 'cloudtrail.amazonaws.com'
                },
                Action: 's3:GetBucketAcl',
                Resource: `arn:aws:s3:::${config.bucketName}`
            }, {
                Sid: 'AWSCloudTrailWrite',
                Effect: 'Allow',
                Principal: {
                    Service: 'cloudtrail.amazonaws.com'
                },
                Action: 's3:PutObject',
                Resource: `arn:aws:s3:::${config.bucketName}/*`,
                Condition: {
                    StringEquals: {
                        's3:x-amz-acl': 'bucket-owner-full-control'
                    }
                }
            }]
        };

        const putBucketPolicyCommand = new PutBucketPolicyCommand({
            Bucket: config.bucketName,
            Policy: JSON.stringify(bucketPolicy)
        });

        await s3Client.send(putBucketPolicyCommand);
        console.log('Added bucket policy for CloudTrail');
    } catch (error) {
        console.error('Error creating S3 bucket:', error);
        throw error;
    }
}

async function createNonCompliantTrail() {
    try {
        // Create single-region trail (non-compliant)
        const createTrailCommand = new CreateTrailCommand({
            Name: config.trailName,
            S3BucketName: config.bucketName,
            IsMultiRegionTrail: false, // Making it non-compliant
            IncludeGlobalServiceEvents: false, // Also non-compliant
            EnableLogFileValidation: true
        });

        await cloudTrailClient.send(createTrailCommand);
        config.createdResources = true;
        console.log(`Created single-region trail: ${config.trailName}`);

        await wait(2000);

        // Start logging
        const startLoggingCommand = new StartLoggingCommand({
            Name: config.trailName
        });

        await cloudTrailClient.send(startLoggingCommand);
        console.log('Started logging for the trail');
    } catch (error) {
        console.error('Error creating trail:', error);
        throw error;
    }
}

async function verifyConfiguration() {
    try {
        // Verify trail configuration
        const describeTrailsCommand = new DescribeTrailsCommand({
            trailNameList: [config.trailName]
        });

        const trailsResponse = await cloudTrailClient.send(describeTrailsCommand);
        
        console.log('\nCurrent Trail Configuration:');
        console.log(JSON.stringify(trailsResponse.trailList[0], null, 2));

        // Verify trail status
        const getTrailStatusCommand = new GetTrailStatusCommand({
            Name: config.trailName
        });

        const statusResponse = await cloudTrailClient.send(getTrailStatusCommand);
        console.log('\nTrail Status:');
        console.log(JSON.stringify({
            IsLogging: statusResponse.IsLogging,
            LatestDeliveryTime: statusResponse.LatestDeliveryTime
        }, null, 2));
    } catch (error) {
        console.error('Error verifying configuration:', error);
    }
}

async function cleanup() {
    try {
        if (config.createdResources) {
            console.log('\nStarting cleanup process...');

            // Stop logging first
            try {
                const stopLoggingCommand = new StopLoggingCommand({
                    Name: config.trailName
                });
                await cloudTrailClient.send(stopLoggingCommand);
                console.log('Stopped logging for the trail');
            } catch (error) {
                console.error('Error stopping logging:', error);
            }

            await wait(2000);

            // Delete the trail
            try {
                const deleteTrailCommand = new DeleteTrailCommand({
                    Name: config.trailName
                });
                await cloudTrailClient.send(deleteTrailCommand);
                console.log('Deleted CloudTrail');
            } catch (error) {
                console.error('Error deleting trail:', error);
            }

            // Delete S3 bucket contents and bucket
            try {
                const listObjectsCommand = new ListObjectsV2Command({
                    Bucket: config.bucketName
                });
                
                const listedObjects = await s3Client.send(listObjectsCommand);

                if (listedObjects.Contents && listedObjects.Contents.length > 0) {
                    const deleteObjectsCommand = new DeleteObjectsCommand({
                        Bucket: config.bucketName,
                        Delete: {
                            Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
                        }
                    });

                    await s3Client.send(deleteObjectsCommand);
                    console.log('Deleted all objects from S3 bucket');
                }

                await wait(2000);

                const deleteBucketCommand = new DeleteBucketCommand({
                    Bucket: config.bucketName
                });
                
                await s3Client.send(deleteBucketCommand);
                console.log('Deleted S3 bucket');
            } catch (error) {
                console.error('Error cleaning up S3:', error);
            }
        } else {
            console.log('No resources to clean up - nothing was created');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
}

async function verifyCleanup() {
    console.log('\nVerifying cleanup...');
    try {
        // Verify trail is gone
        try {
            const describeTrailsCommand = new DescribeTrailsCommand({
                trailNameList: [config.trailName]
            });
            
            await cloudTrailClient.send(describeTrailsCommand);
            console.log('✗ CloudTrail still exists');
        } catch (error) {
            if (error.name === 'TrailNotFoundException') {
                console.log('✓ CloudTrail was successfully deleted');
            } else {
                console.log('? Unable to verify CloudTrail status');
            }
        }

        // Verify bucket is gone
        try {
            const headBucketCommand = new HeadBucketCommand({
                Bucket: config.bucketName
            });
            
            await s3Client.send(headBucketCommand);
            console.log('✗ S3 bucket still exists');
        } catch (error) {
            if (error.name === 'NotFound') {
                console.log('✓ S3 bucket was successfully deleted');
            } else {
                console.log('? Unable to verify S3 bucket status');
            }
        }
    } catch (error) {
        console.log('Cleanup verification error:', error);
    }
}

async function main() {
    try {
        console.log('Starting CloudTrail multi-region non-compliance simulation...');
        
        // Create resources
        await createS3Bucket();
        await createNonCompliantTrail();

        // Verify the configuration
        await verifyConfiguration();

        // Wait for a few seconds
        console.log('\nWaiting for 5 seconds...');
        await wait(5000);

        // Cleanup
        console.log('\nStarting cleanup...');
        await cleanup();
        
        // Verify cleanup
        await verifyCleanup();
        
        console.log('\nScript execution completed successfully');

    } catch (error) {
        console.error('Error in main execution:', error);
        // Attempt cleanup even if there was an error
        try {
            await cleanup();
            await verifyCleanup();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

// Execute the script
main();
