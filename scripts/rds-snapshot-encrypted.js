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
            SubnetIds: subnetIds,
            Tags: commonTags
        }));

        return subnetGroupName;
    } catch (error) {
        console.error('Error creating DB subnet group:', error.message);
        throw error;
    }
}

async function createUnencryptedRDSInstance(vpcId) {
    try {
        const subnetIds = await getAvailableSubnets(vpcId);
        const timestamp = Date.now().toString().slice(-4);
        const instanceIdentifier = `rds-unencrypted-${timestamp}`;

        console.log('Creating RDS instance with unencrypted snapshots...');
        const params = {
            DBInstanceIdentifier: instanceIdentifier,
            Engine: 'mysql',
            //EngineVersion: '8.0.28',
            DBInstanceClass: 'db.t3.micro',
            AllocatedStorage: 20,
            MasterUsername: 'admin',
            MasterUserPassword: 'Admin123#$%',
            PubliclyAccessible: false,
            StorageEncrypted: false,           // Explicitly disable storage encryption
            DBSubnetGroupName: await createDBSubnetGroup(instanceIdentifier, subnetIds),
            Tags: [
                ...commonTags,
                {
                    Key: 'Encryption',
                    Value: 'disabled'
                }
            ],
            BackupRetentionPeriod: 1,          // Enable backups to create snapshots
            CopyTagsToSnapshot: true,          // Copy tags to unencrypted snapshots
            DeletionProtection: false,
            AutoMinorVersionUpgrade: false,
            MonitoringInterval: 0,
            EnablePerformanceInsights: false,
            MultiAZ: false
        };

        const createResponse = await rdsClient.send(new CreateDBInstanceCommand(params));
        console.log('\nRDS Instance Creation Initiated:', {
            DBInstanceIdentifier: instanceIdentifier,
            StorageEncrypted: false,
            SubnetIds: subnetIds,
            MasterUsername: 'admin',
            MasterPassword: 'Admin123#$%',
            Tags: params.Tags
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

// Get VPC ID from environment variables
const vpcId = process.env.VPC_ID;
if (!vpcId) {
    console.error('Error: VPC_ID environment variable is required');
    process.exit(1);
}

// Execute the creation
createUnencryptedRDSInstance(vpcId)
    .then(instance => {
        console.log('\nRDS Instance Details:', {
            Identifier: instance.DBInstanceIdentifier,
            Engine: `${instance.Engine} ${instance.EngineVersion}`,
            Class: instance.DBInstanceClass,
            Storage: `${instance.AllocatedStorage} GB`,
            StorageEncrypted: instance.StorageEncrypted,
            Endpoint: instance.Endpoint,
            Username: 'admin',
            Password: 'Admin123#$%',
            Tags: instance.TagList
        });

        console.log('\nEncryption Configuration:', {
            StorageEncryption: 'Disabled',
            SnapshotEncryption: 'Disabled',
            AutomatedSnapshots: 'Unencrypted',
            ManualSnapshots: 'Will be unencrypted',
            BackupRetention: '1 day'
        });

        console.log('\nSecurity Warning:', {
            warning: [
                'Storage is not encrypted',
                'Snapshots will not be encrypted',
                'Backups will not be encrypted',
                'Data at rest is not protected'
            ],
            risks: [
                'Sensitive data exposure',
                'Non-compliance with security standards',
                'Unprotected backup data',
                'Unencrypted snapshot sharing',
                'Data privacy concerns'
            ],
            recommendations: [
                'Enable storage encryption',
                'Use AWS KMS for encryption',
                'Encrypt existing snapshots',
                'Implement encryption at rest',
                'Follow security best practices'
            ]
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
