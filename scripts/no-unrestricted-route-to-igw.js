const {
    EC2Client,
    DescribeSubnetsCommand
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

async function getAvailableSubnets() {
    try {
        const vpcId = process.env.VPC_ID;
        if (!vpcId) {
            throw new Error('VPC_ID environment variable is not set');
        }

        console.log(`Fetching subnets for VPC: ${vpcId}`);
        
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId]
                }
            ]
        }));

        const subnets = response.Subnets.map(subnet => ({
            SubnetId: subnet.SubnetId,
            CidrBlock: subnet.CidrBlock,
            AvailabilityZone: subnet.AvailabilityZone,
            AvailableIPs: subnet.AvailableIpAddressCount,
            DefaultForAz: subnet.DefaultForAz,
            MapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch,
            Tags: subnet.Tags || []
        }));

        console.log('\nSubnets Summary:');
        subnets.forEach(subnet => {
            console.log('\nSubnet Details:', {
                SubnetId: subnet.SubnetId,
                CIDR: subnet.CidrBlock,
                AZ: subnet.AvailabilityZone,
                AvailableIPs: subnet.AvailableIPs,
                IsPublic: subnet.MapPublicIpOnLaunch,
                Tags: subnet.Tags.reduce((acc, tag) => {
                    acc[tag.Key] = tag.Value;
                    return acc;
                }, {})
            });
        });

        return subnets;
    } catch (error) {
        console.error('Error fetching subnets:', error.message);
        throw error;
    }
}

// Execute the function
getAvailableSubnets()
    .then(subnets => {
        console.log('\nTotal Subnets Found:', subnets.length);
        
        // Group subnets by public/private
        const publicSubnets = subnets.filter(s => s.MapPublicIpOnLaunch);
        const privateSubnets = subnets.filter(s => !s.MapPublicIpOnLaunch);
        
        console.log('\nNetwork Summary:', {
            totalSubnets: subnets.length,
            publicSubnets: publicSubnets.length,
            privateSubnets: privateSubnets.length,
            totalAvailableIPs: subnets.reduce((sum, subnet) => sum + subnet.AvailableIPs, 0)
        });

        // Display AZ distribution
        const azDistribution = subnets.reduce((acc, subnet) => {
            acc[subnet.AvailabilityZone] = (acc[subnet.AvailabilityZone] || 0) + 1;
            return acc;
        }, {});
        
        console.log('\nAvailability Zone Distribution:', azDistribution);
    })
    .catch(error => {
        console.error('Operation failed:', error.message);
        process.exit(1);
    });
