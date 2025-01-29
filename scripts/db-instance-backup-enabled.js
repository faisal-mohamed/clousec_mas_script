const {
    RDSClient,
    CreateDBInstanceCommand,
    DescribeDBInstancesCommand,
    CreateDBSubnetGroupCommand
} = require("@aws-sdk/client-rds");

const {
    EC2Client,
    DescribeVpcsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
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

async function setupVPCResources(vpcId) {
    try {
        // Verify VPC exists
        const vpcResponse = await ec2Client.send(new DescribeVpcsCommand({
            VpcIds: [vpcId]
        }));

        // Get subnets in the VPC
        const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
        }));

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 1) {
            throw new Error('No subnets found in the specified VPC');
        }

        // Create security group for RDS
        const sgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: `rds-sg-${Date.now()}`,
            Description: 'Security group for RDS instance',
            VpcId: vpcId,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [
                    { Key: 'Name', Value: 'RDS Security Group' },
                    { Key: 'simulation-mas', Value: 'true' }
                ]
            }]
        }));

        // Add inbound rule for MySQL
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgResponse.GroupId,
            IpProtocol: 'tcp',
            FromPort: 3306,
            ToPort: 3306,
            CidrIp: '0.0.0.0/0'
        }));

        // Create DB Subnet Group
        const subnetGroupName = `subnet-group-${Date.now()}`;
        await rdsClient.send(new CreateDBSubnetGroupCommand({
            DBSubnetGroupName: subnetGroupName,
            DBSubnetGroupDescription: 'Subnet group for RDS instance',
            SubnetIds: subnetResponse.Subnets.map(subnet => subnet.SubnetId),
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        console.log(`Created DB Subnet Group: ${subnetGroupName}`);

        return {
            subnetGroupName: subnetGroupName,
            securityGroupId: sgResponse.GroupId
        };
    } catch (error) {
        console.error('Error setting up VPC resources:', error);
        throw error;
    }
}

async function waitForDBInstance(dbInstanceIdentifier) {
    console.log('Waiting for DB instance to be available...');
    
    while (true) {
        try {
            const response = await rdsClient.send(new DescribeDBInstancesCommand({
                DBInstanceIdentifier: dbInstanceIdentifier
            }));

            const instance = response.DBInstances[0];
            const status = instance.DBInstanceStatus;

            console.log(`Current status: ${status}`);

            if (status === 'available') {
                return instance;
            } else if (status === 'failed' || status === 'incompatible-parameters' || status === 'incompatible-restore') {
                throw new Error(`DB instance creation failed with status: ${status}`);
            }

            // Wait for 30 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (error) {
            console.error('Error checking DB instance status:', error);
            throw error;
        }
    }
}

async function createNonCompliantDBInstance(vpcId) {
    const timestamp = Date.now();
    const dbInstanceIdentifier = `no-backup-db-${timestamp}`;

    try {
        // Setup VPC resources
        console.log('Setting up VPC resources...');
        const vpcResources = await setupVPCResources(vpcId);
        console.log('VPC resources created successfully');

        // Create DB instance with minimal configuration and no backups
        const createParams = {
            DBInstanceIdentifier: dbInstanceIdentifier,
            Engine: 'mysql',
            DBInstanceClass: 'db.t3.micro',
            AllocatedStorage: 20,
            MasterUsername: 'admin',
            MasterUserPassword: 'Password123!',
            PubliclyAccessible: false,
            
            // VPC Configuration
            VpcSecurityGroupIds: [vpcResources.securityGroupId],
            DBSubnetGroupName: vpcResources.subnetGroupName,
            
            // Non-compliant backup settings
            BackupRetentionPeriod: 0,
            PreferredBackupWindow: null,
            CopyTagsToSnapshot: false,
            DeletionProtection: false,

            // Additional cost-saving settings
            MultiAZ: false,
            StorageType: 'gp2',
            AutoMinorVersionUpgrade: false,
            Port: 3306,

            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'backup-status',
                    Value: 'disabled'
                }
            ]
        };

        // Create the DB instance
        console.log('Creating DB instance...');
        const createResponse = await rdsClient.send(new CreateDBInstanceCommand(createParams));
        
        console.log('\nDB Instance creation initiated:');
        console.log(`Instance Identifier: ${createResponse.DBInstance.DBInstanceIdentifier}`);
        console.log(`ARN: ${createResponse.DBInstance.DBInstanceArn}`);

        // Wait for the DB instance to be available
        const dbInstance = await waitForDBInstance(dbInstanceIdentifier);

        console.log('\nDB Instance Details:');
        console.log(`Identifier: ${dbInstance.DBInstanceIdentifier}`);
        console.log(`ARN: ${dbInstance.DBInstanceArn}`);
        console.log(`Status: ${dbInstance.DBInstanceStatus}`);
        console.log(`Engine: ${dbInstance.Engine} ${dbInstance.EngineVersion}`);
        console.log(`Instance Class: ${dbInstance.DBInstanceClass}`);
        console.log(`Storage: ${dbInstance.AllocatedStorage} GB`);
        console.log(`Endpoint: ${dbInstance.Endpoint?.Address}`);
        console.log(`Port: ${dbInstance.Endpoint?.Port}`);
        console.log(`VPC: ${vpcId}`);
        console.log(`Security Group: ${vpcResources.securityGroupId}`);

        console.log('\nNon-compliant configuration:');
        console.log('- Automated backups: Disabled');
        console.log('- Backup retention period: 0 days');
        console.log('- Preferred backup window: Not configured');
        console.log('- Copy tags to snapshots: Disabled');
        console.log('- Deletion protection: Disabled');
        console.log('- Multi-AZ: Disabled');

        return {
            dbInstanceIdentifier: dbInstance.DBInstanceIdentifier,
            dbInstanceArn: dbInstance.DBInstanceArn,
            securityGroupId: vpcResources.securityGroupId,
            endpoint: dbInstance.Endpoint
        };

    } catch (error) {
        console.error('Error creating DB instance:', error);
        throw error;
    }
}

// Execute the script
async function main() {
    try {
        // Validate required environment variables
        if (!process.env.AWS_ACCESS_KEY_ID || 
            !process.env.AWS_SECRET_ACCESS_KEY || 
            !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }

        const vpcId = process.env.VPC_ID;
        if (!vpcId) {
            throw new Error('VPC_ID environment variable is required');
        }

        const result = await createNonCompliantDBInstance(vpcId);
        
        if (!result || !result.dbInstanceIdentifier) {
            throw new Error('Failed to create DB instance: No instance identifier returned');
        }

        console.log('\nDB Instance created and available:');
        console.log(`Instance Identifier: ${result.dbInstanceIdentifier}`);
        console.log(`Instance ARN: ${result.dbInstanceArn}`);
        console.log(`Security Group ID: ${result.securityGroupId}`);
        console.log(`Endpoint: ${result.endpoint?.Address}`);
        console.log(`Port: ${result.endpoint?.Port}`);

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
