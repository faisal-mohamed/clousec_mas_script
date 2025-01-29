const {
  EC2Client,
  CreateSecurityGroupCommand,
  AuthorizeSecurityGroupIngressCommand,
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

async function createUnrestrictedSSHSecurityGroup(vpcId) {
  try {
    console.log('Creating security group with unrestricted SSH access...');
    
    // Create security group
    const createResponse = await ec2Client.send(
      new CreateSecurityGroupCommand({
        GroupName: `unrestricted-ssh-sg-${Date.now()}`,
        Description: 'Security group with unrestricted SSH access',
        VpcId: vpcId,
        TagSpecifications: [{
          ResourceType: 'security-group',
          Tags: [{
            Key: 'simulation-mas',
            Value: 'true'
          }, {
            Key: 'Name',
            Value: 'Unrestricted-SSH-Security-Group'
          }]
        }]
      })
    );

    const securityGroupId = createResponse.GroupId;
    console.log(`Created security group: ${securityGroupId}`);

    // Add unrestricted SSH inbound rule
    await ec2Client.send(
      new AuthorizeSecurityGroupIngressCommand({
        GroupId: securityGroupId,
        IpPermissions: [
          {
            IpProtocol: 'tcp',
            FromPort: 22,
            ToPort: 22,
            IpRanges: [{
              CidrIp: '0.0.0.0/0',
              Description: 'Allow SSH access from anywhere'
            }],
            Ipv6Ranges: [{
              CidrIpv6: '::/0',
              Description: 'Allow SSH access from anywhere (IPv6)'
            }]
          }
        ]
      })
    );
    console.log('Added unrestricted SSH inbound rule');

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
      console.log(`- Protocol: ${rule.IpProtocol}`);
      console.log(`  Port Range: ${rule.FromPort}-${rule.ToPort}`);
      rule.IpRanges.forEach(range => {
        console.log(`  IPv4: ${range.CidrIp} (${range.Description || 'No description'})`);
      });
      if (rule.Ipv6Ranges && rule.Ipv6Ranges.length > 0) {
        rule.Ipv6Ranges.forEach(range => {
          console.log(`  IPv6: ${range.CidrIpv6} (${range.Description || 'No description'})`);
        });
      }
    });

    console.log('\nOutbound Rules:');
    securityGroup.IpPermissionsEgress.forEach(rule => {
      console.log(`- Protocol: ${rule.IpProtocol}`);
      console.log(`  Port Range: ${rule.FromPort === -1 ? 'All' : `${rule.FromPort}-${rule.ToPort}`}`);
      rule.IpRanges.forEach(range => {
        console.log(`  IPv4: ${range.CidrIp}`);
      });
    });

    console.log('\nWarning: This security group allows SSH access from any IP address (0.0.0.0/0)');
    console.log('This is a security risk and should only be used for testing purposes.');

    return {
      securityGroupId,
      groupName: securityGroup.GroupName,
      vpcId: securityGroup.VpcId
    };
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

    console.log(`Creating security group with unrestricted SSH access in VPC: ${vpcId}`);
    const result = await createUnrestrictedSSHSecurityGroup(vpcId);
    
    console.log('\nSecurity group creation completed successfully!');
    console.log('------------------------');
    console.log(`Security Group ID: ${result.securityGroupId}`);
    console.log(`Security Group Name: ${result.groupName}`);
    console.log(`VPC ID: ${result.vpcId}`);
    console.log('------------------------');
    console.log('\nNOTE: This security group allows SSH access from ANY IP address.');
    console.log('For production use, please restrict SSH access to specific IP ranges.');

  } catch (error) {
    console.error('Error in main execution:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createUnrestrictedSSHSecurityGroup
};
