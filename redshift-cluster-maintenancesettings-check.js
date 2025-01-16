const {
    RedshiftClient,
    CreateClusterCommand,
    DeleteClusterCommand,
    ModifyClusterCommand,
    DescribeClustersCommand
} = require("@aws-sdk/client-redshift");

const {
    EC2Client,
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize AWS clients with temporary credentials
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

// Get default VPC and subnet information
const getDefaultVpcAndSubnet = async () => {
    const ec2Client = getClient(EC2Client);

    try {
        // Get default VPC
        const vpcResponse = await ec2Client.send(
            new DescribeVpcsCommand({
                Filters: [{
                    Name: 'isDefault',
                    Values: ['true']
                }]
            })
        );

        if (!vpcResponse.Vpcs || vpcResponse.Vpcs.length === 0) {
            throw new Error('No default VPC found');
        }

        const vpcId = vpcResponse.Vpcs[0].VpcId;
        console.log(`Found default VPC: ${vpcId}`);

        // Get subnets in the default VPC
        const subnetResponse = await ec2Client.send(
            new DescribeSubnetsCommand({
                Filters: [{
                    Name: 'vpc-id',
                    Values: [vpcId]
                }]
            })
        );

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length === 0) {
            throw new Error('No subnets found in default VPC');
        }

        // Get first subnet
        const subnetId = subnetResponse.Subnets[0].SubnetId;
        console.log(`Using subnet: ${subnetId}`);

        return { vpcId, subnetId };
    } catch (error) {
        console.error('Error getting VPC/Subnet information:', error);
        throw error;
    }
};

// Create Redshift cluster with non-compliant maintenance settings
const createNonCompliantCluster = async (vpcId, subnetId) => {
    const redshiftClient = getClient(RedshiftClient);
    const clusterIdentifier = `temp-cluster-${Date.now()}`;

    try {
        const params = {
            ClusterIdentifier: clusterIdentifier,
            NodeType: 'dc2.large', // Smallest available node type
            MasterUsername: 'admin',
            MasterUserPassword: 'TempPass123!',
            NumberOfNodes: 2,
            // Non-compliant maintenance settings
            AllowVersionUpgrade: false, // Disabling version upgrades (non-compliant)
            PreferredMaintenanceWindow: 'Sun:23:45-Mon:00:15', // Minimal maintenance window
            AutomatedSnapshotRetentionPeriod: 1, // Minimum retention period
            // VPC Settings
            VpcId: vpcId,
            ClusterSubnetGroupName: 'default',
            PubliclyAccessible: false,
            // Additional settings for cost optimization
            SkipFinalClusterSnapshot: true
        };

        console.log('Creating Redshift cluster with non-compliant maintenance settings...');
        await redshiftClient.send(new CreateClusterCommand(params));

        // Wait for cluster to be available
        await waitForClusterStatus(redshiftClient, clusterIdentifier, 'available');
        console.log('Redshift cluster created successfully');

        return clusterIdentifier;
    } catch (error) {
        console.error('Error creating Redshift cluster:', error);
        throw error;
    }
};

// Wait for cluster status
const waitForClusterStatus = async (redshiftClient, clusterIdentifier, targetStatus) => {
    while (true) {
        try {
            const response = await redshiftClient.send(
                new DescribeClustersCommand({
                    ClusterIdentifier: clusterIdentifier
                })
            );

            const status = response.Clusters[0].ClusterStatus;
            console.log(`Current cluster status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            if (status === 'failed' || status === 'deleted') {
                throw new Error(`Cluster reached ${status} state`);
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'ClusterNotFoundFault' && targetStatus === 'deleted') {
                console.log('Cluster deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Make cluster maintenance settings compliant (optional)
const makeCompliant = async (clusterIdentifier) => {
    const redshiftClient = getClient(RedshiftClient);

    try {
        console.log('Updating cluster maintenance settings to be compliant...');
        await redshiftClient.send(
            new ModifyClusterCommand({
                ClusterIdentifier: clusterIdentifier,
                AllowVersionUpgrade: true,
                PreferredMaintenanceWindow: 'sat:05:00-sat:06:00',
                AutomatedSnapshotRetentionPeriod: 7
            })
        );

        await waitForClusterStatus(redshiftClient, clusterIdentifier, 'available');
        console.log('Cluster maintenance settings updated successfully');
    } catch (error) {
        console.error('Error updating cluster maintenance settings:', error);
        throw error;
    }
};

// Delete Redshift cluster
const deleteCluster = async (clusterIdentifier) => {
    const redshiftClient = getClient(RedshiftClient);

    try {
        console.log('Initiating cluster deletion...');
        await redshiftClient.send(
            new DeleteClusterCommand({
                ClusterIdentifier: clusterIdentifier,
                SkipFinalClusterSnapshot: true
            })
        );

        console.log('Waiting for cluster to be deleted...');
        await waitForClusterStatus(redshiftClient, clusterIdentifier, 'deleted');
    } catch (error) {
        console.error('Error deleting cluster:', error);
        throw error;
    }
};

// Main function
const main = async () => {
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

        // Get VPC and subnet information
        const { vpcId, subnetId } = await getDefaultVpcAndSubnet();

        // Create non-compliant cluster
        clusterIdentifier = await createNonCompliantCluster(vpcId, subnetId);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 120 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 120000));

        // Optional: Make the cluster compliant
        // await makeCompliant(clusterIdentifier);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (clusterIdentifier) {
            console.log('\nStarting cleanup...');
            try {
                await deleteCluster(clusterIdentifier);
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
