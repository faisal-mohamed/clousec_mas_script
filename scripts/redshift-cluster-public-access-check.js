const {
  RedshiftClient,
  CreateClusterCommand,
  DescribeClustersCommand,
  CreateClusterSubnetGroupCommand
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

async function getPublicSubnets(vpcId) {
  try {
    console.log(`Searching for public subnets in VPC: ${vpcId}`);
    
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

    // Log all found subnets
    console.log('\nAvailable subnets:');
    response.Subnets.forEach(subnet => {
      console.log(`- Subnet ID: ${subnet.SubnetId}`);
      console.log(`  AZ: ${subnet.AvailabilityZone}`);
      console.log(`  Available IPs: ${subnet.AvailableIpAddressCount}`);
      console.log(`  CIDR Block: ${subnet.CidrBlock}`);
    });

    // Group subnets by AZ
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

    // Select one subnet from each of the first two AZs
    const selectedSubnets = [
      subnetsByAZ[availableAZs[0]][0],
      subnetsByAZ[availableAZs[1]][0]
    ];

    console.log('\nSelected subnets for Redshift:');
    selectedSubnets.forEach(subnet => {
      console.log(`- Subnet ID: ${subnet.SubnetId}`);
      console.log(`  AZ: ${subnet.AvailabilityZone}`);
      console.log(`  CIDR Block: ${subnet.CidrBlock}`);
    });

    return selectedSubnets.map(subnet => ({
      SubnetId: subnet.SubnetId,
      AvailabilityZone: subnet.AvailabilityZone
    }));
  } catch (error) {
    console.error('Error in getPublicSubnets:', error.message);
    throw error;
  }
}

async function createSecurityGroup(vpcId) {
  try {
    const groupName = `redshift-public-sg-${Date.now()}`;
    
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Security group for public Redshift cluster',
        VpcId: vpcId,
        TagSpecifications: [{
          ResourceType: 'security-group',
          Tags: [commonTag]
        }]
      })
    );

    const securityGroupId = createSgResponse.GroupId;

    // Allow inbound access on Redshift port from anywhere
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 5439,
        ToPort: 5439,
        CidrIp: '0.0.0.0/0'  // Allow access from anywhere
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
    const subnets = await getPublicSubnets(vpcId);
    const subnetGroupName = `redshift-subnet-group-${Date.now()}`;
    
    console.log('\nCreating subnet group with the following configuration:');
    console.log(`Name: ${subnetGroupName}`);
    console.log('Subnets:');
    subnets.forEach(s => console.log(`- ${s.SubnetId} (${s.AvailabilityZone})`));

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

async function createPublicRedshiftCluster(vpcId) {
  try {
    const subnetGroupName = await createSubnetGroup(vpcId);
    const securityGroupId = await createSecurityGroup(vpcId);

    const clusterIdentifier = `my-public-cluster-${Date.now()}`;

    const createClusterParams = {
      ClusterIdentifier: clusterIdentifier,
      NodeType: 'dc2.large',
      MasterUsername: 'admin',
      MasterUserPassword: 'Admin123!#',
      NumberOfNodes: 2,
      VpcSecurityGroupIds: [securityGroupId],
      ClusterSubnetGroupName: subnetGroupName,
      PubliclyAccessible: true,
      Port: 5439,
      Encrypted: false,
      Tags: [commonTag]
    };

    const response = await redshiftClient.send(
      new CreateClusterCommand(createClusterParams)
    );

    console.log('\nPublic cluster creation initiated!');
    console.log('------------------------');
    console.log(`Cluster Identifier: ${clusterIdentifier}`);
    console.log(`Subnet Group: ${subnetGroupName}`);
    console.log(`Security Group: ${securityGroupId}`);
    console.log(`Master Username: admin`);
    console.log(`Master Password: Admin123!#`);
    console.log(`Port: 5439`);
    console.log(`Publicly Accessible: Yes`);
    console.log('------------------------\n');

    return response.Cluster;
  } catch (error) {
    console.error('Error creating public cluster:', error);
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
      publiclyAccessible: cluster.PubliclyAccessible
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

    console.log('Starting public Redshift cluster creation...');
    const cluster = await createPublicRedshiftCluster(vpcId);
    console.log('Waiting for cluster to be available...');

    while (true) {
      const { status, endpoint, publiclyAccessible } = await checkClusterStatus(cluster.ClusterIdentifier);
      console.log(`\nCluster status: ${status}`);
      
      if (status === 'available') {
        console.log('\nCluster is now available!');
        console.log('------------------------');
        console.log('Public Endpoint:', endpoint?.Address);
        console.log('Port:', endpoint?.Port);
        console.log('Publicly Accessible:', publiclyAccessible ? 'Yes' : 'No');
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
