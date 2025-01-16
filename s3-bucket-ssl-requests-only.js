// const { 
//     S3Client, 
//     CreateBucketCommand,
//     PutBucketPolicyCommand,
//     DeleteBucketCommand,
//     DeleteBucketPolicyCommand,
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

// // Delete all objects in bucket
// const emptyBucket = async (s3Client, bucketName) => {
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
// const cleanup = async (s3Client, resources) => {
//     try {
//         if (resources.bucketName) {
//             console.log('\nCleaning up resources...');

//             // Remove bucket policy
//             try {
//                 await s3Client.send(
//                     new DeleteBucketPolicyCommand({
//                         Bucket: resources.bucketName
//                     })
//                 );
//                 console.log('Bucket policy deleted');
//             } catch (error) {
//                 console.error('Error deleting bucket policy:', error);
//             }

//             // Empty and delete bucket
//             await emptyBucket(s3Client, resources.bucketName);
//             await s3Client.send(
//                 new DeleteBucketCommand({
//                     Bucket: resources.bucketName
//                 })
//             );
//             console.log('Bucket deleted');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//     }
// };

// // Create non-compliant state
// // Create non-compliant state
// const createNonCompliantState = async () => {
//     const s3Client = createAwsClient(S3Client);
//     const resources = {
//         // Corrected bucket naming pattern
//         bucketName: `non-compliant-bucket-${Math.random().toString(36).substring(2, 8)}-${Date.now()}`
//     };

//     try {
//         console.log('Creating non-compliant S3 bucket that allows non-SSL requests...');

//         // Create bucket
//         await s3Client.send(
//             new CreateBucketCommand({
//                 Bucket: resources.bucketName,
//                 CreateBucketConfiguration: {
//                     LocationConstraint: process.env.AWS_REGION === 'us-east-1' ? null : process.env.AWS_REGION
//                 }
//             })
//         );

//         // Wait a bit for bucket creation to propagate
//         await new Promise(resolve => setTimeout(resolve, 5000));

//         // Create bucket policy that allows both HTTP and HTTPS
//         const bucketPolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Sid: 'AllowHTTPandHTTPS',
//                     Effect: 'Allow',
//                     Principal: '*',
//                     Action: 's3:GetObject',
//                     Resource: `arn:aws:s3:::${resources.bucketName}/*`,
//                     Condition: {
//                         StringEquals: {
//                             's3:ExistingObjectTag/public': 'yes'
//                         }
//                     }
//                 }
//             ]
//         };

//         await s3Client.send(
//             new PutBucketPolicyCommand({
//                 Bucket: resources.bucketName,
//                 Policy: JSON.stringify(bucketPolicy)
//             })
//         );

//         console.log('\nNon-compliant state created:');
//         console.log(`Bucket Name: ${resources.bucketName}`);
//         console.log('Status: Non-compliant - Allows non-SSL requests');

//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error creating non-compliant S3 bucket:', error);
//         throw error;
//     } finally {
//         await cleanup(s3Client, resources);
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
    S3Client,
    CreateBucketCommand,
    DeleteBucketCommand,
    PutBucketPolicyCommand,
    DeleteBucketPolicyCommand,
    HeadBucketCommand,
    PutPublicAccessBlockCommand,
    GetPublicAccessBlockCommand
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

// Enable Block Public Access for the bucket
const enableBlockPublicAccess = async (client, bucketName) => {
    console.log('Enabling Block Public Access...');
    try {
        await client.send(
            new PutPublicAccessBlockCommand({
                Bucket: bucketName,
                PublicAccessBlockConfiguration: {
                    BlockPublicAcls: true,
                    IgnorePublicAcls: true,
                    BlockPublicPolicy: true,
                    RestrictPublicBuckets: true
                }
            })
        );
        console.log('Block Public Access enabled successfully.');
    } catch (error) {
        console.error('Error enabling Block Public Access:', error);
        throw error;
    }
};

// Create non-compliant S3 bucket
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

        // Disable Block Public Access
        await disableBlockPublicAccess(client, bucketName);

        // Add bucket policy that allows public access
        const bucketPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'AllowAllRequestTypes',
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

        console.log('Bucket policy applied successfully.');
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

// Delete S3 bucket
const deleteBucket = async (bucketName) => {
    const client = getClient();

    try {
        console.log('Removing bucket policy...');
        try {
            await client.send(
                new DeleteBucketPolicyCommand({
                    Bucket: bucketName
                })
            );
        } catch (error) {
            if (error.name !== 'NoSuchBucketPolicy') {
                throw error;
            }
        }

        // Re-enable Block Public Access
        await enableBlockPublicAccess(client, bucketName);

        console.log('Deleting bucket...');
        await client.send(
            new DeleteBucketCommand({
                Bucket: bucketName
            })
        );
        console.log('Bucket deleted successfully.');
    } catch (error) {
        console.error('Error deleting bucket:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let bucketName = null;

    try {
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

        // Optional: Observe non-compliant state
        console.log('\nWaiting 30 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        if (bucketName) {
            console.log('\nStarting cleanup...');
            try {
                await deleteBucket(bucketName);
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
