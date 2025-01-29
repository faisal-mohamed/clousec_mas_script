const { 
    EC2Client, 
    DescribeSubnetsCommand, 
    ModifySubnetAttributeCommand 
} = require('@aws-sdk/client-ec2');
require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({ 
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

// Function to get all subnets in specified VPC
async function getVpcSubnets(vpcId) {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId]
                }
            ]
        }));
        return response.Subnets;
    } catch (error) {
        console.error('Error getting subnets:', error);
        throw error;
    }
}

// Function to enable auto-assign public IP for a subnet
async function enableAutoAssignPublicIP(subnetId) {
    try {
        await ec2Client.send(new ModifySubnetAttributeCommand({
            SubnetId: subnetId,
            MapPublicIpOnLaunch: {
                Value: true
            }
        }));
        console.log(`Successfully enabled auto-assign public IP for subnet ${subnetId}`);
    } catch (error) {
        console.error(`Error modifying subnet ${subnetId}:`, error);
        throw error;
    }
}

// Function to describe current subnet settings
async function describeCurrentSettings(subnets) {
    console.log('\nCurrent Subnet Settings:');
    subnets.forEach((subnet, index) => {
        console.log(`${index + 1}. Subnet ID: ${subnet.SubnetId}`);
        console.log(`   Auto-assign Public IP: ${subnet.MapPublicIpOnLaunch}`);
        console.log(`   Availability Zone: ${subnet.AvailabilityZone}`);
        console.log(`   CIDR Block: ${subnet.CidrBlock}`);
        console.log('---');
    });
}

// Main function
async function main() {
    try {
        // Validate environment variables
        if (!process.env.VPC_ID) {
            throw new Error('VPC_ID environment variable is required');
        }

        const vpcId = process.env.VPC_ID;
        console.log(`Getting subnets for VPC: ${vpcId}`);

        // Get all subnets in the VPC
        const subnets = await getVpcSubnets(vpcId);
        
        if (subnets.length === 0) {
            console.log('No subnets found in the specified VPC');
            return;
        }

        // Display current settings
        console.log('Before modifications:');
        await describeCurrentSettings(subnets);

        // Let user select a subnet (for demonstration, using the first subnet)
        // You can modify this to take user input or pass subnet ID as parameter
        const selectedSubnet = subnets[0];
        
        // Enable auto-assign public IP for selected subnet
        await enableAutoAssignPublicIP(selectedSubnet.SubnetId);

        // Get updated subnet information
        const updatedSubnets = await getVpcSubnets(vpcId);
        
        // Display updated settings
        console.log('\nAfter modifications:');
        await describeCurrentSettings(updatedSubnets);

    } catch (error) {
        console.error('Error in main function:', error);
        process.exit(1);
    }
}

// Function to enable auto-assign public IP for a specific subnet
async function enableAutoAssignPublicIPForSubnet(vpcId, subnetId) {
    try {
        // Verify the subnet exists in the VPC
        const subnets = await getVpcSubnets(vpcId);
        const targetSubnet = subnets.find(subnet => subnet.SubnetId === subnetId);
        
        if (!targetSubnet) {
            throw new Error(`Subnet ${subnetId} not found in VPC ${vpcId}`);
        }

        // Enable auto-assign public IP
        await enableAutoAssignPublicIP(subnetId);
        
        console.log(`Successfully modified subnet ${subnetId}`);
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
}

// Export functions for external use
module.exports = {
    getVpcSubnets,
    enableAutoAssignPublicIP,
    enableAutoAssignPublicIPForSubnet,
    describeCurrentSettings
};

// Run the script if called directly
if (require.main === module) {
    main().catch(console.error);
}
