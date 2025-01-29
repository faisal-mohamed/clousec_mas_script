const { 
  EC2Client, 
  CreateLaunchTemplateCommand,
  DescribeImagesCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");

const { 
  AutoScalingClient, 
  CreateAutoScalingGroupCommand 
} = require("@aws-sdk/client-auto-scaling");


require('dotenv').config();

// Function to create a unique name with timestamp
function generateUniqueName(baseName) {
  const timestamp = new Date().getTime();
  return `${baseName}-${timestamp}`;
}

// Function to get AWS credentials from environment variables
function getAWSCredentials() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const credentials = {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  };

  // Add session token if provided
  if (process.env.AWS_SESSION_TOKEN) {
    credentials.credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
  }

  return credentials;
}

// Function to create security group
async function createSecurityGroup(ec2Client, vpcId) {
  try {
    // Create security group
    const createSgCommand = new CreateSecurityGroupCommand({
      GroupName: generateUniqueName('simulation-mas-sg'),
      Description: 'Security group for simulation-mas ASG',
      VpcId: vpcId,
      TagSpecifications: [{
        ResourceType: 'security-group',
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      }]
    });

    const sgResponse = await ec2Client.send(createSgCommand);
    const securityGroupId = sgResponse.GroupId;

    // Add inbound rules
    const authorizeIngressCommand = new AuthorizeSecurityGroupIngressCommand({
      GroupId: securityGroupId,
      IpPermissions: [
        {
          IpProtocol: 'tcp',
          FromPort: 80,
          ToPort: 80,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        },
        {
          IpProtocol: 'tcp',
          FromPort: 443,
          ToPort: 443,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        },
        {
          IpProtocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          IpRanges: [{ CidrIp: '0.0.0.0/0' }]
        }
      ]
    });

    await ec2Client.send(authorizeIngressCommand);
    console.log(`Security group created with ID: ${securityGroupId}`);
    return securityGroupId;
  } catch (error) {
    console.error("Error creating security group:", error);
    throw error;
  }
}

async function getLatestAL2AMI(ec2Client) {
  const command = new DescribeImagesCommand({
    Filters: [
      {
        Name: 'name',
        Values: ['amzn2-ami-hvm-*-x86_64-gp2']
      },
      {
        Name: 'state',
        Values: ['available']
      }
    ],
    Owners: ['amazon']
  });

  const response = await ec2Client.send(command);
  const images = response.Images.sort((a, b) => {
    return new Date(b.CreationDate) - new Date(a.CreationDate);
  });
  
  return images[0].ImageId;
}

async function createLaunchTemplate(ec2Client, securityGroupId) {
  const amiId = await getLatestAL2AMI(ec2Client);
  const uniqueTemplateName = generateUniqueName('simulation-mas-template');
  
  const templateData = {
    LaunchTemplateName: uniqueTemplateName,
    VersionDescription: "Template for simulation-mas ASG",
    LaunchTemplateData: {
      ImageId: amiId,
      InstanceType: "t2.micro",
      SecurityGroupIds: [securityGroupId],
      UserData: Buffer.from(`#!/bin/bash
echo "Hello from simulation-mas!" > /home/ec2-user/hello.txt`).toString('base64'),
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            {
              Key: "simulation-mas",
              Value: "true"
            }
          ]
        },
        {
          ResourceType: "volume",
          Tags: [
            {
              Key: "simulation-mas",
              Value: "true"
            }
          ]
        }
      ]
    },
    TagSpecifications: [{
      ResourceType: 'launch-template',
      Tags: [{
        Key: 'simulation-mas',
        Value: 'true'
      }]
    }]
  };

  const command = new CreateLaunchTemplateCommand(templateData);
  const response = await ec2Client.send(command);
  console.log(`Launch template created: ${uniqueTemplateName}`);
  return response.LaunchTemplate.LaunchTemplateId;
}

async function createASG(vpcId, subnetIds) {
  if (!vpcId || !subnetIds) {
    throw new Error('VPC ID and Subnet IDs are required');
  }

  const awsCredentials = getAWSCredentials();
  const ec2Client = new EC2Client(awsCredentials);
  const asgClient = new AutoScalingClient(awsCredentials);

  try {
    // Create security group
    console.log("Creating security group...");
    const securityGroupId = await createSecurityGroup(ec2Client, vpcId);

    // Create launch template
    console.log("Creating launch template...");
    const launchTemplateId = await createLaunchTemplate(ec2Client, securityGroupId);

    // Create ASG
    const uniqueAsgName = generateUniqueName('simulation-mas-asg');
    const asgParams = {
      AutoScalingGroupName: uniqueAsgName,
      HealthCheckType: "EC2",
      HealthCheckGracePeriod: 300,
      MaxSize: 3,
      MinSize: 1,
      DesiredCapacity: 2,
      VPCZoneIdentifier: subnetIds,
      LaunchTemplate: {
        LaunchTemplateId: launchTemplateId,
        Version: "$Latest"
      },
      Tags: [
        {
          Key: "simulation-mas",
          Value: "true",
          PropagateAtLaunch: true
        }
      ]
    };

    const command = new CreateAutoScalingGroupCommand(asgParams);
    await asgClient.send(command);
    
    console.log(`Successfully created Auto Scaling Group: ${uniqueAsgName}`);
    console.log("Resources created:");
    console.log(`- Security Group: ${securityGroupId}`);
    console.log(`- Launch Template ID: ${launchTemplateId}`);
    console.log(`- Auto Scaling Group: ${uniqueAsgName}`);

  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

// Usage of the script
async function main() {
  try {
    const vpcId = process.env.VPC_ID;
    const subnetIds = process.env.SUBNET_IDS; // Comma-separated subnet IDs

    if (!vpcId || !subnetIds) {
      console.error("Please set VPC_ID and SUBNET_IDS environment variables");
      process.exit(1);
    }

    await createASG(vpcId, subnetIds);
    console.log("Setup completed successfully");
  } catch (error) {
    console.error("Failed to create resources:", error);
    process.exit(1);
  }
}

main();
