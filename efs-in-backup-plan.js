const {
    EFSClient,
    CreateFileSystemCommand,
    DeleteFileSystemCommand,
    DescribeFileSystemsCommand,
    CreateTagsCommand,
    PutBackupPolicyCommand,
    DescribeBackupPolicyCommand
} = require("@aws-sdk/client-efs");

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

// Create EFS file system without backup (non-compliant)
const createNonCompliantEFS = async () => {
    const efsClient = getClient(EFSClient);

    try {
        // Create EFS with minimal configuration
        const createParams = {
            PerformanceMode: 'generalPurpose',
            ThroughputMode: 'bursting',
            Tags: [{
                Key: 'Name',
                Value: `NonCompliantEFS-${Date.now()}`
            }]
        };

        console.log('Creating EFS file system...');
        const response = await efsClient.send(new CreateFileSystemCommand(createParams));
        const fileSystemId = response.FileSystemId;
        console.log(`Created EFS file system: ${fileSystemId}`);

        // Wait for file system to be available
        await waitForFileSystemStatus(efsClient, fileSystemId, 'available');
        console.log('File system is now available');

        // Disable automatic backups (make non-compliant)
        await disableAutomaticBackups(efsClient, fileSystemId);

        return fileSystemId;
    } catch (error) {
        console.error('Error creating EFS file system:', error);
        throw error;
    }
};

// Wait for file system status
const waitForFileSystemStatus = async (efsClient, fileSystemId, targetState) => {
    while (true) {
        try {
            const response = await efsClient.send(
                new DescribeFileSystemsCommand({
                    FileSystemId: fileSystemId
                })
            );

            const state = response.FileSystems[0].LifeCycleState;
            console.log(`Current file system state: ${state}`);

            if (state === targetState) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 10000)); // Check every 10 seconds
        } catch (error) {
            if (error.name === 'FileSystemNotFound' && targetState === 'deleted') {
                console.log('File system deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Disable automatic backups
const disableAutomaticBackups = async (efsClient, fileSystemId) => {
    try {
        console.log('Disabling automatic backups...');
        await efsClient.send(
            new PutBackupPolicyCommand({
                FileSystemId: fileSystemId,
                BackupPolicy: {
                    Status: 'DISABLED'
                }
            })
        );

        // Verify backup policy status
        const response = await efsClient.send(
            new DescribeBackupPolicyCommand({
                FileSystemId: fileSystemId
            })
        );
        console.log(`Backup policy status: ${response.BackupPolicy.Status}`);
    } catch (error) {
        console.error('Error updating backup policy:', error);
        throw error;
    }
};

// Create backup plan (for demonstration of compliance fix)
const createBackupPlan = async () => {
    const backupClient = getClient(BackupClient);

    try {
        const createParams = {
            BackupPlan: {
                BackupPlanName: `EFSBackupPlan-${Date.now()}`,
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

// Add EFS to backup plan (make compliant)
const addEFSToBackupPlan = async (backupPlanId, fileSystemId) => {
    const backupClient = getClient(BackupClient);

    try {
        const params = {
            BackupPlanId: backupPlanId,
            BackupSelection: {
                SelectionName: `EFSSelection-${Date.now()}`,
                IamRoleArn: process.env.BACKUP_ROLE_ARN,
                Resources: [
                    `arn:aws:elasticfilesystem:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:file-system/${fileSystemId}`
                ]
            }
        };

        console.log('Adding EFS to backup plan...');
        const response = await backupClient.send(new CreateBackupSelectionCommand(params));
        console.log('EFS added to backup plan successfully');

        return response.SelectionId;
    } catch (error) {
        console.error('Error adding EFS to backup plan:', error);
        throw error;
    }
};

// Delete EFS file system
const deleteEFS = async (fileSystemId) => {
    const efsClient = getClient(EFSClient);

    try {
        console.log('Deleting EFS file system...');
        await efsClient.send(
            new DeleteFileSystemCommand({
                FileSystemId: fileSystemId
            })
        );

        // Wait for file system to be deleted
        await waitForFileSystemStatus(efsClient, fileSystemId, 'deleted');
    } catch (error) {
        console.error('Error deleting EFS file system:', error);
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
    let fileSystemId = null;
    let backupPlanId = null;
    let selectionId = null;

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

        // Create non-compliant EFS (not in backup plan)
        fileSystemId = await createNonCompliantEFS();

        // Wait to observe the non-compliant state
        console.log('\nWaiting 30 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Optional: Make the EFS compliant by adding it to a backup plan
        // backupPlanId = await createBackupPlan();
        // selectionId = await addEFSToBackupPlan(backupPlanId, fileSystemId);
        // console.log('\nWaiting 30 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\nStarting cleanup...');
        try {
            if (backupPlanId && selectionId) {
                await deleteBackupPlan(backupPlanId, selectionId);
            }
            if (fileSystemId) {
                await deleteEFS(fileSystemId);
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
