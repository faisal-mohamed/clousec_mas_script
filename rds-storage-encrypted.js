require('dotenv').config();
const {
  RDSClient,
  CreateDBInstanceCommand,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  ModifyDBInstanceCommand
} = require("@aws-sdk/client-rds");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand
} = require("@aws-sdk/client-ec2");

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

// Track created resources
const createdResources = [];

// Get VPC information
async function getVpcInfo() {
  try {
    // Get default VPC
    const vpcsResponse = await ec2Client.send(
      new DescribeVpcsCommand({
        Filters: [{ Name: 'isDefault', Values: ['true'] }]
      })
    );

    if (!vpcsResponse.Vpcs || vpcsResponse.Vpcs.length === 0) {
      throw new Error('No default VPC found');
    }

    const vpcId = vpcsResponse.Vpcs[0].VpcId;

    // Get subnets in the VPC
    const subnetsResponse = await ec2Client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
      })
    );

    if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length === 0) {
      throw new Error('No subnets found in VPC');
    }

    return {
      vpcId,
      subnetIds: subnetsResponse.Subnets.map(subnet => subnet.SubnetId)
    };
  } catch (error) {
    console.error('Error getting VPC info:', error);
    throw error;
  }
}

// Create security group for RDS
async function createSecurityGroup(vpcId) {
  try {
    const groupName = `rds-test-sg-${Date.now()}`;
    
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Temporary security group for RDS test',
        VpcId: vpcId
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId
    });

    // Add inbound rule
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 3306,
        ToPort: 3306,
        CidrIp: '10.0.0.0/16'
      })
    );

    console.log(`Created security group: ${securityGroupId}`);
    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

// Create non-compliant RDS instance (without storage encryption)
async function createNonCompliantInstance() {
  try {
    // Get VPC info
    const { vpcId, subnetIds } = await getVpcInfo();
    
    // Create security group
    const securityGroupId = await createSecurityGroup(vpcId);

    // Generate unique identifier
    const timestamp = Math.floor(Date.now() / 1000).toString().slice(-8);
    const identifier = `test-db-${timestamp}`;

    // Create RDS instance
    const createDbResponse = await rdsClient.send(
      new CreateDBInstanceCommand({
        DBInstanceIdentifier: identifier,
        Engine: 'mysql',
        //EngineVersion: '8.0.28',
        DBInstanceClass: 'db.t3.micro',
        AllocatedStorage: 20,
        MasterUsername: 'admin',
        MasterUserPassword: 'Password123!',
        VpcSecurityGroupIds: [securityGroupId],
        StorageEncrypted: false, // Create without storage encryption (non-compliant)
        PubliclyAccessible: false,
        BackupRetentionPeriod: 0, // Disable automated backups for faster deletion
        DeletionProtection: false
      })
    );

    const dbInstance = createDbResponse.DBInstance;
    createdResources.push({
      type: 'RDS_INSTANCE',
      id: identifier
    });

    console.log(`Created non-compliant RDS instance: ${identifier}`);

    // Wait for instance to be available
    await waitForInstanceAvailable(identifier);

    return identifier;
  } catch (error) {
    console.error('Error creating non-compliant RDS instance:', error);
    throw error;
  }
}

// Wait for RDS instance to be available
async function waitForInstanceAvailable(identifier) {
  console.log('Waiting for RDS instance to be available...');
  
  while (true) {
    try {
      const response = await rdsClient.send(
        new DescribeDBInstancesCommand({
          DBInstanceIdentifier: identifier
        })
      );

      const status = response.DBInstances[0].DBInstanceStatus;
      console.log(`Instance status: ${status}`);
      
      if (status === 'available') {
        break;
      }
    } catch (error) {
      console.error('Error checking instance status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
  }
}

// Check RDS instance encryption
async function checkInstanceEncryption(identifier) {
  try {
    const response = await rdsClient.send(
      new DescribeDBInstancesCommand({
        DBInstanceIdentifier: identifier
      })
    );

    const instance = response.DBInstances[0];
    console.log('\nAnalyzing RDS Instance:', identifier);
    console.log('Instance Details:');
    console.log(`Engine: ${instance.Engine} ${instance.EngineVersion}`);
    console.log(`Class: ${instance.DBInstanceClass}`);
    console.log(`Storage: ${instance.AllocatedStorage} GB`);
    
    console.log('\nEncryption Settings:');
    console.log(`Storage Encrypted: ${instance.StorageEncrypted}`);
    if (instance.StorageEncrypted) {
      console.log(`KMS Key ID: ${instance.KmsKeyId}`);
    }

    // Determine compliance
    const isCompliant = instance.StorageEncrypted === true;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking instance encryption:', error);
    throw error;
  }
}

// List and check all RDS instances
async function listInstancesAndCheckEncryption() {
  try {
    const response = await rdsClient.send(
      new DescribeDBInstancesCommand({})
    );

    console.log('\nChecking all RDS instances in region:');
    for (const instance of response.DBInstances) {
      console.log(`\nInstance Identifier: ${instance.DBInstanceIdentifier}`);
      console.log(`Engine: ${instance.Engine} ${instance.EngineVersion}`);
      console.log(`Storage Encrypted: ${instance.StorageEncrypted}`);
      if (instance.StorageEncrypted) {
        console.log(`KMS Key ID: ${instance.KmsKeyId}`);
      }
      console.log(`Compliance Status: ${instance.StorageEncrypted ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing instances:', error);
  }
}

// Cleanup resources
async function cleanup() {
    console.log('\nCleaning up resources...');
  
    // First, delete RDS instance
    for (const resource of createdResources.reverse()) {
      if (resource.type === 'RDS_INSTANCE') {
        try {
          await rdsClient.send(
            new DeleteDBInstanceCommand({
              DBInstanceIdentifier: resource.id,
              SkipFinalSnapshot: true,
              DeleteAutomatedBackups: true
            })
          );
          console.log(`Initiated deletion of RDS instance: ${resource.id}`);
          
          // Wait for RDS instance to be fully deleted
          console.log('Waiting for RDS instance to be deleted...');
          while (true) {
            try {
              const response = await rdsClient.send(
                new DescribeDBInstancesCommand({
                  DBInstanceIdentifier: resource.id
                })
              );
              console.log(`Instance status: ${response.DBInstances[0].DBInstanceStatus}`);
              await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
            } catch (error) {
              // If the instance is not found, it means it's deleted
              if (error.name === 'DBInstanceNotFoundFault') {
                console.log('RDS instance deleted successfully');
                break;
              }
              throw error;
            }
          }
        } catch (error) {
          console.error(`Error deleting RDS instance ${resource.id}:`, error);
        }
      }
    }
  
    // Add additional wait time after RDS deletion
    console.log('Waiting additional time before cleaning up security group...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // Wait 60 seconds
  
    // Then delete security group
    for (const resource of createdResources) {
      if (resource.type === 'SECURITY_GROUP') {
        try {
          let retries = 5;
          while (retries > 0) {
            try {
              await ec2Client.send(
                new DeleteSecurityGroupCommand({
                  GroupId: resource.id
                })
              );
              console.log(`Deleted security group: ${resource.id}`);
              break;
            } catch (error) {
              if (error.Code === 'DependencyViolation' && retries > 1) {
                console.log(`Security group still has dependencies. Retrying in 30 seconds... (${retries - 1} retries left)`);
                await new Promise(resolve => setTimeout(resolve, 30000));
                retries--;
              } else {
                throw error;
              }
            }
          }
        } catch (error) {
          console.error(`Error deleting security group ${resource.id}:`, error);
        }
      }
    }
  }
  

// Main execution
async function main() {
  try {
    console.log('Starting RDS storage encryption check...');
    
    // Create non-compliant instance
    console.log('\nCreating non-compliant RDS instance...');
    const identifier = await createNonCompliantInstance();
    
    // Check encryption configuration
    await checkInstanceEncryption(identifier);
    
    // List all instances and check their encryption
    await listInstancesAndCheckEncryption();
    
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
