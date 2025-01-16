require('dotenv').config();

const {
  EC2Client,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DeleteSecurityGroupCommand,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand
} = require("@aws-sdk/client-ec2");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const ec2Client = new EC2Client({ credentials, region });

// Define commonly restricted ports and their services
const restrictedPorts = [
  { port: 20, description: "FTP Data" },
  { port: 21, description: "FTP Control" },
  { port: 23, description: "Telnet" },
  { port: 25, description: "SMTP" },
  { port: 53, description: "DNS" },
  { port: 135, description: "RPC" },
  { port: 139, description: "NetBIOS" },
  { port: 445, description: "CIFS" },
  { port: 1433, description: "MSSQL" },
  { port: 1521, description: "Oracle DB" },
  { port: 3306, description: "MySQL" },
  { port: 3389, description: "RDP" },
  { port: 5432, description: "PostgreSQL" }
];

const securityGroupName = `non-compliant-sg-${Date.now()}`;

async function getDefaultVpcId() {
  try {
    const { Vpcs } = await ec2Client.send(new DescribeVpcsCommand({
      Filters: [{ Name: "isDefault", Values: ["true"] }]
    }));

    if (!Vpcs || Vpcs.length === 0) {
      throw new Error("No default VPC found");
    }

    return Vpcs[0].VpcId;
  } catch (error) {
    console.error("Error getting default VPC:", error);
    throw error;
  }
}

async function createNonCompliantSecurityGroup() {
  try {
    const vpcId = await getDefaultVpcId();
    
    // Create security group
    console.log("Creating security group...");
    const createResponse = await ec2Client.send(new CreateSecurityGroupCommand({
      GroupName: securityGroupName,
      Description: "Non-compliant security group with restricted ports open",
      VpcId: vpcId
    }));

    const securityGroupId = createResponse.GroupId;
    console.log(`Security group created with ID: ${securityGroupId}`);

    // Add ingress rules for restricted ports
    console.log("Adding ingress rules for restricted ports...");
    for (const { port, description } of restrictedPorts) {
      await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: "tcp",
        FromPort: port,
        ToPort: port,
        CidrIp: "0.0.0.0/0", // Non-compliant: Open to the world
        Description: `Non-compliant rule for ${description}`
      }));
      console.log(`Added rule for port ${port} (${description})`);
    }

    // Add additional non-compliant rules for ranges
    const rangeRules = [
      { FromPort: 3000, ToPort: 4000, Description: "Development ports range" },
      { FromPort: 8000, ToPort: 9000, Description: "Web application ports range" }
    ];

    for (const rule of rangeRules) {
      await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpProtocol: "tcp",
        FromPort: rule.FromPort,
        ToPort: rule.ToPort,
        CidrIp: "0.0.0.0/0",
        Description: rule.Description
      }));
      console.log(`Added rule for port range ${rule.FromPort}-${rule.ToPort}`);
    }

    return securityGroupId;
  } catch (error) {
    console.error("Error creating security group:", error);
    throw error;
  }
}

async function cleanup(securityGroupId) {
  if (!securityGroupId) return;

  try {
    console.log("Starting cleanup process...");
    
    // Check if security group still exists
    try {
      await ec2Client.send(new DescribeSecurityGroupsCommand({
        GroupIds: [securityGroupId]
      }));
    } catch (error) {
      if (error.name === 'InvalidGroup.NotFound') {
        console.log("Security group already deleted");
        return;
      }
    }

    // Delete security group
    await ec2Client.send(new DeleteSecurityGroupCommand({
      GroupId: securityGroupId
    }));

    console.log("Security group deleted successfully");
  } catch (error) {
    console.error("Error during cleanup:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting restricted ports simulation in region ${region}`);
  let securityGroupId;
  
  try {
    securityGroupId = await createNonCompliantSecurityGroup();
    
    // Wait for a short period to simulate the test scenario
    console.log("Waiting for 2 minutes before cleanup...");
    await new Promise(resolve => setTimeout(resolve, 120000));

    await cleanup(securityGroupId);
    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
    if (securityGroupId) {
      try {
        await cleanup(securityGroupId);
      } catch (cleanupError) {
        console.error("Cleanup after error failed:", cleanupError);
      }
    }
  }
}

// Validate environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION'
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
  createNonCompliantSecurityGroup,
  cleanup,
  getDefaultVpcId
};
