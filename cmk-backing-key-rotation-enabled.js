const { 
    KMSClient,
    CreateKeyCommand,
    ScheduleKeyDeletionCommand,
    DisableKeyCommand,
    GetKeyRotationStatusCommand
} = require("@aws-sdk/client-kms");

require('dotenv').config();

const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

class KMSKeyRotationSimulator {
    constructor() {
        this.resources = {};
        this.kmsClient = createAwsClient(KMSClient);
    }

    async createNonCompliantState() {
        try {
            console.log('Creating non-compliant KMS key without automatic rotation...');

            // Create a symmetric KMS key without enabling rotation
            const createKeyResponse = await this.kmsClient.send(
                new CreateKeyCommand({
                    Description: 'Non-compliant KMS key for testing',
                    KeyUsage: 'ENCRYPT_DECRYPT',
                    Origin: 'AWS_KMS',
                    MultiRegion: false
                })
            );

            this.resources.keyId = createKeyResponse.KeyMetadata.KeyId;

            // Verify rotation status
            const rotationStatus = await this.kmsClient.send(
                new GetKeyRotationStatusCommand({
                    KeyId: this.resources.keyId
                })
            );

            console.log('\nNon-compliant state created:');
            console.log(`Key ID: ${this.resources.keyId}`);
            console.log(`Automatic Key Rotation Enabled: ${rotationStatus.KeyRotationEnabled}`);

            // Wait for AWS Config to evaluate
            console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
            await new Promise(resolve => setTimeout(resolve, 120000));

        } catch (error) {
            console.error('Error creating non-compliant KMS key:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        try {
            if (this.resources.keyId) {
                console.log('\nCleaning up resources...');
                
                // First disable the key
                await this.kmsClient.send(
                    new DisableKeyCommand({
                        KeyId: this.resources.keyId
                    })
                );

                // Schedule the key for deletion (minimum 7 days waiting period)
                await this.kmsClient.send(
                    new ScheduleKeyDeletionCommand({
                        KeyId: this.resources.keyId,
                        PendingWindowInDays: 7
                    })
                );

                console.log('KMS key scheduled for deletion in 7 days');
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

async function main() {
    const simulator = new KMSKeyRotationSimulator();
    await simulator.createNonCompliantState();
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createNonCompliantState: main
};
