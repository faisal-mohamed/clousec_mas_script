const {
    RDSClient,
    CreateDBInstanceCommand,
    DeleteDBInstanceCommand,
    ModifyDBInstanceCommand,
    DescribeDBInstancesCommand
} = require("@aws-sdk/client-rds");

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

// Create RDS instance with backups disabled (non-compliant)
const createNonCompliantRDSInstance = async (vpcId, subnetId) => {
    const rdsClient = getClient(RDSClient);
    const instanceIdentifier = `temp-db-${Date.now()}`;

    try {
        const params = {
            DBInstanceIdentifier: instanceIdentifier,
            Engine: 'mysql',
            //EngineVersion: '8.0.28',
            DBInstanceClass: 'db.t3.micro', // Smallest instance class for cost efficiency
            AllocatedStorage: 20,
            MasterUsername: 'admin',
            MasterUserPassword: 'tempPassword123!',
            VpcSecurityGroupIds: [], // Will use default security group
            AvailabilityZone: process.env.AWS_REGION + 'a',
            PubliclyAccessible: false,
            // Non-compliant backup settings
            BackupRetentionPeriod: 0, // Disable automated backups
            PreferredBackupWindow: '23:59-00:29', // Minimal backup window
            CopyTagsToSnapshot: false,
            DeletionProtection: false
        };

        console.log('Creating RDS instance with backups disabled...');
        await rdsClient.send(new CreateDBInstanceCommand(params));

        // Wait for the instance to be available
        console.log('Waiting for RDS instance to be available...');
        await waitForInstanceStatus(rdsClient, instanceIdentifier, 'available');

        console.log('RDS instance created successfully');
        return instanceIdentifier;
    } catch (error) {
        console.error('Error creating RDS instance:', error);
        throw error;
    }
};

// Wait for RDS instance status
const waitForInstanceStatus = async (rdsClient, instanceIdentifier, targetStatus) => {
    while (true) {
        try {
            const response = await rdsClient.send(
                new DescribeDBInstancesCommand({
                    DBInstanceIdentifier: instanceIdentifier
                })
            );

            const status = response.DBInstances[0].DBInstanceStatus;
            console.log(`Current status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            if (status === 'failed' || status === 'deleted') {
                throw new Error(`Instance reached ${status} state`);
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'DBInstanceNotFoundFault') {
                if (targetStatus === 'deleted') {
                    console.log('Instance deleted successfully');
                    break;
                }
            }
            throw error;
        }
    }
};

// Make RDS instance compliant (optional)
const makeCompliant = async (instanceIdentifier) => {
    const rdsClient = getClient(RDSClient);

    try {
        console.log('Enabling backups and setting compliant configuration...');
        await rdsClient.send(
            new ModifyDBInstanceCommand({
                DBInstanceIdentifier: instanceIdentifier,
                BackupRetentionPeriod: 7, // Enable backups with 7-day retention
                PreferredBackupWindow: '03:00-04:00', // More appropriate backup window
                CopyTagsToSnapshot: true,
                ApplyImmediately: true
            })
        );

        // Wait for modification to complete
        await waitForInstanceStatus(rdsClient, instanceIdentifier, 'available');
        console.log('Backup settings updated successfully');
    } catch (error) {
        console.error('Error modifying RDS instance:', error);
        throw error;
    }
};

// Delete RDS instance
const deleteRDSInstance = async (instanceIdentifier) => {
    const rdsClient = getClient(RDSClient);

    try {
        console.log('Initiating RDS instance deletion...');
        await rdsClient.send(
            new DeleteDBInstanceCommand({
                DBInstanceIdentifier: instanceIdentifier,
                SkipFinalSnapshot: true,
                DeleteAutomatedBackups: true
            })
        );

        console.log('Waiting for RDS instance to be deleted...');
        await waitForInstanceStatus(rdsClient, instanceIdentifier, 'deleted');
    } catch (error) {
        console.error('Error deleting RDS instance:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let instanceIdentifier = null;

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

        // Create non-compliant RDS instance
        instanceIdentifier = await createNonCompliantRDSInstance(vpcId, subnetId);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the instance compliant
        // await makeCompliant(instanceIdentifier);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        if (instanceIdentifier) {
            console.log('\nStarting cleanup...');
            try {
                await deleteRDSInstance(instanceIdentifier);
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
