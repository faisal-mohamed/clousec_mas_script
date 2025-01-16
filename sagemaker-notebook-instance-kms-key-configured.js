require('dotenv').config();
const {
  SageMakerClient,
  CreateNotebookInstanceCommand,
  DeleteNotebookInstanceCommand,
  DescribeNotebookInstanceCommand,
  ListNotebookInstancesCommand,
  StopNotebookInstanceCommand
} = require("@aws-sdk/client-sagemaker");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");

// Initialize clients
const sagemakerClient = new SageMakerClient({
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
        GroupName: `sagemaker-notebook-sg-${Date.now()}`,
        Description: 'Security group for SageMaker notebook instance',
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

// Create non-compliant notebook instance (without KMS key)
async function createNonCompliantNotebookInstance() {
  try {
    // Get default VPC and subnet
    const { vpcId, subnetId } = await getDefaultVpcSubnet();

    // Create security group
    const securityGroupId = await createSecurityGroup(vpcId);

    // Generate unique name
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const instanceName = `test-notebook-${timestamp}`;

    // Get the account ID for constructing the role ARN
    const accountId = process.env.AWS_ACCOUNT_ID;
    const roleArn = `arn:aws:iam::${accountId}:role/service-role/AmazonSageMaker-ExecutionRole`;

    // Create notebook instance
    await sagemakerClient.send(
      new CreateNotebookInstanceCommand({
        NotebookInstanceName: instanceName,
        InstanceType: 'ml.t2.medium',
        RoleArn: roleArn,
        SubnetId: subnetId,
        SecurityGroupIds: [securityGroupId],
        DirectInternetAccess: 'Disabled',
        RootAccess: 'Disabled',
        VolumeSizeInGB: 5
        // Not specifying KmsKeyId makes this non-compliant
      })
    );

    createdResources.push({
      type: 'NOTEBOOK_INSTANCE',
      name: instanceName
    });

    console.log(`Created non-compliant notebook instance: ${instanceName}`);

    // Wait for instance to be in service
    await waitForNotebookInstanceStatus(instanceName, 'InService');

    return instanceName;
  } catch (error) {
    console.error('Error creating non-compliant notebook instance:', error);
    throw error;
  }
}

// Wait for notebook instance to reach specific status
async function waitForNotebookInstanceStatus(instanceName, targetStatus) {
  console.log(`Waiting for notebook instance to be ${targetStatus}...`);
  
  while (true) {
    try {
      const response = await sagemakerClient.send(
        new DescribeNotebookInstanceCommand({
          NotebookInstanceName: instanceName
        })
      );

      const status = response.NotebookInstanceStatus;
      console.log(`Instance status: ${status}`);
      
      if (status === targetStatus) {
        break;
      } else if (status === 'Failed') {
        throw new Error('Notebook instance creation failed');
      }
    } catch (error) {
      console.error('Error checking instance status:', error);
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
  }
}

// Check notebook instance KMS configuration
async function checkNotebookInstanceKMS(instanceName) {
  try {
    const response = await sagemakerClient.send(
      new DescribeNotebookInstanceCommand({
        NotebookInstanceName: instanceName
      })
    );

    console.log('\nAnalyzing Notebook Instance:', instanceName);
    console.log('Instance Details:');
    console.log(`Instance Type: ${response.InstanceType}`);
    console.log(`Status: ${response.NotebookInstanceStatus}`);
    console.log(`Volume Size: ${response.VolumeSizeInGB} GB`);
    console.log(`Subnet ID: ${response.SubnetId}`);
    
    console.log('\nEncryption Settings:');
    console.log(`KMS Key ID: ${response.KmsKeyId || 'Not configured'}`);

    // Determine compliance
    const isCompliant = response.KmsKeyId != null;
    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

    return isCompliant;
  } catch (error) {
    console.error('Error checking notebook instance:', error);
    throw error;
  }
}

// List and check all notebook instances
async function listInstancesAndCheckKMS() {
  try {
    const response = await sagemakerClient.send(
      new ListNotebookInstancesCommand({})
    );

    console.log('\nChecking all notebook instances in region:');
    for (const instance of response.NotebookInstances) {
      console.log(`\nInstance Name: ${instance.NotebookInstanceName}`);
      console.log(`Instance Type: ${instance.InstanceType}`);
      console.log(`Status: ${instance.NotebookInstanceStatus}`);
      console.log(`Subnet ID: ${instance.SubnetId}`);
      console.log(`KMS Key ID: ${instance.KmsKeyId || 'Not configured'}`);
      const isCompliant = instance.KmsKeyId != null;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing instances:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // First delete notebook instances
  for (const resource of createdResources.reverse()) {
    if (resource.type === 'NOTEBOOK_INSTANCE') {
      try {
        // Stop the notebook instance first
        try {
          await sagemakerClient.send(
            new StopNotebookInstanceCommand({
              NotebookInstanceName: resource.name
            })
          );
          console.log(`Stopping notebook instance: ${resource.name}`);
          
          // Wait for instance to stop
          await waitForNotebookInstanceStatus(resource.name, 'Stopped');
        } catch (error) {
          console.error(`Error stopping notebook instance ${resource.name}:`, error);
        }

        // Delete the notebook instance
        await sagemakerClient.send(
          new DeleteNotebookInstanceCommand({
            NotebookInstanceName: resource.name
          })
        );
        console.log(`Initiated deletion of notebook instance: ${resource.name}`);

        // Wait for instance to be deleted
        console.log('Waiting for notebook instance to be deleted...');
        while (true) {
          try {
            await sagemakerClient.send(
              new DescribeNotebookInstanceCommand({
                NotebookInstanceName: resource.name
              })
            );
            await new Promise(resolve => setTimeout(resolve, 30000));
          } catch (error) {
            if (error.name === 'ResourceNotFound') {
              console.log('Notebook instance deleted successfully');
              break;
            }
            throw error;
          }
        }
      } catch (error) {
        console.error(`Error cleaning up notebook instance:`, error);
      }
    }
  }

  // Add delay before attempting to delete security groups
  console.log('Waiting before cleaning up security groups...');
  await new Promise(resolve => setTimeout(resolve, 60000));

  // Then delete security groups
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
    console.log('Starting SageMaker notebook instance KMS check...');
    
    // Create non-compliant notebook instance
    console.log('\nCreating non-compliant notebook instance...');
    const instanceName = await createNonCompliantNotebookInstance();
    
    // Check KMS configuration
    await checkNotebookInstanceKMS(instanceName);
    
    // List all instances and check their KMS settings
    await listInstancesAndCheckKMS();
    
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
