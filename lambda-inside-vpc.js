require('dotenv').config();
const {
  LambdaClient,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  ListFunctionsCommand
} = require("@aws-sdk/client-lambda");

const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  CreateSecurityGroupCommand,
  DeleteSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");

const {
  IAMClient,
  CreateRoleCommand,
  DeleteRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand
} = require("@aws-sdk/client-iam");

const fs = require('fs');
const path = require('path');

// Initialize clients
const lambdaClient = new LambdaClient({
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

const iamClient = new IAMClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create IAM role for Lambda
async function createLambdaRole() {
  try {
    const roleName = `lambda-test-role-${Date.now()}`;
    
    // Create role
    const createRoleResponse = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }]
        })
      })
    );

    createdResources.push({
      type: 'IAM_ROLE',
      name: roleName
    });

    // Attach basic Lambda execution policy
    await iamClient.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
      })
    );

    // Add VPC access policy
    await iamClient.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: 'vpc-access',
        PolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Action: [
              'ec2:CreateNetworkInterface',
              'ec2:DescribeNetworkInterfaces',
              'ec2:DeleteNetworkInterface',
              'ec2:AssignPrivateIpAddresses',
              'ec2:UnassignPrivateIpAddresses'
            ],
            Resource: '*'
          }]
        })
      })
    );

    console.log(`Created IAM role: ${roleName}`);
    
    // Wait for role to be available
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    return createRoleResponse.Role.Arn;
  } catch (error) {
    console.error('Error creating IAM role:', error);
    throw error;
  }
}

// Create security group
async function createSecurityGroup(vpcId) {
  try {
    const groupName = `lambda-test-sg-${Date.now()}`;
    
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Security group for Lambda VPC test',
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
        IpProtocol: '-1',
        FromPort: -1,
        ToPort: -1,
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

// Create ZIP file for Lambda function
async function createZipFile() {
  const functionCode = `
exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        body: JSON.stringify('Hello from Lambda!'),
    };
    return response;
};`;

  const tmpDir = path.join(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  const functionPath = path.join(tmpDir, 'index.js');
  fs.writeFileSync(functionPath, functionCode);

  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  zip.addLocalFile(functionPath);
  const zipPath = path.join(tmpDir, 'function.zip');
  zip.writeZip(zipPath);

  const zipBuffer = fs.readFileSync(zipPath);

  fs.unlinkSync(functionPath);
  fs.unlinkSync(zipPath);
  fs.rmdirSync(tmpDir);

  return zipBuffer;
}

// Get VPC info
async function getVpcInfo() {
  const vpcsResponse = await ec2Client.send(
    new DescribeVpcsCommand({
      Filters: [{ Name: 'isDefault', Values: ['true'] }]
    })
  );

  if (!vpcsResponse.Vpcs || vpcsResponse.Vpcs.length === 0) {
    throw new Error('No default VPC found');
  }

  const vpcId = vpcsResponse.Vpcs[0].VpcId;
  
  const subnetsResponse = await ec2Client.send(
    new DescribeSubnetsCommand({
      Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
    })
  );

  if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length === 0) {
    throw new Error('No subnets found in default VPC');
  }

  return {
    vpcId,
    subnetIds: subnetsResponse.Subnets.map(subnet => subnet.SubnetId)
  };
}

// Create non-compliant Lambda function
async function createNonCompliantFunction(roleArn) {
  try {
    const functionName = `test-function-${Date.now()}`;
    const zipBuffer = await createZipFile();

    await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs18.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: {
          ZipFile: zipBuffer
        },
        Description: 'Test function for VPC check',
        Timeout: 30,
        MemorySize: 128,
        Publish: true
      })
    );

    createdResources.push({
      type: 'FUNCTION',
      name: functionName
    });

    console.log(`Created function: ${functionName}`);
    return functionName;
  } catch (error) {
    console.error('Error creating function:', error);
    throw error;
  }
}

// Check function VPC configuration
async function checkFunctionVpcConfig(functionName) {
  const response = await lambdaClient.send(
    new GetFunctionCommand({
      FunctionName: functionName
    })
  );

  const config = response.Configuration;
  console.log('\nAnalyzing Function:', config.FunctionName);
  console.log('VPC Configuration:', config.VpcConfig ? 'Yes' : 'No');
  
  const isCompliant = config.VpcConfig && 
                     config.VpcConfig.VpcId && 
                     config.VpcConfig.SubnetIds && 
                     config.VpcConfig.SubnetIds.length > 0;

  console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
  return isCompliant;
}

// List and check all functions
async function listFunctionsAndCheck() {
  const response = await lambdaClient.send(new ListFunctionsCommand({}));
  
  console.log('\nChecking all Lambda functions:');
  let totalFunctions = 0;
  let nonCompliantFunctions = 0;

  for (const func of response.Functions) {
    totalFunctions++;
    const isCompliant = func.VpcConfig && 
                       func.VpcConfig.VpcId && 
                       func.VpcConfig.SubnetIds && 
                       func.VpcConfig.SubnetIds.length > 0;
    
    if (!isCompliant) {
      nonCompliantFunctions++;
      console.log(`\nNon-compliant function found: ${func.FunctionName}`);
    }
  }

  console.log(`\nTotal functions: ${totalFunctions}`);
  console.log(`Non-compliant functions: ${nonCompliantFunctions}`);
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  // Delete Lambda functions first
  for (const resource of createdResources) {
    if (resource.type === 'FUNCTION') {
      try {
        await lambdaClient.send(
          new DeleteFunctionCommand({
            FunctionName: resource.name
          })
        );
        console.log(`Deleted function: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting function ${resource.name}:`, error);
      }
    }
  }

  // Delete security groups
  for (const resource of createdResources) {
    if (resource.type === 'SECURITY_GROUP') {
      try {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for ENIs to be deleted
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

  // Clean up IAM roles
  for (const resource of createdResources) {
    if (resource.type === 'IAM_ROLE') {
      try {
        // Detach managed policy
        await iamClient.send(
          new DetachRolePolicyCommand({
            RoleName: resource.name,
            PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
          })
        );

        // Delete inline policy
        await iamClient.send(
          new DeleteRolePolicyCommand({
            RoleName: resource.name,
            PolicyName: 'vpc-access'
          })
        );

        // Delete role
        await iamClient.send(
          new DeleteRoleCommand({
            RoleName: resource.name
          })
        );
        console.log(`Deleted IAM role: ${resource.name}`);
      } catch (error) {
        console.error(`Error deleting IAM role ${resource.name}:`, error);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting Lambda function VPC compliance check...');
    
    // Create IAM role
    const roleArn = await createLambdaRole();
    
    // Get VPC info and create security group
    const { vpcId } = await getVpcInfo();
    await createSecurityGroup(vpcId);
    
    // Create non-compliant function
    const functionName = await createNonCompliantFunction(roleArn);
    
    // Check function
    await checkFunctionVpcConfig(functionName);
    
    // List all functions
    await listFunctionsAndCheck();
    
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
