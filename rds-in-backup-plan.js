const {
    RDSClient,
    CreateDBInstanceCommand,
    DeleteDBInstanceCommand,
    DescribeDBInstancesCommand,
    ModifyDBInstanceCommand
} = require("@aws-sdk/client-rds");

const {
    BackupClient,
    CreateBackupPlanCommand,
    DeleteBackupPlanCommand,
    CreateBackupSelectionCommand,
    DeleteBackupSelectionCommand
} = require("@aws-sdk/client-backup");

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

// Create RDS instance without backup plan (non-compliant)
const createNonCompliantRDSInstance = async () => {
    const rdsClient = getClient(RDSClient);
    const instanceIdentifier = `temp-db-${Date.now()}`;

    try {
        // Create RDS instance with minimal configuration
        const params = {
            DBInstanceIdentifier: instanceIdentifier,
            Engine: 'mysql',
            //EngineVersion: '8.0.28',
            DBInstanceClass: 'db.t3.micro',
            AllocatedStorage: 20,
            MasterUsername: 'admin',
            MasterUserPassword: 'TempPass123!',
            VpcSecurityGroupIds: [], // Will use default security group
            AvailabilityZone: `${process.env.AWS_REGION}a`,
            PubliclyAccessible: false,
            BackupRetentionPeriod: 0, // Disable automated backups
            DeletionProtection: false,
            Tags: [{
                Key: 'Environment',
                Value: 'Test'
            }]
        };

        console.log('Creating RDS instance...');
        await rdsClient.send(new CreateDBInstanceCommand(params));

        // Wait for instance to be available
        await waitForInstanceStatus(rdsClient, instanceIdentifier, 'available');
        console.log('RDS instance created successfully');

        return instanceIdentifier;
    } catch (error) {
        console.error('Error creating RDS instance:', error);
        throw error;
    }
};

// Wait for instance status
const waitForInstanceStatus = async (rdsClient, instanceIdentifier, targetStatus) => {
    while (true) {
        try {
            const response = await rdsClient.send(
                new DescribeDBInstancesCommand({
                    DBInstanceIdentifier: instanceIdentifier
                })
            );

            const status = response.DBInstances[0].DBInstanceStatus;
            console.log(`Current instance status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'DBInstanceNotFoundFault' && targetStatus === 'deleted') {
                console.log('Instance deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Create backup plan (for demonstration of compliance fix)
const createBackupPlan = async () => {
    const backupClient = getClient(BackupClient);

    try {
        const createParams = {
            BackupPlan: {
                BackupPlanName: `RDSBackupPlan-${Date.now()}`,
                Rules: [{
                    RuleName: 'DailyBackups',
                    TargetBackupVault: 'Default',
                    ScheduleExpression: 'cron(0 5 ? * * *)', // Daily at 5 AM UTC
                    StartWindowMinutes: 60,
                    CompletionWindowMinutes: 120,
                    Lifecycle: {
                        DeleteAfterDays: 7
                    }
                }]
            }
        };

        console.log('Creating backup plan...');
        const response = await backupClient.send(new CreateBackupPlanCommand(createParams));
        console.log(`Created backup plan: ${response.BackupPlanId}`);

        return response.BackupPlanId;
    } catch (error) {
        console.error('Error creating backup plan:', error);
        throw error;
    }
};

// Add RDS instance to backup plan (make compliant)
const addInstanceToBackupPlan = async (backupPlanId, instanceArn) => {
    const backupClient = getClient(BackupClient);

    try {
        const params = {
            BackupPlanId: backupPlanId,
            BackupSelection: {
                SelectionName: `RDSSelection-${Date.now()}`,
                IamRoleArn: process.env.BACKUP_ROLE_ARN,
                Resources: [instanceArn]
            }
        };

        console.log('Adding RDS instance to backup plan...');
        const response = await backupClient.send(new CreateBackupSelectionCommand(params));
        console.log('RDS instance added to backup plan successfully');

        return response.SelectionId;
    } catch (error) {
        console.error('Error adding RDS instance to backup plan:', error);
        throw error;
    }
};

// Get RDS instance ARN
const getInstanceArn = async (instanceIdentifier) => {
    const rdsClient = getClient(RDSClient);

    try {
        const response = await rdsClient.send(
            new DescribeDBInstancesCommand({
                DBInstanceIdentifier: instanceIdentifier
            })
        );

        return response.DBInstances[0].DBInstanceArn;
    } catch (error) {
        console.error('Error getting instance ARN:', error);
        throw error;
    }
};

// Delete RDS instance
const deleteRDSInstance = async (instanceIdentifier) => {
    const rdsClient = getClient(RDSClient);

    try {
        console.log('Deleting RDS instance...');
        await rdsClient.send(
            new DeleteDBInstanceCommand({
                DBInstanceIdentifier: instanceIdentifier,
                SkipFinalSnapshot: true,
                DeleteAutomatedBackups: true
            })
        );

        // Wait for instance to be deleted
        await waitForInstanceStatus(rdsClient, instanceIdentifier, 'deleted');
    } catch (error) {
        console.error('Error deleting RDS instance:', error);
        throw error;
    }
};

// Delete backup plan
const deleteBackupPlan = async (backupPlanId, selectionId) => {
    const backupClient = getClient(BackupClient);

    try {
        if (selectionId) {
            console.log('Removing backup selection...');
            await backupClient.send(
                new DeleteBackupSelectionCommand({
                    BackupPlanId: backupPlanId,
                    SelectionId: selectionId
                })
            );
        }

        console.log('Deleting backup plan...');
        await backupClient.send(
            new DeleteBackupPlanCommand({
                BackupPlanId: backupPlanId
            })
        );
    } catch (error) {
        console.error('Error deleting backup plan:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let instanceIdentifier = null;
    let backupPlanId = null;
    let selectionId = null;

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

        // Create non-compliant RDS instance
        instanceIdentifier = await createNonCompliantRDSInstance();

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the instance compliant by adding it to a backup plan
        // const instanceArn = await getInstanceArn(instanceIdentifier);
        // backupPlanId = await createBackupPlan();
        // selectionId = await addInstanceToBackupPlan(backupPlanId, instanceArn);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\nStarting cleanup...');
        try {
            if (backupPlanId && selectionId) {
                await deleteBackupPlan(backupPlanId, selectionId);
            }
            if (instanceIdentifier) {
                await deleteRDSInstance(instanceIdentifier);
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
