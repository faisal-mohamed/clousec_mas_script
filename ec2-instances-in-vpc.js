require('dotenv').config();
const {
  EC2Client,
  RunInstancesCommand,
  TerminateInstancesCommand,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeImagesCommand
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

    const images = response.Images.sort((a, b) => {
      return new Date(b.CreationDate) - new Date(a.CreationDate);
    });

    if (images.length === 0) {
      throw new Error('No Amazon Linux 2 AMI found');
    }

    return images[0].ImageId;
  } catch (error) {
    console.error('Error getting AMI:', error);
    throw error;
  }
}

// Create non-compliant instance (attempt without VPC)
async function createNonCompliantInstance(imageId) {
  try {
    // Attempt to launch instance without VPC specifications
    const response = await ec2Client.send(
      new RunInstancesCommand({
        ImageId: imageId,
        InstanceType: 't2.micro',
        MinCount: 1,
        MaxCount: 1,
        TagSpecifications: [
          {
            ResourceType: 'instance',
            Tags: [
              {
                Key: 'Name',
                Value: `test-instance-no-vpc-${Date.now()}`
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

// Check instance VPC configuration
async function checkInstanceVpcConfig(instanceId) {
  try {
    // Get VPCs
    const vpcs = await ec2Client.send(new DescribeVpcsCommand({}));

    // Get instance details
    const response = await ec2Client.send(
      new DescribeInstancesCommand({
        InstanceIds: [instanceId]
      })
    );

    if (!response.Reservations || response.Reservations.length === 0) {
      throw new Error('Instance not found');
    }

    const instance = response.Reservations[0].Instances[0];
    const vpcId = instance.VpcId;

    console.log('\nAnalyzing Instance:', instance.InstanceId);
    console.log('Instance Details:');
    console.log(`Type: ${instance.InstanceType}`);
    console.log(`State: ${instance.State.Name}`);
    console.log(`Launch Time: ${instance.LaunchTime}`);
    
    console.log('\nNetwork Configuration:');
    console.log(`VPC ID: ${vpcId || 'None (EC2-Classic)'}`);
    console.log(`Subnet ID: ${instance.SubnetId || 'None'}`);
    console.log(`Private IP: ${instance.PrivateIpAddress || 'None'}`);
    console.log(`Public IP: ${instance.PublicIpAddress || 'None'}`);

    // If instance is in a VPC, show VPC details
    if (vpcId) {
      const vpc = vpcs.Vpcs.find(v => v.VpcId === vpcId);
      if (vpc) {
        console.log('\nVPC Details:');
        console.log(`CIDR Block: ${vpc.CidrBlock}`);
        console.log(`Is Default VPC: ${vpc.IsDefault ? 'Yes' : 'No'}`);
        console.log(`State: ${vpc.State}`);
      }
    }

    const isCompliant = vpcId !== undefined && vpcId !== null;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    if (!isCompliant) {
      console.log('Reason: Instance is not in a VPC');
    }

    return isCompliant;
  } catch (error) {
    console.error('Error checking instance:', error);
    throw error;
  }
}

// List and check all instances
async function listInstancesAndCheck() {
  try {
    const response = await ec2Client.send(new DescribeInstancesCommand({}));
    
    console.log('\nChecking all instances in region:');
    let totalInstances = 0;
    let compliantInstances = 0;
    let nonCompliantInstances = 0;

    for (const reservation of response.Reservations) {
      for (const instance of reservation.Instances) {
        // Skip terminated instances
        if (instance.State.Name === 'terminated') {
          continue;
        }

        totalInstances++;
        console.log(`\nInstance ID: ${instance.InstanceId}`);
        console.log(`Type: ${instance.InstanceType}`);
        console.log(`State: ${instance.State.Name}`);
        console.log(`VPC ID: ${instance.VpcId || 'None (EC2-Classic)'}`);
        
        const isCompliant = instance.VpcId !== undefined && instance.VpcId !== null;
        console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
        
        if (isCompliant) {
          compliantInstances++;
        } else {
          nonCompliantInstances++;
        }
      }
    }

    // Print summary
    console.log('\n=== Compliance Summary ===');
    console.log(`Total Instances: ${totalInstances}`);
    console.log(`Compliant Instances: ${compliantInstances}`);
    console.log(`Non-Compliant Instances: ${nonCompliantInstances}`);
    if (totalInstances > 0) {
      console.log(`Compliance Rate: ${((compliantInstances / totalInstances) * 100).toFixed(2)}%`);
    }
  } catch (error) {
    console.error('Error listing instances:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Terminate instances
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
}

// Main execution
async function main() {
  try {
    console.log('Starting EC2 instance VPC compliance check...');
    
    // Get AMI ID
    const imageId = await getLatestAL2AMI();
    
    // Create non-compliant instance
    console.log('\nAttempting to create non-compliant instance...');
    const instanceId = await createNonCompliantInstance(imageId);
    
    // Check instance VPC configuration
    await checkInstanceVpcConfig(instanceId);
    
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
