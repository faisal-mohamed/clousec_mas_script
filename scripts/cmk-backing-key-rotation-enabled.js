const {
    KMSClient,
    CreateKeyCommand,
    GetKeyRotationStatusCommand,
    DisableKeyRotationCommand,
    TagResourceCommand
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

async function createNonCompliantCMK() {
    try {
        // Create a CMK
        const createKeyResponse = await kmsClient.send(new CreateKeyCommand({
            Description: 'Non-compliant CMK with rotation disabled',
            KeyUsage: 'ENCRYPT_DECRYPT',
            Origin: 'AWS_KMS',
            MultiRegion: false,
            Tags: [
                {
                    TagKey: 'simulation-mas',
                    TagValue: 'true'
                },
                {
                    TagKey: 'rotation',
                    TagValue: 'disabled'
                }
            ],
            // Creating a symmetric encryption key
            CustomerMasterKeySpec: 'SYMMETRIC_DEFAULT'
        }));

        const keyId = createKeyResponse.KeyMetadata.KeyId;
        console.log('\nCreated CMK:');
        console.log(`Key ID: ${keyId}`);
        console.log(`ARN: ${createKeyResponse.KeyMetadata.Arn}`);
        console.log(`Creation Date: ${createKeyResponse.KeyMetadata.CreationDate}`);
        console.log(`State: ${createKeyResponse.KeyMetadata.KeyState}`);

        // Check initial rotation status
        const initialRotationStatus = await kmsClient.send(new GetKeyRotationStatusCommand({
            KeyId: keyId
        }));

        // If rotation is enabled by default, disable it
        if (initialRotationStatus.KeyRotationEnabled) {
            await kmsClient.send(new DisableKeyRotationCommand({
                KeyId: keyId
            }));
            console.log('Automatic key rotation has been disabled');
        }

        // Verify final rotation status
        const finalRotationStatus = await kmsClient.send(new GetKeyRotationStatusCommand({
            KeyId: keyId
        }));

        console.log('\nKey Configuration:');
        console.log(`Key Spec: ${createKeyResponse.KeyMetadata.CustomerMasterKeySpec}`);
        console.log(`Key Usage: ${createKeyResponse.KeyMetadata.KeyUsage}`);
        console.log(`Origin: ${createKeyResponse.KeyMetadata.Origin}`);
        console.log(`Multi-Region: ${createKeyResponse.KeyMetadata.MultiRegion}`);
        console.log(`Automatic Key Rotation: ${finalRotationStatus.KeyRotationEnabled}`);

        console.log('\nSecurity Warning:');
        console.log('- Automatic key rotation is disabled (non-compliant)');
        console.log('- This reduces security by not automatically rotating the key material');
        console.log('- This configuration may not meet compliance requirements');
        console.log('- Manual key rotation will be required if needed');

        return {
            keyId: keyId,
            keyArn: createKeyResponse.KeyMetadata.Arn
        };

    } catch (error) {
        console.error('Error creating CMK:', error);
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

        const result = await createNonCompliantCMK();
        console.log('\nKey Information for Reference:');
        console.log(`Key ID: ${result.keyId}`);
        console.log(`Key ARN: ${result.keyArn}`);

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
