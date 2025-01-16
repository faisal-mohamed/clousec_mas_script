// const { 
//     CloudTrailClient, 
//     CreateTrailCommand,
//     DeleteTrailCommand,
//     StartLoggingCommand
// } = require("@aws-sdk/client-cloudtrail");

// const { 
//     S3Client, 
//     CreateBucketCommand,
//     PutBucketPolicyCommand,
//     DeleteBucketCommand,
//     DeleteObjectsCommand,
//     ListObjectsV2Command
// } = require("@aws-sdk/client-s3");

// require('dotenv').config();

// // Create AWS client
// const createAwsClient = (ClientClass) => {
//     return new ClientClass({
//         region: process.env.AWS_REGION || 'us-east-1',
//         credentials: {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         }
//     });
// };

// // Create S3 bucket for CloudTrail logs
// const createS3Bucket = async (s3Client, bucketName) => {
//     try {
//         // Create bucket
//         await s3Client.send(
//             new CreateBucketCommand({
//                 Bucket: bucketName,
//                 CreateBucketConfiguration: {
//                     LocationConstraint: process.env.AWS_REGION === 'us-east-1' ? null : process.env.AWS_REGION
//                 }
//             })
//         );

//         // Create bucket policy for CloudTrail
//         const bucketPolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Sid: 'AWSCloudTrailAclCheck',
//                     Effect: 'Allow',
//                     Principal: {
//                         Service: 'cloudtrail.amazonaws.com'
//                     },
//                     Action: 's3:GetBucketAcl',
//                     Resource: `arn:aws:s3:::${bucketName}`
//                 },
//                 {
//                     Sid: 'AWSCloudTrailWrite',
//                     Effect: 'Allow',
//                     Principal: {
//                         Service: 'cloudtrail.amazonaws.com'
//                     },
//                     Action: 's3:PutObject',
//                     Resource: `arn:aws:s3:::${bucketName}/AWSLogs/${process.env.AWS_ACCOUNT_ID}/*`,
//                     Condition: {
//                         StringEquals: {
//                             's3:x-amz-acl': 'bucket-owner-full-control'
//                         }
//                     }
//                 }
//             ]
//         };

//         await s3Client.send(
//             new PutBucketPolicyCommand({
//                 Bucket: bucketName,
//                 Policy: JSON.stringify(bucketPolicy)
//             })
//         );

//         return bucketName;
//     } catch (error) {
//         console.error('Error creating S3 bucket:', error);
//         throw error;
//     }
// };

// // Empty S3 bucket
// const emptyS3Bucket = async (s3Client, bucketName) => {
//     try {
//         const listObjectsResponse = await s3Client.send(
//             new ListObjectsV2Command({ Bucket: bucketName })
//         );

//         if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
//             await s3Client.send(
//                 new DeleteObjectsCommand({
//                     Bucket: bucketName,
//                     Delete: {
//                         Objects: listObjectsResponse.Contents.map(obj => ({ Key: obj.Key }))
//                     }
//                 })
//             );
//         }
//     } catch (error) {
//         console.error('Error emptying bucket:', error);
//     }
// };

// // Cleanup resources
// const cleanup = async (cloudTrailClient, s3Client, resources) => {
//     try {
//         if (resources.trailName) {
//             console.log('\nCleaning up resources...');
            
//             // Delete trail
//             await cloudTrailClient.send(
//                 new DeleteTrailCommand({
//                     Name: resources.trailName
//                 })
//             );
//             console.log('CloudTrail trail deleted');
//         }

//         if (resources.bucketName) {
//             // Empty and delete S3 bucket
//             await emptyS3Bucket(s3Client, resources.bucketName);
//             await s3Client.send(
//                 new DeleteBucketCommand({
//                     Bucket: resources.bucketName
//                 })
//             );
//             console.log('S3 bucket deleted');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//     }
// };

// // Create non-compliant state
// const createNonCompliantState = async () => {
//     const cloudTrailClient = createAwsClient(CloudTrailClient);
//     const s3Client = createAwsClient(S3Client);
    
//     const resources = {
//         trailName: `non-compliant-trail-${Date.now()}`,
//         bucketName: `non-compliant-trail-bucket-${Date.now()}`
//     };

//     try {
//         console.log('Creating non-compliant CloudTrail without CloudWatch Logs...');

//         // Create S3 bucket for trail
//         await createS3Bucket(s3Client, resources.bucketName);

//         // Create trail without CloudWatch Logs
//         await cloudTrailClient.send(
//             new CreateTrailCommand({
//                 Name: resources.trailName,
//                 S3BucketName: resources.bucketName,
//                 IsMultiRegionTrail: false,
//                 EnableLogFileValidation: true,
//                 IncludeGlobalServiceEvents: true
//                 // Deliberately not setting CloudWatchLogsLogGroupArn and CloudWatchLogsRoleArn
//             })
//         );

//         // Start logging for the trail
//         await cloudTrailClient.send(
//             new StartLoggingCommand({
//                 Name: resources.trailName
//             })
//         );

//         console.log('\nNon-compliant state created:');
//         console.log(`Trail Name: ${resources.trailName}`);
//         console.log(`S3 Bucket: ${resources.bucketName}`);
//         console.log('Status: Non-compliant - CloudWatch Logs integration not enabled');

//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error creating non-compliant CloudTrail:', error);
//         throw error;
//     } finally {
//         await cleanup(cloudTrailClient, s3Client, resources);
//     }
// };

// // Main function
// const main = async () => {
//     try {
//         await createNonCompliantState();
//     } catch (error) {
//         console.error('Script execution failed:', error);
//     }
// };

// // Run the script
// if (require.main === module) {
//     main();
// }

// module.exports = {
//     createNonCompliantState
// };

const {
    CloudTrailClient,
    CreateTrailCommand,
    DeleteTrailCommand,
    StartLoggingCommand,
    StopLoggingCommand,
    GetTrailCommand
} = require("@aws-sdk/client-cloudtrail");

const {
    S3Client,
    CreateBucketCommand,
    PutBucketPolicyCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command
} = require("@aws-sdk/client-s3");

require('dotenv').config();

// Initialize AWS clients
const getClient = (ServiceClient) => {
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

        return new ServiceClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create S3 bucket for CloudTrail logs
const createS3Bucket = async () => {
    const s3Client = getClient(S3Client);
    const bucketName = `cloudtrail-logs-${Date.now()}`;

    try {
        // Create bucket
        console.log(`Creating S3 bucket: ${bucketName}`);
        await s3Client.send(
            new CreateBucketCommand({
                Bucket: bucketName,
                CreateBucketConfiguration: {
                    LocationConstraint: process.env.AWS_REGION || 'ap-southeast-1'
                }
            })
        );

        // Add bucket policy for CloudTrail
        const bucketPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'AWSCloudTrailAclCheck',
                    Effect: 'Allow',
                    Principal: {
                        Service: 'cloudtrail.amazonaws.com'
                    },
                    Action: 's3:GetBucketAcl',
                    Resource: `arn:aws:s3:::${bucketName}`
                },
                {
                    Sid: 'AWSCloudTrailWrite',
                    Effect: 'Allow',
                    Principal: {
                        Service: 'cloudtrail.amazonaws.com'
                    },
                    Action: 's3:PutObject',
                    Resource: `arn:aws:s3:::${bucketName}/AWSLogs/${process.env.AWS_ACCOUNT_ID}/*`,
                    Condition: {
                        StringEquals: {
                            's3:x-amz-acl': 'bucket-owner-full-control'
                        }
                    }
                }
            ]
        };

        await s3Client.send(
            new PutBucketPolicyCommand({
                Bucket: bucketName,
                Policy: JSON.stringify(bucketPolicy)
            })
        );

        console.log('S3 bucket created and configured successfully');
        return bucketName;
    } catch (error) {
        console.error('Error creating S3 bucket:', error);
        throw error;
    }
};

// Create non-compliant CloudTrail (without CloudWatch Logs)
const createNonCompliantTrail = async (s3BucketName) => {
    const cloudTrailClient = getClient(CloudTrailClient);
    const trailName = `non-compliant-trail-${Date.now()}`;

    try {
        // Create trail without CloudWatch Logs configuration
        console.log('Creating CloudTrail trail...');
        await cloudTrailClient.send(
            new CreateTrailCommand({
                Name: trailName,
                S3BucketName: s3BucketName,
                IsMultiRegionTrail: true,
                EnableLogFileValidation: true,
                IncludeGlobalServiceEvents: true
                // Intentionally omitting CloudWatchLogsLogGroupArn and CloudWatchLogsRoleArn
            })
        );

        // Start logging
        await cloudTrailClient.send(
            new StartLoggingCommand({
                Name: trailName
            })
        );

        console.log('CloudTrail created and started successfully');
        return trailName;
    } catch (error) {
        console.error('Error creating CloudTrail:', error);
        throw error;
    }
};

// Delete CloudTrail trail
const deleteTrail = async (trailName) => {
    const cloudTrailClient = getClient(CloudTrailClient);

    try {
        console.log('Stopping CloudTrail logging...');
        try {
            await cloudTrailClient.send(
                new StopLoggingCommand({
                    Name: trailName
                })
            );
        } catch (error) {
            if (!error.name.includes('NotFound')) {
                throw error;
            }
        }

        console.log('Deleting CloudTrail...');
        await cloudTrailClient.send(
            new DeleteTrailCommand({
                Name: trailName
            })
        );
        console.log('CloudTrail deleted successfully');
    } catch (error) {
        console.error('Error deleting CloudTrail:', error);
        throw error;
    }
};

// Delete S3 bucket
const deleteBucket = async (bucketName) => {
    const s3Client = getClient(S3Client);

    try {
        // Delete all objects in the bucket
        console.log('Deleting objects from bucket...');
        const listObjectsResponse = await s3Client.send(
            new ListObjectsV2Command({
                Bucket: bucketName
            })
        );

        if (listObjectsResponse.Contents && listObjectsResponse.Contents.length > 0) {
            await s3Client.send(
                new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: listObjectsResponse.Contents.map(obj => ({
                            Key: obj.Key
                        }))
                    }
                })
            );
        }

        // Delete the bucket
        console.log('Deleting bucket...');
        await s3Client.send(
            new DeleteBucketCommand({
                Bucket: bucketName
            })
        );
        console.log('Bucket deleted successfully');
    } catch (error) {
        console.error('Error deleting bucket:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let s3BucketName = null;
    let trailName = null;

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_ACCOUNT_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Create S3 bucket for CloudTrail logs
        s3BucketName = await createS3Bucket();

        // Create non-compliant CloudTrail
        trailName = await createNonCompliantTrail(s3BucketName);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\nStarting cleanup...');
        try {
            if (trailName) {
                await deleteTrail(trailName);
            }
            if (s3BucketName) {
                await deleteBucket(s3BucketName);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
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
