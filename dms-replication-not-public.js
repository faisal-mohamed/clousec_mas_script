const {
    DatabaseMigrationServiceClient,
    CreateReplicationInstanceCommand,
    DeleteReplicationInstanceCommand,
    DescribeReplicationInstancesCommand,
    CreateReplicationSubnetGroupCommand,
    DeleteReplicationSubnetGroupCommand,
    DescribeReplicationSubnetGroupsCommand
  } = require("@aws-sdk/client-database-migration-service");
  
  
const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");


require('dotenv').config();

// Initialize clients
const dmsClient = new DatabaseMigrationServiceClient({
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

// Get default VPC and subnets
async function getDefaultVpcAndSubnets() {
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

    if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length < 2) {
      throw new Error('Need at least 2 subnets in the VPC');
    }

    // Get first two subnets
    const subnets = subnetsResponse.Subnets.slice(0, 2);
    console.log(`Using subnets: ${subnets.map(s => s.SubnetId).join(', ')}`);

    return { vpcId, subnets };
  } catch (error) {
    console.error('Error getting VPC and subnets:', error);
    throw error;
  }
}

// Create security group
async function createSecurityGroup(vpcId) {
  try {
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: `dms-replication-sg-${Date.now()}`,
        Description: 'Security group for DMS replication instance',
        VpcId: vpcId
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    console.log(`Created security group: ${securityGroupId}`);

    // Add inbound rule for HTTPS
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 443,
        ToPort: 443,
        CidrIp: '0.0.0.0/0'
      })
    );

    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId
    });

    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

// Create replication subnet group
async function createReplicationSubnetGroup(subnets) {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const subnetGroupIdentifier = `dms-subnet-group-${timestamp}`;

    await dmsClient.send(
      new CreateReplicationSubnetGroupCommand({
        ReplicationSubnetGroupIdentifier: subnetGroupIdentifier,
        ReplicationSubnetGroupDescription: 'Subnet group for DMS replication instance',
        SubnetIds: subnets.map(s => s.SubnetId)
      })
    );

    createdResources.push({
      type: 'SUBNET_GROUP',
      id: subnetGroupIdentifier
    });

    console.log(`Created replication subnet group: ${subnetGroupIdentifier}`);
    return subnetGroupIdentifier;
  } catch (error) {
    console.error('Error creating replication subnet group:', error);
    throw error;
  }
}

// Create non-compliant replication instance (with public access)
async function createNonCompliantReplicationInstance(subnetGroupId, securityGroupId) {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const instanceIdentifier = `dms-instance-${timestamp}`;

    await dmsClient.send(
      new CreateReplicationInstanceCommand({
        ReplicationInstanceIdentifier: instanceIdentifier,
        ReplicationInstanceClass: 'dms.t3.micro',
        AllocatedStorage: 20,
        VpcSecurityGroupIds: [securityGroupId],
        PubliclyAccessible: true, // This makes it non-compliant
        MultiAZ: false,
        ReplicationSubnetGroupIdentifier: subnetGroupId,
        PreferredMaintenanceWindow: 'sun:10:30-sun:14:30',
        AutoMinorVersionUpgrade: true
      })
    );

    createdResources.push({
      type: 'REPLICATION_INSTANCE',
      id: instanceIdentifier
    });

    console.log(`Created non-compliant replication instance: ${instanceIdentifier}`);
    return instanceIdentifier;
  } catch (error) {
    console.error('Error creating replication instance:', error);
    throw error;
  }
}

// Check replication instance public accessibility
async function checkReplicationInstancePublic(instanceIdentifier) {
  try {
    const response = await dmsClient.send(
      new DescribeReplicationInstancesCommand({
        Filters: [
          {
            Name: 'replication-instance-id',
            Values: [instanceIdentifier]
          }
        ]
      })
    );

    if (!response.ReplicationInstances || response.ReplicationInstances.length === 0) {
      throw new Error('Replication instance not found');
    }

    const instance = response.ReplicationInstances[0];
    console.log('\nAnalyzing Replication Instance:', instance.ReplicationInstanceIdentifier);
    console.log('Instance Details:');
    console.log(`Class: ${instance.ReplicationInstanceClass}`);
    console.log(`Status: ${instance.ReplicationInstanceStatus}`);
    console.log(`Storage: ${instance.AllocatedStorage} GB`);
    console.log(`Multi-AZ: ${instance.MultiAZ}`);
    
    console.log('\nNetwork Settings:');
    console.log(`Public Accessibility: ${instance.PubliclyAccessible ? 'Enabled' : 'Disabled'}`);
    console.log(`VPC: ${instance.VpcSecurityGroups.map(sg => sg.VpcSecurityGroupId).join(', ')}`);

    const isCompliant = !instance.PubliclyAccessible;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking replication instance:', error);
    throw error;
  }
}

// List and check all replication instances
async function listReplicationInstancesAndCheck() {
  try {
    const response = await dmsClient.send(
      new DescribeReplicationInstancesCommand({})
    );
    
    console.log('\nChecking all replication instances in region:');
    for (const instance of response.ReplicationInstances || []) {
      console.log(`\nInstance: ${instance.ReplicationInstanceIdentifier}`);
      console.log(`Class: ${instance.ReplicationInstanceClass}`);
      console.log(`Status: ${instance.ReplicationInstanceStatus}`);
      console.log(`Public Accessibility: ${instance.PubliclyAccessible ? 'Enabled' : 'Disabled'}`);
      
      const isCompliant = !instance.PubliclyAccessible;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing replication instances:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Delete replication instance
  for (const resource of createdResources) {
    if (resource.type === 'REPLICATION_INSTANCE') {
      try {
        await dmsClient.send(
          new DeleteReplicationInstanceCommand({
            ReplicationInstanceArn: `arn:aws:dms:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:rep:${resource.id}`
          })
        );
        console.log(`Initiated deletion of replication instance: ${resource.id}`);
        
        // Wait for instance to be deleted
        console.log('Waiting for replication instance to be deleted...');
        while (true) {
          try {
            const response = await dmsClient.send(
              new DescribeReplicationInstancesCommand({
                Filters: [
                  {
                    Name: 'replication-instance-id',
                    Values: [resource.id]
                  }
                ]
              })
            );
            if (!response.ReplicationInstances || response.ReplicationInstances.length === 0) {
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 30000));
          } catch (error) {
            if (error.name === 'ResourceNotFoundFault') {
              break;
            }
            throw error;
          }
        }
        console.log('Replication instance deleted');
      } catch (error) {
        console.error(`Error deleting replication instance ${resource.id}:`, error);
      }
    }
  }

  // Delete subnet group
  for (const resource of createdResources) {
    if (resource.type === 'SUBNET_GROUP') {
      try {
        await dmsClient.send(
          new DeleteReplicationSubnetGroupCommand({
            ReplicationSubnetGroupIdentifier: resource.id
          })
        );
        console.log(`Deleted subnet group: ${resource.id}`);
      } catch (error) {
        console.error(`Error deleting subnet group ${resource.id}:`, error);
      }
    }
  }

  // Delete security group
  for (const resource of createdResources) {
    if (resource.type === 'SECURITY_GROUP') {
      try {
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
    console.log('Starting DMS replication instance public access check...');
    
    // Get VPC and subnets
    const { vpcId, subnets } = await getDefaultVpcAndSubnets();
    
    // Create security group
    const securityGroupId = await createSecurityGroup(vpcId);
    
    // Create subnet group
    const subnetGroupId = await createReplicationSubnetGroup(subnets);
    
    // Create non-compliant replication instance
    console.log('\nCreating non-compliant replication instance...');
    const instanceId = await createNonCompliantReplicationInstance(subnetGroupId, securityGroupId);
    
    // Check public accessibility
    await checkReplicationInstancePublic(instanceId);
    
    // List all instances and check them
    await listReplicationInstancesAndCheck();
    
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
