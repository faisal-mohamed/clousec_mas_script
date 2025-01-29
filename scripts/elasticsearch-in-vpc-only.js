const {
  OpenSearchClient,
  CreateDomainCommand,
  DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");

require('dotenv').config();

// Initialize OpenSearch client
const openSearchClient = new OpenSearchClient({
  region: process.env.AWS_REGION,
  credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
  }
});

async function createPublicDomain() {
  try {
      const timestamp = Math.floor(Date.now() / 1000).toString().slice(-8);
      const domainName = `test-domain-${timestamp}`.toLowerCase();

      const params = {
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
                  MasterUserPassword: 'Admin123!' // In production, use environment variables
              }
          },
          AccessPolicies: JSON.stringify({
              Version: '2012-10-17',
              Statement: [
                  {
                      Effect: 'Allow',
                      Principal: {
                          AWS: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:root`
                      },
                      Action: 'es:*',
                      Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`,
                      Condition: {
                          IpAddress: {
                              'aws:SourceIp': [
                                  process.env.ALLOWED_IP || '0.0.0.0/0'
                              ]
                          }
                      }
                  }
              ]
          }),
          Tags: [
              {
                  Key: 'simulation-mas',
                  Value: 'true'
              },
              {
                  Key: 'Name',
                  Value: domainName
              },
              {
                  Key: 'CreatedBy',
                  Value: 'automation'
              }
          ]
      };

      const command = new CreateDomainCommand(params);
      const response = await openSearchClient.send(command);

      console.log('Domain creation initiated:', {
          DomainName: response.DomainStatus.DomainName,
          DomainId: response.DomainStatus.DomainId,
          EngineVersion: response.DomainStatus.EngineVersion,
          InstanceType: response.DomainStatus.ClusterConfig.InstanceType,
          EncryptionAtRest: 'Disabled',
          VPCEnabled: 'No',
          FineGrainedAccessControl: 'Enabled',
          AdminUsername: 'admin'
      });

      await waitForDomainActive(domainName);

      return domainName;

  } catch (error) {
      console.error('Error creating domain:', error);
      throw error;
  }
}

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
          const endpoint = response.DomainStatus.Endpoint;

          console.log(`Domain Status: Processing=${processingStatus}`);
          
          if (!processingStatus && endpoint) {
              console.log('Domain is active');
              console.log('Endpoint:', endpoint);
              console.log('Configuration:', {
                  DomainName: response.DomainStatus.DomainName,
                  EngineVersion: response.DomainStatus.EngineVersion,
                  InstanceType: response.DomainStatus.ClusterConfig.InstanceType,
                  InstanceCount: response.DomainStatus.ClusterConfig.InstanceCount,
                  StorageSize: response.DomainStatus.EBSOptions.VolumeSize + ' GB',
                  NodeToNodeEncryption: response.DomainStatus.NodeToNodeEncryptionOptions.Enabled,
                  EncryptionAtRest: response.DomainStatus.EncryptionAtRestOptions.Enabled,
                  EnforceHTTPS: response.DomainStatus.DomainEndpointOptions.EnforceHTTPS,
                  FineGrainedAccessControl: response.DomainStatus.AdvancedSecurityOptions?.Enabled
              });
              console.log('\nAdmin Credentials:');
              console.log('Username: admin');
              console.log('Password: Admin123!');
              break;
          }

          await new Promise(resolve => setTimeout(resolve, 30000));
          
      } catch (error) {
          console.error('Error checking domain status:', error);
          throw error;
      }
  }
}

async function main() {
  try {
      // Validate required environment variables
      const requiredEnvVars = [
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY',
          'AWS_SESSION_TOKEN',
          'AWS_REGION',
          'AWS_ACCOUNT_ID'
      ];

      const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
      if (missingVars.length > 0) {
          throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
      }

      await createPublicDomain();

  } catch (error) {
      console.error('Execution failed:', error);
      process.exit(1);
  }
}

// Execute if running directly
if (require.main === module) {
  main();
}

module.exports = {
  createPublicDomain
};
