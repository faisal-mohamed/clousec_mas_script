const { 
    CloudTrailClient, 
    CreateTrailCommand,
    DeleteTrailCommand,
    StartLoggingCommand,
    StopLoggingCommand,
    DescribeTrailsCommand,
    UpdateTrailCommand
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
    createdNewTrail: false
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

async function createTrail() {
    try {
        const createTrailCommand = new CreateTrailCommand({
            Name: config.trailName,
            S3BucketName: config.bucketName,
            IsMultiRegionTrail: true,
            EnableLogFileValidation: true,
            IncludeGlobalServiceEvents: true
        });

        await cloudTrailClient.send(createTrailCommand);
        config.createdNewTrail = true;
        console.log(`Created new trail: ${config.trailName}`);

        await wait(2000);

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

async function makeNonCompliant() {
    try {
        const updateTrailCommand = new UpdateTrailCommand({
            Name: config.trailName,
            EnableLogFileValidation: false
        });

        await cloudTrailClient.send(updateTrailCommand);
        console.log('Successfully disabled log file validation');
    } catch (error) {
        console.error('Error making trail non-compliant:', error);
        throw error;
    }
}

async function cleanup() {
    try {
        if (config.createdNewTrail) {
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

            // Delete all objects in the bucket
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

                // Delete the bucket
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

async function verifyConfiguration() {
    try {
        const describeTrailsCommand = new DescribeTrailsCommand({
            trailNameList: [config.trailName]
        });

        const trails = await cloudTrailClient.send(describeTrailsCommand);
        console.log('\nCurrent Configuration:');
        console.log(JSON.stringify(trails.trailList[0], null, 2));
    } catch (error) {
        console.error('Error verifying configuration:', error);
    }
}

async function verifyCleanup() {
    console.log('\nVerifying cleanup...');
    try {
        // Verify trail is gone
        const describeTrailsCommand = new DescribeTrailsCommand({
            trailNameList: [config.trailName]
        });
        
        const trails = await cloudTrailClient.send(describeTrailsCommand);
        
        if (trails.trailList.length === 0) {
            console.log('✓ CloudTrail was successfully deleted');
        } else {
            console.log('✗ CloudTrail still exists');
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
        console.log('Starting CloudTrail non-compliance simulation...');
        
        // Check if trail exists
        const describeTrailsCommand = new DescribeTrailsCommand({});
        const trails = await cloudTrailClient.send(describeTrailsCommand);
        const existingTrail = trails.trailList.find(t => t.Name === config.trailName);

        if (!existingTrail) {
            console.log('No existing trail found. Creating new resources...');
            await createS3Bucket();
            await createTrail();
        }

        // Make it non-compliant
        console.log('\nMaking trail non-compliant...');
        await makeNonCompliant();

        // Verify the configuration
        await verifyConfiguration();

        // Wait for a few seconds to simulate some activity
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
