require('dotenv').config();
const {
  IAMClient,
  CreateUserCommand,
  DeleteUserCommand,
  CreateAccessKeyCommand,
  DeleteAccessKeyCommand,
  ListAccessKeysCommand,
  GetAccessKeyLastUsedCommand,
  ListUsersCommand,
  GetCredentialReportCommand,
  GenerateCredentialReportCommand
} = require("@aws-sdk/client-iam");

// Initialize IAM client
const iamClient = new IAMClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create IAM user
async function createUser() {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const username = `test-user-${timestamp}`;

    await iamClient.send(
      new CreateUserCommand({
        UserName: username
      })
    );

    createdResources.push({
      type: 'USER',
      name: username
    });

    console.log(`Created IAM user: ${username}`);
    return username;
  } catch (error) {
    console.error('Error creating IAM user:', error);
    throw error;
  }
}

// Create access key for user
async function createAccessKey(username) {
  try {
    const response = await iamClient.send(
      new CreateAccessKeyCommand({
        UserName: username
      })
    );

    const accessKey = response.AccessKey;
    createdResources.push({
      type: 'ACCESS_KEY',
      id: accessKey.AccessKeyId,
      username: username
    });

    console.log(`Created access key: ${accessKey.AccessKeyId} for user: ${username}`);
    return accessKey;
  } catch (error) {
    console.error('Error creating access key:', error);
    throw error;
  }
}

// Wait for and get credential report
async function getCredentialReport() {
  try {
    // Generate credential report
    console.log('Generating credential report...');
    await iamClient.send(new GenerateCredentialReportCommand({}));

    // Wait for report to be generated
    let reportReady = false;
    while (!reportReady) {
      try {
        const response = await iamClient.send(new GetCredentialReportCommand({}));
        if (response.Content) {
          const report = Buffer.from(response.Content).toString('utf-8');
          console.log('Credential report generated successfully');
          return report;
        }
      } catch (error) {
        if (error.name === 'ReportInProgress') {
          console.log('Report generation in progress, waiting...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }
  } catch (error) {
    console.error('Error getting credential report:', error);
    throw error;
  }
}

// Check access key rotation
async function checkAccessKeyRotation() {
  try {
    const report = await getCredentialReport();
    const lines = report.split('\n');
    const headers = lines[0].split(',');

    // Find indices for relevant columns
    const userIndex = headers.indexOf('user');
    const key1LastRotatedIndex = headers.indexOf('access_key_1_last_rotated');
    const key2LastRotatedIndex = headers.indexOf('access_key_2_last_rotated');
    const key1ActiveIndex = headers.indexOf('access_key_1_active');
    const key2ActiveIndex = headers.indexOf('access_key_2_active');

    console.log('\nChecking access key rotation for all users:');
    
    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const fields = lines[i].split(',');
      if (fields.length <= 1) continue; // Skip empty lines

      const username = fields[userIndex];
      const key1LastRotated = fields[key1LastRotatedIndex];
      const key2LastRotated = fields[key2LastRotatedIndex];
      const key1Active = fields[key1ActiveIndex] === 'true';
      const key2Active = fields[key2ActiveIndex] === 'true';

      console.log(`\nUser: ${username}`);

      // Check each active key
      if (key1Active) {
        checkKeyRotation(username, '1', key1LastRotated);
      }
      if (key2Active) {
        checkKeyRotation(username, '2', key2LastRotated);
      }

      if (!key1Active && !key2Active) {
        console.log('No active access keys');
      }
    }
  } catch (error) {
    console.error('Error checking access key rotation:', error);
  }
}

// Check individual key rotation
function checkKeyRotation(username, keyNumber, lastRotated) {
  if (lastRotated === 'N/A') {
    console.log(`Access key ${keyNumber}: Never rotated`);
    return false;
  }

  const rotationDate = new Date(lastRotated);
  const now = new Date();
  const daysSinceRotation = Math.floor((now - rotationDate) / (1000 * 60 * 60 * 24));

  console.log(`Access key ${keyNumber}:`);
  console.log(`  Last rotated: ${lastRotated}`);
  console.log(`  Days since rotation: ${daysSinceRotation}`);

  const isCompliant = daysSinceRotation <= 90;
  console.log(`  Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

  return isCompliant;
}

// List access keys for user
async function listAccessKeys(username) {
  try {
    const response = await iamClient.send(
      new ListAccessKeysCommand({
        UserName: username
      })
    );

    console.log(`\nAccess keys for user ${username}:`);
    for (const key of response.AccessKeyMetadata) {
      console.log(`\nAccess Key ID: ${key.AccessKeyId}`);
      console.log(`Status: ${key.Status}`);
      console.log(`Created: ${key.CreateDate}`);

      // Get last used information
      try {
        const lastUsed = await iamClient.send(
          new GetAccessKeyLastUsedCommand({
            AccessKeyId: key.AccessKeyId
          })
        );

        if (lastUsed.AccessKeyLastUsed.LastUsedDate) {
          console.log(`Last Used: ${lastUsed.AccessKeyLastUsed.LastUsedDate}`);
          console.log(`Last Used Region: ${lastUsed.AccessKeyLastUsed.Region}`);
          console.log(`Last Used Service: ${lastUsed.AccessKeyLastUsed.ServiceName}`);
        } else {
          console.log('Never used');
        }
      } catch (error) {
        console.error(`Error getting last used info for key ${key.AccessKeyId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing access keys:', error);
  }
}

// List all users and their access keys
async function listAllUsersAndKeys() {
  try {
    const response = await iamClient.send(new ListUsersCommand({}));
    
    console.log('\nListing all IAM users and their access keys:');
    for (const user of response.Users) {
      console.log(`\nUser: ${user.UserName}`);
      console.log(`Created: ${user.CreateDate}`);
      await listAccessKeys(user.UserName);
    }
  } catch (error) {
    console.error('Error listing users:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // First delete access keys
  for (const resource of createdResources.reverse()) {
    if (resource.type === 'ACCESS_KEY') {
      try {
        await iamClient.send(
          new DeleteAccessKeyCommand({
            UserName: resource.username,
            AccessKeyId: resource.id
          })
        );
        console.log(`Deleted access key: ${resource.id}`);
      } catch (error) {
        console.error(`Error deleting access key ${resource.id}:`, error);
      }
    }
  }

  // Then delete users
  for (const resource of createdResources) {
    if (resource.type === 'USER') {
      try {
        await iamClient.send(
          new DeleteUserCommand({
            UserName: resource.name
          })
        );
        console.log(`Deleted user: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting user ${resource.name}:`, error);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting access key rotation check...');
    
    // Create test user
    console.log('\nCreating test user...');
    const username = await createUser();
    
    // Create access key
    console.log('\nCreating access key...');
    await createAccessKey(username);
    
    // List user's access keys
    await listAccessKeys(username);
    
    // Check access key rotation for all users
    await checkAccessKeyRotation();
    
    // List all users and their keys
    await listAllUsersAndKeys();
    
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
