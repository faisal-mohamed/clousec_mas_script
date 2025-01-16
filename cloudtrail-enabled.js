// const { 
//     CloudTrailClient, 
//     ListTrailsCommand,
//     DeleteTrailCommand
// } = require("@aws-sdk/client-cloudtrail");

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

// // Delete existing trails
// const deleteExistingTrails = async (cloudTrailClient) => {
//     try {
//         // List all trails
//         const listResponse = await cloudTrailClient.send(
//             new ListTrailsCommand({})
//         );

//         // Delete each trail
//         for (const trail of listResponse.Trails) {
//             console.log(`Deleting trail: ${trail.Name}`);
//             await cloudTrailClient.send(
//                 new DeleteTrailCommand({
//                     Name: trail.Name
//                 })
//             );
//         }

//         console.log('All existing trails deleted');
//     } catch (error) {
//         console.error('Error deleting existing trails:', error);
//         throw error;
//     }
// };

// // Verify no trails exist
// const verifyNoTrails = async (cloudTrailClient) => {
//     const listResponse = await cloudTrailClient.send(
//         new ListTrailsCommand({})
//     );
//     return listResponse.Trails.length === 0;
// };

// // Create non-compliant state
// const createNonCompliantState = async () => {
//     const cloudTrailClient = createAwsClient(CloudTrailClient);

//     try {
//         console.log('Creating non-compliant state (no CloudTrail enabled)...');

//         // Delete any existing trails to ensure non-compliance
//         await deleteExistingTrails(cloudTrailClient);

//         // Verify no trails exist
//         const noTrails = await verifyNoTrails(cloudTrailClient);

//         if (noTrails) {
//             console.log('\nNon-compliant state created:');
//             console.log('Status: Non-compliant - No CloudTrail trails enabled');
//         } else {
//             console.log('\nWarning: Some trails still exist. State may not be non-compliant.');
//         }

//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error creating non-compliant state:', error);
//         throw error;
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
    DescribeTrailsCommand,
    DeleteTrailCommand,
    GetTrailCommand,
    StopLoggingCommand,
    ListTrailsCommand
} = require("@aws-sdk/client-cloudtrail");

const {
    S3Client,
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

// List all CloudTrail trails
const listTrails = async () => {
    const client = getClient(CloudTrailClient);

    try {
        const response = await client.send(new ListTrailsCommand({}));
        return response.Trails || [];
    } catch (error) {
        console.error('Error listing trails:', error);
        throw error;
    }
};

// Get detailed trail information
const getTrailDetails = async (trailName) => {
    const client = getClient(CloudTrailClient);

    try {
        const response = await client.send(
            new GetTrailCommand({
                Name: trailName
            })
        );
        return response.Trail;
    } catch (error) {
        if (error.name === 'TrailNotFoundException') {
            return null;
        }
        throw error;
    }
};

// Stop logging for a trail
const stopTrailLogging = async (trailName) => {
    const client = getClient(CloudTrailClient);

    try {
        await client.send(
            new StopLoggingCommand({
                Name: trailName
            })
        );
        console.log(`Stopped logging for trail: ${trailName}`);
    } catch (error) {
        if (!error.name.includes('NotFound')) {
            throw error;
        }
    }
};

// Delete trail
const deleteTrail = async (trailName) => {
    const client = getClient(CloudTrailClient);

    try {
        // Stop logging first
        await stopTrailLogging(trailName);

        // Delete the trail
        await client.send(
            new DeleteTrailCommand({
                Name: trailName
            })
        );
        console.log(`Deleted trail: ${trailName}`);
    } catch (error) {
        if (!error.name.includes('NotFound')) {
            throw error;
        }
    }
};

// Delete S3 bucket and its contents
const deleteBucket = async (bucketName) => {
    const s3Client = getClient(S3Client);

    try {
        // Delete all objects in the bucket
        console.log(`Deleting objects from bucket: ${bucketName}`);
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
        console.log(`Deleting bucket: ${bucketName}`);
        await s3Client.send(
            new DeleteBucketCommand({
                Bucket: bucketName
            })
        );
        console.log('Bucket deleted successfully');
    } catch (error) {
        if (!error.name.includes('NotFound')) {
            console.error('Error deleting bucket:', error);
            throw error;
        }
    }
};

// Create non-compliant state by removing all trails
const createNonCompliantState = async () => {
    console.log('Creating non-compliant state (no CloudTrail enabled)...');
    
    // Get list of existing trails
    const trails = await listTrails();
    
    // Store trail details for restoration
    const trailBackups = [];
    
    for (const trail of trails) {
        const details = await getTrailDetails(trail.Name);
        if (details) {
            trailBackups.push(details);
            
            // Stop logging and delete trail
            await deleteTrail(trail.Name);
            
            // If trail has S3 bucket, delete it too
            if (details.S3BucketName) {
                await deleteBucket(details.S3BucketName);
            }
        }
    }
    
    console.log('Non-compliant state created - All CloudTrail trails have been removed');
    return trailBackups;
};

// Main function
const main = async () => {
    let trailBackups = [];

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

        // List existing trails before making changes
        console.log('\nExisting CloudTrail trails:');
        const existingTrails = await listTrails();
        console.log(existingTrails.map(trail => trail.Name));

        // Create non-compliant state
        console.log('\nCreating non-compliant state...');
        trailBackups = await createNonCompliantState();

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Print warning about manual restoration needed
        console.log('\nWARNING: This script has disabled CloudTrail in your account.');
        console.log('Please ensure you re-enable CloudTrail according to your organization\'s policies.');
        console.log('Trail configuration details have been saved and printed below for reference.');
        
        // Print backup details
        console.log('\nBackup of removed trail configurations:');
        console.log(JSON.stringify(trailBackups, null, 2));

    } catch (error) {
        console.error('Fatal error:', error);
    }
};

// Run the program
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
