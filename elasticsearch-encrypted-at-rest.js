require('dotenv').config();
const {
  OpenSearchClient,
  CreateDomainCommand,
  DeleteDomainCommand,
  DescribeDomainCommand,
  ListDomainNamesCommand,
  UpdateDomainConfigCommand
} = require("@aws-sdk/client-opensearch");

// Initialize OpenSearch client
const openSearchClient = new OpenSearchClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create non-compliant OpenSearch domain (without encryption at rest)
async function createNonCompliantDomain() {
  // Generate a shorter domain name (max 28 characters)
  const timestamp = Math.floor(Date.now() / 1000).toString().slice(-8);
  const domainName = `test-domain-${timestamp}`.toLowerCase();
  
  try {
    // Create domain without encryption at rest
    const createDomainResponse = await openSearchClient.send(
      new CreateDomainCommand({
        DomainName: domainName,
        EngineVersion: 'OpenSearch_2.5',
        ClusterConfig: {
          InstanceType: 't3.small.search',
          InstanceCount: 1,
          DedicatedMasterEnabled: false,
          ZoneAwarenessEnabled: false
        },
        EBSOptions: {
          EBSEnabled: true,
          VolumeType: 'gp3',
          VolumeSize: 10
        },
        NodeToNodeEncryptionOptions: {
          Enabled: true // Enable node-to-node encryption for better security
        },
        EncryptionAtRestOptions: {
          Enabled: false // Disable encryption at rest (non-compliant)
        },
        AccessPolicies: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: {
                AWS: '*'
              },
              Action: 'es:*',
              Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
            }
          ]
        })
      })
    );

    createdResources.push({
      type: 'DOMAIN',
      name: domainName
    });

    console.log(`Created non-compliant domain: ${domainName}`);
    console.log('Domain ARN:', createDomainResponse.DomainStatus.ARN);

    // Wait for domain to be active
    await waitForDomainActive(domainName);

    return domainName;
  } catch (error) {
    console.error('Error creating non-compliant domain:', error);
    throw error;
  }
}

// Wait for domain to be active
async function waitForDomainActive(domainName) {
  console.log('Waiting for domain to be active...');
  
  while (true) {
    try {
      const response = await openSearchClient.send(
        new DescribeDomainCommand({
          DomainName: domainName
        })
      );

      const processingStatus = response.DomainStatus.Processing;
      const domainStatus = response.DomainStatus;

      console.log(`Domain Status: Processing=${processingStatus}`);
      
      if (!processingStatus) {
        console.log('Domain is active');
        break;
      }
    } catch (error) {
      console.error('Error checking domain status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
  }
}

// Check domain encryption
async function checkDomainEncryption(domainName) {
  try {
    const response = await openSearchClient.send(
      new DescribeDomainCommand({
        DomainName: domainName
      })
    );

    const domain = response.DomainStatus;
    console.log('\nAnalyzing Domain:', domainName);
    
    // Check encryption at rest
    const encryptionAtRest = domain.EncryptionAtRestOptions || {};
    console.log('\nEncryption at Rest Settings:');
    console.log(`Enabled: ${encryptionAtRest.Enabled || false}`);
    if (encryptionAtRest.Enabled) {
      console.log(`KMS Key ID: ${encryptionAtRest.KmsKeyId}`);
    }

    // Check node-to-node encryption
    const nodeToNodeEncryption = domain.NodeToNodeEncryptionOptions || {};
    console.log('\nNode-to-Node Encryption Settings:');
    console.log(`Enabled: ${nodeToNodeEncryption.Enabled || false}`);

    // Determine compliance
    const isCompliant = encryptionAtRest.Enabled === true;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking domain encryption:', error);
    throw error;
  }
}

// List and check all domains
async function listDomainsAndCheckEncryption() {
  try {
    const response = await openSearchClient.send(new ListDomainNamesCommand({}));
    
    console.log('\nChecking all OpenSearch domains in region:');
    for (const domain of response.DomainNames) {
      await checkDomainEncryption(domain.DomainName);
    }
  } catch (error) {
    console.error('Error listing domains:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'DOMAIN':
          await openSearchClient.send(
            new DeleteDomainCommand({
              DomainName: resource.name
            })
          );
          console.log(`Initiated deletion of domain: ${resource.name}`);
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
    console.log('Starting OpenSearch domain encryption check...');
    
    // Create non-compliant domain
    console.log('\nCreating non-compliant domain...');
    const domainName = await createNonCompliantDomain();
    
    // Check encryption configuration
    await checkDomainEncryption(domainName);
    
    // List all domains and check their encryption
    await listDomainsAndCheckEncryption();
    
    // Wait before cleanup
    console.log('\nWaiting before cleanup...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
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
