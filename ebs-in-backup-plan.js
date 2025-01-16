const {
    EC2Client,
    CreateVolumeCommand,
    DeleteVolumeCommand,
    DescribeVolumesCommand,
    CreateTagsCommand
} = require("@aws-sdk/client-ec2");

const {
    BackupClient,
    CreateBackupPlanCommand,
    DeleteBackupPlanCommand,
    ListBackupPlansCommand,
    GetBackupPlanCommand,
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

// Create EBS volume without backup plan (non-compliant)
const createNonCompliantVolume = async () => {
    const ec2Client = getClient(EC2Client);

    try {
        // Create EBS volume with minimal configuration
        const createParams = {
            AvailabilityZone: `${process.env.AWS_REGION}a`,
            Size: 8, // Minimum size in GiB
            VolumeType: 'gp3',
            TagSpecifications: [{
                ResourceType: 'volume',
                Tags: [{
                    Key: 'Name',
                    Value: `NonCompliantVolume-${Date.now()}`
                }]
            }]
        };

        console.log('Creating EBS volume...');
        const response = await ec2Client.send(new CreateVolumeCommand(createParams));
        const volumeId = response.VolumeId;
        console.log(`Created EBS volume: ${volumeId}`);

        // Wait for volume to be available
        await waitForVolumeStatus(ec2Client, volumeId, 'available');
        console.log('Volume is now available');

        return volumeId;
    } catch (error) {
        console.error('Error creating EBS volume:', error);
        throw error;
    }
};

// Wait for volume status
const waitForVolumeStatus = async (ec2Client, volumeId, targetState) => {
    while (true) {
        try {
            const response = await ec2Client.send(
                new DescribeVolumesCommand({
                    VolumeIds: [volumeId]
                })
            );

            const state = response.Volumes[0].State;
            console.log(`Current volume state: ${state}`);

            if (state === targetState) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
        } catch (error) {
            if (error.name === 'InvalidVolume.NotFound' && targetState === 'deleted') {
                console.log('Volume deleted successfully');
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
                BackupPlanName: `EBSBackupPlan-${Date.now()}`,
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

// Add volume to backup plan (make compliant)
const addVolumeToBackupPlan = async (backupPlanId, volumeId) => {
    const backupClient = getClient(BackupClient);

    try {
        const params = {
            BackupPlanId: backupPlanId,
            BackupSelection: {
                SelectionName: `EBSVolumeSelection-${Date.now()}`,
                IamRoleArn: process.env.BACKUP_ROLE_ARN, // IAM role ARN for AWS Backup
                Resources: [
                    `arn:aws:ec2:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:volume/${volumeId}`
                ]
            }
        };

        console.log('Adding volume to backup plan...');
        const response = await backupClient.send(new CreateBackupSelectionCommand(params));
        console.log('Volume added to backup plan successfully');

        return response.SelectionId;
    } catch (error) {
        console.error('Error adding volume to backup plan:', error);
        throw error;
    }
};

// Delete EBS volume
const deleteVolume = async (volumeId) => {
    const ec2Client = getClient(EC2Client);

    try {
        console.log('Deleting EBS volume...');
        await ec2Client.send(
            new DeleteVolumeCommand({
                VolumeId: volumeId
            })
        );

        // Wait for volume to be deleted
        await waitForVolumeStatus(ec2Client, volumeId, 'deleted');
    } catch (error) {
        console.error('Error deleting EBS volume:', error);
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
    let volumeId = null;
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

        // Create non-compliant volume (not in backup plan)
        volumeId = await createNonCompliantVolume();

        // Wait to observe the non-compliant state
        console.log('\nWaiting 30 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Optional: Make the volume compliant by adding it to a backup plan
        // backupPlanId = await createBackupPlan();
        // selectionId = await addVolumeToBackupPlan(backupPlanId, volumeId);
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
            if (volumeId) {
                await deleteVolume(volumeId);
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
