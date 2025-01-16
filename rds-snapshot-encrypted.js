const {
    RDSClient,
    CreateDBInstanceCommand,
    DeleteDBInstanceCommand,
    CreateDBSnapshotCommand,
    DeleteDBSnapshotCommand,
    DescribeDBInstancesCommand,
    DescribeDBSnapshotsCommand
} = require("@aws-sdk/client-rds");

require('dotenv').config();

// Initialize AWS client
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

        return new RDSClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create non-compliant RDS instance (unencrypted)
const createNonCompliantInstance = async () => {
    const client = getClient();
    const dbInstanceIdentifier = `non-compliant-db-${Date.now()}`.toLowerCase();

    try {
        console.log('Creating unencrypted RDS instance...');
        
        const params = {
            DBInstanceIdentifier: dbInstanceIdentifier,
            Engine: 'mysql',
            //EngineVersion: '8.0.28',
            DBInstanceClass: 'db.t3.micro', // Smallest instance class for cost efficiency
            AllocatedStorage: 20, // Minimum storage
            MasterUsername: 'admin',
            MasterUserPassword: 'Password123!', // Will be changed immediately after creation
            StorageEncrypted: false, // Non-compliant: Creating unencrypted instance
            PubliclyAccessible: false,
            BackupRetentionPeriod: 0, // Non-compliant: Disabling automated backups
            Tags: [
                {
                    Key: 'Purpose',
                    Value: 'CISBenchmarkTesting'
                }
            ]
        };

        await client.send(new CreateDBInstanceCommand(params));
        console.log(`RDS instance ${dbInstanceIdentifier} creation initiated`);
        
        await waitForInstanceStatus(dbInstanceIdentifier, 'available');
        return dbInstanceIdentifier;
    } catch (error) {
        console.error('Error creating RDS instance:', error);
        throw error;
    }
};

// Create unencrypted snapshot
const createUnencryptedSnapshot = async (dbInstanceIdentifier) => {
    const client = getClient();
    const snapshotIdentifier = `non-compliant-snapshot-${Date.now()}`.toLowerCase();

    try {
        console.log('\nCreating unencrypted snapshot...');
        
        await client.send(new CreateDBSnapshotCommand({
            DBInstanceIdentifier: dbInstanceIdentifier,
            DBSnapshotIdentifier: snapshotIdentifier
        }));

        console.log(`Snapshot creation initiated: ${snapshotIdentifier}`);
        await waitForSnapshotStatus(snapshotIdentifier, 'available');
        return snapshotIdentifier;
    } catch (error) {
        console.error('Error creating snapshot:', error);
        throw error;
    }
};

// Wait for instance status
const waitForInstanceStatus = async (dbInstanceIdentifier, targetStatus, timeoutMinutes = 20) => {
    const client = getClient();
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    console.log(`Waiting up to ${timeoutMinutes} minutes for instance ${dbInstanceIdentifier} to be ${targetStatus}...`);

    while (true) {
        try {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Timeout waiting for instance status ${targetStatus}`);
            }

            const response = await client.send(
                new DescribeDBInstancesCommand({
                    DBInstanceIdentifier: dbInstanceIdentifier
                })
            );

            const status = response.DBInstances[0].DBInstanceStatus;
            console.log(`Current status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            // Wait 30 seconds before next check
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (error) {
            if (error.name === 'DBInstanceNotFound' && targetStatus === 'deleted') {
                console.log('Instance deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Wait for snapshot status
const waitForSnapshotStatus = async (snapshotIdentifier, targetStatus, timeoutMinutes = 20) => {
    const client = getClient();
    const startTime = Date.now();
    const timeoutMs = timeoutMinutes * 60 * 1000;

    console.log(`Waiting up to ${timeoutMinutes} minutes for snapshot ${snapshotIdentifier} to be ${targetStatus}...`);

    while (true) {
        try {
            if (Date.now() - startTime > timeoutMs) {
                throw new Error(`Timeout waiting for snapshot status ${targetStatus}`);
            }

            const response = await client.send(
                new DescribeDBSnapshotsCommand({
                    DBSnapshotIdentifier: snapshotIdentifier
                })
            );

            const status = response.DBSnapshots[0].Status;
            console.log(`Current status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            // Wait 30 seconds before next check
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (error) {
            if (error.name === 'DBSnapshotNotFound' && targetStatus === 'deleted') {
                console.log('Snapshot deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Display instance and snapshot details
const displayResourceDetails = async (dbInstanceIdentifier, snapshotIdentifier) => {
    const client = getClient();
    try {
        console.log('\nResource Details:');
        console.log('----------------');

        // Get instance details
        const instanceResponse = await client.send(
            new DescribeDBInstancesCommand({
                DBInstanceIdentifier: dbInstanceIdentifier
            })
        );
        const instance = instanceResponse.DBInstances[0];

        // Get snapshot details
        const snapshotResponse = await client.send(
            new DescribeDBSnapshotsCommand({
                DBSnapshotIdentifier: snapshotIdentifier
            })
        );
        const snapshot = snapshotResponse.DBSnapshots[0];

        console.log('DB Instance:');
        console.log(`- Identifier: ${instance.DBInstanceIdentifier}`);
        console.log(`- Storage Encrypted: ${instance.StorageEncrypted}`);
        console.log(`- Backup Retention Period: ${instance.BackupRetentionPeriod} days`);

        console.log('\nSnapshot:');
        console.log(`- Identifier: ${snapshot.DBSnapshotIdentifier}`);
        console.log(`- Encrypted: ${snapshot.Encrypted}`);

        console.log('\nNon-compliant configurations:');
        console.log('- RDS instance storage is not encrypted');
        console.log('- RDS snapshot is not encrypted');
        console.log('- Automated backups are disabled');
    } catch (error) {
        console.error('Error fetching resource details:', error);
    }
};

// Cleanup resources
const cleanup = async (dbInstanceIdentifier, snapshotIdentifier) => {
    const client = getClient();
    try {
        console.log('\nStarting cleanup...');

        if (snapshotIdentifier) {
            console.log(`Deleting snapshot: ${snapshotIdentifier}`);
            await client.send(
                new DeleteDBSnapshotCommand({
                    DBSnapshotIdentifier: snapshotIdentifier
                })
            );
            await waitForSnapshotStatus(snapshotIdentifier, 'deleted');
        }

        if (dbInstanceIdentifier) {
            console.log(`Deleting RDS instance: ${dbInstanceIdentifier}`);
            await client.send(
                new DeleteDBInstanceCommand({
                    DBInstanceIdentifier: dbInstanceIdentifier,
                    SkipFinalSnapshot: true
                })
            );
            await waitForInstanceStatus(dbInstanceIdentifier, 'deleted');
        }

        console.log('Cleanup completed successfully');
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let dbInstanceIdentifier;
    let snapshotIdentifier;

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_ACCOUNT_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Create non-compliant RDS instance
        dbInstanceIdentifier = await createNonCompliantInstance();

        // Create unencrypted snapshot
        snapshotIdentifier = await createUnencryptedSnapshot(dbInstanceIdentifier);

        // Display resource details
        await displayResourceDetails(dbInstanceIdentifier, snapshotIdentifier);

        // Wait period to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        try {
            await cleanup(dbInstanceIdentifier, snapshotIdentifier);
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
