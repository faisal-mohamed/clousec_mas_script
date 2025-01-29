const {
  AutoScalingClient,
  CreateAutoScalingGroupCommand,
} = require("@aws-sdk/client-auto-scaling");

const {
  EC2Client,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  CreateLaunchTemplateCommand,
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Common credentials configuration
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

// Initialize clients with credentials
const autoScalingClient = new AutoScalingClient({
  credentials: credentials,
  region: process.env.AWS_REGION || 'us-east-1'
});

const ec2Client = new EC2Client({
  credentials: credentials,
  region: process.env.AWS_REGION || 'us-east-1'
});

async function createNonCompliantResources() {
  const resourcePrefix = 'non-compliant-demo';
  const timestamp = Date.now();
  const vpcId = process.env.VPC_ID;

  if (!vpcId) {
    throw new Error('VPC_ID environment variable is required');
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_SESSION_TOKEN) {
    throw new Error('AWS credentials environment variables are required');
  }
  
  try {
    // Get subnet from the specified VPC
    const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
      Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
    }));

    if (!subnetResponse.Subnets || subnetResponse.Subnets.length === 0) {
      throw new Error('No subnets found in the specified VPC');
    }

    const subnetId = subnetResponse.Subnets[0].SubnetId;

    // Create security group
    const sgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
      GroupName: `${resourcePrefix}-sg-${timestamp}`,
      Description: 'Security group for non-compliant launch template',
      VpcId: vpcId,
      TagSpecifications: [{
        ResourceType: 'security-group',
        Tags: [{ Key: 'simulation-mas', Value: 'true' }]
      }]
    }));
    const securityGroupId = sgResponse.GroupId;

    // Allow inbound HTTP traffic
    await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: securityGroupId,
      IpProtocol: 'tcp',
      FromPort: 80,
      ToPort: 80,
      CidrIp: '0.0.0.0/0'
    }));

    // Create launch template
    const launchTemplateResponse = await ec2Client.send(new CreateLaunchTemplateCommand({
      LaunchTemplateName: `${resourcePrefix}-lt-${timestamp}`,
      VersionDescription: 'Non-compliant version with public IP',
      LaunchTemplateData: {
        ImageId: process.env.EC2_AMI_ID,
        InstanceType: 't2.micro',
        NetworkInterfaces: [{
          AssociatePublicIpAddress: true,
          DeviceIndex: 0,
          DeleteOnTermination: true,
          SubnetId: subnetId,
          Groups: [securityGroupId]  // Security group moved here
        }],
        UserData: Buffer.from('#!/bin/bash\necho "Hello World"').toString('base64'),
        Monitoring: { Enabled: true }
      },
      TagSpecifications: [{
        ResourceType: 'launch-template',
        Tags: [{ Key: 'simulation-mas', Value: 'true' }]
      }]
    }));

    // Create Auto Scaling group with the launch template
    const asgName = `${resourcePrefix}-asg-${timestamp}`;
    await autoScalingClient.send(new CreateAutoScalingGroupCommand({
      AutoScalingGroupName: asgName,
      LaunchTemplate: {
        LaunchTemplateName: launchTemplateResponse.LaunchTemplate.LaunchTemplateName,
        Version: '$Latest'
      },
      MinSize: 1,
      MaxSize: 3,
      DesiredCapacity: 1,
      VPCZoneIdentifier: subnetId,
      Tags: [{
        Key: 'simulation-mas',
        Value: 'true',
        PropagateAtLaunch: true
      }]
    }));

    console.log('Created non-compliant resources:');
    console.log(`Launch Template: ${launchTemplateResponse.LaunchTemplate.LaunchTemplateName}`);
    console.log(`Auto Scaling Group: ${asgName}`);
    console.log(`Security Group: ${securityGroupId}`);

  } catch (error) {
    console.error('Error creating non-compliant resources:', error);
    throw error;
  }
}

// Execute the script
async function main() {
  try {
    await createNonCompliantResources();
  } catch (error) {
    console.error('Script execution failed:', error);
  }
}

main();
