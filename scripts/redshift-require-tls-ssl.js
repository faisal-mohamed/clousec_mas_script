const {
  RedshiftClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  CreateClusterSubnetGroupCommand,
  CreateClusterParameterGroupCommand,
  ModifyClusterParameterGroupCommand
} = require("@aws-sdk/client-redshift");

const {
  EC2Client,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

const commonTag = {
  Key: 'simulation-mas',
  Value: 'true'
};

// Initialize clients
const redshiftClient = new RedshiftClient({
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

async function createParameterGroup() {
  try {
    const parameterGroupName = `redshift-params-${Date.now()}`;

    // Create parameter group
    await redshiftClient.send(
      new CreateClusterParameterGroupCommand({
        ParameterGroupName: parameterGroupName,
        ParameterGroupFamily: 'redshift-1.0',
        Description: 'Parameter group allowing unencrypted connections',
        Tags: [commonTag]
      })
    );

    // Modify parameter group to disable SSL requirement
    await redshiftClient.send(
      new ModifyClusterParameterGroupCommand({
        ParameterGroupName: parameterGroupName,
        Parameters: [
          {
            ParameterName: 'require_ssl',
            ParameterValue: 'false',
            ApplyType: 'static'
          }
        ]
      })
    );

    console.log(`Created parameter group: ${parameterGroupName} with SSL requirement disabled`);
    return parameterGroupName;
  } catch (error) {
    console.error('Error creating parameter group:', error);
    throw error;
  }
}

async function getSubnets(vpcId) {
  try {
    console.log(`Searching for subnets in VPC: ${vpcId}`);
    
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

    console.log('\nAvailable subnets:');
    response.Subnets.forEach(subnet => {
      console.log(`- Subnet ID: ${subnet.SubnetId}`);
      console.log(`  AZ: ${subnet.AvailabilityZone}`);
      console.log(`  CIDR: ${subnet.CidrBlock}`);
    });

    // Group by AZ and select one from each
    const subnetsByAZ = response.Subnets.reduce((acc, subnet) => {
      const az = subnet.AvailabilityZone;
      if (!acc[az]) {
        acc[az] = [];
      }
      acc[az].push(subnet);
      return acc;
    }, {});

    const availableAZs = Object.keys(subnetsByAZ);
    if (availableAZs.length < 2) {
      throw new Error(`Need subnets in at least 2 AZs. Found only ${availableAZs.length} AZ(s)`);
    }

    const selectedSubnets = [
      subnetsByAZ[availableAZs[0]][0],
      subnetsByAZ[availableAZs[1]][0]
    ];

    console.log('\nSelected subnets:');
    selectedSubnets.forEach(subnet => {
      console.log(`- ${subnet.SubnetId} (${subnet.AvailabilityZone})`);
    });

    return selectedSubnets.map(subnet => ({
      SubnetId: subnet.SubnetId,
      AvailabilityZone: subnet.AvailabilityZone
    }));
  } catch (error) {
    console.error('Error getting subnets:', error);
    throw error;
  }
}

async function createSecurityGroup(vpcId) {
  try {
    const groupName = `redshift-sg-${Date.now()}`;
    
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Security group for Redshift cluster',
        VpcId: vpcId,
        TagSpecifications: [{
          ResourceType: 'security-group',
          Tags: [commonTag]
        }]
      })
    );

    const securityGroupId = createSgResponse.GroupId;

    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 5439,
        ToPort: 5439,
        CidrIp: '0.0.0.0/0'
      })
    );

    console.log(`Created security group: ${securityGroupId}`);
    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

async function createSubnetGroup(vpcId) {
  try {
    const subnets = await getSubnets(vpcId);
    const subnetGroupName = `redshift-subnet-group-${Date.now()}`;
    
    await redshiftClient.send(
      new CreateClusterSubnetGroupCommand({
        ClusterSubnetGroupName: subnetGroupName,
        Description: 'Subnet group for Redshift cluster',
        SubnetIds: subnets.map(s => s.SubnetId),
        Tags: [commonTag]
      })
    );

    console.log(`Created subnet group: ${subnetGroupName}`);
    return subnetGroupName;
  } catch (error) {
    console.error('Error creating subnet group:', error);
    throw error;
  }
}

async function createRedshiftCluster(vpcId) {
  try {
    const parameterGroupName = await createParameterGroup();
    const subnetGroupName = await createSubnetGroup(vpcId);
    const securityGroupId = await createSecurityGroup(vpcId);

    const clusterIdentifier = `my-cluster-${Date.now()}`;

    const createClusterParams = {
      ClusterIdentifier: clusterIdentifier,
      NodeType: 'dc2.large',
      MasterUsername: 'admin',
      MasterUserPassword: 'Admin123!#',
      NumberOfNodes: 2,
      VpcSecurityGroupIds: [securityGroupId],
      ClusterSubnetGroupName: subnetGroupName,
      ClusterParameterGroupName: parameterGroupName,
      PubliclyAccessible: true,
      Port: 5439,
      Encrypted: false,
      Tags: [commonTag]
    };

    const response = await redshiftClient.send(
      new CreateClusterCommand(createClusterParams)
    );

    console.log('\nCluster creation initiated!');
    console.log('------------------------');
    console.log(`Cluster Identifier: ${clusterIdentifier}`);
    console.log(`Parameter Group: ${parameterGroupName}`);
    console.log(`Subnet Group: ${subnetGroupName}`);
    console.log(`Security Group: ${securityGroupId}`);
    console.log(`Master Username: admin`);
    console.log(`Master Password: Admin123!@#`);
    console.log(`Port: 5439`);
    console.log(`SSL Required: No`);
    console.log('------------------------\n');

    return response.Cluster;
  } catch (error) {
    console.error('Error creating Redshift cluster:', error);
    throw error;
  }
}

async function checkClusterStatus(clusterIdentifier) {
  try {
    const response = await redshiftClient.send(
      new DescribeClustersCommand({
        ClusterIdentifier: clusterIdentifier
      })
    );
    
    const cluster = response.Clusters[0];
    return {
      status: cluster.ClusterStatus,
      endpoint: cluster.Endpoint,
      parameterGroup: cluster.ClusterParameterGroups?.[0]
    };
  } catch (error) {
    console.error('Error checking cluster status:', error);
    throw error;
  }
}

async function main() {
  try {
    const vpcId = process.env.VPC_ID;
    if (!vpcId) {
      throw new Error('VPC_ID environment variable is required');
    }

    console.log('Starting Redshift cluster creation...');
    const cluster = await createRedshiftCluster(vpcId);
    console.log('Waiting for cluster to be available...');

    while (true) {
      const { status, endpoint, parameterGroup } = await checkClusterStatus(cluster.ClusterIdentifier);
      console.log(`\nCluster status: ${status}`);
      
      if (status === 'available') {
        console.log('\nCluster is now available!');
        console.log('------------------------');
        console.log('Endpoint:', endpoint?.Address);
        console.log('Port:', endpoint?.Port);
        console.log('Parameter Group Status:', parameterGroup?.ParameterApplyStatus);
        console.log('------------------------\n');
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
