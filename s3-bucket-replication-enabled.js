// const {
//     S3Client,
//     CreateBucketCommand,
//     DeleteBucketCommand,
//     PutBucketVersioningCommand,
//     GetBucketVersioningCommand,
//     PutBucketReplicationCommand,
//     GetBucketReplicationCommand,
//     DeleteBucketReplicationCommand,
//     ListObjectsV2Command,
//     DeleteObjectsCommand
// } = require("@aws-sdk/client-s3");

// const {
//     IAMClient,
//     CreateRoleCommand,
//     DeleteRoleCommand,
//     PutRolePolicyCommand,
//     DeleteRolePolicyCommand,
//     GetRoleCommand
// } = require("@aws-sdk/client-iam");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN
// };

// // Initialize clients for different regions
// const sourceRegion = process.env.AWS_REGION || 'ap-southeast-1';
// const destinationRegion = 'ap-southeast-2'; // Different region for cross-region replication

// const sourceS3Client = new S3Client({ ...credentials, region: sourceRegion });
// const destinationS3Client = new S3Client({ ...credentials, region: destinationRegion });
// const iamClient = new IAMClient({ ...credentials, region: sourceRegion });

// // Configuration
// const config = {
//     sourceBucketName: `source-bucket-${Date.now()}`,
//     destinationBucketName: `destination-bucket-${Date.now()}`,
//     iamRoleName: `s3-replication-role-${Date.now()}`,
//     iamPolicyName: 'replication-policy',
//     createdResources: false
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function createIAMRole() {
//     try {
//         console.log('Creating IAM role for replication...');

//         const assumeRolePolicyDocument = {
//             Version: "2012-10-17",
//             Statement: [
//                 {
//                     Effect: "Allow",
//                     Principal: {
//                         Service: "s3.amazonaws.com"
//                     },
//                     Action: "sts:AssumeRole"
//                 }
//             ]
//         };

//         const createRoleCommand = new CreateRoleCommand({
//             RoleName: config.iamRoleName,
//             AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument)
//         });

//         const roleResponse = await iamClient.send(createRoleCommand);
//         const roleArn = roleResponse.Role.Arn;

//         // Wait for role to be available
//         await wait(10000);

//         // Add inline policy to role
//         const policyDocument = {
//             Version: "2012-10-17",
//             Statement: [
//                 {
//                     Effect: "Allow",
//                     Action: [
//                         "s3:GetReplicationConfiguration",
//                         "s3:ListBucket"
//                     ],
//                     Resource: [
//                         `arn:aws:s3:::${config.sourceBucketName}`
//                     ]
//                 },
//                 {
//                     Effect: "Allow",
//                     Action: [
//                         "s3:GetObjectVersionForReplication",
//                         "s3:GetObjectVersionAcl",
//                         "s3:GetObjectVersionTagging"
//                     ],
//                     Resource: [
//                         `arn:aws:s3:::${config.sourceBucketName}/*`
//                     ]
//                 },
//                 {
//                     Effect: "Allow",
//                     Action: [
//                         "s3:ReplicateObject",
//                         "s3:ReplicateDelete",
//                         "s3:ReplicateTags"
//                     ],
//                     Resource: [
//                         `arn:aws:s3:::${config.destinationBucketName}/*`
//                     ]
//                 }
//             ]
//         };

//         const putPolicyCommand = new PutRolePolicyCommand({
//             RoleName: config.iamRoleName,
//             PolicyName: config.iamPolicyName,
//             PolicyDocument: JSON.stringify(policyDocument)
//         });

//         await iamClient.send(putPolicyCommand);
//         console.log('Created IAM role and policy');

//         return roleArn;
//     } catch (error) {
//         console.error('Error creating IAM role:', error);
//         throw error;
//     }
// }

// async function createNonCompliantBuckets() {
//     try {
//         console.log('Creating source bucket...');
//         const createSourceBucketCommand = new CreateBucketCommand({
//             Bucket: config.sourceBucketName
//         });
//         await sourceS3Client.send(createSourceBucketCommand);

//         console.log('Creating destination bucket...');
//         const createDestBucketCommand = new CreateBucketCommand({
//             Bucket: config.destinationBucketName,
//             CreateBucketConfiguration: {
//                 LocationConstraint: destinationRegion
//             }
//         });
//         await destinationS3Client.send(createDestBucketCommand);

//         config.createdResources = true;
//         console.log('Created S3 buckets without replication');

//         // Enable versioning on both buckets (required for replication)
//         const sourceVersioningCommand = new PutBucketVersioningCommand({
//             Bucket: config.sourceBucketName,
//             VersioningConfiguration: {
//                 Status: 'Enabled'
//             }
//         });
//         await sourceS3Client.send(sourceVersioningCommand);

//         const destVersioningCommand = new PutBucketVersioningCommand({
//             Bucket: config.destinationBucketName,
//             VersioningConfiguration: {
//                 Status: 'Enabled'
//             }
//         });
//         await destinationS3Client.send(destVersioningCommand);

//         console.log('Enabled versioning on both buckets');

//     } catch (error) {
//         console.error('Error creating buckets:', error);
//         throw error;
//     }
// }

// async function enableReplication(roleArn) {
//     try {
//         console.log('\nEnabling replication...');

//         const replicationConfig = {
//             Role: roleArn,
//             Rules: [
//                 {
//                     ID: 'ReplicationRule1',
//                     Status: 'Enabled',
//                     Priority: 1,
//                     DeleteMarkerReplication: { Status: 'DISABLED' },
//                     Destination: {
//                         Bucket: `arn:aws:s3:::${config.destinationBucketName}`
//                     },
//                     Filter: {
//                         Prefix: ''
//                     }
//                 }
//             ]
//         };

//         const putReplicationCommand = new PutBucketReplicationCommand({
//             Bucket: config.sourceBucketName,
//             ReplicationConfiguration: replicationConfig
//         });

//         await sourceS3Client.send(putReplicationCommand);
//         console.log('Enabled replication on source bucket');

//     } catch (error) {
//         console.error('Error enabling replication:', error);
//     }
// }

// async function verifyConfiguration() {
//     try {
//         console.log('\nVerifying bucket configuration...');

//         // Check versioning status
//         const sourceVersioningCommand = new GetBucketVersioningCommand({
//             Bucket: config.sourceBucketName
//         });
//         const sourceVersioning = await sourceS3Client.send(sourceVersioningCommand);

//         const destVersioningCommand = new GetBucketVersioningCommand({
//             Bucket: config.destinationBucketName
//         });
//         const destVersioning = await destinationS3Client.send(destVersioningCommand);

//         console.log('\nVersioning Status:');
//         console.log(`Source Bucket: ${sourceVersioning.Status || 'Not enabled'}`);
//         console.log(`Destination Bucket: ${destVersioning.Status || 'Not enabled'}`);

//         // Check replication configuration
//         try {
//             const getReplicationCommand = new GetBucketReplicationCommand({
//                 Bucket: config.sourceBucketName
//             });
//             const replication = await sourceS3Client.send(getReplicationCommand);
//             console.log('\nReplication Configuration:');
//             console.log(JSON.stringify(replication.ReplicationConfiguration, null, 2));
//         } catch (error) {
//             if (error.name === 'NoSuchReplicationConfiguration') {
//                 console.log('\nReplication: Not configured (non-compliant)');
//             } else {
//                 throw error;
//             }
//         }

//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Delete replication configuration if it exists
//             try {
//                 const deleteReplicationCommand = new DeleteBucketReplicationCommand({
//                     Bucket: config.sourceBucketName
//                 });
//                 await sourceS3Client.send(deleteReplicationCommand);
//                 console.log('Deleted replication configuration');
//             } catch (error) {
//                 if (error.name !== 'NoSuchReplicationConfiguration') {
//                     console.error('Error deleting replication:', error);
//                 }
//             }

//             // Delete objects in both buckets
//             for (const [bucket, client] of [
//                 [config.sourceBucketName, sourceS3Client],
//                 [config.destinationBucketName, destinationS3Client]
//             ]) {
//                 try {
//                     const listCommand = new ListObjectsV2Command({ Bucket: bucket });
//                     const objects = await client.send(listCommand);

//                     if (objects.Contents && objects.Contents.length > 0) {
//                         const deleteCommand = new DeleteObjectsCommand({
//                             Bucket: bucket,
//                             Delete: {
//                                 Objects: objects.Contents.map(obj => ({ Key: obj.Key }))
//                             }
//                         });
//                         await client.send(deleteCommand);
//                     }

//                     const deleteBucketCommand = new DeleteBucketCommand({
//                         Bucket: bucket
//                     });
//                     await client.send(deleteBucketCommand);
//                     console.log(`Deleted bucket: ${bucket}`);
//                 } catch (error) {
//                     console.error(`Error deleting bucket ${bucket}:`, error);
//                 }
//             }

//             // Delete IAM role and policy
//             try {
//                 const deletePolicyCommand = new DeleteRolePolicyCommand({
//                     RoleName: config.iamRoleName,
//                     PolicyName: config.iamPolicyName
//                 });
//                 await iamClient.send(deletePolicyCommand);

//                 const deleteRoleCommand = new DeleteRoleCommand({
//                     RoleName: config.iamRoleName
//                 });
//                 await iamClient.send(deleteRoleCommand);
//                 console.log('Deleted IAM role and policy');
//             } catch (error) {
//                 console.error('Error deleting IAM resources:', error);
//             }
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// }

// async function main() {
//     try {
//         console.log('Starting S3 bucket replication non-compliance simulation...');
        
//         const roleArn = await createIAMRole();
//         await createNonCompliantBuckets();
//         await verifyConfiguration();

//         // Optional: Make compliant by enabling replication
//         // Uncomment the next lines to enable replication
//         // await enableReplication(roleArn);
//         // await verifyConfiguration();

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
    S3Client,
    CreateBucketCommand,
    PutBucketVersioningCommand,
    DeleteBucketCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
    PutBucketReplicationCommand,
    GetBucketReplicationCommand
} = require("@aws-sdk/client-s3");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand
} = require("@aws-sdk/client-iam");

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

// Create source bucket without replication
const createSourceBucket = async () => {
    const s3Client = getClient(S3Client);
    const bucketName = `source-bucket-${Date.now()}`;

    try {
        console.log(`Creating source bucket: ${bucketName}`);
        await s3Client.send(
            new CreateBucketCommand({
                Bucket: bucketName,
                CreateBucketConfiguration: {
                    LocationConstraint: process.env.AWS_REGION || 'ap-southeast-1'
                }
            })
        );

        // Enable versioning (required for replication)
        await s3Client.send(
            new PutBucketVersioningCommand({
                Bucket: bucketName,
                VersioningConfiguration: {
                    Status: 'Enabled'
                }
            })
        );

        console.log('Source bucket created successfully');
        return bucketName;
    } catch (error) {
        console.error('Error creating source bucket:', error);
        throw error;
    }
};

// Create destination bucket
const createDestinationBucket = async () => {
    const s3Client = getClient(S3Client);
    const bucketName = `destination-bucket-${Date.now()}`;
    const destinationRegion = process.env.DESTINATION_REGION || 'ap-northeast-1'; // Different region for CRR

    try {
        console.log(`Creating destination bucket: ${bucketName}`);
        
        // Create client in destination region
        const destinationClient = new S3Client({
            credentials: s3Client.config.credentials,
            region: destinationRegion
        });

        await destinationClient.send(
            new CreateBucketCommand({
                Bucket: bucketName,
                CreateBucketConfiguration: {
                    LocationConstraint: destinationRegion
                }
            })
        );

        // Enable versioning
        await destinationClient.send(
            new PutBucketVersioningCommand({
                Bucket: bucketName,
                VersioningConfiguration: {
                    Status: 'Enabled'
                }
            })
        );

        console.log('Destination bucket created successfully');
        return { bucketName, region: destinationRegion };
    } catch (error) {
        console.error('Error creating destination bucket:', error);
        throw error;
    }
};

// Create IAM role for replication
const createReplicationRole = async (sourceBucket, destinationBucket) => {
    const iamClient = getClient(IAMClient);
    const roleName = `s3-replication-role-${Date.now()}`;

    try {
        console.log('Creating IAM role for replication...');

        // Create role
        const assumeRolePolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: {
                        Service: 's3.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }
            ]
        };

        const createRoleResponse = await iamClient.send(
            new CreateRoleCommand({
                RoleName: roleName,
                AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
            })
        );

        // Create role policy
        const rolePolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Action: [
                        's3:GetReplicationConfiguration',
                        's3:ListBucket'
                    ],
                    Resource: `arn:aws:s3:::${sourceBucket}`
                },
                {
                    Effect: 'Allow',
                    Action: [
                        's3:GetObjectVersionForReplication',
                        's3:GetObjectVersionAcl',
                        's3:GetObjectVersionTagging'
                    ],
                    Resource: `arn:aws:s3:::${sourceBucket}/*`
                },
                {
                    Effect: 'Allow',
                    Action: [
                        's3:ReplicateObject',
                        's3:ReplicateDelete',
                        's3:ReplicateTags'
                    ],
                    Resource: `arn:aws:s3:::${destinationBucket}/*`
                }
            ]
        };

        await iamClient.send(
            new PutRolePolicyCommand({
                RoleName: roleName,
                PolicyName: 's3-replication-policy',
                PolicyDocument: JSON.stringify(rolePolicy)
            })
        );

        // Wait for role to be available
        await new Promise(resolve => setTimeout(resolve, 10000));

        console.log('IAM role created successfully');
        return createRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
};

// Make bucket compliant by enabling replication
const makeCompliant = async (sourceBucket, destinationBucket, roleArn) => {
    const s3Client = getClient(S3Client);

    try {
        console.log('Enabling replication...');
        
        const replicationConfig = {
            Role: roleArn,
            Rules: [
                {
                    ID: 'default-replication-rule',
                    Priority: 1,
                    Status: 'Enabled',
                    DeleteMarkerReplication: { Status: 'Disabled' },
                    Destination: {
                        Bucket: `arn:aws:s3:::${destinationBucket}`,
                        Account: process.env.AWS_ACCOUNT_ID
                    },
                    Filter: {}
                }
            ]
        };

        await s3Client.send(
            new PutBucketReplicationCommand({
                Bucket: sourceBucket,
                ReplicationConfiguration: replicationConfig
            })
        );

        console.log('Replication enabled successfully');
    } catch (error) {
        console.error('Error enabling replication:', error);
        throw error;
    }
};

// Check replication status
const checkReplicationStatus = async (bucketName) => {
    const s3Client = getClient(S3Client);

    try {
        const response = await s3Client.send(
            new GetBucketReplicationCommand({
                Bucket: bucketName
            })
        );
        return response.ReplicationConfiguration !== undefined;
    } catch (error) {
        if (error.name === 'ReplicationConfigurationNotFoundError') {
            return false;
        }
        throw error;
    }
};

// Cleanup resources
const cleanup = async (resources) => {
    const s3Client = getClient(S3Client);
    const iamClient = getClient(IAMClient);

    try {
        console.log('\nStarting cleanup...');

        // Delete source bucket contents and bucket
        if (resources.sourceBucket) {
            console.log('Cleaning up source bucket...');
            const listResponse = await s3Client.send(
                new ListObjectsV2Command({
                    Bucket: resources.sourceBucket
                })
            );

            if (listResponse.Contents && listResponse.Contents.length > 0) {
                await s3Client.send(
                    new DeleteObjectsCommand({
                        Bucket: resources.sourceBucket,
                        Delete: {
                            Objects: listResponse.Contents.map(obj => ({
                                Key: obj.Key
                            }))
                        }
                    })
                );
            }

            await s3Client.send(
                new DeleteBucketCommand({
                    Bucket: resources.sourceBucket
                })
            );
        }

        // Delete destination bucket contents and bucket
        if (resources.destinationBucket) {
            console.log('Cleaning up destination bucket...');
            const destinationClient = new S3Client({
                credentials: s3Client.config.credentials,
                region: resources.destinationRegion
            });

            const listResponse = await destinationClient.send(
                new ListObjectsV2Command({
                    Bucket: resources.destinationBucket
                })
            );

            if (listResponse.Contents && listResponse.Contents.length > 0) {
                await destinationClient.send(
                    new DeleteObjectsCommand({
                        Bucket: resources.destinationBucket,
                        Delete: {
                            Objects: listResponse.Contents.map(obj => ({
                                Key: obj.Key
                            }))
                        }
                    })
                );
            }

            await destinationClient.send(
                new DeleteBucketCommand({
                    Bucket: resources.destinationBucket
                })
            );
        }

        // Delete IAM role
        if (resources.roleName) {
            console.log('Cleaning up IAM role...');
            await iamClient.send(
                new DeleteRolePolicyCommand({
                    RoleName: resources.roleName,
                    PolicyName: 's3-replication-policy'
                })
            );

            await iamClient.send(
                new DeleteRoleCommand({
                    RoleName: resources.roleName
                })
            );
        }

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    const resources = {};

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

        // Create source bucket
        const sourceBucket = await createSourceBucket();
        resources.sourceBucket = sourceBucket;

        // Create destination bucket
        const { bucketName: destinationBucket, region: destinationRegion } = await createDestinationBucket();
        resources.destinationBucket = destinationBucket;
        resources.destinationRegion = destinationRegion;

        // Create IAM role for replication
        const roleArn = await createReplicationRole(sourceBucket, destinationBucket);
        resources.roleName = roleArn.split('/')[1];

        // Check initial replication status
        const hasReplication = await checkReplicationStatus(sourceBucket);
        console.log(`Initial replication status: ${hasReplication ? 'Enabled' : 'Disabled'}`);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Bucket created without replication enabled.');
        console.log('To be compliant, the bucket should have:');
        console.log('1. Replication configuration enabled');
        console.log('2. Valid destination bucket configured');
        console.log('3. Proper IAM role for replication');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the bucket compliant
        // await makeCompliant(sourceBucket, destinationBucket, roleArn);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        try {
            await cleanup(resources);
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
