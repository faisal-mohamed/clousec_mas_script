require('dotenv').config();
const {
  KMSClient,
  CreateKeyCommand,
  ScheduleKeyDeletionCommand,
  CancelKeyDeletionCommand,
  EnableKeyCommand,
  DisableKeyCommand,
  ListKeysCommand,
  DescribeKeyCommand,
  ListAliasesCommand,
  CreateAliasCommand,
  DeleteAliasCommand
} = require("@aws-sdk/client-kms");

// Initialize KMS client
const kmsClient = new KMSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create KMS key
async function createKey() {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const description = `Test key ${timestamp}`;
    
    const response = await kmsClient.send(
      new CreateKeyCommand({
        Description: description,
        KeyUsage: 'ENCRYPT_DECRYPT',
        Origin: 'AWS_KMS',
        MultiRegion: false,
        Tags: [
          {
            TagKey: 'Purpose',
            TagValue: 'Testing'
          }
        ]
      })
    );

    const keyId = response.KeyMetadata.KeyId;
    console.log(`Created KMS key: ${keyId}`);

    // Create alias for the key
    const aliasName = `alias/test-key-${timestamp}`;
    await kmsClient.send(
      new CreateAliasCommand({
        AliasName: aliasName,
        TargetKeyId: keyId
      })
    );

    createdResources.push({
      type: 'ALIAS',
      name: aliasName
    });

    createdResources.push({
      type: 'KEY',
      id: keyId
    });

    console.log(`Created alias: ${aliasName}`);
    return { keyId, aliasName };
  } catch (error) {
    console.error('Error creating KMS key:', error);
    throw error;
  }
}

// Create non-compliant scenario by scheduling key deletion
async function scheduleKeyDeletion(keyId) {
  try {
    // Schedule key deletion with minimum waiting period (7 days)
    const response = await kmsClient.send(
      new ScheduleKeyDeletionCommand({
        KeyId: keyId,
        PendingWindowInDays: 7
      })
    );

    console.log(`Scheduled key ${keyId} for deletion`);
    console.log(`Deletion date: ${response.DeletionDate}`);
    return response.DeletionDate;
  } catch (error) {
    console.error('Error scheduling key deletion:', error);
    throw error;
  }
}

// Check key deletion status
async function checkKeyDeletionStatus(keyId) {
  try {
    const response = await kmsClient.send(
      new DescribeKeyCommand({
        KeyId: keyId
      })
    );

    console.log('\nAnalyzing Key:', keyId);
    console.log('Key Details:');
    console.log(`Description: ${response.KeyMetadata.Description}`);
    console.log(`State: ${response.KeyMetadata.KeyState}`);
    console.log(`Deletion Date: ${response.KeyMetadata.DeletionDate || 'Not scheduled'}`);
    
    const isScheduledForDeletion = response.KeyMetadata.KeyState === 'PendingDeletion';
    console.log(`\nCompliance Status: ${!isScheduledForDeletion ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isScheduledForDeletion;
  } catch (error) {
    console.error('Error checking key status:', error);
    throw error;
  }
}

// List and check all keys
async function listKeysAndCheckDeletion() {
  try {
    const keysResponse = await kmsClient.send(new ListKeysCommand({}));
    const aliasesResponse = await kmsClient.send(new ListAliasesCommand({}));
    
    console.log('\nChecking all KMS keys in region:');
    
    for (const key of keysResponse.Keys) {
      try {
        const keyDetails = await kmsClient.send(
          new DescribeKeyCommand({
            KeyId: key.KeyId
          })
        );
        
        // Find alias for this key
        const alias = aliasesResponse.Aliases.find(a => a.TargetKeyId === key.KeyId);
        
        console.log(`\nKey ID: ${key.KeyId}`);
        console.log(`Alias: ${alias ? alias.AliasName : 'No alias'}`);
        console.log(`Description: ${keyDetails.KeyMetadata.Description || 'No description'}`);
        console.log(`State: ${keyDetails.KeyMetadata.KeyState}`);
        console.log(`Key Manager: ${keyDetails.KeyMetadata.KeyManager}`);
        
        if (keyDetails.KeyMetadata.DeletionDate) {
          console.log(`Deletion Date: ${keyDetails.KeyMetadata.DeletionDate}`);
        }

        const isScheduledForDeletion = keyDetails.KeyMetadata.KeyState === 'PendingDeletion';
        console.log(`Compliance Status: ${!isScheduledForDeletion ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
        console.log('---');
      } catch (error) {
        console.error(`Error checking key ${key.KeyId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing keys:', error);
  }
}

// Cancel key deletion and cleanup
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'ALIAS':
          await kmsClient.send(
            new DeleteAliasCommand({
              AliasName: resource.name
            })
          );
          console.log(`Deleted alias: ${resource.name}`);
          break;

        case 'KEY':
          try {
            // First try to cancel deletion if key is pending deletion
            await kmsClient.send(
              new CancelKeyDeletionCommand({
                KeyId: resource.id
              })
            );
            console.log(`Cancelled deletion for key: ${resource.id}`);

            // Wait for key state to update
            await new Promise(resolve => setTimeout(resolve, 5000));

            // Enable the key
            await kmsClient.send(
              new EnableKeyCommand({
                KeyId: resource.id
              })
            );
            console.log(`Enabled key: ${resource.id}`);

            // Disable the key before scheduling deletion
            await kmsClient.send(
              new DisableKeyCommand({
                KeyId: resource.id
              })
            );
            console.log(`Disabled key: ${resource.id}`);

            // Schedule deletion with minimum waiting period
            await kmsClient.send(
              new ScheduleKeyDeletionCommand({
                KeyId: resource.id,
                PendingWindowInDays: 7
              })
            );
            console.log(`Scheduled key for deletion: ${resource.id}`);
          } catch (error) {
            console.error(`Error cleaning up key ${resource.id}:`, error);
          }
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting KMS key deletion check...');
    
    // Create key
    console.log('\nCreating KMS key...');
    const { keyId } = await createKey();
    
    // Create non-compliant scenario
    console.log('\nCreating non-compliant scenario...');
    await scheduleKeyDeletion(keyId);
    
    // Check key status
    await checkKeyDeletionStatus(keyId);
    
    // List all keys and check their status
    await listKeysAndCheckDeletion();
    
    // Wait before cleanup
    console.log('\nWaiting before cleanup...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
