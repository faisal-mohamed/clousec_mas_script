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
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createSecurityGroupWithUnauthorizedRules() {
    const vpcId = process.env.VPC_ID;
    const groupName = `unauthorized-sg-${Date.now()}`;

    try {
        // Create security group
        console.log('Creating security group...');
        const createSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: groupName,
                Description: 'Security group with unauthorized rules',
                VpcId: vpcId,
                TagSpecifications: [{
                    ResourceType: 'security-group',
                    Tags: [{
                        Key: 'simulation-mas',
                        Value: 'true'
                    }]
                }]
            })
        );

        const securityGroupId = createSgResponse.GroupId;
        console.log(`Created security group: ${groupName} (${securityGroupId})`);

        // Define unauthorized inbound rules
        const unauthorizedRules = [
            {
                IpProtocol: 'tcp',
                FromPort: 23,  // Telnet
                ToPort: 23,
                IpRanges: [{ 
                    CidrIp: '0.0.0.0/0',
                    Description: 'Allow Telnet from anywhere'
                }]
            },
            {
                IpProtocol: 'tcp',
                FromPort: 21,  // FTP
                ToPort: 21,
                IpRanges: [{ 
                    CidrIp: '0.0.0.0/0',
                    Description: 'Allow FTP from anywhere'
                }]
            },
            {
                IpProtocol: 'tcp',
                FromPort: 3389,  // RDP
                ToPort: 3389,
                IpRanges: [{ 
                    CidrIp: '0.0.0.0/0',
                    Description: 'Allow RDP from anywhere'
                }]
            },
            {
                IpProtocol: '-1',  // All traffic
                FromPort: -1,
                ToPort: -1,
                IpRanges: [{ 
                    CidrIp: '0.0.0.0/0',
                    Description: 'Allow all traffic'
                }]
            }
        ];

        // Add unauthorized rules
        console.log('Adding unauthorized inbound rules...');
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: securityGroupId,
                IpPermissions: unauthorizedRules
            })
        );

        // Verify the rules
        const verifyRules = await ec2Client.send(
            new DescribeSecurityGroupsCommand({
                GroupIds: [securityGroupId]
            })
        );

        console.log('\nCreated Security Group Details:');
        console.log('Security Group ID:', securityGroupId);
        console.log('Security Group Name:', groupName);
        console.log('\nInbound Rules:');
        verifyRules.SecurityGroups[0].IpPermissions.forEach(rule => {
            console.log('\nProtocol:', rule.IpProtocol);
            console.log('Port Range:', rule.FromPort === -1 ? 'All' : `${rule.FromPort}-${rule.ToPort}`);
            rule.IpRanges.forEach(ipRange => {
                console.log('CIDR:', ipRange.CidrIp);
                console.log('Description:', ipRange.Description);
            });
        });

        return securityGroupId;

    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Validate environment variables
function validateEnvironmentVariables() {
    const requiredEnvVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_REGION',
        'VPC_ID'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
}

// Main execution
async function main() {
    try {
        validateEnvironmentVariables();
        console.log(`Starting security group creation in VPC: ${process.env.VPC_ID}`);
        const securityGroupId = await createSecurityGroupWithUnauthorizedRules();
        console.log('\nProcess completed successfully.');
        console.log(`Security Group ID: ${securityGroupId}`);
    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

// Export the function for external use
module.exports = {
    createSecurityGroupWithUnauthorizedRules
};

// Run the script if called directly
if (require.main === module) {
    main().catch(console.error);
}
