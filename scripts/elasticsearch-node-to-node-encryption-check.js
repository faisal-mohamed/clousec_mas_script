const {
    OpenSearchClient,
    CreateDomainCommand,
    DescribeDomainCommand
  } = require("@aws-sdk/client-opensearch");

  require('dotenv').config();
  
  const {
    EC2Client,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeSubnetsCommand
  } = require("@aws-sdk/client-ec2");
  
  const {
    STSClient,
    GetCallerIdentityCommand
  } = require("@aws-sdk/client-sts");
  
  // Initialize clients
  const openSearchClient = new OpenSearchClient({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
  });
  
  const ec2Client = new EC2Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
  });
  
  const stsClient = new STSClient({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
  });
  
  async function getAccountId() {
    try {
      const response = await stsClient.send(new GetCallerIdentityCommand({}));
      return response.Account;
    } catch (error) {
      console.error('Error getting AWS Account ID:', error);
      throw error;
    }
  }
  
  async function findSuitableSubnets(vpcId) {
    try {
      console.log(`Finding suitable subnets in VPC: ${vpcId}`);
      
      const response = await ec2Client.send(
        new DescribeSubnetsCommand({
          Filters: [
            { Name: 'vpc-id', Values: [vpcId] }
          ]
        })
      );
  
      if (!response.Subnets || response.Subnets.length === 0) {
        throw new Error(`No subnets found in VPC ${vpcId}`);
      }
  
      // Log all available subnets
      console.log('\nAll available subnets:');
      response.Subnets.forEach(subnet => {
        console.log(`- Subnet ID: ${subnet.SubnetId}`);
        console.log(`  AZ: ${subnet.AvailabilityZone}`);
        console.log(`  Available IPs: ${subnet.AvailableIpAddressCount}`);
        console.log(`  CIDR Block: ${subnet.CidrBlock}`);
      });
  
      // Filter subnets with at least 5 available IPs
      const suitableSubnets = response.Subnets.filter(
        subnet => subnet.AvailableIpAddressCount >= 5
      );
  
      if (suitableSubnets.length === 0) {
        throw new Error('No subnets found with sufficient IP addresses (need at least 5 available IPs)');
      }
  
      console.log('\nSuitable subnets (with 5+ available IPs):');
      suitableSubnets.forEach(subnet => {
        console.log(`- ${subnet.SubnetId} (${subnet.AvailabilityZone}): ${subnet.AvailableIpAddressCount} IPs available`);
      });
  
      // Group suitable subnets by AZ
      const subnetsByAZ = suitableSubnets.reduce((acc, subnet) => {
        const az = subnet.AvailabilityZone;
        if (!acc[az]) {
          acc[az] = [];
        }
        acc[az].push(subnet);
        return acc;
      }, {});
  
      // Select the subnet with the most available IPs from the first AZ
      const selectedSubnet = Object.values(subnetsByAZ)
        .flat()
        .sort((a, b) => b.AvailableIpAddressCount - a.AvailableIpAddressCount)[0];
  
      console.log('\nSelected subnet for OpenSearch:');
      console.log(`- ${selectedSubnet.SubnetId} (${selectedSubnet.AvailabilityZone}): ${selectedSubnet.AvailableIpAddressCount} IPs available`);
  
      return selectedSubnet.SubnetId;
    } catch (error) {
      console.error('Error finding suitable subnets:', error);
      throw error;
    }
  }
  
  async function createSecurityGroup(vpcId) {
    try {
      const groupName = `opensearch-sg-${Date.now()}`;
      
      const createSgResponse = await ec2Client.send(
        new CreateSecurityGroupCommand({
          GroupName: groupName,
          Description: 'Security group for OpenSearch domain',
          VpcId: vpcId,
          TagSpecifications: [{
            ResourceType: 'security-group',
            Tags: [{
              Key: 'simulation-mas',
              Value: 'true'
            }]
          }]
        })
      );
  
      const securityGroupId = createSgResponse.GroupId;
  
      await ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: [
            {
              IpProtocol: 'tcp',
              FromPort: 443,
              ToPort: 443,
              IpRanges: [{ CidrIp: '0.0.0.0/0' }]
            }
          ]
        })
      );
  
      console.log(`Created security group: ${securityGroupId}`);
      return securityGroupId;
    } catch (error) {
      console.error('Error creating security group:', error);
      throw error;
    }
  }
  
  async function createOpenSearchDomain(vpcId) {
    try {
      const domainName = `domain-${Date.now()}`.substring(0, 28);
      const subnetId = await findSuitableSubnets(vpcId);
      const securityGroupId = await createSecurityGroup(vpcId);
      const accountId = await getAccountId();
  
      console.log('Creating OpenSearch domain with node-to-node encryption disabled...');
  
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
            Enabled: false  // Explicitly disable node-to-node encryption
          },
          EncryptionAtRestOptions: {
            Enabled: true  // Required to be enabled
          },
          DomainEndpointOptions: {
            EnforceHTTPS: true,
            TLSSecurityPolicy: 'Policy-Min-TLS-1-0-2019-07'
          },
          VPCOptions: {
            SubnetIds: [subnetId],
            SecurityGroupIds: [securityGroupId]
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
                Resource: `arn:aws:es:${process.env.AWS_REGION}:${accountId}:domain/${domainName}/*`
              }
            ]
          }),
          Tags: [{
            Key: 'simulation-mas',
            Value: 'true'
          }]
        })
      );
  
      console.log('\nDomain creation initiated:');
      console.log('------------------------');
      console.log(`Domain Name: ${domainName}`);
      console.log(`Account ID: ${accountId}`);
      console.log(`Subnet ID: ${subnetId}`);
      console.log(`Security Group: ${securityGroupId}`);
      console.log('Node-to-node encryption: Disabled');
      console.log('------------------------\n');
  
      // Wait for the domain to be active
      console.log('Waiting for domain to become active (this may take 15-20 minutes)...');
      await waitForDomainActive(domainName);
  
      return domainName;
    } catch (error) {
      console.error('Error creating OpenSearch domain:', error);
      throw error;
    }
  }
  
  async function waitForDomainActive(domainName) {
    while (true) {
      try {
        const response = await openSearchClient.send(
          new DescribeDomainCommand({
            DomainName: domainName
          })
        );
  
        const status = response.DomainStatus;
        const processing = status.Processing;
        const endpoint = status.Endpoints?.vpc;
  
        console.log(`\nCurrent status:`);
        console.log(`Processing: ${processing}`);
        console.log(`Endpoint: ${endpoint || 'Not yet available'}`);
  
        if (!processing && endpoint) {
          console.log('\nDomain is now active!');
          console.log('------------------------');
          console.log(`Domain Name: ${domainName}`);
          console.log(`Endpoint: ${endpoint}`);
          console.log('------------------------\n');
          break;
        }
  
        await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute
      } catch (error) {
        console.error('Error checking domain status:', error);
        throw error;
      }
    }
  }
  
  async function main() {
    try {
      if (!process.env.VPC_ID) {
        throw new Error('VPC_ID environment variable is required');
      }
  
      console.log('Creating OpenSearch domain with node-to-node encryption disabled...');
      const domainName = await createOpenSearchDomain(process.env.VPC_ID);
      
      console.log('\nOpenSearch domain created successfully!');
      console.log('------------------------');
      console.log(`Domain Name: ${domainName}`);
      console.log('------------------------');
  
    } catch (error) {
      console.error('Error in main execution:', error);
      process.exit(1);
    }
  }
  
  if (require.main === module) {
    main();
  }
  
  module.exports = {
    createOpenSearchDomain
  };
  