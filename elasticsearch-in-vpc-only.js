require('dotenv').config();

const {
  OpenSearchClient,
  CreateDomainCommand,
  DeleteDomainCommand,
  DescribeDomainCommand,
  UpdateDomainConfigCommand
} = require("@aws-sdk/client-opensearch");

const {
  IAMClient,
  CreateRoleCommand,
  PutRolePolicyCommand,
  DeleteRoleCommand,
  DeleteRolePolicyCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand
} = require("@aws-sdk/client-iam");

// Configure AWS credentials using dotenv
// Configure AWS credentials using dotenv
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  };
  
  const region = process.env.AWS_REGION;
  const opensearchClient = new OpenSearchClient({ credentials, region });
  const iamClient = new IAMClient({ credentials, region });
  
  // Generate unique names with shortened timestamp
  const timestamp = Date.now().toString().slice(-8);
  const domainName = `nc-domain-${timestamp}`;
  const roleName = `opensearch-role-${timestamp}`;
  const policyName = `opensearch-policy-${timestamp}`;
  let roleArn = '';
  

async function createIAMRole() {
  try {
    console.log("Creating IAM role for OpenSearch...");

    // Create role
    const createRoleResponse = await iamClient.send(new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: {
            Service: "es.amazonaws.com"
          },
          Action: "sts:AssumeRole"
        }]
      })
    }));

    roleArn = createRoleResponse.Role.Arn;
    console.log(`Role created with ARN: ${roleArn}`);

    // Add inline policy
    await iamClient.send(new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Action: [
            "es:*"
          ],
          Resource: "*"
        }]
      })
    }));

    // Wait for role to propagate
    console.log("Waiting for role to propagate...");
    await new Promise(resolve => setTimeout(resolve, 10000));

    return roleArn;
  } catch (error) {
    console.error("Error creating IAM role:", error);
    throw error;
  }
}

async function createNonCompliantDomain() {
  try {
    console.log(`Creating OpenSearch domain: ${domainName}`);

    const params = {
      DomainName: domainName,
      EngineVersion: "OpenSearch_2.5",
      ClusterConfig: {
        InstanceType: "t3.small.search",
        InstanceCount: 1,
        DedicatedMasterEnabled: false,
        ZoneAwarenessEnabled: false
      },
      EBSOptions: {
        EBSEnabled: true,
        VolumeType: "gp3",
        VolumeSize: 10
      },
      AccessPolicies: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: {
            AWS: "*"
          },
          Action: "es:*",
          Resource: `arn:aws:es:${region}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
        }]
      }),
      NodeToNodeEncryptionOptions: {
        Enabled: true
      },
      EncryptionAtRestOptions: {
        Enabled: true
      },
      DomainEndpointOptions: {
        EnforceHTTPS: true,
        TLSSecurityPolicy: "Policy-Min-TLS-1-2-2019-07"
      }
    };

    await opensearchClient.send(new CreateDomainCommand(params));
    console.log("Waiting for domain to be created...");
    
    await waitForDomainStatus('Active');
    console.log("Domain created successfully");

    return domainName;
  } catch (error) {
    console.error("Error creating OpenSearch domain:", error);
    throw error;
  }
}

async function waitForDomainStatus(desiredStatus, maxAttempts = 60) {
  console.log(`Waiting for domain to reach ${desiredStatus} status...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await opensearchClient.send(new DescribeDomainCommand({
        DomainName: domainName
      }));

      const status = response.DomainStatus.Processing ? 'Processing' : 'Active';
      console.log(`Current status: ${status}`);

      if (status === desiredStatus) {
        return true;
      }

      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  throw new Error(`Timeout waiting for domain to reach ${desiredStatus} status`);
}

async function cleanupIAMRole() {
  try {
    console.log(`Cleaning up IAM role: ${roleName}`);

    // Delete inline policy
    try {
      await iamClient.send(new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName
      }));
    } catch (error) {
      console.log("Error deleting inline policy:", error);
    }

    // Delete role
    try {
      await iamClient.send(new DeleteRoleCommand({
        RoleName: roleName
      }));
    } catch (error) {
      console.log("Error deleting role:", error);
    }

    console.log("IAM role cleanup completed");
  } catch (error) {
    console.error("Error during IAM role cleanup:", error);
    throw error;
  }
}

async function cleanup() {
  try {
    console.log(`Starting cleanup for domain: ${domainName}`);

    // Delete the domain
    await opensearchClient.send(new DeleteDomainCommand({
      DomainName: domainName
    }));

    console.log("Waiting for domain to be deleted...");
    await waitForDomainDeletion();

    // Clean up IAM role
    await cleanupIAMRole();

    console.log("Cleanup completed successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
}

async function waitForDomainDeletion(maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await opensearchClient.send(new DescribeDomainCommand({
        DomainName: domainName
      }));
      console.log("Domain still exists, waiting...");
      await new Promise(resolve => setTimeout(resolve, 30000));
    } catch (error) {
      if (error.name === 'ResourceNotFoundException') {
        console.log("Domain deleted successfully");
        return true;
      }
      throw error;
    }
  }
  throw new Error('Timeout waiting for domain deletion');
}

async function monitorDomain() {
  try {
    const response = await opensearchClient.send(new DescribeDomainCommand({
      DomainName: domainName
    }));

    console.log("Current Domain Configuration:");
    console.log(JSON.stringify({
      DomainName: response.DomainStatus.DomainName,
      Endpoint: response.DomainStatus.Endpoint,
      Processing: response.DomainStatus.Processing,
      EngineVersion: response.DomainStatus.EngineVersion,
      ClusterConfig: response.DomainStatus.ClusterConfig,
      VPCOptions: response.DomainStatus.VPCOptions || "Not in VPC"
    }, null, 2));

    return response.DomainStatus;
  } catch (error) {
    console.error("Error monitoring domain:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting OpenSearch domain simulation in region ${region}`);

  try {
    // Create IAM role first
    await createIAMRole();

    // Create non-compliant domain
    await createNonCompliantDomain();

    // Monitor the configuration
    await monitorDomain();

    // Wait for a short period to simulate the test scenario
    console.log("Waiting for 5 minutes before cleanup...");
    await new Promise(resolve => setTimeout(resolve, 300000));

    // Cleanup
    await cleanup();
    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("Cleanup after error failed:", cleanupError);
    }
  }
}

// Validate environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION',
    'AWS_ACCOUNT_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Execute the script with environment validation
if (require.main === module) {
  try {
    validateEnvironmentVariables();
    main();
  } catch (error) {
    console.error("Initialization error:", error.message);
    process.exit(1);
  }
}

module.exports = {
  createNonCompliantDomain,
  cleanup,
  monitorDomain
};
