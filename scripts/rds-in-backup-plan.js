const {
    RDSClient,
    CreateDBInstanceCommand,
    DescribeDBInstancesCommand,
    CreateDBSubnetGroupCommand
} = require("@aws-sdk/client-rds");
const {
    EC2Client,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");
require('dotenv').config();

// Initialize clients
const rdsClient = new RDSClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const ec2Client = new EC2Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

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

        console.log('\nAll Available Subnets:', response.Subnets.map(subnet => ({
            SubnetId: subnet.SubnetId,
            AvailabilityZone: subnet.AvailabilityZone,
            AvailableIPs: subnet.AvailableIpAddressCount,
            CidrBlock: subnet.CidrBlock
        })));

        // Group subnets by AZ with minimal IP requirement
        const subnetsByAZ = {};
        response.Subnets.forEach(subnet => {
            if (subnet.AvailableIpAddressCount >= 3) {  // Minimal IP requirement
                if (!subnetsByAZ[subnet.AvailabilityZone]) {
                    subnetsByAZ[subnet.AvailabilityZone] = [];
                }
                subnetsByAZ[subnet.AvailabilityZone].push(subnet);
            }
        });

        // Get available AZs
        const availableAZs = Object.keys(subnetsByAZ);
        if (availableAZs.length < 2) {
            throw new Error(`Need subnets in at least 2 AZs. Found only ${availableAZs.length} AZ(s) with sufficient IPs.`);
        }

        // Select best subnet from each AZ
        const selectedSubnets = [];
        for (const az of availableAZs.slice(0, 2)) {
            const bestSubnet = subnetsByAZ[az]
                .sort((a, b) => b.AvailableIpAddressCount - a.AvailableIpAddressCount)[0];
            selectedSubnets.push(bestSubnet);
        }

        console.log('\nSelected Subnets:', selectedSubnets.map(subnet => ({
            SubnetId: subnet.SubnetId,
            AvailabilityZone: subnet.AvailabilityZone,
            AvailableIPs: subnet.AvailableIpAddressCount
        })));

        return selectedSubnets.map(subnet => subnet.SubnetId);
    } catch (error) {
        console.error('Error getting subnets:', error.message);
        throw error;
    }
}

async function createDBSubnetGroup(identifier, subnetIds) {
    try {
        const subnetGroupName = `subnet-group-${identifier}`;
        
        await rdsClient.send(new CreateDBSubnetGroupCommand({
            DBSubnetGroupName: subnetGroupName,
            DBSubnetGroupDescription: `Subnet group for ${identifier}`,
            SubnetIds: subnetIds
        }));

        return subnetGroupName;
    } catch (error) {
        console.error('Error creating DB subnet group:', error.message);
        throw error;
    }
}

async function createMinimalRDSInstance(vpcId) {
    try {
        const subnetIds = await getAvailableSubnets(vpcId);
        const timestamp = Date.now().toString().slice(-4);
        const instanceIdentifier = `rds-minimal-${timestamp}`;

        console.log('Creating minimal RDS instance...');
        const params = {
            DBInstanceIdentifier: instanceIdentifier,
            Engine: 'mysql',                    // MySQL is generally cheaper than PostgreSQL
            DBInstanceClass: 'db.t3.micro',     // Smallest instance class
            AllocatedStorage: 20,               // Minimum storage
            MasterUsername: 'admin',
            MasterUserPassword: 'Admin123#$%',
            PubliclyAccessible: false,          // Private access only
            BackupRetentionPeriod: 0,          // No automated backups
            DeletionProtection: false,
            MultiAZ: false,                     // Single AZ deployment
            AutoMinorVersionUpgrade: false,     // No automatic upgrades
            CopyTagsToSnapshot: false,
            DBSubnetGroupName: await createDBSubnetGroup(instanceIdentifier, subnetIds),
            MonitoringInterval: 0,              // Disable enhanced monitoring
            EnablePerformanceInsights: false,   // Disable performance insights
            StorageType: 'gp2',                // General Purpose SSD
            MaxAllocatedStorage: 20,            // Disable storage autoscaling
        };

        const createResponse = await rdsClient.send(new CreateDBInstanceCommand(params));
        console.log('\nRDS Instance Creation Initiated:', {
            DBInstanceIdentifier: instanceIdentifier,
            InstanceClass: 'db.t3.micro',
            Storage: '20 GB',
            MultiAZ: false,
            Backups: 'Disabled'
        });

        await waitForInstanceAvailable(instanceIdentifier);
        return createResponse.DBInstance;
    } catch (error) {
        console.error('Error creating RDS instance:', error.message);
        throw error;
    }
}

async function waitForInstanceAvailable(instanceIdentifier) {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const response = await rdsClient.send(
                new DescribeDBInstancesCommand({
                    DBInstanceIdentifier: instanceIdentifier
                })
            );

            const status = response.DBInstances[0].DBInstanceStatus;
            console.log(`Instance status check ${attempts + 1}/${maxAttempts}: ${status}`);

            if (status === 'available') {
                console.log('RDS instance is now available');
                return response.DBInstances[0];
            }

            if (status === 'failed') {
                throw new Error('RDS instance creation failed');
            }
        } catch (error) {
            console.error('Error checking instance status:', error.message);
            throw error;
        }

        await new Promise(resolve => setTimeout(resolve, 30000));
        attempts++;
    }

    throw new Error('Timed out waiting for RDS instance to become available');
}

// Execute the creation with VPC ID
const vpcId = `${process.env.VPC_ID}`; // Replace with your VPC ID
createMinimalRDSInstance(vpcId)
    .then(instance => {
        console.log('\nRDS Instance Details:', {
            Identifier: instance.DBInstanceIdentifier,
            Engine: instance.Engine,
            Class: instance.DBInstanceClass,
            Storage: `${instance.AllocatedStorage} GB`,
            MultiAZ: instance.MultiAZ,
            Endpoint: instance.Endpoint,
            Username: 'admin',
            Password: 'Admin123#$%'
        });

        console.log('\nCost Optimization Settings:', {
            InstanceType: 'Minimum (db.t3.micro)',
            Storage: 'Minimum (20 GB)',
            MultiAZ: 'Disabled',
            Backups: 'Disabled',
            Monitoring: 'Basic only',
            AutoScaling: 'Disabled',
            PerformanceInsights: 'Disabled'
        });

        console.log('\nWarning:', {
            costSavingMeasures: [
                'Minimal instance size used',
                'No backup retention',
                'No Multi-AZ deployment',
                'No enhanced monitoring',
                'No performance insights'
            ],
            risks: [
                'Limited performance capacity',
                'No automated backup/recovery',
                'No high availability',
                'Limited monitoring capabilities'
            ],
            recommendations: [
                'Monitor performance metrics',
                'Implement manual backup strategy',
                'Plan for potential scaling needs',
                'Consider security implications'
            ]
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
