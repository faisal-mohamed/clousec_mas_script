require('dotenv').config();
const {
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  DescribeInstancesCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeImagesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

// Initialize EC2 client
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

// Get latest Amazon Linux 2 AMI
async function getLatestAL2AMI() {
  try {
    const response = await ec2Client.send(
      new DescribeImagesCommand({
        Filters: [
          {
            Name: 'name',
            Values: ['amzn2-ami-hvm-2.0.*-x86_64-gp2']
          },
          {
            Name: 'state',
            Values: ['available']
          }
        ],
        Owners: ['amazon']
      })
    );

    // Sort by creation date (newest first)
    const images = response.Images.sort((a, b) => {
      return new Date(b.CreationDate) - new Date(a.CreationDate);
    });

    if (images.length === 0) {
      throw new Error('No Amazon Linux 2 AMI found');
    }

    console.log(`Found AMI: ${images[0].ImageId}`);
    return images[0].ImageId;
  } catch (error) {
    console.error('Error getting AMI:', error);
    throw error;
  }
}

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

// Create security group
async function createSecurityGroup(vpcId) {
  try {
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: `test-sg-${Date.now()}`,
        Description: 'Test security group for EC2 instance',
        VpcId: vpcId
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    console.log(`Created security group: ${securityGroupId}`);

    // Add inbound rule for SSH
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 22,
        ToPort: 22,
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

// Create non-compliant EC2 instance (with public IP)
async function createNonCompliantInstance(imageId, subnetId, securityGroupId) {
  try {
    const response = await ec2Client.send(
      new RunInstancesCommand({
        ImageId: imageId,
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
        SubnetId: subnetId,
        SecurityGroupIds: [securityGroupId],
        AssociatePublicIpAddress: true, // This makes it non-compliant
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              {
                Key: 'Name',
                Value: `test-instance-${Date.now()}`
              }
            ]
          }
        ]
      })
    );

    const instanceId = response.Instances[0].InstanceId;
    createdResources.push({
      type: 'INSTANCE',
      id: instanceId
    });

    console.log(`Created instance: ${instanceId}`);

    // Wait for instance to be running
    console.log('Waiting for instance to be running...');
    while (true) {
      const instanceStatus = await ec2Client.send(
        new DescribeInstancesCommand({
          InstanceIds: [instanceId]
        })
      );
      
      const state = instanceStatus.Reservations[0].Instances[0].State.Name;
      if (state === 'running') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return instanceId;
  } catch (error) {
    console.error('Error creating instance:', error);
    throw error;
  }
}

// Check instance public IP
async function checkInstancePublicIP(instanceId) {
  try {
    const response = await ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      })
    );

    if (!response.Reservations || response.Reservations.length === 0) {
      throw new Error('Instance not found');
    }

    const instance = response.Reservations[0].Instances[0];
    console.log('\nAnalyzing Instance:', instance.InstanceId);
    console.log('Instance Details:');
    console.log(`Type: ${instance.InstanceType}`);
    console.log(`State: ${instance.State.Name}`);
    console.log(`Subnet: ${instance.SubnetId}`);
    console.log(`VPC: ${instance.VpcId}`);
    
    console.log('\nNetwork Settings:');
    console.log(`Private IP: ${instance.PrivateIpAddress}`);
    console.log(`Public IP: ${instance.PublicIpAddress || 'None'}`);
    console.log(`Public DNS: ${instance.PublicDnsName || 'None'}`);

    const isCompliant = !instance.PublicIpAddress;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking instance:', error);
    throw error;
  }
}

// List and check all instances
async function listInstancesAndCheck() {
  try {
    const response = await ec2Client.send(
      new DescribeInstancesCommand({})
    );
    
    console.log('\nChecking all instances in region:');
    for (const reservation of response.Reservations) {
      for (const instance of reservation.Instances) {
        console.log(`\nInstance ID: ${instance.InstanceId}`);
        console.log(`Type: ${instance.InstanceType}`);
        console.log(`State: ${instance.State.Name}`);
        console.log(`Private IP: ${instance.PrivateIpAddress}`);
        console.log(`Public IP: ${instance.PublicIpAddress || 'None'}`);
        
        const isCompliant = !instance.PublicIpAddress;
        console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
      }
    }
  } catch (error) {
    console.error('Error listing instances:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Terminate instances first
  for (const resource of createdResources) {
    if (resource.type === 'INSTANCE') {
      try {
        await ec2Client.send(
          new TerminateInstancesCommand({
            InstanceIds: [resource.id]
          })
        );
        console.log(`Terminated instance: ${resource.id}`);
        
        // Wait for instance termination
        console.log('Waiting for instance to terminate...');
        while (true) {
          const instanceStatus = await ec2Client.send(
            new DescribeInstancesCommand({
              InstanceIds: [resource.id]
            })
          );
          
          const state = instanceStatus.Reservations[0].Instances[0].State.Name;
          if (state === 'terminated') {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      } catch (error) {
        console.error(`Error terminating instance ${resource.id}:`, error);
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
    console.log('Starting EC2 instance public IP check...');
    
    // Get AMI ID
    const imageId = await getLatestAL2AMI();
    
    // Get VPC and subnet
    const { vpcId, subnetId } = await getDefaultVpcAndSubnet();
    
    // Create security group
    const securityGroupId = await createSecurityGroup(vpcId);
    
    // Create non-compliant instance
    console.log('\nCreating non-compliant instance...');
    const instanceId = await createNonCompliantInstance(imageId, subnetId, securityGroupId);
    
    // Check instance public IP
    await checkInstancePublicIP(instanceId);
    
    // List all instances and check them
    await listInstancesAndCheck();
    
    // Wait before cleanup
    console.log('\nWaiting before cleanup...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
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
