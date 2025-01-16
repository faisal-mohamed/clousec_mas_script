require('dotenv').config();
const {
  EMRClient,
  RunJobFlowCommand,
  TerminateJobFlowsCommand,
  DescribeClusterCommand,
  ListClustersCommand
} = require("@aws-sdk/client-emr");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");

// Initialize clients
const emrClient = new EMRClient({
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

// Get default VPC and subnet
async function getDefaultVpcAndSubnet() {
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

    // Choose the first subnet
    const subnetId = subnetsResponse.Subnets[0].SubnetId;
    console.log(`Using subnet: ${subnetId}`);

    return { vpcId, subnetId };
  } catch (error) {
    console.error('Error getting default VPC and subnet:', error);
    throw error;
  }
}

// Create security groups for EMR
async function createSecurityGroups(vpcId) {
  try {
    // Create master node security group
    const masterSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: `emr-master-sg-${Date.now()}`,
        Description: 'Security group for EMR master node',
        VpcId: vpcId
      })
    );

    const masterSgId = masterSgResponse.GroupId;
    console.log(`Created master security group: ${masterSgId}`);

    // Create slave node security group
    const slaveSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: `emr-slave-sg-${Date.now()}`,
        Description: 'Security group for EMR slave nodes',
        VpcId: vpcId
      })
    );

    const slaveSgId = slaveSgResponse.GroupId;
    console.log(`Created slave security group: ${slaveSgId}`);

    // Add inbound rules
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: masterSgId,
        IpProtocol: 'tcp',
        FromPort: 22,
        ToPort: 22,
        CidrIp: '0.0.0.0/0'
      })
    );

    createdResources.push(
      {
        type: 'SECURITY_GROUP',
        id: masterSgId
      },
      {
        type: 'SECURITY_GROUP',
        id: slaveSgId
      }
    );

    return { masterSgId, slaveSgId };
  } catch (error) {
    console.error('Error creating security groups:', error);
    throw error;
  }
}

// Create non-compliant EMR cluster (with public IP)
async function createNonCompliantCluster(subnetId, masterSgId, slaveSgId) {
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const clusterName = `test-cluster-${timestamp}`;

    const response = await emrClient.send(
      new RunJobFlowCommand({
        Name: clusterName,
        ReleaseLabel: 'emr-6.10.0',
        Instances: {
          InstanceGroups: [
            {
              Name: 'Master',
              Market: 'ON_DEMAND',
              InstanceRole: 'MASTER',
              InstanceType: 'm5.xlarge',
              InstanceCount: 1
            },
            {
              Name: 'Core',
              Market: 'ON_DEMAND',
              InstanceRole: 'CORE',
              InstanceType: 'm5.xlarge',
              InstanceCount: 1
            }
          ],
          Ec2KeyName: process.env.EC2_KEY_NAME, // Optional: SSH key name
          KeepJobFlowAliveWhenNoSteps: true,
          EmrManagedMasterSecurityGroup: masterSgId,
          EmrManagedSlaveSecurityGroup: slaveSgId,
          Ec2SubnetId: subnetId
        },
        Applications: [
          { Name: 'Spark' },
          { Name: 'Hive' }
        ],
        VisibleToAllUsers: true,
        JobFlowRole: 'EMR_EC2_DefaultRole',
        ServiceRole: 'EMR_DefaultRole',
        LogUri: `s3://${process.env.S3_BUCKET}/emr-logs/` // Optional: S3 bucket for logs
      })
    );

    const clusterId = response.JobFlowId;
    createdResources.push({
      type: 'CLUSTER',
      id: clusterId
    });

    console.log(`Created EMR cluster: ${clusterId}`);

    // Wait for cluster to be running
    console.log('Waiting for cluster to be running...');
    while (true) {
      const clusterStatus = await emrClient.send(
        new DescribeClusterCommand({
          ClusterId: clusterId
        })
      );
      
      const state = clusterStatus.Cluster.Status.State;
      console.log(`Cluster state: ${state}`);
      
      if (state === 'RUNNING' || state === 'WAITING') {
        break;
      } else if (state === 'TERMINATED' || state === 'TERMINATED_WITH_ERRORS') {
        throw new Error(`Cluster terminated with state: ${state}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 30000));
    }

    return clusterId;
  } catch (error) {
    console.error('Error creating EMR cluster:', error);
    throw error;
  }
}

// Check cluster master node public IP
async function checkClusterMasterPublicIP(clusterId) {
  try {
    const response = await emrClient.send(
      new DescribeClusterCommand({
        ClusterId: clusterId
      })
    );

    const cluster = response.Cluster;
    console.log('\nAnalyzing Cluster:', cluster.Id);
    console.log('Cluster Details:');
    console.log(`Name: ${cluster.Name}`);
    console.log(`State: ${cluster.Status.State}`);
    console.log(`Release Label: ${cluster.ReleaseLabel}`);
    
    console.log('\nNetwork Settings:');
    const masterPublicDnsName = cluster.MasterPublicDnsName;
    console.log(`Master Public DNS: ${masterPublicDnsName || 'None'}`);
    console.log(`VPC ID: ${cluster.Ec2InstanceAttributes.Ec2SubnetId}`);

    const isCompliant = !masterPublicDnsName;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking cluster:', error);
    throw error;
  }
}

// List and check all clusters
async function listClustersAndCheck() {
  try {
    const response = await emrClient.send(
      new ListClustersCommand({
        ClusterStates: ['RUNNING', 'WAITING']
      })
    );
    
    console.log('\nChecking all active EMR clusters in region:');
    for (const cluster of response.Clusters) {
      try {
        const clusterDetails = await emrClient.send(
          new DescribeClusterCommand({
            ClusterId: cluster.Id
          })
        );
        
        console.log(`\nCluster: ${cluster.Id}`);
        console.log(`Name: ${cluster.Name}`);
        console.log(`State: ${cluster.Status.State}`);
        
        const masterPublicDnsName = clusterDetails.Cluster.MasterPublicDnsName;
        console.log(`Master Public DNS: ${masterPublicDnsName || 'None'}`);
        
        const isCompliant = !masterPublicDnsName;
        console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
      } catch (error) {
        console.error(`Error checking cluster ${cluster.Id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error listing clusters:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Terminate EMR clusters
  for (const resource of createdResources) {
    if (resource.type === 'CLUSTER') {
      try {
        await emrClient.send(
          new TerminateJobFlowsCommand({
            JobFlowIds: [resource.id]
          })
        );
        console.log(`Initiated termination of cluster: ${resource.id}`);
        
        // Wait for cluster termination
        console.log('Waiting for cluster to terminate...');
        while (true) {
          const clusterStatus = await emrClient.send(
            new DescribeClusterCommand({
              ClusterId: resource.id
            })
          );
          
          const state = clusterStatus.Cluster.Status.State;
          if (state === 'TERMINATED' || state === 'TERMINATED_WITH_ERRORS') {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      } catch (error) {
        console.error(`Error terminating cluster ${resource.id}:`, error);
      }
    }
  }

  // Delete security groups
  for (const resource of createdResources) {
    if (resource.type === 'SECURITY_GROUP') {
      try {
        // Add delay before deleting security groups
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
    console.log('Starting EMR cluster public IP check...');
    
    // Get VPC and subnet
    const { vpcId, subnetId } = await getDefaultVpcAndSubnet();
    
    // Create security groups
    const { masterSgId, slaveSgId } = await createSecurityGroups(vpcId);
    
    // Create non-compliant cluster
    console.log('\nCreating non-compliant EMR cluster...');
    const clusterId = await createNonCompliantCluster(subnetId, masterSgId, slaveSgId);
    
    // Check cluster public IP
    await checkClusterMasterPublicIP(clusterId);
    
    // List all clusters and check them
    await listClustersAndCheck();
    
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
