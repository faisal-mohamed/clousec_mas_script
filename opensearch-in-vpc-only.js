require('dotenv').config();
const {
  OpenSearchClient,
  CreateDomainCommand,
  DeleteDomainCommand,
  DescribeDomainCommand,
  ListDomainNamesCommand,
  UpdateDomainConfigCommand
} = require("@aws-sdk/client-opensearch");

const {
  IAMClient,
  CreateServiceLinkedRoleCommand,
  GetRoleCommand
} = require("@aws-sdk/client-iam");

// Initialize clients
const opensearchClient = new OpenSearchClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

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

// Ensure OpenSearch service-linked role exists
async function ensureServiceLinkedRole() {
  try {
    // Check if role already exists
    try {
      await iamClient.send(
        new GetRoleCommand({
          RoleName: 'AWSServiceRoleForAmazonOpenSearchService'
        })
      );
      console.log('OpenSearch service-linked role already exists');
      return;
    } catch (error) {
      if (error.name !== 'NoSuchEntity') {
        throw error;
      }
    }

    // Create service-linked role if it doesn't exist
    await iamClient.send(
      new CreateServiceLinkedRoleCommand({
        AWSServiceName: 'opensearch.amazonaws.com'
      })
    );
    console.log('Created OpenSearch service-linked role');

    // Wait for role to be available
    console.log('Waiting for role to be available...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  } catch (error) {
    console.error('Error ensuring service-linked role:', error);
    throw error;
  }
}

// Create non-compliant OpenSearch domain (public access)
async function createNonCompliantDomain() {
  try {
    // Generate unique domain name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const domainName = `test-domain-${timestamp}`;

    // Create domain with public access
    const response = await opensearchClient.send(
      new CreateDomainCommand({
        DomainName: domainName,
        EngineVersion: 'OpenSearch_2.5',
        ClusterConfig: {
          InstanceType: 't3.small.search',
          InstanceCount: 1,
          DedicatedMasterEnabled: false,
          ZoneAwarenessEnabled: false,
          WarmEnabled: false
        },
        EBSOptions: {
          EBSEnabled: true,
          VolumeType: 'gp3',
          VolumeSize: 10
        },
        NodeToNodeEncryptionOptions: {
          Enabled: true
        },
        EncryptionAtRestOptions: {
          Enabled: true
        },
        DomainEndpointOptions: {
          EnforceHTTPS: true,
          TLSSecurityPolicy: 'Policy-Min-TLS-1-2-2019-07'
        },
        AdvancedSecurityOptions: {
          Enabled: true,
          InternalUserDatabaseEnabled: true,
          MasterUserOptions: {
            MasterUserName: 'admin',
            MasterUserPassword: 'Test123456789!' // For testing only
          }
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
    
    // Wait for domain to be active
    console.log('Waiting for domain to become active...');
    while (true) {
      const domainStatus = await opensearchClient.send(
        new DescribeDomainCommand({
          DomainName: domainName
        })
      );
      
      if (domainStatus.DomainStatus.Processing === false) {
        break;
      }
      console.log('Domain still processing...');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    return domainName;
  } catch (error) {
    console.error('Error creating domain:', error);
    throw error;
  }
}

// Check domain VPC configuration
async function checkDomainVpcConfig(domainName) {
  try {
    const response = await opensearchClient.send(
      new DescribeDomainCommand({
        DomainName: domainName
      })
    );

    const domain = response.DomainStatus;
    console.log('\nAnalyzing Domain:', domain.DomainName);
    console.log('Domain Details:');
    console.log(`ARN: ${domain.ARN}`);
    console.log(`Engine Version: ${domain.EngineVersion}`);
    console.log(`Instance Type: ${domain.ClusterConfig.InstanceType}`);
    console.log(`Instance Count: ${domain.ClusterConfig.InstanceCount}`);
    
    console.log('\nNetwork Configuration:');
    if (domain.VPCOptions) {
      console.log('VPC Configuration:');
      console.log(`VPC ID: ${domain.VPCOptions.VPCId}`);
      console.log(`Subnet IDs: ${domain.VPCOptions.SubnetIds.join(', ')}`);
      console.log(`Security Group IDs: ${domain.VPCOptions.SecurityGroupIds.join(', ')}`);
    } else {
      console.log('VPC Configuration: Not configured (Public endpoint)');
    }

    const isCompliant = domain.VPCOptions !== undefined;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking domain:', error);
    throw error;
  }
}

// List and check all domains
async function listDomainsAndCheck() {
  try {
    const response = await opensearchClient.send(new ListDomainNamesCommand({}));
    
    console.log('\nChecking all OpenSearch domains in region:');
    for (const domain of response.DomainNames) {
      try {
        const domainStatus = await opensearchClient.send(
          new DescribeDomainCommand({
            DomainName: domain.DomainName
          })
        );
        
        console.log(`\nDomain: ${domain.DomainName}`);
        console.log(`Engine: ${domainStatus.DomainStatus.EngineVersion}`);
        console.log(`Endpoint: ${domainStatus.DomainStatus.Endpoints?.vpc || domainStatus.DomainStatus.Endpoint || 'Not available'}`);
        
        const isVpcConfigured = domainStatus.DomainStatus.VPCOptions !== undefined;
        console.log(`VPC Configuration: ${isVpcConfigured ? 'Configured' : 'Not configured'}`);
        
        const isCompliant = isVpcConfigured;
        console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
      } catch (error) {
        console.error(`Error checking domain ${domain.DomainName}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing domains:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources) {
    if (resource.type === 'DOMAIN') {
      try {
        await opensearchClient.send(
          new DeleteDomainCommand({
            DomainName: resource.name
          })
        );
        console.log(`Initiated deletion of domain: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting domain ${resource.name}:`, error);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting OpenSearch domain VPC check...');
    
    // Ensure service-linked role exists
    await ensureServiceLinkedRole();
    
    // Create non-compliant domain
    console.log('\nCreating non-compliant domain...');
    const domainName = await createNonCompliantDomain();
    
    // Check domain configuration
    await checkDomainVpcConfig(domainName);
    
    // List all domains and check them
    await listDomainsAndCheck();
    
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
