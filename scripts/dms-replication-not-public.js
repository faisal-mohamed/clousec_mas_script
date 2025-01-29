const {
    DatabaseMigrationServiceClient,
    CreateReplicationInstanceCommand,
    DescribeReplicationInstancesCommand,
    CreateReplicationSubnetGroupCommand
} = require("@aws-sdk/client-database-migration-service");

const {
    EC2Client,
    DescribeVpcsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize clients
const dmsClient = new DatabaseMigrationServiceClient({
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

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
            throw new Error('Need at least 2 subnets in the VPC for DMS');
        }

        // Create security group for DMS
        const sgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: `dms-sg-${Date.now()}`,
            Description: 'Security group for DMS replication instance',
            VpcId: vpcId,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [
                    { Key: 'Name', Value: 'DMS Security Group' },
                    { Key: 'simulation-mas', Value: 'true' }
                ]
            }]
        }));

        // Add inbound rules for DMS
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgResponse.GroupId,
            IpProtocol: 'tcp',
            FromPort: 443,
            ToPort: 443,
            CidrIp: '0.0.0.0/0'
        }));

        // Create replication subnet group
        const subnetGroupIdentifier = `dms-subnet-group-${Date.now()}`;
        await dmsClient.send(new CreateReplicationSubnetGroupCommand({
            ReplicationSubnetGroupIdentifier: subnetGroupIdentifier,
            ReplicationSubnetGroupDescription: 'Subnet group for DMS replication instance',
            SubnetIds: subnetResponse.Subnets.slice(0, 2).map(subnet => subnet.SubnetId),
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        console.log(`Created replication subnet group: ${subnetGroupIdentifier}`);

        return {
            subnetGroupIdentifier,
            securityGroupId: sgResponse.GroupId
        };
    } catch (error) {
        console.error('Error setting up VPC resources:', error);
        throw error;
    }
}

async function waitForReplicationInstance(replicationInstanceArn) {
    console.log('Waiting for replication instance to be available...');
    
    while (true) {
        try {
            const response = await dmsClient.send(new DescribeReplicationInstancesCommand({
                Filters: [
                    {
                        Name: 'replication-instance-arn',
                        Values: [replicationInstanceArn]
                    }
                ]
            }));

            if (!response.ReplicationInstances || response.ReplicationInstances.length === 0) {
                throw new Error('Replication instance not found');
            }

            const instance = response.ReplicationInstances[0];
            const status = instance.ReplicationInstanceStatus;

            console.log(`Current status: ${status}`);

            if (status === 'available') {
                return instance;
            } else if (status === 'failed') {
                throw new Error('Replication instance creation failed');
            }

            // Wait for 30 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (error) {
            console.error('Error checking replication instance status:', error);
            throw error;
        }
    }
}

async function createPublicReplicationInstance(vpcId) {
    try {
        // Setup VPC resources
        console.log('Setting up VPC resources...');
        const vpcResources = await setupVPCResources(vpcId);
        console.log('VPC resources created successfully');

        const timestamp = Date.now();
        const replicationInstanceIdentifier = `public-dms-instance-${timestamp}`;

        // Create replication instance
        const createParams = {
            ReplicationInstanceIdentifier: replicationInstanceIdentifier,
            ReplicationInstanceClass: 'dms.t3.micro',
            AllocatedStorage: 20,
            VpcSecurityGroupIds: [vpcResources.securityGroupId],
            ReplicationSubnetGroupIdentifier: vpcResources.subnetGroupIdentifier,
            
            // Non-compliant setting: making it publicly accessible
            PubliclyAccessible: true,
            
            // Additional settings
            MultiAZ: false,
            AutoMinorVersionUpgrade: true,
            EngineVersion: '3.4.7',
            PreferredMaintenanceWindow: 'sun:10:30-sun:14:30',

            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        };

        console.log('Creating replication instance...');
        const createResponse = await dmsClient.send(
            new CreateReplicationInstanceCommand(createParams)
        );

        console.log('\nReplication instance creation initiated:');
        console.log(`Instance Identifier: ${createResponse.ReplicationInstance.ReplicationInstanceIdentifier}`);
        console.log(`ARN: ${createResponse.ReplicationInstance.ReplicationInstanceArn}`);

        // Wait for the instance to be available
        const instance = await waitForReplicationInstance(createResponse.ReplicationInstance.ReplicationInstanceArn);

        console.log('\nReplication Instance Details:');
        console.log(`Identifier: ${instance.ReplicationInstanceIdentifier}`);
        console.log(`ARN: ${instance.ReplicationInstanceArn}`);
        console.log(`Status: ${instance.ReplicationInstanceStatus}`);
        console.log(`Class: ${instance.ReplicationInstanceClass}`);
        console.log(`Storage: ${instance.AllocatedStorage} GB`);
        console.log(`Public Accessibility: ${instance.PubliclyAccessible ? 'Enabled' : 'Disabled'}`);
        console.log(`VPC: ${vpcId}`);
        console.log(`Security Group: ${vpcResources.securityGroupId}`);
        
        if (instance.ReplicationInstancePublicIpAddress) {
            console.log(`Public IP: ${instance.ReplicationInstancePublicIpAddress}`);
        }
        if (instance.ReplicationInstancePrivateIpAddress) {
            console.log(`Private IP: ${instance.ReplicationInstancePrivateIpAddress}`);
        }

        console.log('\nNon-compliant configuration:');
        console.log('- Instance is publicly accessible');
        console.log('- Security group allows inbound access from 0.0.0.0/0');
        console.log('- Instance has a public IP address');

        return {
            replicationInstanceIdentifier: instance.ReplicationInstanceIdentifier,
            replicationInstanceArn: instance.ReplicationInstanceArn,
            securityGroupId: vpcResources.securityGroupId,
            publicIp: instance.ReplicationInstancePublicIpAddress,
            privateIp: instance.ReplicationInstancePrivateIpAddress
        };

    } catch (error) {
        console.error('Error creating replication instance:', error);
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

        const result = await createPublicReplicationInstance(vpcId);
        
        console.log('\nReplication Instance created and available:');
        console.log(`Instance Identifier: ${result.replicationInstanceIdentifier}`);
        console.log(`Instance ARN: ${result.replicationInstanceArn}`);
        console.log(`Security Group ID: ${result.securityGroupId}`);
        console.log(`Public IP: ${result.publicIp}`);
        console.log(`Private IP: ${result.privateIp}`);

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
