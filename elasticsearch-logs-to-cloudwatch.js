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

// // Function to initialize AWS clients
// const getClient = (ClientClass) => {
//     try {
//         const credentials = {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         };

//         const config = {
//             credentials,
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

//         const assumeRolePolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Effect: 'Allow',
//                     Principal: { Service: 'es.amazonaws.com' },
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

//         console.log('IAM role created successfully');
//         return { roleName, roleArn: createRoleResponse.Role.Arn };
//     } catch (error) {
//         console.error('Error creating IAM role:', error);
//         throw error;
//     }
// };

// // Create non-compliant OpenSearch domain
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
//                 NodeToNodeEncryptionOptions: { Enabled: true },
//                 EncryptionAtRestOptions: { Enabled: true },
//                 DomainEndpointOptions: { EnforceHTTPS: true },
//                 AccessPolicies: JSON.stringify({
//                     Version: '2012-10-17',
//                     Statement: [
//                         {
//                             Effect: 'Deny',
//                             Principal: { AWS: '*' },
//                             Action: 'es:*',
//                             Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
//                         }
//                     ]
//                 })
//             })
//         );

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

//     while (true) {
//         try {
//             const response = await client.send(new DescribeDomainCommand({ DomainName: domainName }));
//             const status = response.DomainStatus.Processing ? 'Processing' : 'Active';

//             if (status === targetStatus) break;

//             console.log(`Current status: ${status}, retrying in 30 seconds...`);
//             await new Promise((resolve) => setTimeout(resolve, 30000));
//         } catch (error) {
//             if (error.name === 'ResourceNotFoundException' && targetStatus === 'Deleted') {
//                 console.log('Domain deleted');
//                 break;
//             }
//             throw error;
//         }
//     }
// };

// // Cleanup resources
// const cleanup = async (resources) => {
//     const opensearchClient = getClient(OpenSearchServiceClient);
//     const iamClient = getClient(IAMClient);

//     try {
//         console.log('Cleaning up resources...');

//         if (resources.domainName) {
//             await opensearchClient.send(new DeleteDomainCommand({ DomainName: resources.domainName }));
//             await waitForDomainStatus(resources.domainName, 'Deleted');
//         }

//         if (resources.roleName) {
//             await iamClient.send(
//                 new DeleteRolePolicyCommand({
//                     RoleName: resources.roleName,
//                     PolicyName: 'opensearch-cloudwatch-policy'
//                 })
//             );

//             await iamClient.send(new DeleteRoleCommand({ RoleName: resources.roleName }));
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
//         if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
//             throw new Error('AWS credentials are not set in environment variables.');
//         }

//         const { roleName, roleArn } = await createOpenSearchRole();
//         resources.roleName = roleName;

//         const domainName = await createNonCompliantDomain(roleArn);
//         resources.domainName = domainName;

//         console.log('Non-compliant OpenSearch domain created.');
//     } catch (error) {
//         console.error('Fatal error:', error);
//     } finally {
//         await cleanup(resources);
//     }
// };

// // Run the script
// if (require.main === module) {
//     main().catch((error) => {
//         console.error('Unhandled error:', error);
//         process.exit(1);
//     });
// }


const { 
    OpenSearchClient,  // Changed from OpenSearchServiceClient
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
const opensearchClient = new OpenSearchClient({ region: process.env.AWS_REGION }); // Changed client initialization
const logsClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    DOMAIN_NAME: `test-domain-${Date.now()}`,
    LOG_GROUP_NAME: `/aws/opensearch/domains/test-domain-${Date.now()}`,
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
                        Service: 'es.amazonaws.com'
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
                    Resource: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_NAME}:*`
                }]
            })
        }));

        return createRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
}

// Function to create CloudWatch log group
async function createLogGroup() {
    try {
        await logsClient.send(new CreateLogGroupCommand({
            logGroupName: CONFIG.LOG_GROUP_NAME
        }));

        await logsClient.send(new PutRetentionPolicyCommand({
            logGroupName: CONFIG.LOG_GROUP_NAME,
            retentionInDays: 7
        }));

        console.log('Created CloudWatch log group');
    } catch (error) {
        console.error('Error creating log group:', error);
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
            LogPublishingOptions: {
                // Intentionally not configuring logs to create non-compliant state
            },
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
                    CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_NAME}`,
                    Enabled: true
                },
                INDEX_SLOW_LOGS: {
                    CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_NAME}`,
                    Enabled: true
                },
                ERROR_LOGS: {
                    CloudWatchLogsLogGroupArn: `arn:aws:logs:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:log-group:${CONFIG.LOG_GROUP_NAME}`,
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

        // Delete CloudWatch log group
        try {
            await logsClient.send(new DeleteLogGroupCommand({
                logGroupName: CONFIG.LOG_GROUP_NAME
            }));
            console.log('Deleted CloudWatch log group');
        } catch (error) {
            console.error('Error deleting log group:', error);
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

        // Create log group
        console.log('Creating CloudWatch log group...');
        await createLogGroup();

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
