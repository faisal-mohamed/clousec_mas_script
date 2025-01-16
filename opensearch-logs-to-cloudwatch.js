// const {
//     OpenSearchServiceClient,
//     CreateDomainCommand,
//     DeleteDomainCommand,
//     DescribeDomainCommand,
//     UpdateDomainConfigCommand
// } = require("@aws-sdk/client-opensearch");

// const {
//     IAMClient,
//     CreateRoleCommand,
//     PutRolePolicyCommand,
//     DeleteRoleCommand,
//     DeleteRolePolicyCommand
// } = require("@aws-sdk/client-iam");

// require('dotenv').config();

// // Initialize AWS clients
// const getClient = (ClientClass) => {
//     try {
//         const credentials = {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         };

//         const config = {
//             credentials: credentials,
//             region: process.env.AWS_REGION || 'ap-southeast-1'
//         };

//         return new ClientClass(config);
//     } catch (error) {
//         console.error('Error initializing AWS client:', error);
//         throw error;
//     }
// };

// // Create IAM role for OpenSearch
// const createOpenSearchRole = async () => {
//     const iamClient = getClient(IAMClient);
//     const roleName = `opensearch-role-${Date.now()}`;

//     try {
//         console.log('Creating IAM role for OpenSearch...');

//         // Create role
//         const assumeRolePolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Effect: 'Allow',
//                     Principal: {
//                         Service: 'es.amazonaws.com'
//                     },
//                     Action: 'sts:AssumeRole'
//                 }
//             ]
//         };

//         const createRoleResponse = await iamClient.send(
//             new CreateRoleCommand({
//                 RoleName: roleName,
//                 AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
//             })
//         );

//         // Create role policy
//         const rolePolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Effect: 'Allow',
//                     Action: [
//                         'logs:CreateLogGroup',
//                         'logs:CreateLogStream',
//                         'logs:PutLogEvents',
//                         'logs:PutRetentionPolicy'
//                     ],
//                     Resource: 'arn:aws:logs:*:*:*'
//                 }
//             ]
//         };

//         await iamClient.send(
//             new PutRolePolicyCommand({
//                 RoleName: roleName,
//                 PolicyName: 'opensearch-cloudwatch-policy',
//                 PolicyDocument: JSON.stringify(rolePolicy)
//             })
//         );

//         // Wait for role to be available
//         await new Promise(resolve => setTimeout(resolve, 10000));

//         console.log('IAM role created successfully');
//         return { roleName, roleArn: createRoleResponse.Role.Arn };
//     } catch (error) {
//         console.error('Error creating IAM role:', error);
//         throw error;
//     }
// };

// // Create non-compliant OpenSearch domain (without CloudWatch logs)
// const createNonCompliantDomain = async (roleArn) => {
//     const client = getClient(OpenSearchServiceClient);
//     const domainName = `non-compliant-domain-${Date.now()}`.toLowerCase();

//     try {
//         console.log('Creating OpenSearch domain...');
//         await client.send(
//             new CreateDomainCommand({
//                 DomainName: domainName,
//                 EngineVersion: 'OpenSearch_2.5',
//                 ClusterConfig: {
//                     InstanceType: 't3.small.search',
//                     InstanceCount: 1,
//                     DedicatedMasterEnabled: false,
//                     ZoneAwarenessEnabled: false
//                 },
//                 EBSOptions: {
//                     EBSEnabled: true,
//                     VolumeType: 'gp3',
//                     VolumeSize: 10
//                 },
//                 NodeToNodeEncryptionOptions: {
//                     Enabled: true
//                 },
//                 EncryptionAtRestOptions: {
//                     Enabled: true
//                 },
//                 DomainEndpointOptions: {
//                     EnforceHTTPS: true
//                 },
//                 AccessPolicies: JSON.stringify({
//                     Version: '2012-10-17',
//                     Statement: [
//                         {
//                             Effect: 'Deny',
//                             Principal: {
//                                 AWS: '*'
//                             },
//                             Action: 'es:*',
//                             Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
//                         }
//                     ]
//                 })
//                 // Non-compliant: No LogPublishingOptions specified
//             })
//         );

//         console.log('Waiting for domain to be created...');
//         await waitForDomainStatus(domainName, 'Active');
//         console.log('Domain created successfully');

//         return domainName;
//     } catch (error) {
//         console.error('Error creating OpenSearch domain:', error);
//         throw error;
//     }
// };

// // Wait for domain status
// const waitForDomainStatus = async (domainName, targetStatus) => {
//     const client = getClient(OpenSearchServiceClient);
//     console.log(`Waiting for domain ${domainName} to be ${targetStatus}...`);

//     while (true) {
//         try {
//             const response = await client.send(
//                 new DescribeDomainCommand({
//                     DomainName: domainName
//                 })
//             );

//             const status = response.DomainStatus.Processing ? 'Processing' : 'Active';
//             console.log(`Current status: ${status}`);

//             if (status === targetStatus) {
//                 break;
//             }

//             await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
//         } catch (error) {
//             if (error.name === 'ResourceNotFoundException' && targetStatus === 'Deleted') {
//                 console.log('Domain deleted');
//                 break;
//             }
//             throw error;
//         }
//     }
// };

// // Make domain compliant by enabling CloudWatch logs
// const makeCompliant = async (domainName, roleArn) => {
//     const client = getClient(OpenSearchServiceClient);

//     try {
//         console.log('Enabling CloudWatch logs...');
//         await client.send(
//             new UpdateDomainConfigCommand({
//                 DomainName: domainName,
//                 LogPublishingOptions: {
//                     SEARCH_SLOW_LOGS: {
//                         CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:/aws/opensearch/${domainName}/search-slow-logs`,
//                         Enabled: true
//                     },
//                     INDEX_SLOW_LOGS: {
//                         CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:/aws/opensearch/${domainName}/index-slow-logs`,
//                         Enabled: true
//                     },
//                     ES_APPLICATION_LOGS: {
//                         CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:/aws/opensearch/${domainName}/es-application-logs`,
//                         Enabled: true
//                     }
//                 }
//             })
//         );

//         await waitForDomainStatus(domainName, 'Active');
//         console.log('CloudWatch logs enabled successfully');
//     } catch (error) {
//         console.error('Error enabling CloudWatch logs:', error);
//         throw error;
//     }
// };

// // Cleanup resources
// const cleanup = async (resources) => {
//     const opensearchClient = getClient(OpenSearchServiceClient);
//     const iamClient = getClient(IAMClient);

//     try {
//         console.log('\nStarting cleanup...');

//         // Delete OpenSearch domain
//         if (resources.domainName) {
//             console.log('Deleting OpenSearch domain...');
//             await opensearchClient.send(
//                 new DeleteDomainCommand({
//                     DomainName: resources.domainName
//                 })
//             );
//             await waitForDomainStatus(resources.domainName, 'Deleted');
//         }

//         // Delete IAM role
//         if (resources.roleName) {
//             console.log('Cleaning up IAM role...');
//             await iamClient.send(
//                 new DeleteRolePolicyCommand({
//                     RoleName: resources.roleName,
//                     PolicyName: 'opensearch-cloudwatch-policy'
//                 })
//             );

//             await iamClient.send(
//                 new DeleteRoleCommand({
//                     RoleName: resources.roleName
//                 })
//             );
//         }

//         console.log('Cleanup completed successfully');
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// };

// // Main function
// const main = async () => {
//     const resources = {};

//     try {
//         // Validate required environment variables
//         const requiredEnvVars = [
//             'AWS_ACCESS_KEY_ID',
//             'AWS_SECRET_ACCESS_KEY',
//             'AWS_SESSION_TOKEN',
//             'AWS_ACCOUNT_ID'
//         ];

//         const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
//         if (missingVars.length > 0) {
//             throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
//         }

//         // Create IAM role
//         const { roleName, roleArn } = await createOpenSearchRole();
//         resources.roleName = roleName;

//         // Create non-compliant domain
//         const domainName = await createNonCompliantDomain(roleArn);
//         resources.domainName = domainName;

//         // Wait to observe the non-compliant state
//         console.log('\nWaiting 60 seconds to observe non-compliant state...');
//         console.log('Domain created without CloudWatch logs enabled.');
//         console.log('To be compliant, the domain should have:');
//         console.log('1. SEARCH_SLOW_LOGS enabled and configured');
//         console.log('2. INDEX_SLOW_LOGS enabled and configured');
//         console.log('3. ES_APPLICATION_LOGS enabled and configured');
//         await new Promise(resolve => setTimeout(resolve, 60000));

//         // Optional: Make the domain compliant
//         // await makeCompliant(domainName, roleArn);
//         // console.log('\nWaiting 60 seconds to observe compliant state...');
//         // await new Promise(resolve => setTimeout(resolve, 60000));

//     } catch (error) {
//         console.error('Fatal error:', error);
//     } finally {
//         // Cleanup
//         try {
//             await cleanup(resources);
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// };

// // Run the program
// if (require.main === module) {
//     main().catch(error => {
//         console.error('Unhandled error:', error);
//         process.exit(1);
//     });
// }



const { 
    OpenSearchClient,
    CreateDomainCommand,
    DeleteDomainCommand,
    DescribeDomainCommand,
    UpdateDomainConfigCommand
} = require("@aws-sdk/client-opensearch");

const {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    DeleteLogGroupCommand,
    PutRetentionPolicyCommand
} = require("@aws-sdk/client-cloudwatch-logs");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const opensearchClient = new OpenSearchClient({ region: process.env.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    DOMAIN_NAME: `test-domain-${Date.now()}`,
    LOG_GROUP_PREFIX: '/aws/opensearch/domains/test-domain',
    ROLE_NAME: `opensearch-logs-role-${Date.now()}`
};

// Function to create IAM role for OpenSearch logs
async function createLogsRole() {
    try {
        // Create role
        const createRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'opensearch.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Attach policy for CloudWatch Logs
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.ROLE_NAME,
            PolicyName: 'opensearch-logs-policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        'logs:CreateLogStream',
                        'logs:PutLogEvents',
                        'logs:PutLogEventsBatch'
                    ],
                    Resource: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_PREFIX}*:*`
                }]
            })
        }));

        // Wait for role propagation
        await new Promise(resolve => setTimeout(resolve, 10000));

        return createRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
}

// Function to create CloudWatch log groups
async function createLogGroups() {
    try {
        const logTypes = ['search-slow-logs', 'index-slow-logs', 'error-logs'];
        
        for (const logType of logTypes) {
            const logGroupName = `${CONFIG.LOG_GROUP_PREFIX}-${logType}`;
            await logsClient.send(new CreateLogGroupCommand({
                logGroupName
            }));

            await logsClient.send(new PutRetentionPolicyCommand({
                logGroupName,
                retentionInDays: 7
            }));

            console.log(`Created log group: ${logGroupName}`);
        }
    } catch (error) {
        console.error('Error creating log groups:', error);
        throw error;
    }
}

// Function to create non-compliant OpenSearch domain
async function createNonCompliantDomain(roleArn) {
    try {
        const response = await opensearchClient.send(new CreateDomainCommand({
            DomainName: CONFIG.DOMAIN_NAME,
            EngineVersion: 'OpenSearch_2.5',
            ClusterConfig: {
                InstanceType: 't3.small.search',
                InstanceCount: 1,
                DedicatedMasterEnabled: false,
                ZoneAwarenessEnabled: false
            },
            EBSOptions: {
                EBSEnabled: true,
                VolumeType: 'gp3',
                VolumeSize: 10
            },
            NodeToNodeEncryptionOptions: {
                Enabled: true
            },
            EncryptionAtRestOptions: {
                Enabled: true
            },
            DomainEndpointOptions: {
                EnforceHTTPS: true
            },
            // Intentionally not configuring logs to create non-compliant state
            AccessPolicies: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Deny',
                    Principal: {
                        AWS: '*'
                    },
                    Action: 'es:*',
                    Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${CONFIG.DOMAIN_NAME}/*`
                }]
            })
        }));

        console.log('Created OpenSearch domain:', CONFIG.DOMAIN_NAME);
        return response.DomainStatus.DomainName;
    } catch (error) {
        console.error('Error creating OpenSearch domain:', error);
        throw error;
    }
}

// Function to make domain compliant
async function makeDomainCompliant(roleArn) {
    try {
        await opensearchClient.send(new UpdateDomainConfigCommand({
            DomainName: CONFIG.DOMAIN_NAME,
            LogPublishingOptions: {
                SEARCH_SLOW_LOGS: {
                    CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_PREFIX}-search-slow-logs`,
                    Enabled: true
                },
                INDEX_SLOW_LOGS: {
                    CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_PREFIX}-index-slow-logs`,
                    Enabled: true
                },
                ES_APPLICATION_LOGS: {
                    CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_PREFIX}-error-logs`,
                    Enabled: true
                }
            }
        }));
        console.log('Enabled CloudWatch logging for domain');
    } catch (error) {
        console.error('Error updating domain config:', error);
        throw error;
    }
}

// Function to wait for domain status
async function waitForDomainStatus(targetStatus) {
    try {
        let status;
        do {
            const response = await opensearchClient.send(new DescribeDomainCommand({
                DomainName: CONFIG.DOMAIN_NAME
            }));
            
            status = response.DomainStatus.Processing ? 'PROCESSING' : 'ACTIVE';
            console.log('Current domain status:', status);
            
            if (status !== targetStatus) {
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        } while (status !== targetStatus);
    } catch (error) {
        console.error('Error checking domain status:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources() {
    try {
        // Delete OpenSearch domain
        try {
            await opensearchClient.send(new DeleteDomainCommand({
                DomainName: CONFIG.DOMAIN_NAME
            }));
            console.log('Deleted OpenSearch domain');
        } catch (error) {
            console.error('Error deleting OpenSearch domain:', error);
        }

        // Delete CloudWatch log groups
        try {
            const logTypes = ['search-slow-logs', 'index-slow-logs', 'error-logs'];
            for (const logType of logTypes) {
                await logsClient.send(new DeleteLogGroupCommand({
                    logGroupName: `${CONFIG.LOG_GROUP_PREFIX}-${logType}`
                }));
            }
            console.log('Deleted CloudWatch log groups');
        } catch (error) {
            console.error('Error deleting log groups:', error);
        }

        // Delete IAM role
        try {
            await iamClient.send(new DeleteRolePolicyCommand({
                RoleName: CONFIG.ROLE_NAME,
                PolicyName: 'opensearch-logs-policy'
            }));

            await iamClient.send(new DeleteRoleCommand({
                RoleName: CONFIG.ROLE_NAME
            }));
            console.log('Deleted IAM role');
        } catch (error) {
            console.error('Error deleting IAM role:', error);
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    try {
        console.log('Starting OpenSearch logs compliance simulation...');

        // Create IAM role
        console.log('Creating IAM role...');
        const roleArn = await createLogsRole();

        // Create log groups
        console.log('Creating CloudWatch log groups...');
        await createLogGroups();

        // Create non-compliant domain
        console.log('Creating non-compliant OpenSearch domain...');
        await createNonCompliantDomain(roleArn);

        // Wait for domain to be active
        console.log('Waiting for domain to be active...');
        await waitForDomainStatus('ACTIVE');

        // Show non-compliant state
        console.log('\nDomain is now active in non-compliant state (no logs configured)');
        
        // Wait for testing period
        console.log('Waiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Make domain compliant
        console.log('\nMaking domain compliant...');
        await makeDomainCompliant(roleArn);

        // Wait for changes to apply
        console.log('Waiting for changes to apply...');
        await waitForDomainStatus('ACTIVE');

        console.log('Domain is now compliant with CloudWatch logging enabled');

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('\nCleaning up resources...');
        await cleanupResources();
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
