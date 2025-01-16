// const {
//     OpenSearchServiceClient,
//     CreateDomainCommand,
//     DeleteDomainCommand,
//     DescribeDomainCommand,
//     UpdateDomainConfigCommand
// } = require("@aws-sdk/client-opensearch");

// require('dotenv').config();

// // Initialize AWS client
// const getClient = () => {
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

//         return new OpenSearchServiceClient(config);
//     } catch (error) {
//         console.error('Error initializing AWS client:', error);
//         throw error;
//     }
// };

// // Create non-compliant OpenSearch domain (without proper fault tolerance)
// const createNonCompliantDomain = async () => {
//     const client = getClient();
//     const domainName = `non-compliant-domain-${Date.now()}`.toLowerCase();

//     try {
//         console.log('Creating OpenSearch domain...');
//         await client.send(
//             new CreateDomainCommand({
//                 DomainName: domainName,
//                 EngineVersion: 'OpenSearch_2.5',
//                 ClusterConfig: {
//                     InstanceType: 't3.small.search',
//                     InstanceCount: 2, // Non-compliant: Less than 3 data nodes
//                     ZoneAwarenessEnabled: false, // Non-compliant: Zone awareness disabled
//                     DedicatedMasterEnabled: false
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
//     const client = getClient();
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

// // Make domain compliant by enabling proper fault tolerance
// const makeCompliant = async (domainName) => {
//     const client = getClient();

//     try {
//         console.log('Updating domain configuration for fault tolerance...');
//         await client.send(
//             new UpdateDomainConfigCommand({
//                 DomainName: domainName,
//                 ClusterConfig: {
//                     InstanceCount: 3, // Compliant: At least 3 data nodes
//                     ZoneAwarenessEnabled: true, // Compliant: Zone awareness enabled
//                     ZoneAwarenessConfig: {
//                         AvailabilityZoneCount: 3 // Use 3 AZs for better fault tolerance
//                     }
//                 }
//             })
//         );

//         await waitForDomainStatus(domainName, 'Active');
//         console.log('Domain updated successfully with fault tolerance configuration');
//     } catch (error) {
//         console.error('Error updating domain configuration:', error);
//         throw error;
//     }
// };

// // Cleanup resources
// const cleanup = async (domainName) => {
//     const client = getClient();

//     try {
//         console.log('\nStarting cleanup...');

//         if (domainName) {
//             console.log('Deleting OpenSearch domain...');
//             await client.send(
//                 new DeleteDomainCommand({
//                     DomainName: domainName
//                 })
//             );
//             await waitForDomainStatus(domainName, 'Deleted');
//         }

//         console.log('Cleanup completed successfully');
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// };

// // Main function
// const main = async () => {
//     let domainName;

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

//         // Create non-compliant domain
//         domainName = await createNonCompliantDomain();

//         // Wait to observe the non-compliant state
//         console.log('\nWaiting 60 seconds to observe non-compliant state...');
//         console.log('Domain created without proper fault tolerance.');
//         console.log('Current configuration:');
//         console.log('1. Less than 3 data nodes');
//         console.log('2. Zone awareness disabled');
//         console.log('\nTo be compliant, the domain should have:');
//         console.log('1. At least 3 data nodes');
//         console.log('2. Zone awareness enabled');
//         console.log('3. Multi-AZ deployment');
//         await new Promise(resolve => setTimeout(resolve, 60000));

//         // Optional: Make the domain compliant
//         // await makeCompliant(domainName);
//         // console.log('\nWaiting 60 seconds to observe compliant state...');
//         // await new Promise(resolve => setTimeout(resolve, 60000));

//     } catch (error) {
//         console.error('Fatal error:', error);
//     } finally {
//         // Cleanup
//         if (domainName) {
//             try {
//                 await cleanup(domainName);
//             } catch (cleanupError) {
//                 console.error('Error during cleanup:', cleanupError);
//             }
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

        return new OpenSearchClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create non-compliant OpenSearch domain
const createNonCompliantDomain = async () => {
    const client = getClient();
    // Use lowercase and timestamp to ensure unique name
    const domainName = `non-comp-${Date.now().toString().slice(-10)}`; // Truncate timestamp to last 10 digits

    try {
        console.log('Creating non-compliant OpenSearch domain...');
        const createDomainResponse = await client.send(
            new CreateDomainCommand({
                DomainName: domainName,
                EngineVersion: 'OpenSearch_2.5',
                ClusterConfig: {
                    // Non-compliant configuration:
                    // 1. Only 2 data nodes (less than required 3)
                    // 2. Zone awareness disabled
                    InstanceType: 't3.small.search', // Smallest instance type to minimize cost
                    InstanceCount: 2, // Non-compliant: Less than 3 nodes
                    ZoneAwarenessEnabled: false, // Non-compliant: No zone awareness
                    DedicatedMasterEnabled: false // Disable dedicated master to reduce cost
                },
                // Minimal required configurations
                EBSOptions: {
                    EBSEnabled: true,
                    VolumeType: 'gp3',
                    VolumeSize: 10 // Minimum size
                },
                // Security configurations (required)
                NodeToNodeEncryptionOptions: {
                    Enabled: true
                },
                EncryptionAtRestOptions: {
                    Enabled: true
                },
                DomainEndpointOptions: {
                    EnforceHTTPS: true
                },
                // Restrictive access policy
                AccessPolicies: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Deny',
                            Principal: {
                                AWS: '*'
                            },
                            Action: 'es:*',
                            Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
                        }
                    ]
                })
            })
        );

        console.log('Domain creation initiated. Waiting for active status...');
        await waitForDomainStatus(domainName, 'Active');
        console.log('Non-compliant domain created successfully');

        return domainName;
    } catch (error) {
        if (error.name === 'ValidationException') {
            console.error('Domain configuration validation failed:', error.message);
        } else if (error.name === 'LimitExceededException') {
            console.error('Domain limit exceeded in this account:', error.message);
        } else {
            console.error('Error creating OpenSearch domain:', error);
        }
        throw error;
    }
};

// Enhanced wait function with timeout
const waitForDomainStatus = async (domainName, targetStatus, timeoutMinutes = 30) => {
    const client = getClient();
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    console.log(`Waiting up to ${timeoutMinutes} minutes for domain ${domainName} to be ${targetStatus}...`);

    while (true) {
        try {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Timeout waiting for domain status ${targetStatus}`);
            }

            const response = await client.send(
                new DescribeDomainCommand({
                    DomainName: domainName
                })
            );

            const status = response.DomainStatus.Processing ? 'Processing' : 'Active';
            console.log(`Current status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            // Wait 30 seconds before next check
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (error) {
            if (error.name === 'ResourceNotFoundException' && targetStatus === 'Deleted') {
                console.log('Domain deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Cleanup function
const cleanup = async (domainName) => {
    if (!domainName) return;

    const client = getClient();
    try {
        console.log('\nStarting cleanup...');
        console.log(`Deleting OpenSearch domain: ${domainName}`);
        
        await client.send(
            new DeleteDomainCommand({
                DomainName: domainName
            })
        );

        await waitForDomainStatus(domainName, 'Deleted');
        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main execution function
const main = async () => {
    let domainName;

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_ACCOUNT_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Create non-compliant domain
        domainName = await createNonCompliantDomain();

        // Display non-compliant configuration details
        console.log('\nNon-compliant configuration created:');
        console.log('1. Only 2 data nodes (CIS requirement is minimum 3)');
        console.log('2. Zone awareness disabled (CIS requirement is enabled)');
        console.log('\nThis configuration violates these CIS benchmarks:');
        console.log('- Fault tolerance requirements');
        console.log('- High availability requirements');

        // Wait period to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (domainName) {
            try {
                await cleanup(domainName);
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
