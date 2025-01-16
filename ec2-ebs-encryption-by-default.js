require('dotenv').config();
const {
  EC2Client,
  DisableEbsEncryptionByDefaultCommand,
  GetEbsEncryptionByDefaultCommand,
  EnableEbsEncryptionByDefaultCommand,
  CreateVolumeCommand,
  DeleteVolumeCommand,
  DescribeVolumesCommand
} = require("@aws-sdk/client-ec2");

// Initialize EC2 client
const ec2Client = new EC2Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create non-compliant scenario (disable EBS encryption by default)
async function createNonCompliantScenario() {
  try {
    // First, check current encryption status
    const currentStatus = await checkEncryptionStatus();
    console.log('Current encryption status:', currentStatus);

    // Disable EBS encryption by default
    await ec2Client.send(new DisableEbsEncryptionByDefaultCommand({}));
    console.log('Disabled EBS encryption by default');

    // Verify the change
    const newStatus = await checkEncryptionStatus();
    console.log('New encryption status:', newStatus);

    // Create an unencrypted volume to demonstrate non-compliance
    await createUnencryptedVolume();

  } catch (error) {
    console.error('Error creating non-compliant scenario:', error);
    throw error;
  }
}

// Check EBS encryption by default status
async function checkEncryptionStatus() {
  try {
    const response = await ec2Client.send(
      new GetEbsEncryptionByDefaultCommand({})
    );

    console.log('\nAnalyzing EBS Encryption By Default:');
    console.log(`Enabled: ${response.EbsEncryptionByDefault}`);
    console.log(`Compliance Status: ${response.EbsEncryptionByDefault ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return response.EbsEncryptionByDefault;
  } catch (error) {
    console.error('Error checking encryption status:', error);
    throw error;
  }
}

// Create an unencrypted volume to demonstrate non-compliance
async function createUnencryptedVolume() {
  try {
    // Create an unencrypted volume
    const createVolumeResponse = await ec2Client.send(
      new CreateVolumeCommand({
        AvailabilityZone: `${process.env.AWS_REGION}a`, // Use first AZ in region
        Size: 1, // 1 GB volume
        VolumeType: 'gp3',
        Encrypted: false // Explicitly create unencrypted volume
      })
    );

    const volumeId = createVolumeResponse.VolumeId;
    createdResources.push({
      type: 'VOLUME',
      id: volumeId
    });

    console.log(`\nCreated unencrypted volume: ${volumeId}`);

    // Wait for volume to be available
    await waitForVolumeAvailable(volumeId);

    // Check volume encryption status
    await checkVolumeEncryption(volumeId);

    return volumeId;
  } catch (error) {
    console.error('Error creating unencrypted volume:', error);
    throw error;
  }
}

// Wait for volume to be available
async function waitForVolumeAvailable(volumeId) {
  console.log('Waiting for volume to be available...');
  
  while (true) {
    try {
      const response = await ec2Client.send(
        new DescribeVolumesCommand({
          VolumeIds: [volumeId]
        })
      );

      if (response.Volumes[0].State === 'available') {
        break;
      }
    } catch (error) {
      console.error('Error checking volume status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Check volume encryption status
async function checkVolumeEncryption(volumeId) {
  try {
    const response = await ec2Client.send(
      new DescribeVolumesCommand({
        VolumeIds: [volumeId]
      })
    );

    const volume = response.Volumes[0];
    console.log('\nAnalyzing Volume:', volumeId);
    console.log('Encryption Settings:');
    console.log(`Encrypted: ${volume.Encrypted}`);
    if (volume.Encrypted) {
      console.log(`KMS Key ID: ${volume.KmsKeyId}`);
    }
    console.log(`Compliance Status: ${volume.Encrypted ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return volume.Encrypted;
  } catch (error) {
    console.error('Error checking volume encryption:', error);
    throw error;
  }
}

// Restore previous encryption setting
async function restorePreviousState(wasEnabled) {
  if (wasEnabled) {
    try {
      await ec2Client.send(new EnableEbsEncryptionByDefaultCommand({}));
      console.log('\nRestored EBS encryption by default to enabled state');
    } catch (error) {
      console.error('Error restoring encryption state:', error);
    }
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'VOLUME':
          await ec2Client.send(
            new DeleteVolumeCommand({
              VolumeId: resource.id
            })
          );
          console.log(`Deleted volume: ${resource.id}`);
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  let previousEncryptionStatus = false;
  
  try {
    console.log('Starting EBS encryption by default check...');
    
    // Get current encryption status before making changes
    previousEncryptionStatus = await checkEncryptionStatus();
    
    // Create non-compliant scenario
    console.log('\nCreating non-compliant scenario...');
    await createNonCompliantScenario();
    
    // Wait before cleanup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    // Cleanup resources
    await cleanup();
    
    // Restore previous encryption state if it was enabled
    await restorePreviousState(previousEncryptionStatus);
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
