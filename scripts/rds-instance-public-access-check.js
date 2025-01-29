const {
  RDSClient,
  CreateDBInstanceCommand,
  DescribeDBInstancesCommand,
  CreateDBSubnetGroupCommand
} = require("@aws-sdk/client-rds");
const {
  EC2Client,
  DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");
require('dotenv').config();

// Initialize clients
const rdsClient = new RDSClient({
  credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'us-east-1'
});

const ec2Client = new EC2Client({
  credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'us-east-1'
});

// Common tags
const commonTags = [
  {
      Key: 'simulation-mas',
      Value: 'true'
  }
];

async function getAvailableSubnets(vpcId) {
  try {
      const response = await ec2Client.send(new DescribeSubnetsCommand({
          Filters: [
              {
                  Name: 'vpc-id',
                  Values: [vpcId]
              }
          ]
      }));

      console.log('\nAll Available Subnets:', response.Subnets.map(subnet => ({
          SubnetId: subnet.SubnetId,
          AvailabilityZone: subnet.AvailabilityZone,
          AvailableIPs: subnet.AvailableIpAddressCount,
          CidrBlock: subnet.CidrBlock
      })));

      // Group subnets by AZ
      const subnetsByAZ = {};
      response.Subnets.forEach(subnet => {
          if (subnet.AvailableIpAddressCount >= 3) {
              if (!subnetsByAZ[subnet.AvailabilityZone]) {
                  subnetsByAZ[subnet.AvailabilityZone] = [];
              }
              subnetsByAZ[subnet.AvailabilityZone].push(subnet);
          }
      });

      const availableAZs = Object.keys(subnetsByAZ);
      if (availableAZs.length < 2) {
          throw new Error(`Need subnets in at least 2 AZs. Found only ${availableAZs.length} AZ(s) with sufficient IPs.`);
      }

      // Select best subnet from each AZ
      const selectedSubnets = [];
      for (const az of availableAZs.slice(0, 2)) {
          const bestSubnet = subnetsByAZ[az]
              .sort((a, b) => b.AvailableIpAddressCount - a.AvailableIpAddressCount)[0];
          selectedSubnets.push(bestSubnet);
      }

      console.log('\nSelected Subnets:', selectedSubnets.map(subnet => ({
          SubnetId: subnet.SubnetId,
          AvailabilityZone: subnet.AvailabilityZone,
          AvailableIPs: subnet.AvailableIpAddressCount
      })));

      return selectedSubnets.map(subnet => subnet.SubnetId);
  } catch (error) {
      console.error('Error getting subnets:', error.message);
      throw error;
  }
}

async function createDBSubnetGroup(identifier, subnetIds) {
  try {
      const subnetGroupName = `subnet-group-${identifier}`;
      
      await rdsClient.send(new CreateDBSubnetGroupCommand({
          DBSubnetGroupName: subnetGroupName,
          DBSubnetGroupDescription: `Subnet group for ${identifier}`,
          SubnetIds: subnetIds,
          Tags: commonTags
      }));

      return subnetGroupName;
  } catch (error) {
      console.error('Error creating DB subnet group:', error.message);
      throw error;
  }
}

async function createPublicRDSInstance(vpcId) {
  try {
      const subnetIds = await getAvailableSubnets(vpcId);
      const timestamp = Date.now().toString().slice(-4);
      const instanceIdentifier = `rds-public-${timestamp}`;

      console.log('Creating RDS instance with public access...');
      const params = {
          DBInstanceIdentifier: instanceIdentifier,
          Engine: 'mysql',
          //EngineVersion: '8.0.28',
          DBInstanceClass: 'db.t3.micro',
          AllocatedStorage: 20,
          MasterUsername: 'admin',
          MasterUserPassword: 'Admin123#$%',
          PubliclyAccessible: true,           // Non-compliant: Making instance publicly accessible
          DeletionProtection: false,
          DBSubnetGroupName: await createDBSubnetGroup(instanceIdentifier, subnetIds),
          Tags: [
              ...commonTags,
              {
                  Key: 'PublicAccess',
                  Value: 'enabled'
              }
          ],
          MultiAZ: false,
          BackupRetentionPeriod: 0,
          AutoMinorVersionUpgrade: false,
          MonitoringInterval: 0,
          EnablePerformanceInsights: false
      };

      const createResponse = await rdsClient.send(new CreateDBInstanceCommand(params));
      console.log('\nRDS Instance Creation Initiated:', {
          DBInstanceIdentifier: instanceIdentifier,
          PubliclyAccessible: true,
          SubnetIds: subnetIds,
          MasterUsername: 'admin',
          MasterPassword: 'Admin123#$%',
          Tags: params.Tags
      });

      await waitForInstanceAvailable(instanceIdentifier);
      return createResponse.DBInstance;
  } catch (error) {
      console.error('Error creating RDS instance:', error.message);
      throw error;
  }
}

async function waitForInstanceAvailable(instanceIdentifier) {
  const maxAttempts = 60;
  let attempts = 0;

  while (attempts < maxAttempts) {
      try {
          const response = await rdsClient.send(
              new DescribeDBInstancesCommand({
                  DBInstanceIdentifier: instanceIdentifier
              })
          );

          const status = response.DBInstances[0].DBInstanceStatus;
          console.log(`Instance status check ${attempts + 1}/${maxAttempts}: ${status}`);

          if (status === 'available') {
              console.log('RDS instance is now available');
              return response.DBInstances[0];
          }

          if (status === 'failed') {
              throw new Error('RDS instance creation failed');
          }
      } catch (error) {
          console.error('Error checking instance status:', error.message);
          throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 30000));
      attempts++;
  }

  throw new Error('Timed out waiting for RDS instance to become available');
}

// Get VPC ID from environment variables
const vpcId = process.env.VPC_ID;
if (!vpcId) {
  console.error('Error: VPC_ID environment variable is required');
  process.exit(1);
}

// Execute the creation
createPublicRDSInstance(vpcId)
  .then(instance => {
      console.log('\nRDS Instance Details:', {
          Identifier: instance.DBInstanceIdentifier,
          //Engine: `${instance.Engine} ${instance.EngineVersion}`,
          Class: instance.DBInstanceClass,
          Storage: `${instance.AllocatedStorage} GB`,
          Endpoint: instance.Endpoint,
          PubliclyAccessible: instance.PubliclyAccessible,
          Username: 'admin',
          Password: 'Admin123#$%',
          Tags: instance.TagList
      });

      console.log('\nSecurity Configuration:', {
          PublicAccess: 'Enabled (Non-Compliant)',
          DeletionProtection: 'Disabled',
          BackupRetention: '0 days',
          MultiAZ: 'Disabled'
      });

      console.log('\nSecurity Warning:', {
          warning: [
              'Instance is publicly accessible',
              'No deletion protection',
              'No automated backups'
          ],
          risks: [
              'Exposed to internet access',
              'Potential security vulnerability',
              'Increased attack surface',
              'No protection against accidental deletion',
              'No automated recovery points'
          ],
          recommendations: [
              'Disable public accessibility',
              'Use VPC endpoints or VPN for access',
              'Enable deletion protection',
              'Configure automated backups',
              'Implement security groups with strict rules'
          ]
      });
  })
  .catch(error => {
      console.error('Deployment failed:', error.message);
      process.exit(1);
  });
