require('dotenv').config();
const {
  EC2Client,
  CreateVolumeCommand,
  DeleteVolumeCommand,
  DescribeVolumesCommand,
  DescribeAvailabilityZonesCommand
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

// Get first availability zone in the region
async function getAvailabilityZone() {
  try {
    const response = await ec2Client.send(
      new DescribeAvailabilityZonesCommand({
        Filters: [
          {
            Name: 'state',
            Values: ['available']
          }
        ]
      })
    );

    if (!response.AvailabilityZones || response.AvailabilityZones.length === 0) {
      throw new Error('No availability zones found');
    }

    return response.AvailabilityZones[0].ZoneName;
  } catch (error) {
    console.error('Error getting availability zone:', error);
    throw error;
  }
}

// Create non-compliant EBS volume (unencrypted)
async function createNonCompliantVolume() {
  try {
    // Get availability zone
    const availabilityZone = await getAvailabilityZone();

    // Create unencrypted volume
    const createVolumeResponse = await ec2Client.send(
      new CreateVolumeCommand({
        AvailabilityZone: availabilityZone,
        Size: 1, // 1 GB volume
        VolumeType: 'gp3',
        Encrypted: false, // Create unencrypted volume (non-compliant)
        TagSpecifications: [
          {
            ResourceType: 'volume',
            Tags: [
              {
                Key: 'Name',
                Value: `test-volume-non-compliant-${Date.now()}`
              }
            ]
          }
        ]
      })
    );

    const volumeId = createVolumeResponse.VolumeId;
    createdResources.push({
      type: 'VOLUME',
      id: volumeId
    });

    console.log(`Created unencrypted volume: ${volumeId}`);

    // Wait for volume to be available
    await waitForVolumeAvailable(volumeId);

    return volumeId;
  } catch (error) {
    console.error('Error creating non-compliant volume:', error);
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

      const volume = response.Volumes[0];
      if (volume.State === 'available') {
        console.log('Volume is available');
        break;
      }
      
      console.log(`Volume status: ${volume.State}`);
    } catch (error) {
      console.error('Error checking volume status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Check volume encryption
async function checkVolumeEncryption(volumeId) {
  try {
    const response = await ec2Client.send(
      new DescribeVolumesCommand({
        VolumeIds: [volumeId]
      })
    );

    const volume = response.Volumes[0];
    console.log('\nAnalyzing Volume:', volumeId);
    console.log('Volume Details:');
    console.log(`Size: ${volume.Size} GiB`);
    console.log(`Type: ${volume.VolumeType}`);
    console.log(`State: ${volume.State}`);
    console.log(`Availability Zone: ${volume.AvailabilityZone}`);
    
    console.log('\nEncryption Settings:');
    console.log(`Encrypted: ${volume.Encrypted}`);
    if (volume.Encrypted) {
      console.log(`KMS Key ID: ${volume.KmsKeyId}`);
    }

    // Determine compliance
    const isCompliant = volume.Encrypted === true;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking volume encryption:', error);
    throw error;
  }
}

// List and check all volumes
async function listVolumesAndCheckEncryption() {
  try {
    const response = await ec2Client.send(
      new DescribeVolumesCommand({})
    );

    console.log('\nChecking all EBS volumes in region:');
    for (const volume of response.Volumes) {
      console.log(`\nVolume ID: ${volume.VolumeId}`);
      console.log(`Size: ${volume.Size} GiB`);
      console.log(`Type: ${volume.VolumeType}`);
      console.log(`Encrypted: ${volume.Encrypted}`);
      if (volume.Encrypted) {
        console.log(`KMS Key ID: ${volume.KmsKeyId}`);
      }
      console.log(`Compliance Status: ${volume.Encrypted ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing volumes:', error);
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
  try {
    console.log('Starting EBS volume encryption check...');
    
    // Create non-compliant volume
    console.log('\nCreating non-compliant volume...');
    const volumeId = await createNonCompliantVolume();
    
    // Check encryption configuration
    await checkVolumeEncryption(volumeId);
    
    // List all volumes and check their encryption
    await listVolumesAndCheckEncryption();
    
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
