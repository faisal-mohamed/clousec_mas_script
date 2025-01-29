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

        // Group subnets by AZ
        const subnetsByAZ = {};
        response.Subnets.forEach(subnet => {
            if (subnet.AvailableIpAddressCount >= 10) {
                if (!subnetsByAZ[subnet.AvailabilityZone]) {
                    subnetsByAZ[subnet.AvailabilityZone] = [];
                }
                subnetsByAZ[subnet.AvailabilityZone].push(subnet);
            }
        });

        // Get available AZs
        const availableAZs = Object.keys(subnetsByAZ);
        if (availableAZs.length < 2) {
            throw new Error(`Not enough AZs with available subnets. Found ${availableAZs.length} AZs, need at least 2.`);
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
            AvailableIPs: subnet.AvailableIpAddressCount,
            AZ: subnet.AvailabilityZone
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
            SubnetIds: subnetIds,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        return subnetGroupName;
    } catch (error) {
        console.error('Error creating DB subnet group:', error.message);
        throw error;
    }
}

// Previous imports and client initialization remain the same...

async function createRDSWithoutAutoUpgrade(vpcId) {
    try {
        const subnetIds = await getAvailableSubnets(vpcId);
        const timestamp = Date.now().toString().slice(-4);
        const instanceIdentifier = `rds-no-auto-upgrade-${timestamp}`;

        console.log('Creating RDS instance with automatic minor version upgrade disabled...');
        const params = {
            DBInstanceIdentifier: instanceIdentifier,
            Engine: 'mysql',
            //EngineVersion: '8.0.28',
            DBInstanceClass: 'db.t3.micro',
            AllocatedStorage: 20,
            MasterUsername: 'admin',
            MasterUserPassword: 'Admin123#$%', // Modified password to meet RDS requirements
            PubliclyAccessible: false,
            AutoMinorVersionUpgrade: false,
            BackupRetentionPeriod: 0,
            DeletionProtection: false,
            CopyTagsToSnapshot: true,
            DBSubnetGroupName: await createDBSubnetGroup(instanceIdentifier, subnetIds),
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'AutoUpgrade',
                    Value: 'disabled'
                }
            ],
            MonitoringInterval: 0,
            EnablePerformanceInsights: false,
            StorageType: 'gp2'
        };

        const createResponse = await rdsClient.send(new CreateDBInstanceCommand(params));
        console.log('\nRDS Instance Creation Initiated:', {
            DBInstanceIdentifier: instanceIdentifier,
            AutoMinorVersionUpgrade: false,
            MasterUsername: 'admin',
            MasterPassword: 'Admin123#$%', // Updated password in logs
            SubnetIds: subnetIds
        });

        await waitForInstanceAvailable(instanceIdentifier);
        return createResponse.DBInstance;
    } catch (error) {
        console.error('Error creating RDS instance:', error.message);
        throw error;
    }
}

// Rest of the code remains the same...


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
const vpcId = process.env.VPC_ID || 'vpc-xxxxxxxx';
createRDSWithoutAutoUpgrade(vpcId)
    .then(instance => {
        console.log('\nRDS Instance Details:', {
            Identifier: instance.DBInstanceIdentifier,
            Engine: `${instance.Engine} ${instance.EngineVersion}`,
            Class: instance.DBInstanceClass,
            Storage: `${instance.AllocatedStorage} GB`,
            Endpoint: instance.Endpoint,
            AutoMinorVersionUpgrade: instance.AutoMinorVersionUpgrade,
            Username: 'admin',
            Password: 'Admin123!@#',
            SubnetGroup: instance.DBSubnetGroup
        });

        console.log('\nConfiguration Status:', {
            AutomaticMinorUpgrades: 'Disabled',
            BackupRetention: '0 days',
            DeletionProtection: 'Disabled',
            EnhancedMonitoring: 'Disabled',
            PerformanceInsights: 'Disabled'
        });

        console.log('\nSecurity Warning:', {
            warning: [
                'Credentials are hardcoded in the script',
                'Automatic minor version upgrades are disabled'
            ],
            risks: [
                'Password visible in source code',
                'Security patches not automatically applied',
                'Credentials might be exposed in logs or version control'
            ],
            recommendations: [
                'Use AWS Secrets Manager for credentials',
                'Plan manual updates during maintenance windows',
                'Monitor security bulletins for your engine version',
                'Rotate database passwords regularly'
            ]
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
