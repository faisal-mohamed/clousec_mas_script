require('dotenv').config();
const {
  EC2Client,
  DescribeSecurityGroupsCommand,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
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

// Parse port ranges from environment variables
function parsePortRanges(portsString) {
  if (!portsString) return [];
  
  return portsString.split(',').map(range => {
    const [start, end] = range.split('-').map(Number);
    return end ? { FromPort: start, ToPort: end } : { FromPort: start, ToPort: start };
  });
}

// Create non-compliant security group
async function createNonCompliantSecurityGroup() {
  const groupName = `test-sg-unauthorized-ports-${Date.now()}`;
  
  try {
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Test security group with unauthorized open ports'
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId,
      name: groupName
    });

    console.log(`Created security group: ${groupName} (${securityGroupId})`);

    // Add non-compliant rules (unauthorized open ports)
    const nonCompliantRules = [
      // Unauthorized TCP ports
      {
        IpProtocol: 'tcp',
        FromPort: 23,  // Telnet
        ToPort: 23,
        IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Unauthorized Telnet access' }]
      },
      {
        IpProtocol: 'tcp',
        FromPort: 3389,  // RDP
        ToPort: 3389,
        IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Unauthorized RDP access' }]
      },
      // Unauthorized UDP port
      {
        IpProtocol: 'udp',
        FromPort: 161,  // SNMP
        ToPort: 161,
        IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'Unauthorized SNMP access' }]
      }
    ];

    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: nonCompliantRules
      })
    );

    console.log('Added non-compliant rules');
    return securityGroupId;
  } catch (error) {
    console.error('Error creating non-compliant security group:', error);
    throw error;
  }
}

// Create compliant security group
async function createCompliantSecurityGroup() {
  const groupName = `test-sg-authorized-ports-${Date.now()}`;
  
  try {
    // Create security group
    const createSgResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: groupName,
        Description: 'Test security group with only authorized ports'
      })
    );

    const securityGroupId = createSgResponse.GroupId;
    createdResources.push({
      type: 'SECURITY_GROUP',
      id: securityGroupId,
      name: groupName
    });

    console.log(`Created security group: ${groupName} (${securityGroupId})`);

    // Get authorized ports from environment variables
    const authorizedTcpPorts = parsePortRanges(process.env.AUTHORIZED_TCP_PORTS);
    const authorizedUdpPorts = parsePortRanges(process.env.AUTHORIZED_UDP_PORTS);

    // Create compliant rules
    const compliantRules = [
      // TCP rules
      ...authorizedTcpPorts.map(portRange => ({
        IpProtocol: 'tcp',
        FromPort: portRange.FromPort,
        ToPort: portRange.ToPort,
        IpRanges: [{ CidrIp: '0.0.0.0/0', Description: `Authorized TCP port ${portRange.FromPort}-${portRange.ToPort}` }]
      })),
      // UDP rules
      ...authorizedUdpPorts.map(portRange => ({
        IpProtocol: 'udp',
        FromPort: portRange.FromPort,
        ToPort: portRange.ToPort,
        IpRanges: [{ CidrIp: '0.0.0.0/0', Description: `Authorized UDP port ${portRange.FromPort}-${portRange.ToPort}` }]
      }))
    ];

    if (compliantRules.length > 0) {
      await ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: compliantRules
        })
      );
      console.log('Added compliant rules');
    }

    return securityGroupId;
  } catch (error) {
    console.error('Error creating compliant security group:', error);
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
    const authorizedTcpPorts = parsePortRanges(process.env.AUTHORIZED_TCP_PORTS);
    const authorizedUdpPorts = parsePortRanges(process.env.AUTHORIZED_UDP_PORTS);

    console.log(`\nAnalyzing Security Group: ${securityGroup.GroupName} (${securityGroup.GroupId})`);
    
    let hasUnauthorizedPorts = false;
    
    // Check inbound rules
    console.log('\nInbound Rules:');
    securityGroup.IpPermissions.forEach(rule => {
      const protocol = rule.IpProtocol;
      const fromPort = rule.FromPort;
      const toPort = rule.ToPort;

      rule.IpRanges.forEach(ipRange => {
        if (ipRange.CidrIp === '0.0.0.0/0') {
          console.log(`\nRule:`);
          console.log(`Protocol: ${protocol}`);
          console.log(`Port Range: ${fromPort}-${toPort}`);
          console.log(`CIDR: ${ipRange.CidrIp}`);

          // Check if port is authorized
          let isAuthorized = false;
          if (protocol === 'tcp') {
            isAuthorized = authorizedTcpPorts.some(
              range => fromPort >= range.FromPort && toPort <= range.ToPort
            );
          } else if (protocol === 'udp') {
            isAuthorized = authorizedUdpPorts.some(
              range => fromPort >= range.FromPort && toPort <= range.ToPort
            );
          }

          console.log(`Status: ${isAuthorized ? 'AUTHORIZED' : 'UNAUTHORIZED'}`);
          if (!isAuthorized) hasUnauthorizedPorts = true;
        }
      });
    });

    console.log(`\nOverall Compliance Status: ${hasUnauthorizedPorts ? 'NON_COMPLIANT' : 'COMPLIANT'}`);
    return hasUnauthorizedPorts;
  } catch (error) {
    console.error('Error checking security group rules:', error);
    throw error;
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'SECURITY_GROUP':
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
    console.log('Starting security group port check...');
    
    // Create non-compliant security group
    console.log('\nCreating non-compliant security group...');
    const nonCompliantSgId = await createNonCompliantSecurityGroup();
    await checkSecurityGroupRules(nonCompliantSgId);
    
    // Create compliant security group
    console.log('\nCreating compliant security group...');
    const compliantSgId = await createCompliantSecurityGroup();
    await checkSecurityGroupRules(compliantSgId);
    
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
