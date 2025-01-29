const {
  EC2Client,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
  AuthorizeSecurityGroupEgressCommand,
  DescribeSecurityGroupsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION
});

async function createUnrestrictedSecurityGroup(vpcId) {
  try {
    console.log('Creating security group with unrestricted access...');
    
    // Create security group
    const createResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: `unrestricted-sg-${Date.now()}`,
        Description: 'Security group with unrestricted inbound and outbound access',
        VpcId: vpcId,
        TagSpecifications: [{
          ResourceType: 'security-group',
          Tags: [{
            Key: 'simulation-mas',
            Value: 'true'
          }, {
            Key: 'Name',
            Value: 'Unrestricted-Security-Group'
          }]
        }]
      })
    );

    const securityGroupId = createResponse.GroupId;
    console.log(`Created security group: ${securityGroupId}`);

    // Add unrestricted inbound rules (all protocols, all ports)
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: '-1', // -1 means all protocols
            FromPort: -1,     // -1 means all ports
            ToPort: -1,
            IpRanges: [{
              CidrIp: '0.0.0.0/0',
              Description: 'Allow all inbound IPv4 traffic'
            }],
            Ipv6Ranges: [{
              CidrIpv6: '::/0',
              Description: 'Allow all inbound IPv6 traffic'
            }]
          }
        ]
      })
    );
    console.log('Added unrestricted inbound rules');

    // Add unrestricted outbound rules (all protocols, all ports)
    // await ec2Client.send(
    //   new AuthorizeSecurityGroupEgressCommand({
    //     GroupId: securityGroupId,
    //     IpPermissions: [
    //       {
    //         IpProtocol: '-1', // -1 means all protocols
    //         FromPort: -1,     // -1 means all ports
    //         ToPort: -1,
    //         IpRanges: [{
    //           CidrIp: '0.0.0.0/0',
    //           Description: 'Allow all outbound IPv4 traffic'
    //         }],
    //         Ipv6Ranges: [{
    //           CidrIpv6: '::/0',
    //           Description: 'Allow all outbound IPv6 traffic'
    //         }]
    //       }
    //     ]
    //   })
    // );
    // console.log('Added unrestricted outbound rules');

    // Get and display the security group details
    const describeResponse = await ec2Client.send(
      new DescribeSecurityGroupsCommand({
        GroupIds: [securityGroupId]
      })
    );

    const securityGroup = describeResponse.SecurityGroups[0];
    
    console.log('\nSecurity Group Details:');
    console.log('------------------------');
    console.log(`Security Group ID: ${securityGroup.GroupId}`);
    console.log(`Name: ${securityGroup.GroupName}`);
    console.log(`VPC ID: ${securityGroup.VpcId}`);
    console.log(`Description: ${securityGroup.Description}`);
    
    console.log('\nInbound Rules:');
    securityGroup.IpPermissions.forEach(rule => {
      console.log(`- Protocol: ${rule.IpProtocol === '-1' ? 'All' : rule.IpProtocol}`);
      console.log(`  Port Range: ${rule.FromPort === -1 ? 'All' : `${rule.FromPort}-${rule.ToPort}`}`);
      rule.IpRanges.forEach(range => {
        console.log(`  IPv4: ${range.CidrIp} (${range.Description})`);
      });
      rule.Ipv6Ranges.forEach(range => {
        console.log(`  IPv6: ${range.CidrIpv6} (${range.Description})`);
      });
    });

    console.log('\nOutbound Rules:');
    securityGroup.IpPermissionsEgress.forEach(rule => {
      console.log(`- Protocol: ${rule.IpProtocol === '-1' ? 'All' : rule.IpProtocol}`);
      console.log(`  Port Range: ${rule.FromPort === -1 ? 'All' : `${rule.FromPort}-${rule.ToPort}`}`);
      rule.IpRanges.forEach(range => {
        console.log(`  IPv4: ${range.CidrIp} (${range.Description})`);
      });
      rule.Ipv6Ranges.forEach(range => {
        console.log(`  IPv6: ${range.CidrIpv6} (${range.Description})`);
      });
    });

    return securityGroupId;
  } catch (error) {
    console.error('Error creating security group:', error);
    throw error;
  }
}

async function main() {
  try {
    const vpcId = process.env.VPC_ID;
    if (!vpcId) {
      throw new Error('VPC_ID environment variable is required');
    }

    console.log(`Creating unrestricted security group in VPC: ${vpcId}`);
    const securityGroupId = await createUnrestrictedSecurityGroup(vpcId);
    console.log('\nSecurity group creation completed successfully!');
    console.log(`Security Group ID: ${securityGroupId}`);

  } catch (error) {
    console.error('Error in main execution:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createUnrestrictedSecurityGroup
};
