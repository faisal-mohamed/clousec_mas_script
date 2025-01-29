const {
    CloudTrailClient,
    CreateTrailCommand,
    GetTrailCommand
} = require("@aws-sdk/client-cloudtrail");
require('dotenv').config();


const {
    S3Client,
    CreateBucketCommand,
    PutBucketPolicyCommand
} = require("@aws-sdk/client-s3");

// Initialize clients
const cloudTrailClient = new CloudTrailClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const s3Client = new S3Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createSingleRegionCloudTrail() {
    try {
        const trailName = `single-region-trail-${Date.now()}`;
        const bucketName = `cloudtrail-logs-${Date.now()}`;
        const region = process.env.AWS_REGION || 'us-east-1';
        const accountId = process.env.AWS_ACCOUNT_ID;

        // Create S3 bucket for CloudTrail logs
        console.log('Creating S3 bucket for CloudTrail logs...');
        await s3Client.send(new CreateBucketCommand({
            Bucket: bucketName
        }));

        // Create bucket policy
        const bucketPolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "AWSCloudTrailAclCheck",
                    Effect: "Allow",
                    Principal: {
                        Service: "cloudtrail.amazonaws.com"
                    },
                    Action: "s3:GetBucketAcl",
                    Resource: `arn:aws:s3:::${bucketName}`
                },
                {
                    Sid: "AWSCloudTrailWrite",
                    Effect: "Allow",
                    Principal: {
                        Service: "cloudtrail.amazonaws.com"
                    },
                    Action: "s3:PutObject",
                    Resource: `arn:aws:s3:::${bucketName}/AWSLogs/${accountId}/*`,
                    Condition: {
                        StringEquals: {
                            "s3:x-amz-acl": "bucket-owner-full-control"
                        }
                    }
                }
            ]
        };

        // Apply bucket policy
        console.log('Applying bucket policy...');
        await s3Client.send(new PutBucketPolicyCommand({
            Bucket: bucketName,
            Policy: JSON.stringify(bucketPolicy)
        }));

        // Create CloudTrail
        console.log('Creating single-region CloudTrail...');
        const createTrailResponse = await cloudTrailClient.send(new CreateTrailCommand({
            Name: trailName,
            S3BucketName: bucketName,
            IsMultiRegionTrail: false, // Explicitly disable multi-region
            EnableLogFileValidation: true,
            IncludeGlobalServiceEvents: false, // Since it's single region, disable global events
            IsOrganizationTrail: false,
            TagsList: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'TrailType',
                    Value: 'SingleRegion'
                }
            ]
        }));

        // Verify trail configuration
        const getTrailResponse = await cloudTrailClient.send(new GetTrailCommand({
            Name: trailName
        }));

        return {
            trailName: trailName,
            trailArn: createTrailResponse.TrailARN,
            bucketName: bucketName,
            region: region,
            configuration: getTrailResponse.Trail
        };
    } catch (error) {
        console.error('Error creating CloudTrail:', error.message);
        throw error;
    }
}

// Execute creation
createSingleRegionCloudTrail()
    .then(result => {
        console.log('\nCloudTrail Deployment Summary:', {
            TrailName: result.trailName,
            TrailARN: result.trailArn,
            S3Bucket: result.bucketName,
            Region: result.region,
            MultiRegion: 'Disabled',
            GlobalEvents: 'Disabled'
        });

        console.log('\nTrail Configuration:', {
            isMultiRegionTrail: false,
            includeGlobalServiceEvents: false,
            region: result.region,
            logValidation: true,
            organizationTrail: false
        });

        console.log('\nLogging Details:', {
            storageLocation: `s3://${result.bucketName}`,
            logFormat: 'JSON',
            validationEnabled: true,
            loggingRegion: result.region
        });

        console.log('\nImportant Notes:', {
            coverage: 'Only logs events from current region',
            globalServices: 'Global service events not included',
            monitoring: 'Monitor S3 bucket for log delivery',
            retention: 'Implement lifecycle rules as needed'
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
