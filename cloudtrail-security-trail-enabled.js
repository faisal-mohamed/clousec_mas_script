// const {
//     CloudTrailClient,
//     CreateTrailCommand,
//     DeleteTrailCommand,
//     GetTrailCommand,
//     StartLoggingCommand,
//     StopLoggingCommand,
//     GetEventSelectorsCommand,
//     PutEventSelectorsCommand
// } = require("@aws-sdk/client-cloudtrail");

// const {
//     S3Client,
//     CreateBucketCommand,
//     PutBucketPolicyCommand,
//     DeleteBucketCommand,
//     DeleteObjectsCommand,
//     ListObjectsV2Command
// } = require("@aws-sdk/client-s3");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN,
//     region: process.env.AWS_REGION || 'ap-southeast-1'
// };

// // Initialize clients
// const cloudTrailClient = new CloudTrailClient(credentials);
// const s3Client = new S3Client(credentials);

// // Configuration
// const config = {
//     trailName: `test-non-compliant-trail-${Date.now()}`,
//     bucketName: `cloudtrail-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`,
//     createdResources: false
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function createS3Bucket() {
//     try {
//         console.log('Creating S3 bucket...');

//         const createBucketCommand = new CreateBucketCommand({
//             Bucket: config.bucketName,
//             ACL: 'private'
//         });
        
//         await s3Client.send(createBucketCommand);

//         // Add bucket policy
//         const bucketPolicy = {
//             Version: "2012-10-17",
//             Statement: [
//                 {
//                     Sid: "AWSCloudTrailAclCheck20150319",
//                     Effect: "Allow",
//                     Principal: {
//                         Service: "cloudtrail.amazonaws.com"
//                     },
//                     Action: "s3:GetBucketAcl",
//                     Resource: `arn:aws:s3:::${config.bucketName}`
//                 },
//                 {
//                     Sid: "AWSCloudTrailWrite20150319",
//                     Effect: "Allow",
//                     Principal: {
//                         Service: "cloudtrail.amazonaws.com"
//                     },
//                     Action: "s3:PutObject",
//                     Resource: `arn:aws:s3:::${config.bucketName}/AWSLogs/${process.env.AWS_ACCOUNT_ID}/*`,
//                     Condition: {
//                         StringEquals: {
//                             "s3:x-amz-acl": "bucket-owner-full-control"
//                         }
//                     }
//                 }
//             ]
//         };
        

//         const putBucketPolicyCommand = new PutBucketPolicyCommand({
//             Bucket: config.bucketName,
//             Policy: JSON.stringify(bucketPolicy)
//         });

//         await s3Client.send(putBucketPolicyCommand);
//         console.log('Created and configured S3 bucket');

//         // Wait for policy to propagate
//         await wait(5000);
//     } catch (error) {
//         console.error('Error creating S3 bucket:', error);
//         throw error;
//     }
// }

// async function createNonCompliantTrail() {
//     try {
//         console.log('Creating non-compliant CloudTrail trail...');

//         // Create trail without security best practices
//         const createTrailCommand = new CreateTrailCommand({
//             Name: config.trailName,
//             S3BucketName: config.bucketName,
//             // Non-compliant settings:
//             IsMultiRegionTrail: false,        // Should be true
//             EnableLogging: true,
//             IncludeGlobalServiceEvents: false, // Should be true
//             IsOrganizationTrail: false,
//             LogFileValidationEnabled: false    // Should be true
//             // KmsKeyId not set (non-compliant)
//         });

//         await cloudTrailClient.send(createTrailCommand);
//         config.createdResources = true;
//         console.log('Created non-compliant CloudTrail trail');

//         // Configure basic event selectors (non-compliant - not recording all management events)
//         const putEventSelectorsCommand = new PutEventSelectorsCommand({
//             TrailName: config.trailName,
//             EventSelectors: [{
//                 ReadWriteType: 'WriteOnly', // Should be 'All'
//                 IncludeManagementEvents: true
//             }]
//         });

//         await cloudTrailClient.send(putEventSelectorsCommand);
//         console.log('Configured non-compliant event selectors');

//         // Start logging
//         const startLoggingCommand = new StartLoggingCommand({
//             Name: config.trailName
//         });

//         await cloudTrailClient.send(startLoggingCommand);
//         console.log('Started CloudTrail logging');

//     } catch (error) {
//         console.error('Error creating CloudTrail trail:', error);
//         throw error;
//     }
// }

// async function verifyConfiguration() {
//     try {
//         console.log('\nVerifying CloudTrail configuration...');

//         // Get trail configuration
//         const getTrailCommand = new GetTrailCommand({
//             Name: config.trailName
//         });

//         const trailResponse = await cloudTrailClient.send(getTrailCommand);
        
//         console.log('\nTrail Configuration:');
//         console.log(JSON.stringify(trailResponse.Trail, null, 2));

//         // Get event selectors
//         const getEventSelectorsCommand = new GetEventSelectorsCommand({
//             TrailName: config.trailName
//         });

//         const eventSelectorsResponse = await cloudTrailClient.send(getEventSelectorsCommand);
        
//         console.log('\nEvent Selectors:');
//         console.log(JSON.stringify(eventSelectorsResponse.EventSelectors, null, 2));

//         // Check compliance
//         const trail = trailResponse.Trail;
//         const eventSelectors = eventSelectorsResponse.EventSelectors;

//         console.log('\nCompliance Check:');
//         console.log(`Multi-region Trail: ${trail.IsMultiRegionTrail} (should be true)`);
//         console.log(`Global Service Events: ${trail.IncludeGlobalServiceEvents} (should be true)`);
//         console.log(`Log File Validation: ${trail.LogFileValidationEnabled} (should be true)`);
//         console.log(`KMS Encryption: ${Boolean(trail.KmsKeyId)} (should be true)`);
//         console.log(`Management Events: ${eventSelectors[0].IncludeManagementEvents} (should be true)`);
//         console.log(`Read/Write Events: ${eventSelectors[0].ReadWriteType === 'All'} (should be All)`);

//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Stop and delete trail
//             try {
//                 const stopLoggingCommand = new StopLoggingCommand({
//                     Name: config.trailName
//                 });
//                 await cloudTrailClient.send(stopLoggingCommand);

//                 const deleteTrailCommand = new DeleteTrailCommand({
//                     Name: config.trailName
//                 });
//                 await cloudTrailClient.send(deleteTrailCommand);
//                 console.log('Deleted CloudTrail trail');
//             } catch (error) {
//                 console.error('Error cleaning up trail:', error);
//             }

//             // Delete S3 bucket contents and bucket
//             try {
//                 const listObjectsCommand = new ListObjectsV2Command({
//                     Bucket: config.bucketName
//                 });
                
//                 const listedObjects = await s3Client.send(listObjectsCommand);

//                 if (listedObjects.Contents && listedObjects.Contents.length > 0) {
//                     const deleteObjectsCommand = new DeleteObjectsCommand({
//                         Bucket: config.bucketName,
//                         Delete: {
//                             Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
//                         }
//                     });

//                     await s3Client.send(deleteObjectsCommand);
//                 }

//                 const deleteBucketCommand = new DeleteBucketCommand({
//                     Bucket: config.bucketName
//                 });
                
//                 await s3Client.send(deleteBucketCommand);
//                 console.log('Deleted S3 bucket');
//             } catch (error) {
//                 console.error('Error cleaning up S3:', error);
//             }
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// }

// async function main() {
//     try {
//         console.log('Starting CloudTrail security configuration non-compliance simulation...');
        
//         await createS3Bucket();
//         await createNonCompliantTrail();
//         await verifyConfiguration();

//         console.log('\nWaiting for 5 seconds...');
//         await wait(5000);

//         await cleanup();
        
//         console.log('\nScript execution completed successfully');

//     } catch (error) {
//         console.error('Error in main execution:', error);
//         try {
//             await cleanup();
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// }

// // Execute the script
// main();


const {
    CloudTrailClient,
    CreateTrailCommand,
    DeleteTrailCommand,
    StartLoggingCommand,
    StopLoggingCommand,
    GetTrailCommand,
    PutEventSelectorsCommand
} = require("@aws-sdk/client-cloudtrail");

const {
    S3Client,
    CreateBucketCommand,
    PutBucketPolicyCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command
} = require("@aws-sdk/client-s3");

const {
    KMSClient,
    CreateKeyCommand,
    ScheduleKeyDeletionCommand,
    PutKeyPolicyCommand
} = require("@aws-sdk/client-kms");

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

// Create KMS key for CloudTrail encryption
const createKMSKey = async () => {
    const kmsClient = getClient(KMSClient);

    try {
        console.log('Creating KMS key...');
        const createKeyResponse = await kmsClient.send(
            new CreateKeyCommand({
                Description: 'KMS key for CloudTrail encryption',
                KeyUsage: 'ENCRYPT_DECRYPT',
                Origin: 'AWS_KMS'
            })
        );

        const keyId = createKeyResponse.KeyMetadata.KeyId;
        const keyArn = createKeyResponse.KeyMetadata.Arn;

        // Set key policy to allow CloudTrail
        const keyPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'Enable IAM User Permissions',
                    Effect: 'Allow',
                    Principal: {
                        AWS: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:root`
                    },
                    Action: 'kms:*',
                    Resource: '*'
                },
                {
                    Sid: 'Allow CloudTrail to encrypt logs',
                    Effect: 'Allow',
                    Principal: {
                        Service: 'cloudtrail.amazonaws.com'
                    },
                    Action: [
                        'kms:GenerateDataKey*',
                        'kms:Decrypt'
                    ],
                    Resource: '*'
                }
            ]
        };

        await kmsClient.send(
            new PutKeyPolicyCommand({
                KeyId: keyId,
                PolicyName: 'default',
                Policy: JSON.stringify(keyPolicy)
            })
        );

        console.log('KMS key created and configured successfully');
        return keyArn;
    } catch (error) {
        console.error('Error creating KMS key:', error);
        throw error;
    }
};

// Create non-compliant CloudTrail (without security best practices)
// Create non-compliant CloudTrail (without security best practices)
const createNonCompliantTrail = async (s3BucketName) => {
    const cloudTrailClient = getClient(CloudTrailClient);
    const trailName = `non-compliant-trail-${Date.now()}`;

    try {
        // Create trail without security best practices
        console.log('Creating CloudTrail trail...');
        await cloudTrailClient.send(
            new CreateTrailCommand({
                Name: trailName,
                S3BucketName: s3BucketName,
                IsMultiRegionTrail: false, // Non-compliant: Single region only
                EnableLogFileValidation: false, // Non-compliant: No log file validation
                IncludeGlobalServiceEvents: false, // Non-compliant: No global service events
                // Non-compliant: No KMS encryption
            })
        );

        // Configure event selectors with minimal logging
        await cloudTrailClient.send(
            new PutEventSelectorsCommand({
                TrailName: trailName,
                EventSelectors: [
                    {
                        ReadWriteType: 'WriteOnly', // Non-compliant: Only write events
                        IncludeManagementEvents: true, // Need to be true when not using data events
                        DataResources: [] // Empty data resources
                    }
                ]
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


// Make trail compliant with security best practices
const makeCompliant = async (trailName, kmsKeyArn) => {
    const cloudTrailClient = getClient(CloudTrailClient);

    try {
        console.log('Updating trail with security best practices...');
        await cloudTrailClient.send(
            new UpdateTrailCommand({
                Name: trailName,
                IsMultiRegionTrail: true,
                EnableLogFileValidation: true,
                IncludeGlobalServiceEvents: true,
                KmsKeyId: kmsKeyArn
            })
        );

        // Update event selectors
        await cloudTrailClient.send(
            new PutEventSelectorsCommand({
                TrailName: trailName,
                EventSelectors: [
                    {
                        ReadWriteType: 'All',
                        IncludeManagementEvents: true
                    }
                ]
            })
        );

        console.log('Trail updated with security best practices');
    } catch (error) {
        console.error('Error updating trail:', error);
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
            if (!error.name.includes('TrailNotFoundException')) {
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

// Delete KMS key
const deleteKMSKey = async (keyId) => {
    const kmsClient = getClient(KMSClient);

    try {
        console.log('Scheduling KMS key deletion...');
        await kmsClient.send(
            new ScheduleKeyDeletionCommand({
                KeyId: keyId,
                PendingWindowInDays: 7
            })
        );
        console.log('KMS key scheduled for deletion');
    } catch (error) {
        console.error('Error scheduling KMS key deletion:', error);
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
    let kmsKeyArn = null;

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

        // Create KMS key (but don't use it in non-compliant trail)
        kmsKeyArn = await createKMSKey();

        // Create non-compliant CloudTrail
        trailName = await createNonCompliantTrail(s3BucketName);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Non-compliant trail created with these issues:');
        console.log('1. Single-region trail (not multi-region)');
        console.log('2. Log file validation disabled');
        console.log('3. Global service events excluded');
        console.log('4. No KMS encryption');
        console.log('5. Management events excluded');
        console.log('6. Only write events logged');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the trail compliant
        // await makeCompliant(trailName, kmsKeyArn);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

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
            if (kmsKeyArn) {
                await deleteKMSKey(kmsKeyArn.split('/')[1]);
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


