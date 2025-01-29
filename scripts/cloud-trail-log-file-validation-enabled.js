const { 
    CloudTrailClient, 
    CreateTrailCommand,
    StartLoggingCommand,
} = require("@aws-sdk/client-cloudtrail");

const { 
    S3Client, 
    CreateBucketCommand,
    PutBucketPolicyCommand,
} = require("@aws-sdk/client-s3");


require('dotenv').config();

// Configure credentials
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
};

// Initialize clients
const cloudTrailClient = new CloudTrailClient({
    credentials: credentials,
    region: process.env.AWS_REGION || 'us-east-1'
});

const s3Client = new S3Client({
    credentials: credentials,
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createMinimalCostCloudTrail() {
    const resourcePrefix = 'minimal-cost';
    const timestamp = Date.now();

    try {
        // Create S3 bucket for CloudTrail logs
        const bucketName = `${resourcePrefix}-bucket-${timestamp}`;
        await s3Client.send(new CreateBucketCommand({
            Bucket: bucketName,
            CreateBucketConfiguration: {
                LocationConstraint: process.env.AWS_REGION === 'us-east-1' ? undefined : process.env.AWS_REGION
            }
        }));

        console.log(`Created S3 bucket: ${bucketName}`);

        // Create bucket policy for CloudTrail
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
                    Resource: `arn:aws:s3:::${bucketName}/AWSLogs/${process.env.AWS_ACCOUNT_ID || '*'}/*`,
                    Condition: {
                        StringEquals: {
                            's3:x-amz-acl': 'bucket-owner-full-control'
                        }
                    }
                }
            ]
        };

        // Apply bucket policy
        await s3Client.send(new PutBucketPolicyCommand({
            Bucket: bucketName,
            Policy: JSON.stringify(bucketPolicy)
        }));

        console.log('Applied bucket policy');

        // Create minimal cost CloudTrail
        const trailName = `${resourcePrefix}-trail-${timestamp}`;
        const createTrailResponse = await cloudTrailClient.send(new CreateTrailCommand({
            Name: trailName,
            S3BucketName: bucketName,
            // Disable multi-region trail to minimize cost
            IsMultiRegionTrail: false,
            // Disable log file validation to minimize cost and make it non-compliant
            EnableLogFileValidation: false,
            // Disable global service events to minimize cost
            IncludeGlobalServiceEvents: false,
            // Minimal configuration for cost savings
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        console.log(`Created CloudTrail: ${trailName}`);

        // Start logging for the trail
        await cloudTrailClient.send(new StartLoggingCommand({
            Name: trailName
        }));

        console.log('Started CloudTrail logging');

        console.log('\nCreated minimal cost CloudTrail:');
        console.log(`Trail Name: ${trailName}`);
        console.log(`S3 Bucket: ${bucketName}`);
        console.log(`Trail ARN: ${createTrailResponse.TrailARN}`);
        console.log('\nNon-compliant configuration:');
        console.log('- Log file validation: Disabled');
        console.log('- Multi-region trail: Disabled');
        console.log('- Global service events: Disabled');

    } catch (error) {
        console.error('Error creating minimal cost CloudTrail:', error);
        throw error;
    }
}

// Execute the script
async function main() {
    try {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }
        await createMinimalCostCloudTrail();
    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
