// const { 
//     RDSClient, 
//     CreateDBInstanceCommand,
//     DeleteDBInstanceCommand,
//     DescribeDBInstancesCommand,
//     ModifyDBInstanceCommand,
//     DescribeDBLogFilesCommand
// } = require("@aws-sdk/client-rds");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN,
//     region: process.env.AWS_REGION || 'ap-southeast-1'
// };

// // Initialize client
// const rdsClient = new RDSClient(credentials);

// // Configuration
// const config = {
//     dbInstanceIdentifier: 'test-non-compliant-db',
//     createdResources: false,
//     dbEngine: 'postgres',  // You can change this to 'mysql' if needed
//     dbInstanceClass: 'db.t3.micro',
//     masterUsername: 'testadmin',
//     masterPassword: 'TestPassword123!', // In production, use secrets manager
//     allocatedStorage: 20
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// // Utility function to wait for DB instance to be available
// async function waitForDBInstance(status) {
//     console.log(`Waiting for DB instance to be ${status}...`);
//     while (true) {
//         try {
//             const describeCommand = new DescribeDBInstancesCommand({
//                 DBInstanceIdentifier: config.dbInstanceIdentifier
//             });
            
//             const response = await rdsClient.send(describeCommand);
//             const dbInstance = response.DBInstances[0];
            
//             if (dbInstance.DBInstanceStatus === status) {
//                 console.log(`DB instance is ${status}`);
//                 return;
//             }
            
//             console.log(`Current status: ${dbInstance.DBInstanceStatus}`);
//             await wait(30000); // Wait 30 seconds before checking again
//         } catch (error) {
//             if (status === 'deleted' && error.name === 'DBInstanceNotFoundFault') {
//                 console.log('DB instance has been deleted');
//                 return;
//             }
//             throw error;
//         }
//     }
// }

// async function createNonCompliantDB() {
//     try {
//         // Create RDS instance with logging disabled
//         const createParams = {
//             DBInstanceIdentifier: config.dbInstanceIdentifier,
//             Engine: config.dbEngine,
//             DBInstanceClass: config.dbInstanceClass,
//             MasterUsername: config.masterUsername,
//             MasterUserPassword: config.masterPassword,
//             AllocatedStorage: config.allocatedStorage,
//             PubliclyAccessible: false,
//             EnableCloudwatchLogsExports: [], // No logs enabled (non-compliant)
//             DeletionProtection: false
//         };

//         const createCommand = new CreateDBInstanceCommand(createParams);
//         await rdsClient.send(createCommand);
//         config.createdResources = true;
        
//         console.log(`Creating RDS instance: ${config.dbInstanceIdentifier}`);
        
//         // Wait for the instance to be available
//         await waitForDBInstance('available');
        
//     } catch (error) {
//         console.error('Error creating RDS instance:', error);
//         throw error;
//     }
// }

// async function verifyConfiguration() {
//     try {
//         const describeCommand = new DescribeDBInstancesCommand({
//             DBInstanceIdentifier: config.dbInstanceIdentifier
//         });
        
//         const response = await rdsClient.send(describeCommand);
//         const instance = response.DBInstances[0];
        
//         console.log('\nCurrent Configuration:');
//         console.log(JSON.stringify({
//             DBInstanceIdentifier: instance.DBInstanceIdentifier,
//             Engine: instance.Engine,
//             EngineVersion: instance.EngineVersion,
//             EnabledCloudwatchLogsExports: instance.EnabledCloudwatchLogsExports || [],
//             DBInstanceStatus: instance.DBInstanceStatus
//         }, null, 2));

//         // Try to describe log files (should be empty for non-compliant setup)
//         const describeLogsCommand = new DescribeDBLogFilesCommand({
//             DBInstanceIdentifier: config.dbInstanceIdentifier
//         });

//         const logFiles = await rdsClient.send(describeLogsCommand);
//         console.log('\nLog Files:');
//         console.log(JSON.stringify(logFiles.DescribeDBLogFiles || [], null, 2));
//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Delete the RDS instance
//             const deleteCommand = new DeleteDBInstanceCommand({
//                 DBInstanceIdentifier: config.dbInstanceIdentifier,
//                 SkipFinalSnapshot: true,
//                 DeleteAutomatedBackups: true
//             });

//             await rdsClient.send(deleteCommand);
//             console.log('Initiated RDS instance deletion');

//             // Wait for the instance to be deleted
//             await waitForDBInstance('deleted');
            
//             console.log('Cleanup completed successfully');
//         } else {
//             console.log('No resources to clean up - nothing was created');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// }

// async function verifyCleanup() {
//     console.log('\nVerifying cleanup...');
//     try {
//         const describeCommand = new DescribeDBInstancesCommand({
//             DBInstanceIdentifier: config.dbInstanceIdentifier
//         });
        
//         await rdsClient.send(describeCommand);
//         console.log('✗ RDS instance still exists');
//     } catch (error) {
//         if (error.name === 'DBInstanceNotFoundFault') {
//             console.log('✓ RDS instance was successfully deleted');
//         } else {
//             console.log('? Unable to verify RDS instance status');
//             console.error(error);
//         }
//     }
// }

// async function main() {
//     try {
//         console.log('Starting RDS logging non-compliance simulation...');
        
//         // Create non-compliant RDS instance
//         await createNonCompliantDB();

//         // Verify the configuration
//         await verifyConfiguration();

//         // Wait for a few seconds
//         console.log('\nWaiting for 5 seconds...');
//         await wait(5000);

//         // Cleanup
//         console.log('\nStarting cleanup...');
//         await cleanup();
        
//         // Verify cleanup
//         await verifyCleanup();
        
//         console.log('\nScript execution completed successfully');

//     } catch (error) {
//         console.error('Error in main execution:', error);
//         // Attempt cleanup even if there was an error
//         try {
//             await cleanup();
//             await verifyCleanup();
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// }

// // Execute the script
// main();






const {
    RDSClient,
    CreateDBInstanceCommand,
    DeleteDBInstanceCommand,
    DescribeDBInstancesCommand,
    ModifyDBInstanceCommand
} = require("@aws-sdk/client-rds");

const {
    EC2Client,
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize AWS clients
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
const getNetworkInfo = async () => {
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

        // Get subnets in the VPC
        const subnetResponse = await ec2Client.send(
            new DescribeSubnetsCommand({
                Filters: [{
                    Name: 'vpc-id',
                    Values: [vpcId]
                }]
            })
        );

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length === 0) {
            throw new Error('No subnets found in VPC');
        }

        // Get first subnet
        const subnetId = subnetResponse.Subnets[0].SubnetId;

        return { vpcId, subnetId };
    } catch (error) {
        console.error('Error getting network information:', error);
        throw error;
    }
};

// Create security group for RDS
const createSecurityGroup = async (vpcId) => {
    const ec2Client = getClient(EC2Client);

    try {
        // Create security group
        const createSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `non-compliant-rds-sg-${Date.now()}`,
                Description: 'Security group for non-compliant RDS testing',
                VpcId: vpcId
            })
        );

        const sgId = createSgResponse.GroupId;

        // Add inbound rule for PostgreSQL
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 5432,
                    ToPort: 5432,
                    IpRanges: [{ CidrIp: '10.0.0.0/16' }]
                }]
            })
        );

        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
};

// Create non-compliant RDS instance (without logging)
const createNonCompliantRDS = async (vpcId, subnetId, sgId) => {
    const rdsClient = getClient(RDSClient);
    const dbIdentifier = `non-compliant-db-${Date.now()}`;

    try {
        // Create RDS instance with logging disabled
        const params = {
            DBInstanceIdentifier: dbIdentifier,
            Engine: 'postgres',
            //EngineVersion: '14.7',
            DBInstanceClass: 'db.t3.micro',
            AllocatedStorage: 20,
            MasterUsername: 'postgres',
            MasterUserPassword: 'Password123!',
            VpcSecurityGroupIds: [sgId],
            AvailabilityZone: `${process.env.AWS_REGION}a`,
            DBSubnetGroupName: 'default',
            PubliclyAccessible: false,
            EnableCloudwatchLogsExports: [], // No logs enabled
            DeletionProtection: false
        };

        console.log('Creating RDS instance...');
        await rdsClient.send(new CreateDBInstanceCommand(params));

        // Wait for RDS instance to be available
        await waitForDBInstanceStatus(rdsClient, dbIdentifier, 'available');
        console.log('RDS instance created successfully');

        return dbIdentifier;
    } catch (error) {
        console.error('Error creating RDS instance:', error);
        throw error;
    }
};

// Wait for DB instance status
const waitForDBInstanceStatus = async (rdsClient, dbIdentifier, targetStatus) => {
    while (true) {
        try {
            const response = await rdsClient.send(
                new DescribeDBInstancesCommand({
                    DBInstanceIdentifier: dbIdentifier
                })
            );

            const status = response.DBInstances[0].DBInstanceStatus;
            console.log(`Current RDS instance status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'DBInstanceNotFound' && targetStatus === 'deleted') {
                console.log('RDS instance deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Make RDS instance compliant by enabling logging
const makeCompliant = async (dbIdentifier) => {
    const rdsClient = getClient(RDSClient);

    try {
        console.log('Enabling logging...');
        await rdsClient.send(
            new ModifyDBInstanceCommand({
                DBInstanceIdentifier: dbIdentifier,
                EnableCloudwatchLogsExports: ['postgresql', 'upgrade'],
                ApplyImmediately: true
            })
        );

        await waitForDBInstanceStatus(rdsClient, dbIdentifier, 'available');
        console.log('Logging enabled successfully');
    } catch (error) {
        console.error('Error enabling logging:', error);
        throw error;
    }
};

// Delete RDS instance
const deleteDBInstance = async (dbIdentifier) => {
    const rdsClient = getClient(RDSClient);

    try {
        console.log('Deleting RDS instance...');
        await rdsClient.send(
            new DeleteDBInstanceCommand({
                DBInstanceIdentifier: dbIdentifier,
                SkipFinalSnapshot: true,
                DeleteAutomatedBackups: true
            })
        );

        await waitForDBInstanceStatus(rdsClient, dbIdentifier, 'deleted');
    } catch (error) {
        console.error('Error deleting RDS instance:', error);
        throw error;
    }
};

// Delete security group
const deleteSecurityGroup = async (sgId) => {
    const ec2Client = getClient(EC2Client);

    try {
        console.log('Deleting security group...');
        await ec2Client.send(
            new DeleteSecurityGroupCommand({
                GroupId: sgId
            })
        );
        console.log('Security group deleted successfully');
    } catch (error) {
        console.error('Error deleting security group:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let dbIdentifier = null;
    let sgId = null;

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

        // Get network information
        const { vpcId, subnetId } = await getNetworkInfo();

        // Create security group
        sgId = await createSecurityGroup(vpcId);

        // Create non-compliant RDS instance
        dbIdentifier = await createNonCompliantRDS(vpcId, subnetId, sgId);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the instance compliant
        // await makeCompliant(dbIdentifier);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\nStarting cleanup...');
        try {
            if (dbIdentifier) {
                await deleteDBInstance(dbIdentifier);
            }
            if (sgId) {
                // Wait for RDS instance to be fully deleted
                await new Promise(resolve => setTimeout(resolve, 30000));
                await deleteSecurityGroup(sgId);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
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
