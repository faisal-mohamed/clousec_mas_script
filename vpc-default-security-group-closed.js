require('dotenv').config();
const {
  EC2Client,
  DescribeSecurityGroupsCommand,
  DescribeVpcsCommand,
  RevokeSecurityGroupIngressCommand,
  RevokeSecurityGroupEgressCommand,
  AuthorizeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand
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

// Find default security groups for all VPCs
async function findDefaultSecurityGroups() {
  try {
    const vpcsResponse = await ec2Client.send(new DescribeVpcsCommand({}));
    const defaultSecurityGroups = [];

    for (const vpc of vpcsResponse.Vpcs) {
      const response = await ec2Client.send(
        new DescribeSecurityGroupsCommand({
          Filters: [
            {
              Name: 'vpc-id',
              Values: [vpc.VpcId]
            },
            {
              Name: 'group-name',
              Values: ['default']
            }
          ]
        })
      );

      if (response.SecurityGroups.length > 0) {
        defaultSecurityGroups.push({
          vpcId: vpc.VpcId,
          securityGroup: response.SecurityGroups[0]
        });
      }
    }

    return defaultSecurityGroups;
  } catch (error) {
    console.error('Error finding default security groups:', error);
    throw error;
  }
}

// Check security group rules
async function checkSecurityGroupRules(securityGroup) {
  const hasInboundRules = securityGroup.IpPermissions.length > 0;
  const hasOutboundRules = securityGroup.IpPermissionsEgress.length > 0;

  console.log(`\nAnalyzing Default Security Group for VPC ${securityGroup.VpcId}`);
  console.log(`Security Group ID: ${securityGroup.GroupId}`);
  console.log('Current Status:');
  console.log(`- Has Inbound Rules: ${hasInboundRules}`);
  console.log(`- Has Outbound Rules: ${hasOutboundRules}`);
  console.log(`- Compliance Status: ${!hasInboundRules && !hasOutboundRules ? 'COMPLIANT' : 'NON_COMPLIANT'}`);

  if (hasInboundRules) {
    console.log('\nInbound Rules:');
    securityGroup.IpPermissions.forEach(rule => {
      console.log(`- Protocol: ${rule.IpProtocol}`);
      if (rule.FromPort) console.log(`  Port Range: ${rule.FromPort}-${rule.ToPort}`);
      if (rule.IpRanges.length > 0) {
        rule.IpRanges.forEach(range => {
          console.log(`  CIDR: ${range.CidrIp}`);
        });
      }
      if (rule.UserIdGroupPairs.length > 0) {
        rule.UserIdGroupPairs.forEach(pair => {
          console.log(`  Group: ${pair.GroupId}`);
        });
      }
    });
  }

  if (hasOutboundRules) {
    console.log('\nOutbound Rules:');
    securityGroup.IpPermissionsEgress.forEach(rule => {
      console.log(`- Protocol: ${rule.IpProtocol}`);
      if (rule.FromPort) console.log(`  Port Range: ${rule.FromPort}-${rule.ToPort}`);
      if (rule.IpRanges.length > 0) {
        rule.IpRanges.forEach(range => {
          console.log(`  CIDR: ${range.CidrIp}`);
        });
      }
      if (rule.UserIdGroupPairs.length > 0) {
        rule.UserIdGroupPairs.forEach(pair => {
          console.log(`  Group: ${pair.GroupId}`);
        });
      }
    });
  }

  return { hasInboundRules, hasOutboundRules };
}

// Make security group non-compliant (add rules)
async function makeNonCompliant(securityGroup) {
  try {
    console.log(`\nMaking security group ${securityGroup.GroupId} non-compliant...`);

    // Add inbound rule
    if (securityGroup.IpPermissions.length === 0) {
      await ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroup.GroupId,
          IpPermissions: [
            {
              IpProtocol: '-1',
              FromPort: -1,
              ToPort: -1,
              UserIdGroupPairs: [
                {
                  GroupId: securityGroup.GroupId
                }
              ]
            }
          ]
        })
      );
      console.log('Added inbound rule');
    }

    // Add outbound rule
    if (securityGroup.IpPermissionsEgress.length === 0) {
      await ec2Client.send(
        new AuthorizeSecurityGroupEgressCommand({
          GroupId: securityGroup.GroupId,
          IpPermissions: [
            {
              IpProtocol: '-1',
              FromPort: -1,
              ToPort: -1,
              IpRanges: [
                {
                  CidrIp: '0.0.0.0/0'
                }
              ]
            }
          ]
        })
      );
      console.log('Added outbound rule');
    }
  } catch (error) {
    console.error('Error making security group non-compliant:', error);
    throw error;
  }
}

// Make security group compliant (remove all rules)
async function makeCompliant(securityGroup) {
  try {
    console.log(`\nMaking security group ${securityGroup.GroupId} compliant...`);

    // Remove inbound rules
    if (securityGroup.IpPermissions.length > 0) {
      await ec2Client.send(
        new RevokeSecurityGroupIngressCommand({
          GroupId: securityGroup.GroupId,
          IpPermissions: securityGroup.IpPermissions
        })
      );
      console.log('Removed inbound rules');
    }

    // Remove outbound rules
    if (securityGroup.IpPermissionsEgress.length > 0) {
      await ec2Client.send(
        new RevokeSecurityGroupEgressCommand({
          GroupId: securityGroup.GroupId,
          IpPermissions: securityGroup.IpPermissionsEgress
        })
      );
      console.log('Removed outbound rules');
    }
  } catch (error) {
    console.error('Error making security group compliant:', error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting VPC default security group check...');
    
    // Find all default security groups
    const defaultSecurityGroups = await findDefaultSecurityGroups();
    
    if (defaultSecurityGroups.length === 0) {
      console.log('No default security groups found');
      return;
    }

    // Check initial state
    console.log('\nInitial State:');
    for (const { securityGroup } of defaultSecurityGroups) {
      await checkSecurityGroupRules(securityGroup);
    }

    // Make non-compliant if specified
    if (process.env.MAKE_NON_COMPLIANT === 'true') {
      for (const { securityGroup } of defaultSecurityGroups) {
        await makeNonCompliant(securityGroup);
      }

      // Check non-compliant state
      console.log('\nAfter Making Non-Compliant:');
      for (const { securityGroup } of defaultSecurityGroups) {
        const updatedSg = (await ec2Client.send(
          new DescribeSecurityGroupsCommand({
            GroupIds: [securityGroup.GroupId]
          })
        )).SecurityGroups[0];
        await checkSecurityGroupRules(updatedSg);
      }
    }

    // Make compliant if specified
    if (process.env.MAKE_COMPLIANT === 'true') {
      for (const { securityGroup } of defaultSecurityGroups) {
        await makeCompliant(securityGroup);
      }

      // Check compliant state
      console.log('\nAfter Making Compliant:');
      for (const { securityGroup } of defaultSecurityGroups) {
        const updatedSg = (await ec2Client.send(
          new DescribeSecurityGroupsCommand({
            GroupIds: [securityGroup.GroupId]
          })
        )).SecurityGroups[0];
        await checkSecurityGroupRules(updatedSg);
      }
    }
    
  } catch (error) {
    console.error('Error in main execution:', error);
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
