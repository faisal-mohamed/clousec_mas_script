const {
    KMSClient,
    CreateKeyCommand,
    ScheduleKeyDeletionCommand,
    DescribeKeyCommand
} = require("@aws-sdk/client-kms");
require('dotenv').config();

// Initialize KMS client
const kmsClient = new KMSClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createAndScheduleKeyDeletion() {
    try {
        // Create CMK
        console.log('Creating Customer Master Key (CMK)...');
        const createKeyResponse = await kmsClient.send(new CreateKeyCommand({
            Description: `Test CMK scheduled for deletion ${Date.now()}`,
            KeyUsage: 'ENCRYPT_DECRYPT',
            Origin: 'AWS_KMS',
            MultiRegion: false,
            Tags: [
                {
                    TagKey: 'simulation-mas',
                    TagValue: 'true'
                },
                {
                    TagKey: 'Purpose',
                    TagValue: 'DeletionTest'
                },
                {
                    TagKey: 'DeleteAfterCreation',
                    TagValue: 'true'
                }
            ]
        }));

        const keyId = createKeyResponse.KeyMetadata.KeyId;
        console.log('CMK created:', {
            KeyId: keyId,
            Arn: createKeyResponse.KeyMetadata.Arn,
            CreationDate: createKeyResponse.KeyMetadata.CreationDate
        });

        // Schedule key deletion
        console.log('\nScheduling key for deletion...');
        const scheduleDeletionResponse = await kmsClient.send(new ScheduleKeyDeletionCommand({
            KeyId: keyId,
            PendingWindowInDays: 7 // Minimum waiting period
        }));

        // Verify key status
        const keyStatus = await kmsClient.send(new DescribeKeyCommand({
            KeyId: keyId
        }));

        console.log('\nKey deletion scheduled:', {
            KeyId: keyId,
            DeletionDate: scheduleDeletionResponse.DeletionDate,
            KeyState: keyStatus.KeyMetadata.KeyState,
            PendingWindowInDays: 7
        });

        return {
            keyId: keyId,
            keyArn: createKeyResponse.KeyMetadata.Arn,
            deletionDate: scheduleDeletionResponse.DeletionDate,
            keyState: keyStatus.KeyMetadata.KeyState
        };
    } catch (error) {
        console.error('Error in key creation or deletion scheduling:', error.message);
        throw error;
    }
}

// Execute key creation and deletion scheduling
createAndScheduleKeyDeletion()
    .then(result => {
        console.log('\nOperation Summary:', {
            KeyId: result.keyId,
            KeyArn: result.keyArn,
            Status: 'Pending Deletion',
            DeletionDate: result.deletionDate,
            CurrentState: result.keyState
        });
        console.log('\nImportant Notes:', {
            warning: 'Key is scheduled for deletion and cannot be used for cryptographic operations',
            pendingPeriod: '7 days',
            cancellation: 'Deletion can be cancelled using CancelKeyDeletion before the waiting period ends',
            recovery: 'After deletion, the key CANNOT be recovered'
        });
    })
    .catch(error => {
        console.error('Operation failed:', error.message);
        process.exit(1);
    });
