// const { 
//     ElasticBeanstalkClient, 
//     CreateApplicationCommand,
//     CreateEnvironmentCommand,
//     DeleteApplicationCommand,
//     DescribeEnvironmentsCommand,
//     UpdateEnvironmentCommand
// } = require("@aws-sdk/client-elastic-beanstalk");

// const { 
//     S3Client,
//     PutObjectCommand,
//     DeleteObjectCommand,
//     CreateBucketCommand,
//     DeleteBucketCommand
// } = require("@aws-sdk/client-s3");

// const { 
//     IAMClient,
//     CreateRoleCommand,
//     DeleteRoleCommand,
//     AttachRolePolicyCommand,
//     DetachRolePolicyCommand,
//     PutRolePolicyCommand
// } = require("@aws-sdk/client-iam");

// require('dotenv').config();

// // Configuration
// const CONFIG = {
//     APP: {
//         NAME: 'test-managed-updates-app-1',
//         DESCRIPTION: 'Test application for managed updates compliance',
//         VERSION_LABEL: 'v1',
//     },
//     ENV: {
//         NAME: 'test-managed-updates-env-1',
//         DESCRIPTION: 'Test environment with managed updates disabled',
//         SOLUTION_STACK: '64bit Amazon Linux 2023 v6.0.4 running Node.js 20',

//         INSTANCE_TYPE: 't3.micro'
//     },
//     S3: {
//         BUCKET_NAME: `elasticbeanstalk-test-${Date.now()}`,
//         APP_FILE_KEY: 'app-source.zip'
//     },
//     IAM: {
//         ROLE_NAME: 'aws-elasticbeanstalk-service-role-1',
//         INSTANCE_PROFILE: 'aws-elasticbeanstalk-ec2-role'
//     }
// };

// const createAwsClient = (ClientClass) => {
//     return new ClientClass({
//         region: process.env.AWS_REGION,
//         credentials: {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         }
//     });
// };

// async function createServiceRole(iamClient) {
//     const assumeRolePolicy = {
//         Version: '2012-10-17',
//         Statement: [{
//             Effect: 'Allow',
//             Principal: {
//                 Service: 'elasticbeanstalk.amazonaws.com'
//             },
//             Action: 'sts:AssumeRole'
//         }]
//     };

//     try {
//         // Create service role
//         await iamClient.send(new CreateRoleCommand({
//             RoleName: CONFIG.IAM.ROLE_NAME,
//             AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
//         }));

//         // Attach required policies
//         await iamClient.send(new AttachRolePolicyCommand({
//             RoleName: CONFIG.IAM.ROLE_NAME,
//             PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService'
//         }));

//         // Wait for role to propagate
//         await new Promise(resolve => setTimeout(resolve, 10000));

//     } catch (error) {
//         console.error('Error creating service role:', error);
//         throw error;
//     }
// }

// async function uploadSampleApplication(s3Client) {
//     try {
//         // Create S3 bucket
//         await s3Client.send(new CreateBucketCommand({
//             Bucket: CONFIG.S3.BUCKET_NAME
//         }));

//         // Create a simple Node.js application
//         const sampleApp = {
//             'package.json': JSON.stringify({
//                 name: 'sample-app',
//                 version: '1.0.0',
//                 main: 'app.js'
//             }),
//             'app.js': `
//                 const http = require('http');
//                 const server = http.createServer((req, res) => {
//                     res.writeHead(200, {'Content-Type': 'text/plain'});
//                     res.end('Hello World\\n');
//                 });
//                 server.listen(process.env.PORT || 8080);
//             `
//         };

//         // Upload sample application
//         await s3Client.send(new PutObjectCommand({
//             Bucket: CONFIG.S3.BUCKET_NAME,
//             Key: CONFIG.S3.APP_FILE_KEY,
//             Body: Buffer.from(JSON.stringify(sampleApp))
//         }));

//         return `s3://${CONFIG.S3.BUCKET_NAME}/${CONFIG.S3.APP_FILE_KEY}`;
//     } catch (error) {
//         console.error('Error uploading sample application:', error);
//         throw error;
//     }
// }

// async function waitForEnvironment(ebClient, environmentId, targetStatus) {
//     console.log(`Waiting for environment ${environmentId} to be ${targetStatus}...`);
    
//     while (true) {
//         const response = await ebClient.send(new DescribeEnvironmentsCommand({
//             EnvironmentIds: [environmentId]
//         }));

//         const status = response.Environments[0].Status;
//         if (status === targetStatus) break;
        
//         await new Promise(resolve => setTimeout(resolve, 10000));
//     }
// }

// async function createNonCompliantEnvironment() {
//     const ebClient = createAwsClient(ElasticBeanstalkClient);
//     const s3Client = createAwsClient(S3Client);
//     const iamClient = createAwsClient(IAMClient);

//     try {
//         // Create service role
//         console.log('Creating service role...');
//         await createServiceRole(iamClient);

//         // Upload sample application
//         console.log('Uploading sample application...');
//         const sourceBundle = await uploadSampleApplication(s3Client);

//         // Create Elastic Beanstalk application
//         console.log('Creating Elastic Beanstalk application...');
//         await ebClient.send(new CreateApplicationCommand({
//             ApplicationName: CONFIG.APP.NAME,
//             Description: CONFIG.APP.DESCRIPTION
//         }));

//         // Create environment with managed updates disabled
//         console.log('Creating non-compliant environment...');
//         const createEnvResponse = await ebClient.send(new CreateEnvironmentCommand({
//             ApplicationName: CONFIG.APP.NAME,
//             EnvironmentName: CONFIG.ENV.NAME,
//             Description: CONFIG.ENV.DESCRIPTION,
//             SolutionStackName: CONFIG.ENV.SOLUTION_STACK,
//             OptionSettings: [
//                 {
//                     Namespace: 'aws:autoscaling:launchconfiguration',
//                     OptionName: 'IamInstanceProfile',
//                     Value: CONFIG.IAM.INSTANCE_PROFILE
//                 },
//                 {
//                     Namespace: 'aws:elasticbeanstalk:environment',
//                     OptionName: 'ServiceRole',
//                     Value: CONFIG.IAM.ROLE_NAME
//                 },
//                 {
//                     Namespace: 'aws:elasticbeanstalk:managedactions',
//                     OptionName: 'ManagedActionsEnabled',
//                     Value: 'false' // Explicitly disable managed updates
//                 }
//             ],
//             VersionLabel: CONFIG.APP.VERSION_LABEL
//         }));

//         const environmentId = createEnvResponse.EnvironmentId;
        
//         // Wait for environment to be ready
//         await waitForEnvironment(ebClient, environmentId, 'Ready');

//         console.log('\nNon-compliant state created:');
//         console.log(`Application Name: ${CONFIG.APP.NAME}`);
//         console.log(`Environment Name: ${CONFIG.ENV.NAME}`);
//         console.log(`Environment ID: ${environmentId}`);
//         console.log('Managed Updates: Disabled');

//         return {
//             applicationName: CONFIG.APP.NAME,
//             environmentId: environmentId
//         };

//     } catch (error) {
//         console.error('Error creating non-compliant environment:', error);
//         throw error;
//     }
// }

// async function cleanupResources(resources) {
//     const ebClient = createAwsClient(ElasticBeanstalkClient);
//     const s3Client = createAwsClient(S3Client);
//     const iamClient = createAwsClient(IAMClient);

//     console.log('\nCleaning up resources...');

//     try {
//         // Terminate Elastic Beanstalk environment
//         if (resources.environmentId) {
//             await ebClient.send(new UpdateEnvironmentCommand({
//                 EnvironmentId: resources.environmentId,
//                 TerminateResources: true
//             }));
//             await waitForEnvironment(ebClient, resources.environmentId, 'Terminated');
//         }

//         // Delete Elastic Beanstalk application
//         if (resources.applicationName) {
//             await ebClient.send(new DeleteApplicationCommand({
//                 ApplicationName: resources.applicationName
//             }));
//         }

//         // Delete S3 bucket and contents
//         try {
//             await s3Client.send(new DeleteObjectCommand({
//                 Bucket: CONFIG.S3.BUCKET_NAME,
//                 Key: CONFIG.S3.APP_FILE_KEY
//             }));

//             await s3Client.send(new DeleteBucketCommand({
//                 Bucket: CONFIG.S3.BUCKET_NAME
//             }));
//         } catch (error) {
//             console.error('Error cleaning up S3 resources:', error);
//         }

//         // Cleanup IAM role
//         try {
//             await iamClient.send(new DetachRolePolicyCommand({
//                 RoleName: CONFIG.IAM.ROLE_NAME,
//                 PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService'
//             }));

//             await iamClient.send(new DeleteRoleCommand({
//                 RoleName: CONFIG.IAM.ROLE_NAME
//             }));
//         } catch (error) {
//             console.error('Error cleaning up IAM role:', error);
//         }

//         console.log('Cleanup completed');
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//     }
// }

// async function main() {
//     let resources = {};
//     try {
//         console.log('Creating non-compliant state for elastic-beanstalk-managed-updates-enabled...');
//         resources = await createNonCompliantEnvironment();
        
//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error in main execution:', error);
//     } finally {
//         // Cleanup
//         await cleanupResources(resources);
//     }
// }

// // Run the script
// if (require.main === module) {
//     main().catch(console.error);
// }

// module.exports = {
//     createNonCompliantState: main
// };


const {
    ElasticBeanstalkClient,
    CreateApplicationCommand,
    CreateEnvironmentCommand,
    DeleteApplicationCommand,
    DescribeEnvironmentsCommand,
    CreateApplicationVersionCommand,
    DeleteApplicationVersionCommand,
    DescribeApplicationVersionsCommand,
    TerminateEnvironmentCommand,
    UpdateEnvironmentCommand
} = require("@aws-sdk/client-elastic-beanstalk");

const {
    S3Client,
    PutObjectCommand,
    DeleteObjectCommand,
    CreateBucketCommand,
    DeleteBucketCommand
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

// Create S3 bucket and upload sample application
const createAndUploadApplication = async () => {
    const s3Client = getClient(S3Client);
    const bucketName = `eb-app-${Date.now()}`;
    const key = 'sample-app.zip';

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

        // Create sample application zip
        const sampleApp = Buffer.from(`
            package.json:
            {
                "name": "sample-app",
                "version": "1.0.0",
                "scripts": {
                    "start": "node app.js"
                }
            }

            app.js:
            const http = require('http');
            const server = http.createServer((req, res) => {
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end('Hello World\\n');
            });
            server.listen(process.env.PORT || 8080);
        `);

        // Upload to S3
        await s3Client.send(
            new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: sampleApp
            })
        );

        console.log('Sample application uploaded successfully');
        return { bucketName, key };
    } catch (error) {
        console.error('Error creating/uploading application:', error);
        throw error;
    }
};

// Create Elastic Beanstalk application
const createApplication = async (appName) => {
    const client = getClient(ElasticBeanstalkClient);

    try {
        console.log('Creating Elastic Beanstalk application...');
        await client.send(
            new CreateApplicationCommand({
                ApplicationName: appName,
                Description: 'Non-compliant application without managed updates'
            })
        );
        console.log('Application created successfully');
    } catch (error) {
        console.error('Error creating application:', error);
        throw error;
    }
};

// Create application version
const createApplicationVersion = async (appName, bucketName, key) => {
    const client = getClient(ElasticBeanstalkClient);
    const versionLabel = `v${Date.now()}`;

    try {
        console.log('Creating application version...');
        await client.send(
            new CreateApplicationVersionCommand({
                ApplicationName: appName,
                VersionLabel: versionLabel,
                Description: 'Initial version',
                SourceBundle: {
                    S3Bucket: bucketName,
                    S3Key: key
                },
                AutoCreateApplication: false,
                Process: true
            })
        );

        // Wait for the version to be processed
        await waitForApplicationVersion(appName, versionLabel);
        
        console.log('Application version created and processed successfully');
        return versionLabel;
    } catch (error) {
        console.error('Error creating application version:', error);
        throw error;
    }
};

// Wait for application version to be processed
const waitForApplicationVersion = async (appName, versionLabel) => {
    const client = getClient(ElasticBeanstalkClient);
    console.log('Waiting for application version to be processed...');

    while (true) {
        try {
            const response = await client.send(
                new DescribeApplicationVersionsCommand({
                    ApplicationName: appName,
                    VersionLabels: [versionLabel]
                })
            );

            if (!response.ApplicationVersions || response.ApplicationVersions.length === 0) {
                throw new Error('Application version not found');
            }

            const status = response.ApplicationVersions[0].Status;
            console.log(`Application version status: ${status}`);

            if (status === 'PROCESSED') {
                break;
            }
            if (status === 'FAILED') {
                throw new Error('Application version processing failed');
            }

            await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
        } catch (error) {
            console.error('Error checking application version status:', error);
            throw error;
        }
    }
};

// Create non-compliant environment (without managed updates)
const createNonCompliantEnvironment = async (appName, versionLabel) => {
    const client = getClient(ElasticBeanstalkClient);
    const envName = `non-compliant-env-${Date.now()}`.substring(0, 40);

    try {
        // Wait for application version to be processed
        await waitForApplicationVersion(appName, versionLabel);

        console.log('Creating Elastic Beanstalk environment...');
        await client.send(
            new CreateEnvironmentCommand({
                ApplicationName: appName,
                EnvironmentName: envName,
                Description: 'Non-compliant environment without managed updates',
                VersionLabel: versionLabel,
                SolutionStackName: '64bit Amazon Linux 2 v5.8.0 running Node.js 18',
                OptionSettings: [
                    {
                        Namespace: 'aws:autoscaling:launchconfiguration',
                        OptionName: 'IamInstanceProfile',
                        Value: 'aws-elasticbeanstalk-ec2-role'
                    },
                    {
                        Namespace: 'aws:elasticbeanstalk:managedactions',
                        OptionName: 'ManagedActionsEnabled',
                        Value: 'false' // Non-compliant: Managed updates disabled
                    },
                    {
                        Namespace: 'aws:elasticbeanstalk:environment',
                        OptionName: 'EnvironmentType',
                        Value: 'SingleInstance'
                    }
                ],
                Tier: {
                    Name: 'WebServer',
                    Type: 'Standard'
                }
            })
        );

        console.log('Environment created successfully');
        return envName;
    } catch (error) {
        console.error('Error creating environment:', error);
        throw error;
    }
};

// Wait for environment status
const waitForEnvironmentStatus = async (appName, envName, targetStatus) => {
    const client = getClient(ElasticBeanstalkClient);
    console.log(`Waiting for environment ${envName} to be ${targetStatus}...`);

    while (true) {
        try {
            const response = await client.send(
                new DescribeEnvironmentsCommand({
                    ApplicationName: appName,
                    EnvironmentNames: [envName]
                })
            );

            if (!response.Environments || response.Environments.length === 0) {
                if (targetStatus === 'Terminated') {
                    console.log('Environment terminated');
                    break;
                }
                throw new Error('Environment not found');
            }

            const status = response.Environments[0].Status;
            console.log(`Current status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            if (status.includes('Failed')) {
                throw new Error(`Environment creation failed: ${status}`);
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'ResourceNotFoundException' && targetStatus === 'Terminated') {
                console.log('Environment terminated');
                break;
            }
            throw error;
        }
    }
};

// Make environment compliant
const makeCompliant = async (appName, envName) => {
    const client = getClient(ElasticBeanstalkClient);

    try {
        console.log('Updating environment to enable managed updates...');
        await client.send(
            new UpdateEnvironmentCommand({
                ApplicationName: appName,
                EnvironmentName: envName,
                OptionSettings: [
                    {
                        Namespace: 'aws:elasticbeanstalk:managedactions',
                        OptionName: 'ManagedActionsEnabled',
                        Value: 'true'
                    },
                    {
                        Namespace: 'aws:elasticbeanstalk:managedactions',
                        OptionName: 'PreferredStartTime',
                        Value: 'Tue:10:00'
                    },
                    {
                        Namespace: 'aws:elasticbeanstalk:managedactions:platformupdate',
                        OptionName: 'UpdateLevel',
                        Value: 'minor'
                    }
                ]
            })
        );

        await waitForEnvironmentStatus(appName, envName, 'Ready');
        console.log('Environment updated successfully');
    } catch (error) {
        console.error('Error updating environment:', error);
        throw error;
    }
};

// Cleanup resources
const cleanup = async (resources) => {
    const ebClient = getClient(ElasticBeanstalkClient);
    const s3Client = getClient(S3Client);

    try {
        console.log('\nStarting cleanup...');

        // Terminate environment
        if (resources.envName) {
            console.log('Terminating environment...');
            await ebClient.send(
                new TerminateEnvironmentCommand({
                    EnvironmentName: resources.envName
                })
            );
            await waitForEnvironmentStatus(resources.appName, resources.envName, 'Terminated');
        }

        // Delete application version
        if (resources.appName && resources.versionLabel) {
            console.log('Deleting application version...');
            await ebClient.send(
                new DeleteApplicationVersionCommand({
                    ApplicationName: resources.appName,
                    VersionLabel: resources.versionLabel,
                    DeleteSourceBundle: true
                })
            );
        }

        // Delete application
        if (resources.appName) {
            console.log('Deleting application...');
            await ebClient.send(
                new DeleteApplicationCommand({
                    ApplicationName: resources.appName
                })
            );
        }

        // Delete S3 objects and bucket
        if (resources.bucketName) {
            console.log('Deleting S3 bucket and contents...');
            if (resources.key) {
                await s3Client.send(
                    new DeleteObjectCommand({
                        Bucket: resources.bucketName,
                        Key: resources.key
                    })
                );
            }
            await s3Client.send(
                new DeleteBucketCommand({
                    Bucket: resources.bucketName
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
    const appName = `non-compliant-app-${Date.now()}`;
    resources.appName = appName;

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

        // Create and upload application
        const { bucketName, key } = await createAndUploadApplication();
        resources.bucketName = bucketName;
        resources.key = key;

        // Create Elastic Beanstalk application
        await createApplication(appName);

        // Create application version
        const versionLabel = await createApplicationVersion(appName, bucketName, key);
        resources.versionLabel = versionLabel;

        // Create non-compliant environment
        const envName = await createNonCompliantEnvironment(appName, versionLabel);
        resources.envName = envName;

        // Wait for environment to be ready
        await waitForEnvironmentStatus(appName, envName, 'Ready');

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Environment created without managed updates enabled.');
        console.log('To be compliant, the environment should have:');
        console.log('1. ManagedActionsEnabled set to true');
        console.log('2. PreferredStartTime configured');
        console.log('3. UpdateLevel specified');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the environment compliant
        // await makeCompliant(appName, envName);
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
