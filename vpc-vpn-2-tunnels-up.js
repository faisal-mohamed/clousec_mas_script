const { 
    EC2Client, 
    CreateCustomerGatewayCommand,
    CreateVpnConnectionCommand,
    DeleteCustomerGatewayCommand,
    DeleteVpnConnectionCommand,
    DescribeVpnConnectionsCommand,
    CreateTagsCommand
} = require('@aws-sdk/client-ec2');

require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    CGW_IP: '203.0.113.1', // Example public IP - replace with your actual CGW IP
    BGP_ASN: 65000, // Example ASN
    TAGS: {
        Name: 'Test-VPN-Connection',
        Environment: 'Test'
    }
};

// Function to create a Customer Gateway
async function createCustomerGateway() {
    try {
        const response = await ec2Client.send(new CreateCustomerGatewayCommand({
            BgpAsn: CONFIG.BGP_ASN,
            PublicIp: CONFIG.CGW_IP,
            Type: 'ipsec.1'
        }));

        console.log('Created Customer Gateway:', response.CustomerGateway.CustomerGatewayId);

        // Add tags to Customer Gateway
        await ec2Client.send(new CreateTagsCommand({
            Resources: [response.CustomerGateway.CustomerGatewayId],
            Tags: Object.entries(CONFIG.TAGS).map(([Key, Value]) => ({ Key, Value }))
        }));

        return response.CustomerGateway.CustomerGatewayId;
    } catch (error) {
        console.error('Error creating Customer Gateway:', error);
        throw error;
    }
}

// Function to create VPN Connection
async function createVpnConnection(customerGatewayId) {
    try {
        const response = await ec2Client.send(new CreateVpnConnectionCommand({
            CustomerGatewayId: customerGatewayId,
            Type: 'ipsec.1',
            Options: {
                StaticRoutesOnly: true
            },
            TagSpecifications: [{
                ResourceType: 'vpn-connection',
                Tags: Object.entries(CONFIG.TAGS).map(([Key, Value]) => ({ Key, Value }))
            }]
        }));

        console.log('Created VPN Connection:', response.VpnConnection.VpnConnectionId);
        return response.VpnConnection.VpnConnectionId;
    } catch (error) {
        console.error('Error creating VPN Connection:', error);
        throw error;
    }
}

// Function to monitor VPN tunnel status
async function monitorVpnTunnelStatus(vpnConnectionId) {
    try {
        const response = await ec2Client.send(new DescribeVpnConnectionsCommand({
            VpnConnectionIds: [vpnConnectionId]
        }));

        const vpnConnection = response.VpnConnections[0];
        const tunnels = vpnConnection.VgwTelemetry || [];

        console.log('\nVPN Connection Status:', vpnConnection.State);
        console.log('Tunnel Status:');
        tunnels.forEach((tunnel, index) => {
            console.log(`Tunnel ${index + 1}:`);
            console.log('- Status:', tunnel.Status);
            console.log('- Last Status Change:', tunnel.LastStatusChange);
            console.log('- Status Message:', tunnel.StatusMessage || 'No message');
        });

        return {
            state: vpnConnection.State,
            tunnels: tunnels.map(t => ({
                status: t.Status,
                lastChange: t.LastStatusChange,
                message: t.StatusMessage
            }))
        };
    } catch (error) {
        console.error('Error monitoring VPN tunnel status:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(vpnConnectionId, customerGatewayId) {
    try {
        if (vpnConnectionId) {
            console.log('Deleting VPN Connection...');
            await ec2Client.send(new DeleteVpnConnectionCommand({
                VpnConnectionId: vpnConnectionId
            }));
            console.log('Deleted VPN Connection');
        }

        // Wait for VPN connection to be deleted before deleting Customer Gateway
        if (vpnConnectionId) {
            console.log('Waiting for VPN Connection to be deleted...');
            let isDeleted = false;
            while (!isDeleted) {
                try {
                    const response = await ec2Client.send(new DescribeVpnConnectionsCommand({
                        VpnConnectionIds: [vpnConnectionId]
                    }));
                    
                    if (response.VpnConnections[0].State === 'deleted') {
                        isDeleted = true;
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                } catch (error) {
                    if (error.name === 'InvalidVpnConnectionID.NotFound') {
                        isDeleted = true;
                    } else {
                        throw error;
                    }
                }
            }
        }

        if (customerGatewayId) {
            console.log('Deleting Customer Gateway...');
            await ec2Client.send(new DeleteCustomerGatewayCommand({
                CustomerGatewayId: customerGatewayId
            }));
            console.log('Deleted Customer Gateway');
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let customerGatewayId = null;
    let vpnConnectionId = null;

    try {
        console.log('Starting VPN tunnel compliance simulation...');

        // Create Customer Gateway
        console.log('Creating Customer Gateway...');
        customerGatewayId = await createCustomerGateway();

        // Create VPN Connection
        console.log('Creating VPN Connection...');
        vpnConnectionId = await createVpnConnection(customerGatewayId);

        // Monitor tunnel status for a period
        console.log('\nMonitoring VPN tunnel status...');
        for (let i = 0; i < 6; i++) {
            console.log(`\nCheck ${i + 1} of 6:`);
            await monitorVpnTunnelStatus(vpnConnectionId);
            if (i < 5) {
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        // The VPN connection will be non-compliant because the tunnels won't come up
        // (since we're using a dummy customer gateway IP)

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('\nCleaning up resources...');
        await cleanupResources(vpnConnectionId, customerGatewayId);
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
