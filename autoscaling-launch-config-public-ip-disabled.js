require('dotenv').config();
const {
  AutoScalingClient,
  CreateLaunchConfigurationCommand,
  DeleteLaunchConfigurationCommand,
  DescribeLaunchConfigurationsCommand
} = require("@aws-sdk/client-auto-scaling");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeImagesCommand
} = require("@aws-sdk/client-ec2");

// Initialize clients
const autoScalingClient = new AutoScalingClient({
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
async function getDefaultVpcSubnet() {
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
        GroupName: `launch-config-sg-${Date.now()}`,
        Description: 'Security group for launch configuration',
        VpcId: vpcId
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    console.log(`Created security group: ${securityGroupId}`);

    // Add inbound rule for HTTP
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: 'tcp',
        FromPort: 80,
        ToPort: 80,
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

// Create non-compliant launch configuration (with public IP enabled)
async function createNonCompliantLaunchConfig() {
  try {
    // Get latest Amazon Linux 2 AMI
    const imageId = await getLatestAL2AMI();

    // Get VPC and create security group
    const { vpcId } = await getDefaultVpcSubnet();
    const securityGroupId = await createSecurityGroup(vpcId);

    // Generate unique name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const launchConfigName = `test-launch-config-${timestamp}`;

    // Create launch configuration with public IP enabled
    await autoScalingClient.send(
      new CreateLaunchConfigurationCommand({
        LaunchConfigurationName: launchConfigName,
        ImageId: imageId,
        InstanceType: 't2.micro',
        SecurityGroups: [securityGroupId],
        AssociatePublicIpAddress: true, // This makes it non-compliant
        InstanceMonitoring: {
          Enabled: true
        },
        UserData: Buffer.from('#!/bin/bash\necho "Hello, World!"').toString('base64')
      })
    );

    createdResources.push({
      type: 'LAUNCH_CONFIG',
      name: launchConfigName
    });

    console.log(`Created non-compliant launch configuration: ${launchConfigName}`);
    return launchConfigName;
  } catch (error) {
    console.error('Error creating launch configuration:', error);
    throw error;
  }
}

// Check launch configuration public IP settings
async function checkLaunchConfigPublicIP(launchConfigName) {
  try {
    const response = await autoScalingClient.send(
      new DescribeLaunchConfigurationsCommand({
        LaunchConfigurationNames: [launchConfigName]
      })
    );

    if (response.LaunchConfigurations.length === 0) {
      throw new Error('Launch configuration not found');
    }

    const config = response.LaunchConfigurations[0];
    console.log('\nAnalyzing Launch Configuration:', config.LaunchConfigurationName);
    console.log('Configuration Details:');
    console.log(`Instance Type: ${config.InstanceType}`);
    console.log(`Image ID: ${config.ImageId}`);
    console.log(`Security Groups: ${config.SecurityGroups.join(', ')}`);
    
    console.log('\nNetwork Settings:');
    console.log(`Public IP Association: ${config.AssociatePublicIpAddress ? 'Enabled' : 'Disabled'}`);

    const isCompliant = !config.AssociatePublicIpAddress;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking launch configuration:', error);
    throw error;
  }
}

// List and check all launch configurations
async function listLaunchConfigsAndCheck() {
  try {
    const response = await autoScalingClient.send(
      new DescribeLaunchConfigurationsCommand({})
    );
    
    console.log('\nChecking all launch configurations in region:');
    for (const config of response.LaunchConfigurations) {
      console.log(`\nLaunch Configuration: ${config.LaunchConfigurationName}`);
      console.log(`Instance Type: ${config.InstanceType}`);
      console.log(`Image ID: ${config.ImageId}`);
      console.log(`Public IP Association: ${config.AssociatePublicIpAddress ? 'Enabled' : 'Disabled'}`);
      
      const isCompliant = !config.AssociatePublicIpAddress;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing launch configurations:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Delete launch configurations
  for (const resource of createdResources) {
    if (resource.type === 'LAUNCH_CONFIG') {
      try {
        await autoScalingClient.send(
          new DeleteLaunchConfigurationCommand({
            LaunchConfigurationName: resource.name
          })
        );
        console.log(`Deleted launch configuration: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting launch configuration ${resource.name}:`, error);
      }
    }
  }

  // Add delay before deleting security groups
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Delete security groups
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
    console.log('Starting launch configuration public IP check...');
    
    // Create non-compliant launch configuration
    console.log('\nCreating non-compliant launch configuration...');
    const launchConfigName = await createNonCompliantLaunchConfig();
    
    // Check public IP configuration
    await checkLaunchConfigPublicIP(launchConfigName);
    
    // List all launch configurations and check them
    await listLaunchConfigsAndCheck();
    
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
