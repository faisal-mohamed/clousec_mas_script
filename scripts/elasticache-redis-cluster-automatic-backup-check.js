const {
    ElastiCacheClient,
    CreateCacheClusterCommand,
    DescribeCacheClustersCommand,
    CreateCacheSubnetGroupCommand
} = require("@aws-sdk/client-elasticache");
const {
    EC2Client,
    DescribeSubnetsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");
require('dotenv').config();

// Initialize clients
const elasticacheClient = new ElastiCacheClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

const ec2Client = new EC2Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

async function getSubnetsFromVpc() {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [process.env.VPC_ID]
                }
            ]
        }));

        if (response.Subnets.length === 0) {
            throw new Error('No subnets found in the specified VPC');
        }

        // Return at least two subnet IDs from different AZs if available
        const subnets = response.Subnets;
        const uniqueAZSubnets = [];
        const seenAZs = new Set();

        for (const subnet of subnets) {
            if (!seenAZs.has(subnet.AvailabilityZone)) {
                uniqueAZSubnets.push(subnet.SubnetId);
                seenAZs.add(subnet.AvailabilityZone);
                if (uniqueAZSubnets.length >= 2) break;
            }
        }

        return uniqueAZSubnets;
    } catch (error) {
        console.error('Error getting subnets:', error);
        throw error;
    }
}

async function createCacheSubnetGroup(subnetIds) {
    try {
        const subnetGroupName = `redis-subnet-group-${Date.now()}`;
        
        const params = {
            CacheSubnetGroupName: subnetGroupName,
            CacheSubnetGroupDescription: 'Subnet group for Redis cluster',
            SubnetIds: subnetIds,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'Name',
                    Value: subnetGroupName
                }
            ]
        };

        await elasticacheClient.send(new CreateCacheSubnetGroupCommand(params));
        console.log('Created cache subnet group:', subnetGroupName);
        return subnetGroupName;
    } catch (error) {
        console.error('Error creating cache subnet group:', error);
        throw error;
    }
}

async function createSecurityGroup() {
    try {
        const createSgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: `redis-sg-${Date.now()}`,
            Description: 'Security group for Redis cluster',
            VpcId: process.env.VPC_ID,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [
                    {
                        Key: 'simulation-mas',
                        Value: 'true'
                    },
                    {
                        Key: 'Name',
                        Value: 'redis-security-group'
                    }
                ]
            }]
        }));

        const sgId = createSgResponse.GroupId;

        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgId,
            IpProtocol: 'tcp',
            FromPort: 6379,
            ToPort: 6379,
            CidrIp: '0.0.0.0/0'  // Note: In production, restrict this to specific IP ranges
        }));

        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
}

async function createRedisClusterWithoutBackup() {
    try {
        const clusterId = `redis-no-backup-${Date.now()}`;
        const securityGroupId = await createSecurityGroup();
        
        // Get subnets and create subnet group
        const subnetIds = await getSubnetsFromVpc();
        const subnetGroupName = await createCacheSubnetGroup(subnetIds);
        
        const params = {
            CacheClusterId: clusterId,
            Engine: 'redis',
            EngineVersion: '7.0',
            CacheNodeType: 'cache.t3.micro',
            NumCacheNodes: 1,
            Port: 6379,
            PreferredMaintenanceWindow: 'sun:05:00-sun:06:00',
            SnapshotRetentionLimit: 0,  // Disable automatic backups
            AutoMinorVersionUpgrade: true,
            VpcSecurityGroupIds: [securityGroupId],
            CacheSubnetGroupName: subnetGroupName,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'Name',
                    Value: clusterId
                },
                {
                    Key: 'CreatedBy',
                    Value: 'automation'
                }
            ]
        };

        const command = new CreateCacheClusterCommand(params);
        const response = await elasticacheClient.send(command);

        console.log('Redis cluster creation initiated:', {
            ClusterId: response.CacheCluster.CacheClusterId,
            Status: response.CacheCluster.CacheClusterStatus,
            NodeType: response.CacheCluster.CacheNodeType,
            Engine: response.CacheCluster.Engine,
            EngineVersion: response.CacheCluster.EngineVersion,
            VpcId: process.env.VPC_ID,
            SecurityGroupId: securityGroupId,
            SubnetGroupName: subnetGroupName,
            AutomaticBackup: 'Disabled'
        });

        await waitForClusterAvailable(clusterId);

        return clusterId;

    } catch (error) {
        console.error('Error creating Redis cluster:', error);
        throw error;
    }
}

async function waitForClusterAvailable(clusterId) {
    console.log('Waiting for Redis cluster to become available...');
    
    while (true) {
        try {
            const command = new DescribeCacheClustersCommand({
                CacheClusterId: clusterId
            });
            
            const response = await elasticacheClient.send(command);
            const cluster = response.CacheClusters[0];
            
            if (cluster.CacheClusterStatus === 'available') {
                console.log('Redis cluster is now available');
                console.log('Configuration:', {
                    ClusterId: cluster.CacheClusterId,
                    Status: cluster.CacheClusterStatus,
                    EngineVersion: cluster.EngineVersion,
                    CacheNodeType: cluster.CacheNodeType,
                    VpcId: process.env.VPC_ID
                });
                break;
            }
            
            console.log(`Current status: ${cluster.CacheClusterStatus}`);
            await new Promise(resolve => setTimeout(resolve, 30000));
            
        } catch (error) {
            console.error('Error checking cluster status:', error);
            throw error;
        }
    }
}

async function main() {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_REGION',
            'VPC_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        await createRedisClusterWithoutBackup();

    } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
    }
}

// Execute if running directly
if (require.main === module) {
    main();
}

module.exports = {
    createRedisClusterWithoutBackup
};
