require('dotenv').config();
const {
  RedshiftClient,
  CreateClusterCommand,
  DeleteClusterCommand,
  DescribeClustersCommand,
  DescribeClusterParameterGroupsCommand
} = require("@aws-sdk/client-redshift");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DeleteSecurityGroupCommand
} = require("@aws-sdk/client-ec2");

// Initialize clients
const redshiftClient = new RedshiftClient({
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

// Create security group for Redshift
async function createSecurityGroup(vpcId) {
  try {
    const groupName = `redshift-test-sg-${Date.now()}`;
    
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Temporary security group for Redshift test',
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
        FromPort: 5439,
        ToPort: 5439,
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

// Create non-compliant Redshift cluster (without KMS encryption)
async function createNonCompliantCluster() {
  try {
    // Get VPC info
    const { vpcId, subnetIds } = await getVpcInfo();
    
    // Create security group
    const securityGroupId = await createSecurityGroup(vpcId);

    // Generate unique identifier (must be lowercase)
    const timestamp = Math.floor(Date.now() / 1000).toString().slice(-8);
    const identifier = `test-cluster-${timestamp}`;

    // Create Redshift cluster
    const createClusterResponse = await redshiftClient.send(
      new CreateClusterCommand({
        ClusterIdentifier: identifier,
        NodeType: 'dc2.large',
        MasterUsername: 'admin',
        MasterUserPassword: 'Password123!',
        NumberOfNodes: 2,
        VpcSecurityGroupIds: [securityGroupId],
        Encrypted: false, // Create without KMS encryption (non-compliant)
        PubliclyAccessible: false,
        Port: 5439
      })
    );

    createdResources.push({
      type: 'REDSHIFT_CLUSTER',
      id: identifier
    });

    console.log(`Created non-compliant Redshift cluster: ${identifier}`);

    // Wait for cluster to be available
    await waitForClusterAvailable(identifier);

    return identifier;
  } catch (error) {
    console.error('Error creating non-compliant Redshift cluster:', error);
    throw error;
  }
}

// Wait for Redshift cluster to be available
async function waitForClusterAvailable(identifier) {
  console.log('Waiting for Redshift cluster to be available...');
  
  while (true) {
    try {
      const response = await redshiftClient.send(
        new DescribeClustersCommand({
          ClusterIdentifier: identifier
        })
      );

      const status = response.Clusters[0].ClusterStatus;
      console.log(`Cluster status: ${status}`);
      
      if (status === 'available') {
        break;
      }
    } catch (error) {
      console.error('Error checking cluster status:', error);
    }

    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
  }
}

// Check cluster encryption
async function checkClusterEncryption(identifier) {
  try {
    const response = await redshiftClient.send(
      new DescribeClustersCommand({
        ClusterIdentifier: identifier
      })
    );

    const cluster = response.Clusters[0];
    console.log('\nAnalyzing Redshift Cluster:', identifier);
    console.log('Cluster Details:');
    console.log(`Node Type: ${cluster.NodeType}`);
    console.log(`Number of Nodes: ${cluster.NumberOfNodes}`);
    console.log(`Status: ${cluster.ClusterStatus}`);
    
    console.log('\nEncryption Settings:');
    console.log(`Encrypted: ${cluster.Encrypted}`);
    if (cluster.Encrypted) {
      console.log(`KMS Key ID: ${cluster.KmsKeyId}`);
    }

    // Determine compliance
    const isCompliant = cluster.Encrypted === true && cluster.KmsKeyId != null;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking cluster encryption:', error);
    throw error;
  }
}

// List and check all Redshift clusters
async function listClustersAndCheckEncryption() {
  try {
    const response = await redshiftClient.send(
      new DescribeClustersCommand({})
    );

    console.log('\nChecking all Redshift clusters in region:');
    for (const cluster of response.Clusters) {
      console.log(`\nCluster Identifier: ${cluster.ClusterIdentifier}`);
      console.log(`Node Type: ${cluster.NodeType}`);
      console.log(`Encrypted: ${cluster.Encrypted}`);
      if (cluster.Encrypted) {
        console.log(`KMS Key ID: ${cluster.KmsKeyId}`);
      }
      const isCompliant = cluster.Encrypted === true && cluster.KmsKeyId != null;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing clusters:', error);
  }
}

// Cleanup resources
// Cleanup resources
async function cleanup() {
    console.log('\nCleaning up resources...');
  
    // First, delete Redshift cluster
    for (const resource of createdResources.reverse()) {
      if (resource.type === 'REDSHIFT_CLUSTER') {
        try {
          await redshiftClient.send(
            new DeleteClusterCommand({
              ClusterIdentifier: resource.id,
              SkipFinalClusterSnapshot: true,  // This must be explicitly set to true
              FinalClusterSnapshotIdentifier: undefined  // This should be undefined when skipping snapshot
            })
          );
          console.log(`Initiated deletion of Redshift cluster: ${resource.id}`);
          
          // Wait for cluster to be fully deleted
          console.log('Waiting for Redshift cluster to be deleted...');
          while (true) {
            try {
              const response = await redshiftClient.send(
                new DescribeClustersCommand({
                  ClusterIdentifier: resource.id
                })
              );
              console.log(`Cluster status: ${response.Clusters[0].ClusterStatus}`);
              await new Promise(resolve => setTimeout(resolve, 30000));
            } catch (error) {
              if (error.name === 'ClusterNotFoundFault') {
                console.log('Redshift cluster deleted successfully');
                break;
              }
              throw error;
            }
          }
        } catch (error) {
          console.error(`Error deleting Redshift cluster ${resource.id}:`, error);
        }
      }
    }
  
    // Add additional wait time after cluster deletion
    console.log('Waiting additional time before cleaning up security group...');
    await new Promise(resolve => setTimeout(resolve, 60000));
  
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
    console.log('Starting Redshift cluster encryption check...');
    
    // Create non-compliant cluster
    console.log('\nCreating non-compliant Redshift cluster...');
    const identifier = await createNonCompliantCluster();
    
    // Check encryption configuration
    await checkClusterEncryption(identifier);
    
    // List all clusters and check their encryption
    await listClustersAndCheckEncryption();
    
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
