const {
    CloudTrailClient,
    CreateTrailCommand,
    StartLoggingCommand,
    PutEventSelectorsCommand
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

async function createNonCompliantCloudTrail() {
    const resourcePrefix = 'no-security-events';
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

        // Create CloudTrail with minimal configuration
        const trailName = `${resourcePrefix}-trail-${timestamp}`;
        const createTrailResponse = await cloudTrailClient.send(new CreateTrailCommand({
            Name: trailName,
            S3BucketName: bucketName,
            // Minimal cost configuration
            IsMultiRegionTrail: false,  // Single region only
            EnableLogFileValidation: false,  // Disable log file validation
            IncludeGlobalServiceEvents: false,  // Disable global service events
            // No encryption
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        // Configure event selectors to exclude security events
        await cloudTrailClient.send(new PutEventSelectorsCommand({
            TrailName: trailName,
            EventSelectors: [
                {
                    ReadWriteType: 'WriteOnly', // Only track write events, ignore read events
                    IncludeManagementEvents: true,
                    ExcludeManagementEventSources: [
                        // Exclude security-related services
                        'kms.amazonaws.com',
                        'iam.amazonaws.com',
                        'guardduty.amazonaws.com',
                        'securityhub.amazonaws.com',
                        'macie.amazonaws.com',
                        'waf.amazonaws.com',
                        'waf-regional.amazonaws.com',
                        'config.amazonaws.com',
                        'cloudtrail.amazonaws.com',
                        'shield.amazonaws.com'
                    ]
                }
            ]
        }));

        // Start logging
        await cloudTrailClient.send(new StartLoggingCommand({
            Name: trailName
        }));

        console.log('\nCreated non-compliant CloudTrail:');
        console.log(`Trail Name: ${trailName}`);
        console.log(`S3 Bucket: ${bucketName}`);
        console.log(`Trail ARN: ${createTrailResponse.TrailARN}`);
        console.log('\nNon-compliant configuration:');
        console.log('- Security events: Not tracked');
        console.log('- Read events: Not tracked');
        console.log('- Multi-region trail: Disabled');
        console.log('- Log file validation: Disabled');
        console.log('- Global service events: Disabled');
        console.log('- Encryption: Disabled');
        console.log('\nExcluded security services:');
        console.log('- KMS (Key Management Service)');
        console.log('- IAM (Identity and Access Management)');
        console.log('- GuardDuty');
        console.log('- Security Hub');
        console.log('- Macie');
        console.log('- WAF (Web Application Firewall)');
        console.log('- AWS Config');
        console.log('- CloudTrail');
        console.log('- Shield');

    } catch (error) {
        console.error('Error creating CloudTrail:', error);
        throw error;
    }
}

// Execute the script
async function main() {
    try {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }
        await createNonCompliantCloudTrail();
    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
