// const { 
//     RedshiftClient,
//     CreateClusterCommand,
//     DeleteClusterCommand,
//     DescribeClustersCommand,
//     CreateClusterParameterGroupCommand,
//     ModifyClusterParameterGroupCommand,
//     DeleteClusterParameterGroupCommand
// } = require("@aws-sdk/client-redshift");

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

// // Wait for cluster creation
// const waitForClusterCreation = async (redshiftClient, clusterIdentifier) => {
//     let isAvailable = false;
//     let attempts = 0;
//     const maxAttempts = 2;

//     while (!isAvailable && attempts < maxAttempts) {
//         try {
//             const response = await redshiftClient.send(
//                 new DescribeClustersCommand({
//                     ClusterIdentifier: clusterIdentifier
//                 })
//             );

//             const status = response.Clusters[0].ClusterStatus;
//             if (status === 'available') {
//                 isAvailable = true;
//                 console.log('Cluster is now available!');
//             } else {
//                 attempts++;
//                 console.log('Still creating cluster... (attempt', attempts, 'of', maxAttempts, ')');
//                 await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
//             }
//         } catch (error) {
//             attempts++;
//             await new Promise(resolve => setTimeout(resolve, 30000));
//         }
//     }

//     if (!isAvailable) {
//         throw new Error('Cluster creation timed out');
//     }
// };

// // Create parameter group
// const createParameterGroup = async (redshiftClient, parameterGroupName) => {
//     try {
//         // Create parameter group
//         await redshiftClient.send(
//             new CreateClusterParameterGroupCommand({
//                 ParameterGroupName: parameterGroupName,
//                 ParameterGroupFamily: 'redshift-1.0',
//                 Description: 'Non-compliant parameter group for testing'
//             })
//         );

//         // Modify parameter group to disable SSL requirement
//         await redshiftClient.send(
//             new ModifyClusterParameterGroupCommand({
//                 ParameterGroupName: parameterGroupName,
//                 Parameters: [
//                     {
//                         ParameterName: 'require_ssl',
//                         ParameterValue: 'false',
//                         ApplyType: 'static'
//                     }
//                 ]
//             })
//         );

//         return parameterGroupName;
//     } catch (error) {
//         console.error('Error creating parameter group:', error);
//         throw error;
//     }
// };

// // Cleanup resources
// const cleanup = async (redshiftClient, resources) => {
//     try {
//         if (resources.clusterIdentifier) {
//             console.log('\nCleaning up resources...');
            
//             // Delete cluster
//             await redshiftClient.send(
//                 new DeleteClusterCommand({
//                     ClusterIdentifier: resources.clusterIdentifier,
//                     SkipFinalClusterSnapshot: true
//                 })
//             );
//             console.log('Redshift cluster deletion initiated');

//             // Wait for cluster to be deleted before deleting parameter group
//             await new Promise(resolve => setTimeout(resolve, 300000)); // Wait 5 minutes
//         }

//         if (resources.parameterGroupName) {
//             await redshiftClient.send(
//                 new DeleteClusterParameterGroupCommand({
//                     ParameterGroupName: resources.parameterGroupName
//                 })
//             );
//             console.log('Parameter group deleted');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//     }
// };

// // Create non-compliant state
// const createNonCompliantState = async () => {
//     const redshiftClient = createAwsClient(RedshiftClient);
//     const resources = {
//         clusterIdentifier: 'non-compliant-cluster-' + Math.random().toString(36).substring(7),
//         parameterGroupName: 'non-compliant-params-' + Math.random().toString(36).substring(7)
//     };

//     try {
//         console.log('Creating non-compliant Redshift cluster without SSL requirement...');

//         // Create parameter group with SSL disabled
//         await createParameterGroup(redshiftClient, resources.parameterGroupName);

//         // Create cluster with minimal configuration
//         await redshiftClient.send(
//             new CreateClusterCommand({
//                 ClusterIdentifier: resources.clusterIdentifier,
//                 NodeType: 'dc2.large',    // Smallest available node type
//                 MasterUsername: 'admin',
//                 MasterUserPassword: 'Admin123456789',
//                 ClusterParameterGroupName: resources.parameterGroupName,
//                 ClusterType: 'single-node', // Explicitly specify single-node cluster
//                 NumberOfNodes: 1,           // Single node
//                 PubliclyAccessible: false,  // Private access only
//                 Encrypted: true,            // Required encryption at rest
//                 Port: 5439                  // Default port
//             })
//         );

//         console.log('\nWaiting for cluster to be available...');
//         await waitForClusterCreation(redshiftClient, resources.clusterIdentifier);

//         console.log('\nNon-compliant state created:');
//         console.log(`Cluster Identifier: ${resources.clusterIdentifier}`);
//         console.log(`Parameter Group: ${resources.parameterGroupName}`);
//         console.log('SSL Requirement: Disabled');

//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error creating non-compliant Redshift cluster:', error);
//         throw error;
//     } finally {
//         await cleanup(redshiftClient, resources);
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
    RedshiftClient,
    CreateClusterCommand,
    DeleteClusterCommand,
    DescribeClustersCommand,
    ModifyClusterCommand,
    CreateClusterParameterGroupCommand,
    ModifyClusterParameterGroupCommand,
    DeleteClusterParameterGroupCommand,
    DescribeClusterParameterGroupsCommand
} = require("@aws-sdk/client-redshift");

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

        return new RedshiftClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create parameter group with SSL disabled
const createParameterGroup = async () => {
    const client = getClient();
    const parameterGroupName = `non-compliant-params-${Date.now()}`;

    try {
        // Create parameter group
        await client.send(
            new CreateClusterParameterGroupCommand({
                ParameterGroupName: parameterGroupName,
                ParameterGroupFamily: 'redshift-1.0',
                Description: 'Non-compliant parameter group with SSL disabled'
            })
        );

        console.log('Parameter group created');

        // Modify parameter group to disable SSL requirement
        await client.send(
            new ModifyClusterParameterGroupCommand({
                ParameterGroupName: parameterGroupName,
                Parameters: [{
                    ParameterName: 'require_ssl',
                    ParameterValue: 'false',
                    ApplyType: 'static'
                }]
            })
        );

        console.log('SSL requirement disabled in parameter group');
        return parameterGroupName;
    } catch (error) {
        console.error('Error creating parameter group:', error);
        throw error;
    }
};

// Create non-compliant Redshift cluster
const createNonCompliantCluster = async (parameterGroupName) => {
    const client = getClient();
    const clusterIdentifier = `non-compliant-cluster-${Date.now()}`;

    try {
        const params = {
            ClusterIdentifier: clusterIdentifier,
            NodeType: 'dc2.large',
            MasterUsername: 'admin',
            MasterUserPassword: 'Temp1234!',
            ClusterParameterGroupName: parameterGroupName,
            NumberOfNodes: 1,
            PubliclyAccessible: false,
            Encrypted: true,
            Port: 5439,
            ClusterType: 'single-node',
            AutomatedSnapshotRetentionPeriod: 1,
            PreferredMaintenanceWindow: 'sun:05:00-sun:06:00',
            Tags: [{
                Key: 'Environment',
                Value: 'Test'
            }]
        };

        console.log('Creating Redshift cluster...');
        await client.send(new CreateClusterCommand(params));

        // Wait for cluster to be available
        await waitForClusterStatus(client, clusterIdentifier, 'available');
        console.log('Redshift cluster created successfully');

        return clusterIdentifier;
    } catch (error) {
        console.error('Error creating Redshift cluster:', error);
        throw error;
    }
};

// Wait for cluster status
const waitForClusterStatus = async (client, clusterIdentifier, targetStatus) => {
    while (true) {
        try {
            const response = await client.send(
                new DescribeClustersCommand({
                    ClusterIdentifier: clusterIdentifier
                })
            );

            const status = response.Clusters[0].ClusterStatus;
            console.log(`Current cluster status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'ClusterNotFound' && targetStatus === 'deleted') {
                console.log('Cluster deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Make cluster compliant by enabling SSL requirement
const makeCompliant = async (clusterIdentifier, parameterGroupName) => {
    const client = getClient();

    try {
        console.log('Enabling SSL requirement...');
        await client.send(
            new ModifyClusterParameterGroupCommand({
                ParameterGroupName: parameterGroupName,
                Parameters: [{
                    ParameterName: 'require_ssl',
                    ParameterValue: 'true',
                    ApplyType: 'static'
                }]
            })
        );

        // Reboot cluster to apply parameter group changes
        await client.send(
            new ModifyClusterCommand({
                ClusterIdentifier: clusterIdentifier,
                ClusterParameterGroupName: parameterGroupName
            })
        );

        await waitForClusterStatus(client, clusterIdentifier, 'available');
        console.log('SSL requirement enabled successfully');
    } catch (error) {
        console.error('Error enabling SSL requirement:', error);
        throw error;
    }
};

// Delete Redshift cluster
const deleteCluster = async (clusterIdentifier) => {
    const client = getClient();

    try {
        console.log('Deleting Redshift cluster...');
        await client.send(
            new DeleteClusterCommand({
                ClusterIdentifier: clusterIdentifier,
                SkipFinalClusterSnapshot: true
            })
        );

        // Wait for cluster to be deleted
        await waitForClusterStatus(client, clusterIdentifier, 'deleted');
    } catch (error) {
        console.error('Error deleting Redshift cluster:', error);
        throw error;
    }
};

// Delete parameter group
const deleteParameterGroup = async (parameterGroupName) => {
    const client = getClient();

    try {
        console.log('Deleting parameter group...');
        await client.send(
            new DeleteClusterParameterGroupCommand({
                ParameterGroupName: parameterGroupName
            })
        );
        console.log('Parameter group deleted successfully');
    } catch (error) {
        console.error('Error deleting parameter group:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let parameterGroupName = null;
    let clusterIdentifier = null;

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

        // Create parameter group with SSL disabled
        parameterGroupName = await createParameterGroup();

        // Create non-compliant cluster
        clusterIdentifier = await createNonCompliantCluster(parameterGroupName);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the cluster compliant
        // await makeCompliant(clusterIdentifier, parameterGroupName);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\nStarting cleanup...');
        try {
            if (clusterIdentifier) {
                await deleteCluster(clusterIdentifier);
            }
            if (parameterGroupName) {
                // Wait for cluster deletion to complete
                await new Promise(resolve => setTimeout(resolve, 30000));
                await deleteParameterGroup(parameterGroupName);
            }
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

