const {
  RDSClient,
  CreateDBInstanceCommand,
  CreateDBSnapshotCommand,
  ModifyDBSnapshotCommand,
  DescribeDBSnapshotsCommand,
  DescribeDBInstancesCommand,
  CreateDBSubnetGroupCommand,
  waitUntilDBSnapshotAvailable,
  waitUntilDBInstanceAvailable
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
          throw new Error(`Need subnets in at least 2 AZs. Found only ${availableAZs.length} AZ(s).`);
      }

      const selectedSubnets = [];
      for (const az of availableAZs.slice(0, 2)) {
          const bestSubnet = subnetsByAZ[az]
              .sort((a, b) => b.AvailableIpAddressCount - a.AvailableIpAddressCount)[0];
          selectedSubnets.push(bestSubnet);
      }

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

async function createRDSInstance(vpcId) {
  try {
      const subnetIds = await getAvailableSubnets(vpcId);
      const timestamp = Date.now().toString().slice(-4);
      const instanceIdentifier = `rds-snapshot-test-${timestamp}`;

      console.log('Creating RDS instance...');
      const params = {
          DBInstanceIdentifier: instanceIdentifier,
          Engine: 'mysql',
          //EngineVersion: '8.0.28',
          DBInstanceClass: 'db.t3.micro',
          AllocatedStorage: 20,
          MasterUsername: 'admin',
          MasterUserPassword: 'Admin123#$%',
          PubliclyAccessible: false,
          DBSubnetGroupName: await createDBSubnetGroup(instanceIdentifier, subnetIds),
          Tags: commonTags,
          MultiAZ: false,
          BackupRetentionPeriod: 0,
          DeletionProtection: false
      };

      const createResponse = await rdsClient.send(new CreateDBInstanceCommand(params));
      console.log('RDS Instance creation initiated:', {
          DBInstanceIdentifier: instanceIdentifier,
          Status: createResponse.DBInstance.DBInstanceStatus
      });

      console.log('Waiting for RDS instance to become available...');
      await waitUntilDBInstanceAvailable(
          {
              client: rdsClient,
              maxWaitTime: 900
          },
          {
              DBInstanceIdentifier: instanceIdentifier
          }
      );

      return instanceIdentifier;
  } catch (error) {
      console.error('Error creating RDS instance:', error.message);
      throw error;
  }
}

async function createAndSharePublicSnapshot(dbInstanceIdentifier) {
  try {
      const timestamp = Date.now().toString().slice(-4);
      const snapshotIdentifier = `public-snapshot-${timestamp}`;

      console.log('\nCreating DB snapshot...');
      const createParams = {
          DBInstanceIdentifier: dbInstanceIdentifier,
          DBSnapshotIdentifier: snapshotIdentifier,
          Tags: [
              ...commonTags,
              {
                  Key: 'Public',
                  Value: 'true'
              }
          ]
      };

      const createResponse = await rdsClient.send(new CreateDBSnapshotCommand(createParams));
      console.log('Snapshot creation initiated:', {
          SnapshotIdentifier: snapshotIdentifier,
          Status: createResponse.DBSnapshot.Status
      });

      console.log('\nWaiting for snapshot to become available...');
      await waitUntilDBSnapshotAvailable(
          {
              client: rdsClient,
              maxWaitTime: 900
          },
          {
              DBSnapshotIdentifier: snapshotIdentifier
          }
      );

      console.log('Making snapshot public...');
      const modifyParams = {
          DBSnapshotIdentifier: snapshotIdentifier,
          AttributeName: 'restore',
          ValuesToAdd: ['all']
      };

      await rdsClient.send(new ModifyDBSnapshotCommand(modifyParams));
      console.log('Snapshot is now public');

      const describeResponse = await rdsClient.send(new DescribeDBSnapshotsCommand({
          DBSnapshotIdentifier: snapshotIdentifier
      }));
      
      return describeResponse.DBSnapshots[0];
  } catch (error) {
      console.error('Error in snapshot operation:', error.message);
      throw error;
  }
}

async function main() {
  try {
      const vpcId = process.env.VPC_ID;
      if (!vpcId) {
          throw new Error('VPC_ID environment variable is required');
      }

      console.log('Starting RDS instance and public snapshot creation...');
      
      // Create RDS instance
      const dbInstanceId = await createRDSInstance(vpcId);
      console.log(`RDS instance ${dbInstanceId} created successfully`);

      // Create and share public snapshot
      const snapshot = await createAndSharePublicSnapshot(dbInstanceId);
      
      console.log('\nOperation completed successfully:', {
          DBInstance: dbInstanceId,
          SnapshotId: snapshot.DBSnapshotIdentifier,
          Status: snapshot.Status,
          Public: true,
          CreatedAt: snapshot.SnapshotCreateTime
      });

      console.log('\nSecurity Warning:', {
          warnings: [
              'RDS snapshot is publicly accessible',
              'Any AWS account can restore this snapshot',
              'Database contents are exposed',
              'Non-compliant with security best practices'
          ],
          risks: [
              'Data exposure to unauthorized parties',
              'Potential data breaches',
              'Compliance violations',
              'Security policy violations'
          ],
          recommendations: [
              'Make snapshot private immediately',
              'Implement proper access controls',
              'Review security policies',
              'Monitor snapshot access'
          ]
      });

  } catch (error) {
      console.error('Operation failed:', error.message);
      process.exit(1);
  }
}

// Execute the script
main();
