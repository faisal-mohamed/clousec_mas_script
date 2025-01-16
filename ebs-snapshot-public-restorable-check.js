require('dotenv').config();
const {
  EC2Client,
  CreateVolumeCommand,
  DeleteVolumeCommand,
  CreateSnapshotCommand,
  DeleteSnapshotCommand,
  ModifySnapshotAttributeCommand,
  DescribeSnapshotsCommand,
  DescribeVolumesCommand,
  EnableSnapshotBlockPublicAccessCommand,
  DisableSnapshotBlockPublicAccessCommand,
  GetSnapshotBlockPublicAccessStateCommand
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

// Check if block public access is enabled
async function checkBlockPublicAccess() {
  try {
    const response = await ec2Client.send(
      new GetSnapshotBlockPublicAccessStateCommand({})
    );
    
    console.log('\nSnapshot Block Public Access State:');
    console.log(`State: ${response.State}`);
    console.log(`Policy: ${response.PolicyEnabled ? 'Enabled' : 'Disabled'}`);
    
    return response.State === 'block-all-sharing' || response.State === 'block-new-sharing';
  } catch (error) {
    console.error('Error checking block public access state:', error);
    return false;
  }
}

// Disable block public access (for testing)
async function disableBlockPublicAccess() {
  try {
    await ec2Client.send(new DisableSnapshotBlockPublicAccessCommand({}));
    console.log('Disabled block public access for snapshots');
  } catch (error) {
    console.error('Error disabling block public access:', error);
    throw error;
  }
}

// Create EBS volume
async function createVolume() {
  try {
    const response = await ec2Client.send(
      new CreateVolumeCommand({
        AvailabilityZone: `${process.env.AWS_REGION}a`,
        Size: 1, // 1 GB
        VolumeType: 'gp3',
        TagSpecifications: [
          {
            ResourceType: 'volume',
            Tags: [
              {
                Key: 'Name',
                Value: `test-volume-${Date.now()}`
              }
            ]
          }
        ]
      })
    );

    const volumeId = response.VolumeId;
    createdResources.push({
      type: 'VOLUME',
      id: volumeId
    });

    console.log(`Created volume: ${volumeId}`);

    // Wait for volume to be available
    console.log('Waiting for volume to become available...');
    while (true) {
      const volumeStatus = await ec2Client.send(
        new DescribeVolumesCommand({
          VolumeIds: [volumeId]
        })
      );
      
      if (volumeStatus.Volumes[0].State === 'available') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return volumeId;
  } catch (error) {
    console.error('Error creating volume:', error);
    throw error;
  }
}

// Create non-compliant snapshot (public)
async function createNonCompliantSnapshot(volumeId) {
  try {
    // Create snapshot
    const createResponse = await ec2Client.send(
      new CreateSnapshotCommand({
        VolumeId: volumeId,
        Description: `Test snapshot ${Date.now()}`,
        TagSpecifications: [
          {
            ResourceType: 'snapshot',
            Tags: [
              {
                Key: 'Name',
                Value: `test-snapshot-${Date.now()}`
              }
            ]
          }
        ]
      })
    );

    const snapshotId = createResponse.SnapshotId;
    createdResources.push({
      type: 'SNAPSHOT',
      id: snapshotId
    });

    console.log(`Created snapshot: ${snapshotId}`);

    // Wait for snapshot to complete
    console.log('Waiting for snapshot to complete...');
    while (true) {
      const snapshotStatus = await ec2Client.send(
        new DescribeSnapshotsCommand({
          SnapshotIds: [snapshotId]
        })
      );
      
      if (snapshotStatus.Snapshots[0].State === 'completed') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Make snapshot public
    await ec2Client.send(
      new ModifySnapshotAttributeCommand({
        SnapshotId: snapshotId,
        Attribute: 'createVolumePermission',
        OperationType: 'add',
        GroupNames: ['all']
      })
    );

    console.log(`Made snapshot ${snapshotId} public`);
    return snapshotId;
  } catch (error) {
    console.error('Error creating snapshot:', error);
    throw error;
  }
}

// Check snapshot public accessibility
async function checkSnapshotPublic(snapshotId) {
  try {
    const response = await ec2Client.send(
      new DescribeSnapshotsCommand({
        SnapshotIds: [snapshotId]
      })
    );

    if (!response.Snapshots || response.Snapshots.length === 0) {
      throw new Error('Snapshot not found');
    }

    const snapshot = response.Snapshots[0];
    console.log('\nAnalyzing Snapshot:', snapshot.SnapshotId);
    console.log('Snapshot Details:');
    console.log(`Description: ${snapshot.Description}`);
    console.log(`Volume Size: ${snapshot.VolumeSize} GB`);
    console.log(`State: ${snapshot.State}`);
    console.log(`Start Time: ${snapshot.StartTime}`);
    
    // Check if snapshot is public
    const isPublic = snapshot.CreateVolumePermissions && 
                    snapshot.CreateVolumePermissions.some(p => p.Group === 'all');
    
    console.log('\nPermissions:');
    console.log(`Public Access: ${isPublic ? 'Enabled' : 'Disabled'}`);

    const isCompliant = !isPublic;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking snapshot:', error);
    throw error;
  }
}

// List and check all snapshots
async function listSnapshotsAndCheck() {
  try {
    const response = await ec2Client.send(
      new DescribeSnapshotsCommand({
        OwnerIds: ['self']
      })
    );
    
    console.log('\nChecking all snapshots in region:');
    for (const snapshot of response.Snapshots) {
      console.log(`\nSnapshot ID: ${snapshot.SnapshotId}`);
      console.log(`Description: ${snapshot.Description}`);
      console.log(`Volume Size: ${snapshot.VolumeSize} GB`);
      console.log(`State: ${snapshot.State}`);
      
      const isPublic = snapshot.CreateVolumePermissions && 
                      snapshot.CreateVolumePermissions.some(p => p.Group === 'all');
      console.log(`Public Access: ${isPublic ? 'Enabled' : 'Disabled'}`);
      
      const isCompliant = !isPublic;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing snapshots:', error);
  }
}

// Re-enable block public access
async function enableBlockPublicAccess() {
  try {
    await ec2Client.send(
      new EnableSnapshotBlockPublicAccessCommand({
        State: 'block-all-sharing'
      })
    );
    console.log('Re-enabled block public access for snapshots');
  } catch (error) {
    console.error('Error enabling block public access:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Delete snapshots first
  for (const resource of createdResources) {
    if (resource.type === 'SNAPSHOT') {
      try {
        await ec2Client.send(
          new DeleteSnapshotCommand({
            SnapshotId: resource.id
          })
        );
        console.log(`Deleted snapshot: ${resource.id}`);
      } catch (error) {
        console.error(`Error deleting snapshot ${resource.id}:`, error);
      }
    }
  }

  // Then delete volumes
  for (const resource of createdResources) {
    if (resource.type === 'VOLUME') {
      try {
        await ec2Client.send(
          new DeleteVolumeCommand({
            VolumeId: resource.id
          })
        );
        console.log(`Deleted volume: ${resource.id}`);
      } catch (error) {
        console.error(`Error deleting volume ${resource.id}:`, error);
      }
    }
  }

  // Re-enable block public access
  await enableBlockPublicAccess();
}

// Main execution
async function main() {
  try {
    console.log('Starting EBS snapshot public access check...');
    
    // Check current block public access state
    const isBlocked = await checkBlockPublicAccess();
    
    if (isBlocked) {
      console.log('\nDisabling block public access for testing...');
      await disableBlockPublicAccess();
    }
    
    // Create volume
    console.log('\nCreating EBS volume...');
    const volumeId = await createVolume();
    
    // Create non-compliant snapshot
    console.log('\nCreating non-compliant snapshot...');
    const snapshotId = await createNonCompliantSnapshot(volumeId);
    
    // Check snapshot accessibility
    await checkSnapshotPublic(snapshotId);
    
    // List all snapshots and check them
    await listSnapshotsAndCheck();
    
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
