const {
    RedshiftClient,
    CreateClusterCommand,
    DescribeClustersCommand,
    CreateClusterSubnetGroupCommand
} = require("@aws-sdk/client-redshift");
const {
    EC2Client,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");
require('dotenv').config();

// Initialize clients
const redshiftClient = new RedshiftClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const ec2Client = new EC2Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'ap-southeast-1'
});

const commonTags = [
    {
        Key: 'simulation-mas',
        Value: 'true'
    }
];

async function getAvailableSubnets(vpcId) {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId]
                }
            ]
        }));

        const subnetsByAZ = {};
        response.Subnets.forEach(subnet => {
            if (subnet.AvailableIpAddressCount >= 3) {
                if (!subnetsByAZ[subnet.AvailabilityZone]) {
                    subnetsByAZ[subnet.AvailabilityZone] = [];
                }
                subnetsByAZ[subnet.AvailabilityZone].push(subnet);
            }
        });

        const availableAZs = Object.keys(subnetsByAZ);
        if (availableAZs.length < 2) {
            throw new Error(`Need subnets in at least 2 AZs. Found only ${availableAZs.length} AZ(s).`);
        }

        const selectedSubnets = [];
        for (const az of availableAZs.slice(0, 2)) {
            const bestSubnet = subnetsByAZ[az]
                .sort((a, b) => b.AvailableIpAddressCount - a.AvailableIpAddressCount)[0];
            selectedSubnets.push(bestSubnet);
        }

        return selectedSubnets.map(subnet => subnet.SubnetId);
    } catch (error) {
        console.error('Error getting subnets:', error.message);
        throw error;
    }
}

async function createClusterSubnetGroup(subnetIds) {
    try {
        const timestamp = Date.now().toString().slice(-4);
        const subnetGroupName = `redshift-subnet-group-${timestamp}`;

        await redshiftClient.send(new CreateClusterSubnetGroupCommand({
            ClusterSubnetGroupName: subnetGroupName,
            Description: 'Subnet group for Redshift cluster without backups',
            SubnetIds: subnetIds,
            Tags: commonTags
        }));

        return subnetGroupName;
    } catch (error) {
        console.error('Error creating cluster subnet group:', error.message);
        throw error;
    }
}

async function createRedshiftWithoutBackup(vpcId) {
    try {
        const subnetIds = await getAvailableSubnets(vpcId);
        const timestamp = Date.now().toString().slice(-4);
        const clusterIdentifier = `redshift-no-backup-${timestamp}`;

        console.log('Creating Redshift cluster without backups...');
        const params = {
            ClusterIdentifier: clusterIdentifier,
            NodeType: 'dc2.large',
            MasterUsername: 'admin',
            MasterUserPassword: 'Admin123#$%',
            NumberOfNodes: 2,
            ClusterSubnetGroupName: await createClusterSubnetGroup(subnetIds),
            // Disable automated snapshots
            AutomatedSnapshotRetentionPeriod: 0,
            // Disable manual snapshot retention
            ManualSnapshotRetentionPeriod: 1,
            // Additional settings
            DBName: 'dev',
            Port: 5439,
            AllowVersionUpgrade: false,
            PubliclyAccessible: false,
            Encrypted: true,
            // Maintenance settings
            PreferredMaintenanceWindow: 'sun:05:00-sun:06:00',
            // Tags
            Tags: [
                ...commonTags,
                {
                    Key: 'Backups',
                    Value: 'disabled'
                }
            ]
        };

        const createResponse = await redshiftClient.send(new CreateClusterCommand(params));
        console.log('\nRedshift Cluster Creation Initiated:', {
            ClusterIdentifier: clusterIdentifier,
            AutomatedSnapshotRetention: 0,
            ManualSnapshotRetention: 1,
            SubnetIds: subnetIds,
            MasterUsername: 'admin',
            MasterPassword: 'Admin123#$%',
            Tags: params.Tags
        });

        await waitForClusterAvailable(clusterIdentifier);
        return createResponse.Cluster;
    } catch (error) {
        console.error('Error creating Redshift cluster:', error.message);
        throw error;
    }
}

async function waitForClusterAvailable(clusterIdentifier) {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const response = await redshiftClient.send(
                new DescribeClustersCommand({
                    ClusterIdentifier: clusterIdentifier
                })
            );

            const status = response.Clusters[0].ClusterStatus;
            console.log(`Cluster status check ${attempts + 1}/${maxAttempts}: ${status}`);

            if (status === 'available') {
                console.log('Redshift cluster is now available');
                return response.Clusters[0];
            }
        } catch (error) {
            console.error('Error checking cluster status:', error.message);
            throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 30000));
        attempts++;
    }

    throw new Error('Timed out waiting for Redshift cluster to become available');
}

// Get VPC ID from environment variables
const vpcId = process.env.VPC_ID;
if (!vpcId) {
    console.error('Error: VPC_ID environment variable is required');
    process.exit(1);
}

// Execute the creation
createRedshiftWithoutBackup(vpcId)
    .then(cluster => {
        console.log('\nRedshift Cluster Details:', {
            Identifier: cluster.ClusterIdentifier,
            Status: cluster.ClusterStatus,
            NodeType: cluster.NodeType,
            NumberOfNodes: cluster.NumberOfNodes,
            AutomatedSnapshotRetention: cluster.AutomatedSnapshotRetentionPeriod,
            ManualSnapshotRetention: cluster.ManualSnapshotRetentionPeriod,
            Endpoint: cluster.Endpoint,
            Username: 'admin',
            Password: 'Admin123#$%',
            Tags: cluster.Tags
        });

        console.log('\nBackup Configuration:', {
            AutomatedSnapshots: 'Disabled',
            SnapshotRetention: '0 days',
            ManualSnapshotRetention: '1 day',
            BackupWindow: 'None',
            AutomatedBackups: 'Disabled'
        });

        console.log('\nSecurity Warning:', {
            warnings: [
                'Automated snapshots are disabled',
                'No backup retention period',
                'No disaster recovery capability',
                'No point-in-time recovery'
            ],
            risks: [
                'Data loss in case of failure',
                'No recovery points available',
                'Extended downtime possible',
                'Business continuity issues'
            ],
            recommendations: [
                'Enable automated snapshots',
                'Set appropriate retention period',
                'Configure backup window',
                'Implement disaster recovery plan'
            ]
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
