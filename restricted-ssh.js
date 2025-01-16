require('dotenv').config();
const {
  EC2Client,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  DescribeSecurityGroupsCommand,
  RevokeSecurityGroupIngressCommand,
  DeleteSecurityGroupCommand
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

// Create non-compliant security group (unrestricted SSH)
async function createNonCompliantSecurityGroup() {
  const groupName = `test-sg-unrestricted-ssh-${Date.now()}`;
  
  try {
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Test security group with unrestricted SSH access'
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId,
      name: groupName
    });

    console.log(`Created security group: ${groupName} (${securityGroupId})`);

    // Add unrestricted SSH rule (non-compliant)
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 22,
            ToPort: 22,
            IpRanges: [
              {
                CidrIp: '0.0.0.0/0',
                Description: 'Allow SSH from anywhere (non-compliant)'
              }
            ]
          }
        ]
      })
    );

    console.log('Added unrestricted SSH rule');
    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

// Create compliant security group (restricted SSH) for comparison
async function createCompliantSecurityGroup() {
  const groupName = `test-sg-restricted-ssh-${Date.now()}`;
  
  try {
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Test security group with restricted SSH access'
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId,
      name: groupName
    });

    console.log(`Created security group: ${groupName} (${securityGroupId})`);

    // Add restricted SSH rule (compliant)
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 22,
            ToPort: 22,
            IpRanges: [
              {
                CidrIp: process.env.ALLOWED_IP_RANGE || '10.0.0.0/16', // Replace with your allowed IP range
                Description: 'Allow SSH from specific range (compliant)'
              }
            ]
          }
        ]
      })
    );

    console.log('Added restricted SSH rule');
    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

// Check security group rules
async function checkSecurityGroupRules(securityGroupId) {
  try {
    const response = await ec2Client.send(
      new DescribeSecurityGroupsCommand({
        GroupIds: [securityGroupId]
      })
    );

    const securityGroup = response.SecurityGroups[0];
    console.log(`\nAnalyzing Security Group: ${securityGroup.GroupName} (${securityGroup.GroupId})`);
    
    // Check inbound rules
    console.log('\nInbound Rules:');
    securityGroup.IpPermissions.forEach(rule => {
      if (rule.FromPort === 22 || rule.ToPort === 22) {
        console.log('\nSSH Rule Found:');
        console.log(`Protocol: ${rule.IpProtocol}`);
        console.log(`Port Range: ${rule.FromPort}-${rule.ToPort}`);
        
        rule.IpRanges.forEach(ipRange => {
          console.log(`CIDR: ${ipRange.CidrIp}`);
          console.log(`Description: ${ipRange.Description || 'No description'}`);
          
          // Check if rule is compliant
          const isCompliant = ipRange.CidrIp !== '0.0.0.0/0';
          console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
        });
      }
    });
  } catch (error) {
    console.error('Error checking security group rules:', error);
  }
}

// List all security groups with SSH access
async function listSecurityGroupsWithSshAccess() {
  try {
    const response = await ec2Client.send(
      new DescribeSecurityGroupsCommand({})
    );

    console.log('\nAll Security Groups with SSH Access:');
    response.SecurityGroups.forEach(sg => {
      const sshRules = sg.IpPermissions.filter(
        rule => (rule.FromPort === 22 || rule.ToPort === 22)
      );

      if (sshRules.length > 0) {
        console.log(`\nGroup: ${sg.GroupName} (${sg.GroupId})`);
        sshRules.forEach(rule => {
          rule.IpRanges.forEach(ipRange => {
            console.log(`CIDR: ${ipRange.CidrIp}`);
            const isCompliant = ipRange.CidrIp !== '0.0.0.0/0';
            console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
          });
        });
      }
    });
  } catch (error) {
    console.error('Error listing security groups:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'SECURITY_GROUP':
          // Delete security group
          await ec2Client.send(
            new DeleteSecurityGroupCommand({
              GroupId: resource.id
            })
          );
          console.log(`Deleted security group: ${resource.name} (${resource.id})`);
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting non-compliant scenario creation...');
    
    // Create non-compliant security group
    const nonCompliantSgId = await createNonCompliantSecurityGroup();
    console.log('\nChecking non-compliant security group:');
    await checkSecurityGroupRules(nonCompliantSgId);
    
    // Create compliant security group for comparison
    if (process.env.CREATE_COMPLIANT_EXAMPLE === 'true') {
      console.log('\nCreating compliant example for comparison...');
      const compliantSgId = await createCompliantSecurityGroup();
      console.log('\nChecking compliant security group:');
      await checkSecurityGroupRules(compliantSgId);
    }
    
    // List all security groups with SSH access
    await listSecurityGroupsWithSshAccess();
    
    // Wait a moment before cleanup
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
