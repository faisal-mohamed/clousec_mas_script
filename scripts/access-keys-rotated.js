const {
  IAMClient,
  CreateUserCommand,
  CreateAccessKeyCommand,
  TagUserCommand,
  ListAccessKeysCommand,
  GetAccessKeyLastUsedCommand
} = require("@aws-sdk/client-iam");

function generateUniqueName(baseName) {
  const timestamp = new Date().getTime();
  return `${baseName}-${timestamp}`;
}


require('dotenv').config();


function getAWSCredentials() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const credentials = {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  };

  if (process.env.AWS_SESSION_TOKEN) {
    credentials.credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
  }

  return credentials;
}

async function createIAMUserWithAccessKey() {
  const awsCredentials = getAWSCredentials();
  const iamClient = new IAMClient(awsCredentials);

  try {
    // Generate unique username
    const username = generateUniqueName('simulation-mas-user');

    // 1. Create IAM user
    console.log(`Creating IAM user: ${username}`);
    await iamClient.send(
      new CreateUserCommand({
        UserName: username,
        Tags: [
          {
            Key: 'simulation-mas',
            Value: 'true'
          },
          {
            Key: 'NoRotation',
            Value: 'true'
          }
        ]
      })
    );

    // 2. Create access key
    console.log("Creating access key...");
    const createKeyResponse = await iamClient.send(
      new CreateAccessKeyCommand({
        UserName: username
      })
    );

    const accessKey = createKeyResponse.AccessKey;

    // 3. Add additional tags to the user
    console.log("Adding additional tags...");
    await iamClient.send(
      new TagUserCommand({
        UserName: username,
        Tags: [
          {
            Key: 'AccessKeyCreatedAt',
            Value: new Date().toISOString()
          },
          {
            Key: 'AccessKeyId',
            Value: accessKey.AccessKeyId
          }
        ]
      })
    );

    // 4. List access keys to verify
    console.log("Verifying access key creation...");
    const listKeysResponse = await iamClient.send(
      new ListAccessKeysCommand({
        UserName: username
      })
    );

    // 5. Get access key last used info (will show "N/A" for new keys)
    const lastUsedResponse = await iamClient.send(
      new GetAccessKeyLastUsedCommand({
        AccessKeyId: accessKey.AccessKeyId
      })
    );

    console.log("\nIAM User created successfully!");
    console.log("\nUser Details:");
    console.log(`- Username: ${username}`);
    console.log(`- ARN: ${accessKey.UserName}`);
    
    console.log("\nAccess Key Details:");
    console.log(`- Access Key ID: ${accessKey.AccessKeyId}`);
    console.log(`- Secret Access Key: ${accessKey.SecretAccessKey}`);
    console.log(`- Status: ${accessKey.Status}`);
    console.log(`- Created Date: ${accessKey.CreateDate}`);
    
    if (lastUsedResponse.AccessKeyLastUsed?.LastUsedDate) {
      console.log(`- Last Used: ${lastUsedResponse.AccessKeyLastUsed.LastUsedDate}`);
      console.log(`- Region Last Used: ${lastUsedResponse.AccessKeyLastUsed.Region}`);
      console.log(`- Service Last Used: ${lastUsedResponse.AccessKeyLastUsed.ServiceName}`);
    } else {
      console.log("- Last Used: Never");
    }

    console.log("\nTags applied:");
    console.log("- simulation-mas: true");
    console.log("- NoRotation: true");
    console.log(`- AccessKeyCreatedAt: ${new Date().toISOString()}`);
    console.log(`- AccessKeyId: ${accessKey.AccessKeyId}`);

    console.log("\nIMPORTANT:");
    console.log("1. Store the Secret Access Key securely - it cannot be retrieved again");
    console.log("2. This access key is configured to never rotate (NoRotation tag)");
    console.log("3. Make sure to follow your organization's security policies");

    return {
      username,
      accessKeyId: accessKey.AccessKeyId,
      secretAccessKey: accessKey.SecretAccessKey,
      tags: {
        'simulation-mas': 'true',
        'NoRotation': 'true'
      }
    };

  } catch (error) {
    console.error("Error creating IAM user and access key:", error);
    throw error;
  }
}

async function main() {
  try {
    console.log("Starting IAM user creation with non-rotating access key...");
    const result = await createIAMUserWithAccessKey();
    
    // Save credentials to a file (optional)
    if (process.env.SAVE_CREDENTIALS === 'true') {
      const fs = require('fs');
      const credentials = {
        username: result.username,
        accessKeyId: result.accessKeyId,
        secretAccessKey: result.secretAccessKey,
        region: process.env.AWS_REGION,
        createdAt: new Date().toISOString()
      };

      const filename = `${result.username}-credentials.json`;
      fs.writeFileSync(filename, JSON.stringify(credentials, null, 2));
      console.log(`\nCredentials saved to: ${filename}`);
    }

    console.log("\nSetup completed successfully");
  } catch (error) {
    console.error("Failed to create IAM user and access key:", error);
    process.exit(1);
  }
}

// Only run if this is the main module
if (require.main === module) {
  main();
}

module.exports = {
  createIAMUserWithAccessKey
};
