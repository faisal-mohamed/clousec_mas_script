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
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
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

// Get default VPC and subnet information
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
    console.log(`Found default VPC: ${vpcId}`);

    // Get subnets in the default VPC
    const subnetsResponse = await ec2Client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
      })
    );

    if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length === 0) {
      throw new Error('No subnets found in default VPC');
    }

    // Get subnet IDs
    const subnetIds = subnetsResponse.Subnets.map(subnet => subnet.SubnetId);
    console.log(`Found subnets: ${subnetIds.join(', ')}`);

    return { vpcId, subnetIds };
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
        Description: 'Security group for RDS public access test',
        VpcId: vpcId
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId
    });

    // Add inbound rule for MySQL/Aurora (3306)
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 3306,
        ToPort: 3306,
        CidrIp: '0.0.0.0/0' // Allow access from anywhere (non-compliant)
      })
    );

    console.log(`Created security group: ${securityGroupId}`);
    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

// Create non-compliant RDS instance (publicly accessible)
async function createNonCompliantRDS(vpcId, subnetIds, securityGroupId) {
  try {
    const dbInstanceIdentifier = `test-db-${Date.now()}`;
    
    const params = {
      DBInstanceIdentifier: dbInstanceIdentifier,
      Engine: 'mysql',
      DBInstanceClass: 'db.t3.micro', // Smallest instance class for cost efficiency
      AllocatedStorage: 20, // Minimum storage
      MasterUsername: 'admin',
      MasterUserPassword: `Test${Date.now()}!`, // Random password
      VpcSecurityGroupIds: [securityGroupId],
      AvailabilityZone: process.env.AWS_REGION + 'a',
      DBSubnetGroupName: undefined, // Will be created if needed
      PubliclyAccessible: true, // Non-compliant setting
      MaxAllocatedStorage: 1000,
      BackupRetentionPeriod: 0, // Disable automated backups for faster deletion
      DeletionProtection: false
    };

    await rdsClient.send(new CreateDBInstanceCommand(params));

    createdResources.push({
      type: 'RDS',
      id: dbInstanceIdentifier
    });

    console.log(`Creating RDS instance: ${dbInstanceIdentifier}`);
    return dbInstanceIdentifier;
  } catch (error) {
    console.error('Error creating RDS instance:', error);
    throw error;
  }
}

// Check RDS instance public accessibility
async function checkRDSPublicAccess(dbInstanceIdentifier) {
  try {
    const response = await rdsClient.send(
      new DescribeDBInstancesCommand({
        DBInstanceIdentifier: dbInstanceIdentifier
      })
    );

    if (!response.DBInstances || response.DBInstances.length === 0) {
      throw new Error('DB instance not found');
    }

    const instance = response.DBInstances[0];
    console.log('\nAnalyzing RDS Instance:', instance.DBInstanceIdentifier);
    console.log('Configuration:');
    console.log(`Engine: ${instance.Engine}`);
    console.log(`Instance Class: ${instance.DBInstanceClass}`);
    console.log(`Status: ${instance.DBInstanceStatus}`);
    console.log(`Publicly Accessible: ${instance.PubliclyAccessible}`);
    console.log(`Endpoint: ${instance.Endpoint?.Address || 'Not available yet'}`);

    const isCompliant = !instance.PubliclyAccessible;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    if (!isCompliant) {
      console.log('Reason: Instance is publicly accessible');
    }

    return isCompliant;
  } catch (error) {
    console.error('Error checking RDS instance:', error);
    throw error;
  }
}

// List and check all RDS instances
async function listInstancesAndCheck() {
  try {
    const response = await rdsClient.send(new DescribeDBInstancesCommand({}));
    
    console.log('\nChecking all RDS instances:');
    let totalInstances = 0;
    let nonCompliantInstances = 0;

    for (const instance of response.DBInstances) {
      totalInstances++;
      console.log(`\nInstance: ${instance.DBInstanceIdentifier}`);
      console.log(`Engine: ${instance.Engine}`);
      console.log(`Publicly Accessible: ${instance.PubliclyAccessible}`);
      
      if (instance.PubliclyAccessible) {
        nonCompliantInstances++;
        console.log('Status: NON_COMPLIANT');
      } else {
        console.log('Status: COMPLIANT');
      }
    }

    console.log(`\nTotal instances: ${totalInstances}`);
    console.log(`Non-compliant instances: ${nonCompliantInstances}`);
  } catch (error) {
    console.error('Error listing instances:', error);
  }
}

// Wait for RDS instance to be available
async function waitForInstance(dbInstanceIdentifier, targetState = 'available') {
  console.log(`Waiting for instance ${dbInstanceIdentifier} to be ${targetState}...`);
  while (true) {
    try {
      const response = await rdsClient.send(
        new DescribeDBInstancesCommand({
          DBInstanceIdentifier: dbInstanceIdentifier
        })
      );

      const state = response.DBInstances[0].DBInstanceStatus;
      console.log(`Current state: ${state}`);
      
      if (state === targetState) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
    } catch (error) {
      if (error.name === 'DBInstanceNotFoundFault' && targetState === 'deleted') {
        break;
      }
      throw error;
    }
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Delete RDS instances first
  for (const resource of createdResources) {
    if (resource.type === 'RDS') {
      try {
        console.log(`Deleting RDS instance: ${resource.id}`);
        await rdsClient.send(
          new DeleteDBInstanceCommand({
            DBInstanceIdentifier: resource.id,
            SkipFinalSnapshot: true,
            DeleteAutomatedBackups: true
          })
        );
        
        // Wait for instance to be deleted
        await waitForInstance(resource.id, 'deleted');
      } catch (error) {
        console.error(`Error deleting RDS instance ${resource.id}:`, error);
      }
    }
  }

  // Delete security groups
  for (const resource of createdResources) {
    if (resource.type === 'SECURITY_GROUP') {
      try {
        // Add delay before deleting security group
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await ec2Client.send(
          new DeleteSecurityGroupCommand({
            GroupId: resource.id
          })
        );
        console.log(`Deleted security group: ${resource.id}`);
      } catch (error) {
        console.error(`Error deleting security group ${resource.id}:`, error);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting RDS public access check...');
    
    // Get VPC info
    const { vpcId, subnetIds } = await getVpcInfo();
    
    // Create security group
    const securityGroupId = await createSecurityGroup(vpcId);
    
    // Create non-compliant RDS instance
    const dbInstanceIdentifier = await createNonCompliantRDS(vpcId, subnetIds, securityGroupId);
    
    // Wait for instance to be available
    await waitForInstance(dbInstanceIdentifier);
    
    // Check instance
    await checkRDSPublicAccess(dbInstanceIdentifier);
    
    // List all instances
    await listInstancesAndCheck();
    
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
