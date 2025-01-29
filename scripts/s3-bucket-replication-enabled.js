const {
    S3Client,
    CreateBucketCommand,
    PutBucketVersioningCommand,
    PutBucketReplicationCommand,
    GetBucketReplicationCommand,
    PutBucketTaggingCommand
} = require("@aws-sdk/client-s3");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand
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

        // Add simulation-mas tag
        await s3Client.send(
            new PutBucketTaggingCommand({
                Bucket: bucketName,
                Tagging: {
                    TagSet: [
                        {
                            Key: "simulation-mas",
                            Value: "true"
                        }
                    ]
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

        // Add simulation-mas tag
        await destinationClient.send(
            new PutBucketTaggingCommand({
                Bucket: bucketName,
                Tagging: {
                    TagSet: [
                        {
                            Key: "simulation-mas",
                            Value: "true"
                        }
                    ]
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

        // Create role with simulation-mas tag
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
                AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
                Tags: [
                    {
                        Key: "simulation-mas",
                        Value: "true"
                    }
                ]
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

// Configure replication from source to destination bucket
const configureReplication = async (sourceBucket, destinationBucket, roleArn) => {
    const s3Client = getClient(S3Client);

    const replicationConfiguration = {
        Role: roleArn,
        Rules: [
            {
                Status: 'Enabled',
                Prefix: '', // Optional, replicate all objects
                Destination: {
                    Bucket: `arn:aws:s3:::${destinationBucket}`,
                    StorageClass: 'STANDARD'
                }
            }
        ]
    };

    try {
        console.log('Configuring replication...');
        await s3Client.send(
            new PutBucketReplicationCommand({
                Bucket: sourceBucket,
                ReplicationConfiguration: replicationConfiguration
            })
        );

        console.log('Replication configured successfully');
    } catch (error) {
        console.error('Error configuring replication:', error);
        throw error;
    }
};

// Main function to create buckets, role, and configure replication
const main = async () => {
    try {
        // Create source and destination buckets
        const sourceBucket = await createSourceBucket();
        const { bucketName: destinationBucket, region: destinationRegion } = await createDestinationBucket();

        // Create replication role
        const roleArn = await createReplicationRole(sourceBucket, destinationBucket);

        // Configure replication between source and destination buckets
        await configureReplication(sourceBucket, destinationBucket, roleArn);

        console.log('Replication setup completed successfully');
    } catch (error) {
        console.error('Error during replication setup:', error);
    }
};

// Run the main function
main();
