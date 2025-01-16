require('dotenv').config();
const {
  EFSClient,
  CreateFileSystemCommand,
  DeleteFileSystemCommand,
  DescribeFileSystemsCommand,
  CreateTagsCommand
} = require("@aws-sdk/client-efs");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

// Initialize clients
const efsClient = new EFSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

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

// Get VPC and subnet information
async function getVpcInfo() {
  try {
    // Get default VPC
    const vpcsResponse = await ec2Client.send(
      new DescribeVpcsCommand({
        Filters: [{ Name: 'isDefault', Values: ['true'] }]
      })
    );

    if (!vpcsResponse.Vpcs || vpcsResponse.Vpcs.length === 0) {
      throw new Error('No default VPC found');
    }

    const vpcId = vpcsResponse.Vpcs[0].VpcId;

    // Get subnets in the VPC
    const subnetsResponse = await ec2Client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
      })
    );

    if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length === 0) {
      throw new Error('No subnets found in VPC');
    }

    return {
      vpcId,
      subnetId: subnetsResponse.Subnets[0].SubnetId
    };
  } catch (error) {
    console.error('Error getting VPC info:', error);
    throw error;
  }
}

// Create non-compliant EFS file system (unencrypted)
async function createNonCompliantFileSystem() {
  try {
    // Create unencrypted file system
    const createFsResponse = await efsClient.send(
      new CreateFileSystemCommand({
        Encrypted: false, // Create unencrypted file system (non-compliant)
        PerformanceMode: 'generalPurpose',
        ThroughputMode: 'bursting',
        Tags: [
          {
            Key: 'Name',
            Value: `test-efs-non-compliant-${Date.now()}`
          }
        ]
      })
    );

    const fileSystemId = createFsResponse.FileSystemId;
    createdResources.push({
      type: 'FILE_SYSTEM',
      id: fileSystemId
    });

    console.log(`Created unencrypted file system: ${fileSystemId}`);

    // Wait for file system to be available
    await waitForFileSystemAvailable(fileSystemId);

    return fileSystemId;
  } catch (error) {
    console.error('Error creating non-compliant file system:', error);
    throw error;
  }
}

// Wait for file system to be available
async function waitForFileSystemAvailable(fileSystemId) {
  console.log('Waiting for file system to be available...');
  
  while (true) {
    try {
      const response = await efsClient.send(
        new DescribeFileSystemsCommand({
          FileSystemId: fileSystemId
        })
      );

      const fileSystem = response.FileSystems[0];
      if (fileSystem.LifeCycleState === 'available') {
        break;
      }
    } catch (error) {
      console.error('Error checking file system status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

// Check file system encryption
async function checkFileSystemEncryption(fileSystemId) {
  try {
    const response = await efsClient.send(
      new DescribeFileSystemsCommand({
        FileSystemId: fileSystemId
      })
    );

    const fileSystem = response.FileSystems[0];
    console.log('\nAnalyzing File System:', fileSystemId);
    console.log('Encryption Settings:');
    console.log(`Encrypted: ${fileSystem.Encrypted}`);
    if (fileSystem.Encrypted) {
      console.log(`KMS Key ID: ${fileSystem.KmsKeyId}`);
    }
    console.log(`Compliance Status: ${fileSystem.Encrypted ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return fileSystem.Encrypted;
  } catch (error) {
    console.error('Error checking file system encryption:', error);
    throw error;
  }
}

// List and check all file systems
async function listFileSystemsAndCheckEncryption() {
  try {
    const response = await efsClient.send(
      new DescribeFileSystemsCommand({})
    );

    console.log('\nChecking all EFS file systems in region:');
    for (const fileSystem of response.FileSystems) {
      console.log(`\nFile System ID: ${fileSystem.FileSystemId}`);
      console.log(`Creation Time: ${fileSystem.CreationTime}`);
      console.log(`Life Cycle State: ${fileSystem.LifeCycleState}`);
      console.log(`Size: ${fileSystem.SizeInBytes.Value} bytes`);
      console.log(`Encrypted: ${fileSystem.Encrypted}`);
      if (fileSystem.Encrypted) {
        console.log(`KMS Key ID: ${fileSystem.KmsKeyId}`);
      }
      console.log(`Compliance Status: ${fileSystem.Encrypted ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing file systems:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'FILE_SYSTEM':
          await efsClient.send(
            new DeleteFileSystemCommand({
              FileSystemId: resource.id
            })
          );
          console.log(`Deleted file system: ${resource.id}`);
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
    console.log('Starting EFS encryption check...');
    
    // Create non-compliant file system
    console.log('\nCreating non-compliant file system...');
    const fileSystemId = await createNonCompliantFileSystem();
    
    // Check encryption configuration
    await checkFileSystemEncryption(fileSystemId);
    
    // List all file systems and check their encryption
    await listFileSystemsAndCheckEncryption();
    
    // Wait before cleanup
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
