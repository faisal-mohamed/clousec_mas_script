const {
    RedshiftClient,
    CreateClusterCommand,
    DeleteClusterCommand,
    DescribeClustersCommand,
    ModifyClusterCommand
} = require("@aws-sdk/client-redshift");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const redshiftClient = new RedshiftClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    CLUSTER_IDENTIFIER: `test-cluster-${Date.now()}`,
    DATABASE_NAME: 'testdb',
    MASTER_USERNAME: 'admin',
    MASTER_PASSWORD: 'Admin123!_#',
    NODE_TYPE: 'dc2.large',
    ROLE_NAME: `redshift-role-${Date.now()}`
};

// Function to create IAM role for Redshift
async function createRedshiftRole() {
    try {
        // Create role
        const createRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'redshift.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Attach policy
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.ROLE_NAME,
            PolicyName: 'redshift-policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        's3:GetBucketLocation',
                        's3:GetObject',
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::*',
                        'arn:aws:s3:::*/*'
                    ]
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

// Function to create non-compliant cluster
async function createNonCompliantCluster(roleArn) {
    try {
        const response = await redshiftClient.send(new CreateClusterCommand({
            ClusterIdentifier: CONFIG.CLUSTER_IDENTIFIER,
            NodeType: CONFIG.NODE_TYPE,
            MasterUsername: CONFIG.MASTER_USERNAME,
            MasterUserPassword: CONFIG.MASTER_PASSWORD,
            DBName: CONFIG.DATABASE_NAME,
            NumberOfNodes: 2,
            PubliclyAccessible: true, // Non-compliant: Making cluster publicly accessible
            IamRoles: [roleArn],
            Encrypted: true // Keep encryption for security
        }));

        console.log('Created Redshift cluster:', response.Cluster.ClusterIdentifier);
        return response.Cluster.ClusterIdentifier;
    } catch (error) {
        console.error('Error creating cluster:', error);
        throw error;
    }
}

// Function to wait for cluster status
async function waitForClusterStatus(clusterId, targetStatus) {
    try {
        let status;
        do {
            const response = await redshiftClient.send(new DescribeClustersCommand({
                ClusterIdentifier: clusterId
            }));
            
            status = response.Clusters[0].ClusterStatus;
            console.log('Cluster status:', status);
            
            if (status !== targetStatus) {
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        } while (status !== targetStatus);

        return true;
    } catch (error) {
        console.error('Error checking cluster status:', error);
        throw error;
    }
}

// Function to make cluster compliant
async function makeClusterCompliant(clusterId) {
    try {
        await redshiftClient.send(new ModifyClusterCommand({
            ClusterIdentifier: clusterId,
            PubliclyAccessible: false
        }));

        console.log('Updated cluster to be private');
    } catch (error) {
        console.error('Error updating cluster:', error);
        throw error;
    }
}

// Function to check cluster compliance
async function checkClusterCompliance(clusterId) {
    try {
        const response = await redshiftClient.send(new DescribeClustersCommand({
            ClusterIdentifier: clusterId
        }));

        const cluster = response.Clusters[0];
        const isCompliant = !cluster.PubliclyAccessible;

        console.log('\nCompliance Check Results:');
        console.log('-------------------------');
        console.log('Cluster Identifier:', cluster.ClusterIdentifier);
        console.log('Publicly Accessible:', cluster.PubliclyAccessible);
        console.log('Compliance Status:', isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT');
        console.log('-------------------------');

        return isCompliant;
    } catch (error) {
        console.error('Error checking compliance:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(clusterId) {
    try {
        // Delete Redshift cluster
        if (clusterId) {
            try {
                console.log('Deleting Redshift cluster...');
                await redshiftClient.send(new DeleteClusterCommand({
                    ClusterIdentifier: clusterId,
                    SkipFinalClusterSnapshot: true
                }));

                // Wait for cluster deletion
                console.log('Waiting for cluster deletion...');
                let status;
                do {
                    try {
                        const response = await redshiftClient.send(new DescribeClustersCommand({
                            ClusterIdentifier: clusterId
                        }));
                        status = response.Clusters[0].ClusterStatus;
                        console.log('Cluster status:', status);
                        await new Promise(resolve => setTimeout(resolve, 30000));
                    } catch (error) {
                        if (error.name === 'ClusterNotFoundFault') {
                            console.log('Cluster deleted successfully');
                            break;
                        }
                        throw error;
                    }
                } while (status !== 'deleted');
            } catch (error) {
                console.error('Error deleting cluster:', error);
            }
        }

        // Delete IAM role
        try {
            // Delete role policy
            await iamClient.send(new DeleteRolePolicyCommand({
                RoleName: CONFIG.ROLE_NAME,
                PolicyName: 'redshift-policy'
            }));

            // Delete role
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
    let clusterId = null;
    let roleArn = null;

    try {
        console.log('Starting Redshift public access compliance simulation...');

        // Create IAM role
        console.log('Creating IAM role...');
        roleArn = await createRedshiftRole();

        // Create non-compliant cluster
        console.log('Creating non-compliant cluster (publicly accessible)...');
        clusterId = await createNonCompliantCluster(roleArn);

        // Wait for cluster to be available
        console.log('Waiting for cluster to be available...');
        await waitForClusterStatus(clusterId, 'available');

        // Check initial compliance
        console.log('\nChecking initial compliance...');
        await checkClusterCompliance(clusterId);

        // Wait for testing period
        console.log('\nWaiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Make cluster compliant
        console.log('\nMaking cluster compliant...');
        await makeClusterCompliant(clusterId);

        // Wait for changes to apply
        console.log('Waiting for changes to apply...');
        await waitForClusterStatus(clusterId, 'available');

        // Check final compliance
        console.log('\nChecking final compliance...');
        await checkClusterCompliance(clusterId);

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('\nCleaning up resources...');
        await cleanupResources(clusterId);
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
