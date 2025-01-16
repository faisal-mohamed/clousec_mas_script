require('dotenv').config();
const {
  SNSClient,
  CreateTopicCommand,
  DeleteTopicCommand,
  GetTopicAttributesCommand,
  ListTopicsCommand,
  SetTopicAttributesCommand
} = require("@aws-sdk/client-sns");

const {
  KMSClient,
  ListKeysCommand,
  DescribeKeyCommand,
  ListAliasesCommand
} = require("@aws-sdk/client-kms");

// Initialize clients
const snsClient = new SNSClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

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

// List available KMS keys
async function listKMSKeys() {
  try {
    const keysResponse = await kmsClient.send(new ListKeysCommand({}));
    const aliasesResponse = await kmsClient.send(new ListAliasesCommand({}));
    
    console.log('\nAvailable KMS Keys:');
    
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
        console.log('---');
      } catch (error) {
        console.error(`Error getting key details for ${key.KeyId}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing KMS keys:', error);
  }
}

// Create non-compliant SNS topic (without KMS encryption)
async function createNonCompliantTopic() {
  try {
    // Generate unique name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const topicName = `test-topic-${timestamp}`;

    // Create topic without encryption
    const response = await snsClient.send(
      new CreateTopicCommand({
        Name: topicName
      })
    );

    const topicArn = response.TopicArn;
    createdResources.push({
      type: 'TOPIC',
      arn: topicArn
    });

    console.log(`Created non-compliant topic: ${topicName}`);
    console.log(`Topic ARN: ${topicArn}`);

    // Add HTTPS-only policy
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Sid: "AllowPublishThroughSSLOnly",
          Effect: "Deny",
          Principal: "*",
          Action: "SNS:Publish",
          Resource: topicArn,
          Condition: {
            Bool: {
              "aws:SecureTransport": "false"
            }
          }
        }
      ]
    };

    await snsClient.send(
      new SetTopicAttributesCommand({
        TopicArn: topicArn,
        AttributeName: 'Policy',
        AttributeValue: JSON.stringify(policy)
      })
    );

    console.log('Added HTTPS-only policy to topic');

    return topicArn;
  } catch (error) {
    console.error('Error creating non-compliant topic:', error);
    throw error;
  }
}

// Check topic encryption
async function checkTopicEncryption(topicArn) {
  try {
    const response = await snsClient.send(
      new GetTopicAttributesCommand({
        TopicArn: topicArn
      })
    );

    console.log('\nAnalyzing Topic:', topicArn);
    console.log('Topic Attributes:');
    
    const attributes = response.Attributes;
    console.log(`Owner: ${attributes.Owner}`);
    console.log(`Policy: ${attributes.Policy}`);
    
    console.log('\nEncryption Settings:');
    const kmsKeyId = attributes.KmsMasterKeyId;
    console.log(`KMS Key ID: ${kmsKeyId || 'Not configured'}`);

    // Check if using KMS
    const isUsingKMS = kmsKeyId != null;
    console.log(`\nCompliance Status: ${isUsingKMS ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isUsingKMS;
  } catch (error) {
    console.error('Error checking topic encryption:', error);
    throw error;
  }
}

// List and check all topics
async function listTopicsAndCheckEncryption() {
  try {
    const response = await snsClient.send(new ListTopicsCommand({}));
    
    console.log('\nChecking all topics in region:');
    for (const topic of response.Topics) {
      try {
        const attributes = await snsClient.send(
          new GetTopicAttributesCommand({
            TopicArn: topic.TopicArn
          })
        );

        console.log(`\nTopic ARN: ${topic.TopicArn}`);
        const kmsKeyId = attributes.Attributes.KmsMasterKeyId;
        console.log(`KMS Key ID: ${kmsKeyId || 'Not configured'}`);
        
        const isUsingKMS = kmsKeyId != null;
        console.log(`Compliance Status: ${isUsingKMS ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
      } catch (error) {
        console.error(`Error checking topic ${topic.TopicArn}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing topics:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'TOPIC':
          await snsClient.send(
            new DeleteTopicCommand({
              TopicArn: resource.arn
            })
          );
          console.log(`Deleted topic: ${resource.arn}`);
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
    console.log('Starting SNS topic KMS encryption check...');
    
    // List available KMS keys
    await listKMSKeys();
    
    // Create non-compliant topic
    console.log('\nCreating non-compliant topic...');
    const topicArn = await createNonCompliantTopic();
    
    // Check encryption configuration
    await checkTopicEncryption(topicArn);
    
    // List all topics and check their encryption
    await listTopicsAndCheckEncryption();
    
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
