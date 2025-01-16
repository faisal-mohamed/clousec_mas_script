// const { 
//     WAFV2Client, 
//     CreateWebACLCommand,
//     DeleteWebACLCommand,
//     GetWebACLCommand,
//     PutLoggingConfigurationCommand,
//     GetLoggingConfigurationCommand,
//     ListWebACLsCommand
// } = require("@aws-sdk/client-wafv2");

// const {
//     FirehoseClient,
//     CreateDeliveryStreamCommand,
//     DeleteDeliveryStreamCommand,
//     DescribeDeliveryStreamCommand
// } = require("@aws-sdk/client-firehose");

// const {
//     IAMClient,
//     CreateRoleCommand,
//     PutRolePolicyCommand,
//     DeleteRoleCommand,
//     DeleteRolePolicyCommand
// } = require("@aws-sdk/client-iam");

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
// const wafv2Client = new WAFV2Client(credentials);
// const firehoseClient = new FirehoseClient(credentials);
// const iamClient = new IAMClient(credentials);
// const s3Client = new S3Client(credentials);

// // Configuration
// const config = {
//     webAclName: `test-non-compliant-waf-${Date.now()}`,
//     bucketName: `waf-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`,
//     firehoseStreamName: `aws-waf-logs-stream-${Date.now()}`,
//     iamRoleName: `WAFLoggingRole-${Date.now()}`,
//     createdResources: false,
//     webAclId: '',
//     webAclArn: '',
//     roleArn: '',
//     lockToken: ''
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function setupIAMRole() {
//     try {
//         console.log('Setting up IAM role...');

//         // Create IAM role for Firehose
//         const createRoleCommand = new CreateRoleCommand({
//             RoleName: config.iamRoleName,
//             AssumeRolePolicyDocument: JSON.stringify({
//                 Version: '2012-10-17',
//                 Statement: [{
//                     Effect: 'Allow',
//                     Principal: {
//                         Service: 'firehose.amazonaws.com'
//                     },
//                     Action: 'sts:AssumeRole'
//                 }]
//             })
//         });

//         const roleResponse = await iamClient.send(createRoleCommand);
//         config.roleArn = roleResponse.Role.Arn;

//         // Add policy to role
//         const putPolicyCommand = new PutRolePolicyCommand({
//             RoleName: config.iamRoleName,
//             PolicyName: 'WAFLoggingPolicy',
//             PolicyDocument: JSON.stringify({
//                 Version: '2012-10-17',
//                 Statement: [{
//                     Effect: 'Allow',
//                     Action: [
//                         's3:PutObject',
//                         's3:GetBucketLocation'
//                     ],
//                     Resource: [
//                         `arn:aws:s3:::${config.bucketName}`,
//                         `arn:aws:s3:::${config.bucketName}/*`
//                     ]
//                 }]
//             })
//         });

//         await iamClient.send(putPolicyCommand);
//         console.log('Created IAM role and policy');

//         // Wait for role to propagate
//         await wait(10000);
//     } catch (error) {
//         console.error('Error setting up IAM role:', error);
//         throw error;
//     }
// }

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
//             Version: '2012-10-17',
//             Statement: [{
//                 Effect: 'Allow',
//                 Principal: {
//                     Service: 'firehose.amazonaws.com'
//                 },
//                 Action: 's3:PutObject',
//                 Resource: `arn:aws:s3:::${config.bucketName}/*`,
//                 Condition: {
//                     StringEquals: {
//                         'aws:SourceAccount': process.env.AWS_ACCOUNT_ID
//                     }
//                 }
//             }]
//         };

//         const putBucketPolicyCommand = new PutBucketPolicyCommand({
//             Bucket: config.bucketName,
//             Policy: JSON.stringify(bucketPolicy)
//         });

//         await s3Client.send(putBucketPolicyCommand);
//         console.log('Created and configured S3 bucket');
//     } catch (error) {
//         console.error('Error creating S3 bucket:', error);
//         throw error;
//     }
// }

// async function createFirehoseStream() {
//     try {
//         console.log('Creating Kinesis Firehose delivery stream...');

//         const createStreamCommand = new CreateDeliveryStreamCommand({
//             DeliveryStreamName: config.firehoseStreamName,
//             DeliveryStreamType: 'DirectPut',
//             S3DestinationConfiguration: {
//                 RoleARN: config.roleArn,
//                 BucketARN: `arn:aws:s3:::${config.bucketName}`,
//                 Prefix: 'waf-logs/',
//                 BufferingHints: {
//                     SizeInMBs: 5,
//                     IntervalInSeconds: 300
//                 }
//             }
//         });

//         await firehoseClient.send(createStreamCommand);
//         console.log('Created Kinesis Firehose delivery stream');

//         // Wait for stream to be active
//         await wait(30000);
//     } catch (error) {
//         console.error('Error creating Firehose stream:', error);
//         throw error;
//     }
// }

// async function createNonCompliantWebACL() {
//     try {
//         console.log('Creating non-compliant WAFv2 Web ACL...');

//         const createWebAclCommand = new CreateWebACLCommand({
//             Name: config.webAclName,
//             Scope: 'REGIONAL',
//             DefaultAction: {
//                 Allow: {}
//             },
//             Description: 'Test WAF ACL without logging',
//             Rules: [],
//             VisibilityConfig: {
//                 SampledRequestsEnabled: true,
//                 CloudWatchMetricsEnabled: true,
//                 MetricName: config.webAclName
//             }
//         });

//         const response = await wafv2Client.send(createWebAclCommand);
//         config.webAclId = response.Summary.Id;
//         config.webAclArn = response.Summary.ARN;
//         config.lockToken = response.LockToken;
//         config.createdResources = true;

//         console.log('Created WAFv2 Web ACL without logging (non-compliant)');
//     } catch (error) {
//         console.error('Error creating Web ACL:', error);
//         throw error;
//     }
// }

// async function verifyConfiguration() {
//     try {
//         console.log('\nVerifying WAF configuration...');

//         // Get Web ACL configuration
//         const getWebAclCommand = new GetWebACLCommand({
//             Name: config.webAclName,
//             Scope: 'REGIONAL',
//             Id: config.webAclId
//         });

//         const webAclResponse = await wafv2Client.send(getWebAclCommand);
        
//         // Check logging configuration
//         try {
//             const getLoggingCommand = new GetLoggingConfigurationCommand({
//                 ResourceArn: config.webAclArn
//             });

//             const loggingResponse = await wafv2Client.send(getLoggingCommand);
//             console.log('\nLogging Configuration:');
//             console.log(JSON.stringify(loggingResponse, null, 2));
//         } catch (error) {
//             if (error.name === 'ResourceNotFoundException') {
//                 console.log('\nNo logging configuration found (non-compliant)');
//             } else {
//                 throw error;
//             }
//         }
//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function enableLogging() {
//     try {
//         console.log('\nEnabling logging (optional step)...');

//         const putLoggingCommand = new PutLoggingConfigurationCommand({
//             LoggingConfiguration: {
//                 ResourceArn: config.webAclArn,
//                 LogDestinationConfigs: [
//                     `arn:aws:firehose:${credentials.region}:${process.env.AWS_ACCOUNT_ID}:deliverystream/${config.firehoseStreamName}`
//                 ]
//             }
//         });

//         await wafv2Client.send(putLoggingCommand);
//         console.log('Enabled logging for Web ACL');
//     } catch (error) {
//         console.error('Error enabling logging:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Delete Web ACL
//             try {
//                 // Get the current lock token
//                 const getWebAclCommand = new GetWebACLCommand({
//                     Name: config.webAclName,
//                     Scope: 'REGIONAL',
//                     Id: config.webAclId
//                 });

//                 const webAclResponse = await wafv2Client.send(getWebAclCommand);
//                 const lockToken = webAclResponse.LockToken;

//                 const deleteWebAclCommand = new DeleteWebACLCommand({
//                     Name: config.webAclName,
//                     Scope: 'REGIONAL',
//                     Id: config.webAclId,
//                     LockToken: lockToken
//                 });

//                 await wafv2Client.send(deleteWebAclCommand);
//                 console.log('Deleted Web ACL');
//             } catch (error) {
//                 console.error('Error deleting Web ACL:', error);
//             }

//             // Delete Firehose stream
//             try {
//                 const deleteStreamCommand = new DeleteDeliveryStreamCommand({
//                     DeliveryStreamName: config.firehoseStreamName
//                 });
//                 await firehoseClient.send(deleteStreamCommand);
//                 console.log('Deleted Firehose stream');
//             } catch (error) {
//                 console.error('Error deleting Firehose stream:', error);
//             }

//             // Delete IAM role and policy
//             try {
//                 const deleteRolePolicyCommand = new DeleteRolePolicyCommand({
//                     RoleName: config.iamRoleName,
//                     PolicyName: 'WAFLoggingPolicy'
//                 });
//                 await iamClient.send(deleteRolePolicyCommand);

//                 const deleteRoleCommand = new DeleteRoleCommand({
//                     RoleName: config.iamRoleName
//                 });
//                 await iamClient.send(deleteRoleCommand);
//                 console.log('Deleted IAM role and policy');
//             } catch (error) {
//                 console.error('Error cleaning up IAM resources:', error);
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
//         console.log('Starting WAFv2 logging non-compliance simulation...');
        
//         await setupIAMRole();
//         await createS3Bucket();
//         await createFirehoseStream();
//         await createNonCompliantWebACL();
//         await verifyConfiguration();

//         // Optional: Enable logging to demonstrate compliant state
//         // Uncomment the next line to enable logging
//         // await enableLogging();

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
    WAFV2Client,
    CreateWebACLCommand,
    DeleteWebACLCommand,
    GetWebACLCommand,
    ListWebACLsCommand
} = require("@aws-sdk/client-wafv2");

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

        return new WAFV2Client(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create non-compliant WAFv2 Web ACL (without logging)
const createNonCompliantWebACL = async () => {
    const client = getClient();
    const webACLName = `non-compliant-waf-${Date.now()}`;

    try {
        // Create Web ACL without logging configuration
        const params = {
            Name: webACLName,
            Scope: 'REGIONAL',
            DefaultAction: {
                Allow: {}
            },
            Description: 'Non-compliant Web ACL without logging enabled',
            Rules: [
                {
                    Name: 'BasicRule',
                    Priority: 0,
                    Statement: {
                        RateBasedStatement: {
                            Limit: 2000,
                            AggregateKeyType: 'IP'
                        }
                    },
                    Action: {
                        Block: {}
                    },
                    VisibilityConfig: {
                        SampledRequestsEnabled: true,
                        CloudWatchMetricsEnabled: true,
                        MetricName: 'BasicRuleMetric'
                    }
                }
            ],
            VisibilityConfig: {
                SampledRequestsEnabled: true,
                CloudWatchMetricsEnabled: true,
                MetricName: 'NonCompliantWebACLMetric'
            },
            Tags: [
                {
                    Key: 'Environment',
                    Value: 'Test'
                }
            ]
        };

        console.log('Creating WAFv2 Web ACL...');
        const response = await client.send(new CreateWebACLCommand(params));
        console.log('WAFv2 Web ACL created successfully');

        return {
            name: webACLName,
            id: response.Summary.Id,
            arn: response.Summary.ARN
        };
    } catch (error) {
        console.error('Error creating WAFv2 Web ACL:', error);
        throw error;
    }
};

// Wait for Web ACL to be available
const waitForWebACL = async (id, scope = 'REGIONAL') => {
    const client = getClient();

    while (true) {
        try {
            await client.send(
                new GetWebACLCommand({
                    Id: id,
                    Name: id,
                    Scope: scope
                })
            );
            break;
        } catch (error) {
            if (error.name === 'WAFNonexistentItemException') {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                continue;
            }
            throw error;
        }
    }
};

// Delete WAFv2 Web ACL
const deleteWebACL = async (id, name, scope = 'REGIONAL') => {
    const client = getClient();

    try {
        console.log('Getting Web ACL lock token...');
        const webACL = await client.send(
            new GetWebACLCommand({
                Id: id,
                Name: name,
                Scope: scope
            })
        );

        console.log('Deleting Web ACL...');
        await client.send(
            new DeleteWebACLCommand({
                Id: id,
                Name: name,
                Scope: scope,
                LockToken: webACL.LockToken
            })
        );

        console.log('Web ACL deleted successfully');
    } catch (error) {
        if (!error.name.includes('WAFNonexistentItemException')) {
            console.error('Error deleting Web ACL:', error);
            throw error;
        }
    }
};

// Main function
const main = async () => {
    let webACLInfo = null;

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

        // Create non-compliant Web ACL
        webACLInfo = await createNonCompliantWebACL();

        // Wait for Web ACL to be fully created
        console.log('Waiting for Web ACL to be available...');
        await waitForWebACL(webACLInfo.id);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Web ACL created without logging enabled.');
        console.log('To make it compliant, you would need to:');
        console.log('1. Create a Kinesis Firehose delivery stream with prefix "aws-waf-logs-"');
        console.log('2. Configure the Web ACL to send logs to the Firehose');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (webACLInfo) {
            console.log('\nStarting cleanup...');
            try {
                await deleteWebACL(webACLInfo.id, webACLInfo.name);
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

