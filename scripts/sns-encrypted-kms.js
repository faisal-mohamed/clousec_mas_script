require('dotenv').config();
const {
  SNSClient,
  CreateTopicCommand,
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
    const response = await kmsClient.send(new ListKeysCommand({}));
    console.log('\nAvailable KMS keys:');
    
    for (const key of response.Keys) {
      const keyId = key.KeyId;
      
      // Get key details
      const keyDetails = await kmsClient.send(
        new DescribeKeyCommand({
          KeyId: keyId
        })
      );
      
      // Get aliases
      const aliases = await kmsClient.send(
        new ListAliasesCommand({
          KeyId: keyId
        })
      );
      
      const aliasNames = aliases.Aliases.map(a => a.AliasName).join(', ');
      
      console.log(`Key ID: ${keyId}`);
      console.log(`Description: ${keyDetails.KeyMetadata.Description}`);
      console.log(`Aliases: ${aliasNames || 'No aliases'}`);
      console.log('---');
    }
  } catch (error) {
    console.error('Error listing KMS keys:', error);
    throw error;
  }
}

async function createNonCompliantTopic() {
  try {
    // Generate unique name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const topicName = `test-topic-${timestamp}`;

    // Create topic without encryption but with tags
    const response = await snsClient.send(
      new CreateTopicCommand({
        Name: topicName,
        Tags: [
          {
            Key: "simulation-mas",
            Value: "true"
          }
        ]
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
    
    const attributes = response.Attributes;
    const kmsMasterKeyId = attributes.KmsMasterKeyId;
    
    console.log('\nTopic encryption check:');
    console.log(`Topic ARN: ${topicArn}`);
    if (kmsMasterKeyId) {
      console.log(`KMS Key ID: ${kmsMasterKeyId}`);
      console.log('Status: Compliant - Topic is encrypted with KMS');
    } else {
      console.log('Status: Non-compliant - Topic is not encrypted with KMS');
    }
  } catch (error) {
    console.error('Error checking topic encryption:', error);
    throw error;
  }
}

async function listTopicsAndCheckEncryption() {
  try {
    const response = await snsClient.send(new ListTopicsCommand({}));
    
    console.log('\nChecking all topics:');
    for (const topic of response.Topics) {
      await checkTopicEncryption(topic.TopicArn);
    }
  } catch (error) {
    console.error('Error listing topics:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    // Verify AWS credentials are available
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_SESSION_TOKEN) {
      throw new Error('AWS credentials not found in environment variables');
    }
    
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
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

main();