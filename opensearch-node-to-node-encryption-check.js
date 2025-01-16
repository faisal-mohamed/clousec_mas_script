// const { 
//     OpenSearchClient,
//     CreateDomainCommand,
//     DeleteDomainCommand,
//     DescribeDomainCommand
// } = require("@aws-sdk/client-opensearch");

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

// // Wait for domain creation
// const waitForDomainCreation = async (client, domainName) => {
//     let isCreated = false;
//     let attempts = 0;
//     const maxAttempts = 2; 

//     while (!isCreated && attempts < maxAttempts) {
//         try {
//             const response = await client.send(
//                 new DescribeDomainCommand({
//                     DomainName: domainName
//                 })
//             );

//             if (response.DomainStatus.Processing === false) {
//                 isCreated = true;
//                 console.log('Domain creation completed!');
//             } else {
//                 attempts++;
//                 console.log('Still creating domain... (attempt', attempts, 'of', maxAttempts, ')');
//                 await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
//             }
//         } catch (error) {
//             console.error('Error checking domain status:', error);
//             attempts++;
//             await new Promise(resolve => setTimeout(resolve, 10000));
//         }
//     }

//     if (!isCreated) {
//         throw new Error('Domain creation timed out');
//     }
// };

// // Cleanup resources
// const cleanup = async (client, domainName) => {
//     try {
//         if (domainName) {
//             console.log('\nCleaning up resources...');
//             await client.send(
//                 new DeleteDomainCommand({
//                     DomainName: domainName
//                 })
//             );
//             console.log('OpenSearch domain deletion initiated');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//     }
// };

// // Create non-compliant state
// const createNonCompliantState = async () => {
//     const opensearchClient = createAwsClient(OpenSearchClient);
//     const domainName = 'non-compliant-domain-' + Math.random().toString(36).substring(7);

//     try {
//         console.log('Creating non-compliant OpenSearch domain without node-to-node encryption...');

//         // Create domain without node-to-node encryption
//         await opensearchClient.send(
//             new CreateDomainCommand({
//                 DomainName: domainName,
//                 EngineVersion: 'OpenSearch_1.0',
//                 ClusterConfig: {
//                     InstanceType: 't3.small.search',
//                     InstanceCount: 1,
//                     DedicatedMasterEnabled: false
//                 },
//                 EBSOptions: {
//                     EBSEnabled: true,
//                     VolumeType: 'gp3',
//                     VolumeSize: 10
//                 },
//                 NodeToNodeEncryptionOptions: {
//                     Enabled: false  // This makes it non-compliant
//                 },
//                 EncryptionAtRestOptions: {
//                     Enabled: true  // Required for newer domains
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
//                             Resource: '*'
//                         }
//                     ]
//                 })
//             })
//         );

//         console.log('\nWaiting for domain to be created (this may take 10-15 minutes)...');
//         await waitForDomainCreation(opensearchClient, domainName);

//         // Get domain status to verify configuration
//         const domainStatus = await opensearchClient.send(
//             new DescribeDomainCommand({
//                 DomainName: domainName
//             })
//         );

//         console.log('\nNon-compliant state created:');
//         console.log(`Domain Name: ${domainName}`);
//         console.log(`Node-to-Node Encryption: ${domainStatus.DomainStatus.NodeToNodeEncryptionOptions.Enabled}`);

//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error creating non-compliant OpenSearch domain:', error);
//         throw error;
//     } finally {
//         await cleanup(opensearchClient, domainName);
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
    OpenSearchClient,
    CreateDomainCommand,
    DeleteDomainCommand,
    DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");

require('dotenv').config();

// Create AWS client
const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

// Wait for domain creation with increased retry attempts
const waitForDomainCreation = async (client, domainName) => {
    let isCreated = false;
    let attempts = 0;
    const maxAttempts = 5; // Increased attempts
    const delay = 30000; // Increased delay (30 seconds)

    while (!isCreated && attempts < maxAttempts) {
        try {
            const response = await client.send(
                new DescribeDomainCommand({
                    DomainName: domainName
                })
            );

            if (response.DomainStatus.Processing === false) {
                isCreated = true;
                console.log('Domain creation completed!');
            } else {
                attempts++;
                console.log('Still creating domain... (attempt', attempts, 'of', maxAttempts, ')');
                await new Promise(resolve => setTimeout(resolve, delay)); // Wait 30 seconds
            }
        } catch (error) {
            console.error('Error checking domain status:', error);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, delay)); // Wait 30 seconds
        }
    }

    if (!isCreated) {
        throw new Error('Domain creation timed out');
    }
};

// Cleanup resources
const cleanup = async (client, domainName) => {
    try {
        if (domainName) {
            console.log('\nCleaning up resources...');
            await client.send(
                new DeleteDomainCommand({
                    DomainName: domainName
                })
            );
            console.log('OpenSearch domain deletion initiated');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
};

// Create non-compliant state
const createNonCompliantState = async () => {
    const opensearchClient = createAwsClient(OpenSearchClient);
    const domainName = 'non-compliant-domain-' + Math.random().toString(36).substring(7);

    try {
        console.log('Creating non-compliant OpenSearch domain without node-to-node encryption...');

        // Create domain without node-to-node encryption
        await opensearchClient.send(
            new CreateDomainCommand({
                DomainName: domainName,
                EngineVersion: 'OpenSearch_1.0',
                ClusterConfig: {
                    InstanceType: 't3.small.search',
                    InstanceCount: 1,
                    DedicatedMasterEnabled: false
                },
                EBSOptions: {
                    EBSEnabled: true,
                    VolumeType: 'gp3',
                    VolumeSize: 10
                },
                NodeToNodeEncryptionOptions: {
                    Enabled: false  // This makes it non-compliant
                },
                EncryptionAtRestOptions: {
                    Enabled: true  // Required for newer domains
                },
                AccessPolicies: JSON.stringify({
                    Version: '2012-10-17',
                    Statement: [
                        {
                            Effect: 'Deny',
                            Principal: {
                                AWS: '*'
                            },
                            Action: 'es:*',
                            Resource: '*'
                        }
                    ]
                })
            })
        );

        console.log('\nWaiting for domain to be created (this may take 10-15 minutes)...');
        await waitForDomainCreation(opensearchClient, domainName);

        // Get domain status to verify configuration
        const domainStatus = await opensearchClient.send(
            new DescribeDomainCommand({
                DomainName: domainName
            })
        );

        console.log('\nNon-compliant state created:');
        console.log(`Domain Name: ${domainName}`);
        console.log(`Node-to-Node Encryption: ${domainStatus.DomainStatus.NodeToNodeEncryptionOptions.Enabled}`);

        // Wait for AWS Config to evaluate
        console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('Error creating non-compliant OpenSearch domain:', error);
        throw error;
    } finally {
        await cleanup(opensearchClient, domainName);
    }
};

// Main function
const main = async () => {
    try {
        await createNonCompliantState();
    } catch (error) {
        console.error('Script execution failed:', error);
    }
};

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    createNonCompliantState
};
