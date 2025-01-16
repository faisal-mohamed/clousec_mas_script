const { 
    EC2Client, 
    DescribeSubnetsCommand, 
    ModifySubnetAttributeCommand 
} = require('@aws-sdk/client-ec2');
require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

// Store original subnet settings for restoration
let originalSubnetSettings = [];

// Function to get all subnets in default VPC
async function getDefaultVpcSubnets() {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'default-for-az',
                    Values: ['true']
                }
            ]
        }));
        return response.Subnets;
    } catch (error) {
        console.error('Error getting subnets:', error);
        throw error;
    }
}

// Function to make subnet non-compliant by enabling auto-assign public IP
async function makeSubnetNonCompliant(subnetId) {
    try {
        await ec2Client.send(new ModifySubnetAttributeCommand({
            SubnetId: subnetId,
            MapPublicIpOnLaunch: {
                Value: true
            }
        }));
        console.log(`Made subnet ${subnetId} non-compliant (enabled auto-assign public IP)`);
    } catch (error) {
        console.error(`Error modifying subnet ${subnetId}:`, error);
        throw error;
    }
}

// Function to restore subnet to original state
async function restoreSubnetCompliance(subnetId, originalValue) {
    try {
        await ec2Client.send(new ModifySubnetAttributeCommand({
            SubnetId: subnetId,
            MapPublicIpOnLaunch: {
                Value: originalValue
            }
        }));
        console.log(`Restored subnet ${subnetId} to original state`);
    } catch (error) {
        console.error(`Error restoring subnet ${subnetId}:`, error);
        throw error;
    }
}

// Main function to simulate non-compliance
async function simulateSubnetNonCompliance() {
    try {
        console.log('Starting subnet non-compliance simulation...');

        // Get all subnets in default VPC
        const subnets = await getDefaultVpcSubnets();
        
        if (subnets.length === 0) {
            console.log('No default subnets found');
            return;
        }

        // Store original settings and make subnets non-compliant
        for (const subnet of subnets) {
            originalSubnetSettings.push({
                subnetId: subnet.SubnetId,
                autoAssignIp: subnet.MapPublicIpOnLaunch
            });

            await makeSubnetNonCompliant(subnet.SubnetId);
        }

        console.log('All subnets are now non-compliant');
        
        // Wait for some time to simulate testing period
        console.log('Waiting for 10 seconds to simulate testing...');
        await new Promise(resolve => setTimeout(resolve, 10000));

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Restore original settings
        console.log('Restoring original subnet settings...');
        
        for (const setting of originalSubnetSettings) {
            await restoreSubnetCompliance(
                setting.subnetId, 
                setting.autoAssignIp
            );
        }
        
        console.log('Simulation completed and original settings restored');
    }
}

// Function to describe current subnet settings
async function describeCurrentSettings() {
    try {
        const subnets = await getDefaultVpcSubnets();
        console.log('\nCurrent Subnet Settings:');
        subnets.forEach(subnet => {
            console.log(`Subnet ID: ${subnet.SubnetId}`);
            console.log(`Auto-assign Public IP: ${subnet.MapPublicIpOnLaunch}`);
            console.log(`Availability Zone: ${subnet.AvailabilityZone}`);
            console.log('---');
        });
    } catch (error) {
        console.error('Error describing settings:', error);
    }
}

// Run the simulation with before and after states
async function runFullSimulation() {
    console.log('Describing initial subnet settings...');
    await describeCurrentSettings();

    await simulateSubnetNonCompliance();

    console.log('\nDescribing final subnet settings...');
    await describeCurrentSettings();
}

// Run the full simulation
runFullSimulation().catch(console.error);
