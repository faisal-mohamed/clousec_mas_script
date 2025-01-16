const {
    ElastiCacheClient,
    CreateCacheClusterCommand,
    DeleteCacheClusterCommand,
    DescribeCacheClustersCommand,
    ModifyCacheClusterCommand,
    CreateReplicationGroupCommand,
    DeleteReplicationGroupCommand,
    DescribeReplicationGroupsCommand
} = require("@aws-sdk/client-elasticache");

require('dotenv').config();

// Initialize AWS client with temporary credentials
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

        return new ElastiCacheClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create Redis cluster with automatic backups disabled (non-compliant)
// Create Redis cluster with automatic backups disabled (non-compliant)
const createNonCompliantRedisCluster = async () => {
    const client = getClient();
    const replicationGroupId = `temp-redis-${Date.now()}`;
    const cacheClusterId = `${replicationGroupId}-001`;

    try {
        // Create replication group with non-compliant backup settings
        const params = {
            ReplicationGroupId: replicationGroupId,
            ReplicationGroupDescription: 'Temporary Redis cluster with backups disabled',
            NumCacheClusters: 1,
            CacheNodeType: 'cache.t3.micro',
            Engine: 'redis',
            EngineVersion: '7.0',
            Port: 6379,
            AutomaticFailoverEnabled: false,
            CacheParameterGroupName: 'default.redis7',
            SecurityGroupIds: [], // Will use default security group
            SnapshotRetentionLimit: 0, // Disable automatic backups (non-compliant)
            SnapshotWindow: '02:00-03:00', // Snapshot window
            PreferredMaintenanceWindow: 'sun:05:00-sun:06:00', // Maintenance window (different time)
            AutoMinorVersionUpgrade: true
        };

        console.log('Creating Redis replication group...');
        await client.send(new CreateReplicationGroupCommand(params));

        // Wait for cluster to be available
        await waitForReplicationGroupStatus(client, replicationGroupId, 'available');
        console.log('Redis cluster created successfully');

        return { replicationGroupId, cacheClusterId };
    } catch (error) {
        console.error('Error creating Redis cluster:', error);
        throw error;
    }
};


// Wait for replication group status
const waitForReplicationGroupStatus = async (client, replicationGroupId, targetStatus) => {
    while (true) {
        try {
            const response = await client.send(
                new DescribeReplicationGroupsCommand({
                    ReplicationGroupId: replicationGroupId
                })
            );

            const status = response.ReplicationGroups[0].Status;
            console.log(`Current replication group status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'ReplicationGroupNotFoundFault' && targetStatus === 'deleted') {
                console.log('Replication group deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Make Redis cluster compliant by enabling backups
const makeCompliant = async (replicationGroupId) => {
    const client = getClient();

    try {
        console.log('Enabling automatic backups...');
        const params = {
            ReplicationGroupId: replicationGroupId,
            SnapshotRetentionLimit: 7, // Enable 7-day backup retention
            SnapshotWindow: '05:00-06:00', // More appropriate backup window
            ApplyImmediately: true
        };

        await client.send(new ModifyCacheClusterCommand(params));
        await waitForReplicationGroupStatus(client, replicationGroupId, 'available');
        console.log('Automatic backups enabled successfully');
    } catch (error) {
        console.error('Error enabling automatic backups:', error);
        throw error;
    }
};

// Delete Redis cluster
const deleteRedisCluster = async (replicationGroupId) => {
    const client = getClient();

    try {
        console.log('Deleting Redis replication group...');
        await client.send(
            new DeleteReplicationGroupCommand({
                ReplicationGroupId: replicationGroupId,
                RetainPrimaryCluster: false,
                FinalSnapshotIdentifier: `final-snapshot-${Date.now()}`
            })
        );

        // Wait for deletion to complete
        await waitForReplicationGroupStatus(client, replicationGroupId, 'deleted');
    } catch (error) {
        console.error('Error deleting Redis cluster:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let replicationGroupId = null;
    let cacheClusterId = null;

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

        // Create non-compliant Redis cluster
        const clusterInfo = await createNonCompliantRedisCluster();
        replicationGroupId = clusterInfo.replicationGroupId;
        cacheClusterId = clusterInfo.cacheClusterId;

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the cluster compliant
        // await makeCompliant(replicationGroupId);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (replicationGroupId) {
            console.log('\nStarting cleanup...');
            try {
                await deleteRedisCluster(replicationGroupId);
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
