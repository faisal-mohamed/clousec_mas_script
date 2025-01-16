const {
    EC2Client,
    CreateVpcCommand,
    CreateInternetGatewayCommand,
    AttachInternetGatewayCommand,
    CreateRouteTableCommand,
    CreateRouteCommand,
    CreateSubnetCommand,
    AssociateRouteTableCommand,
    DeleteVpcCommand,
    DeleteInternetGatewayCommand,
    DeleteRouteTableCommand,
    DetachInternetGatewayCommand,
    DescribeVpcsCommand,
    DescribeRouteTablesCommand,
    DeleteSubnetCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize client
const ec2Client = new EC2Client({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    VPC_CIDR: '10.0.0.0/16',
    SUBNET_CIDR: '10.0.1.0/24',
    UNRESTRICTED_ROUTE: '0.0.0.0/0' // Non-compliant route
};

// Function to create non-compliant VPC setup
async function createNonCompliantVpc() {
    let vpcId = null;
    let internetGatewayId = null;
    let routeTableId = null;
    let subnetId = null;

    try {
        // Create VPC
        console.log('Creating VPC...');
        const vpcResponse = await ec2Client.send(new CreateVpcCommand({
            CidrBlock: CONFIG.VPC_CIDR,
            TagSpecifications: [{
                ResourceType: 'vpc',
                Tags: [{
                    Key: 'Name',
                    Value: 'NonCompliantVPC'
                }]
            }]
        }));
        vpcId = vpcResponse.Vpc.VpcId;
        console.log('Created VPC:', vpcId);

        // Wait for VPC to be available
        await waitForVpcAvailable(vpcId);

        // Create Internet Gateway
        console.log('Creating Internet Gateway...');
        const igwResponse = await ec2Client.send(new CreateInternetGatewayCommand({
            TagSpecifications: [{
                ResourceType: 'internet-gateway',
                Tags: [{
                    Key: 'Name',
                    Value: 'NonCompliantIGW'
                }]
            }]
        }));
        internetGatewayId = igwResponse.InternetGateway.InternetGatewayId;
        console.log('Created Internet Gateway:', internetGatewayId);

        // Attach Internet Gateway to VPC
        console.log('Attaching Internet Gateway to VPC...');
        await ec2Client.send(new AttachInternetGatewayCommand({
            InternetGatewayId: internetGatewayId,
            VpcId: vpcId
        }));

        // Create Subnet
        console.log('Creating Subnet...');
        const subnetResponse = await ec2Client.send(new CreateSubnetCommand({
            VpcId: vpcId,
            CidrBlock: CONFIG.SUBNET_CIDR,
            TagSpecifications: [{
                ResourceType: 'subnet',
                Tags: [{
                    Key: 'Name',
                    Value: 'NonCompliantSubnet'
                }]
            }]
        }));
        subnetId = subnetResponse.Subnet.SubnetId;
        console.log('Created Subnet:', subnetId);

        // Create Route Table
        console.log('Creating Route Table...');
        const routeTableResponse = await ec2Client.send(new CreateRouteTableCommand({
            VpcId: vpcId,
            TagSpecifications: [{
                ResourceType: 'route-table',
                Tags: [{
                    Key: 'Name',
                    Value: 'NonCompliantRouteTable'
                }]
            }]
        }));
        routeTableId = routeTableResponse.RouteTable.RouteTableId;
        console.log('Created Route Table:', routeTableId);

        // Associate Route Table with Subnet
        console.log('Associating Route Table with Subnet...');
        await ec2Client.send(new AssociateRouteTableCommand({
            RouteTableId: routeTableId,
            SubnetId: subnetId
        }));

        // Create non-compliant route (0.0.0.0/0)
        console.log('Creating non-compliant route...');
        await ec2Client.send(new CreateRouteCommand({
            RouteTableId: routeTableId,
            DestinationCidrBlock: CONFIG.UNRESTRICTED_ROUTE,
            GatewayId: internetGatewayId
        }));
        console.log('Created unrestricted route to Internet Gateway');

        return {
            vpcId,
            internetGatewayId,
            routeTableId,
            subnetId
        };
    } catch (error) {
        console.error('Error creating VPC setup:', error);
        // Cleanup on error
        await cleanupResources({
            vpcId,
            internetGatewayId,
            routeTableId,
            subnetId
        });
        throw error;
    }
}

// Function to wait for VPC to be available
async function waitForVpcAvailable(vpcId) {
    try {
        let state;
        do {
            const response = await ec2Client.send(new DescribeVpcsCommand({
                VpcIds: [vpcId]
            }));
            
            state = response.Vpcs[0].State;
            console.log('VPC state:', state);
            
            if (state === 'pending') {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } while (state === 'pending');

        return state === 'available';
    } catch (error) {
        console.error('Error waiting for VPC:', error);
        throw error;
    }
}

// Function to check route table status
async function checkRouteTableStatus(routeTableId) {
    try {
        const response = await ec2Client.send(new DescribeRouteTablesCommand({
            RouteTableIds: [routeTableId]
        }));

        const routes = response.RouteTables[0].Routes;
        console.log('\nCurrent routes:');
        routes.forEach(route => {
            console.log(`Destination: ${route.DestinationCidrBlock || route.DestinationPrefixListId}`);
            console.log(`Target: ${route.GatewayId || route.NatGatewayId || route.NetworkInterfaceId}`);
            console.log('---');
        });

        // Check for non-compliant route
        const hasUnrestrictedRoute = routes.some(route => 
            route.DestinationCidrBlock === CONFIG.UNRESTRICTED_ROUTE && 
            route.GatewayId && 
            route.GatewayId.startsWith('igw-')
        );

        console.log('\nCompliance status:', hasUnrestrictedRoute ? 'NON-COMPLIANT' : 'COMPLIANT');
        return hasUnrestrictedRoute;
    } catch (error) {
        console.error('Error checking route table status:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(resources) {
    try {
        if (resources.routeTableId) {
            try {
                console.log('Deleting Route Table...');
                await ec2Client.send(new DeleteRouteTableCommand({
                    RouteTableId: resources.routeTableId
                }));
            } catch (error) {
                console.error('Error deleting Route Table:', error);
            }
        }

        if (resources.internetGatewayId && resources.vpcId) {
            try {
                console.log('Detaching Internet Gateway...');
                await ec2Client.send(new DetachInternetGatewayCommand({
                    InternetGatewayId: resources.internetGatewayId,
                    VpcId: resources.vpcId
                }));
            } catch (error) {
                console.error('Error detaching Internet Gateway:', error);
            }
        }

        if (resources.internetGatewayId) {
            try {
                console.log('Deleting Internet Gateway...');
                await ec2Client.send(new DeleteInternetGatewayCommand({
                    InternetGatewayId: resources.internetGatewayId
                }));
            } catch (error) {
                console.error('Error deleting Internet Gateway:', error);
            }
        }

        if (resources.subnetId) {
            try {
                console.log('Deleting Subnet...');
                await ec2Client.send(new DeleteSubnetCommand({
                    SubnetId: resources.subnetId
                }));
            } catch (error) {
                console.error('Error deleting Subnet:', error);
            }
        }

        if (resources.vpcId) {
            try {
                console.log('Deleting VPC...');
                await ec2Client.send(new DeleteVpcCommand({
                    VpcId: resources.vpcId
                }));
            } catch (error) {
                console.error('Error deleting VPC:', error);
            }
        }

        console.log('Cleanup completed');
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let resources = null;

    try {
        console.log('Starting VPC route compliance simulation...');

        // Create non-compliant VPC setup
        console.log('\nCreating non-compliant VPC setup...');
        resources = await createNonCompliantVpc();

        // Check initial route table status
        console.log('\nChecking route table status...');
        await checkRouteTableStatus(resources.routeTableId);

        // Wait for testing period
        console.log('\nWaiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log('\nNote: To make this VPC compliant:');
        console.log('1. Remove the unrestricted route (0.0.0.0/0) to the Internet Gateway');
        console.log('2. Add more specific routes for required internet access');
        console.log('3. Consider using a NAT Gateway for private subnets');

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        if (resources) {
            console.log('\nCleaning up resources...');
            await cleanupResources(resources);
        }
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
