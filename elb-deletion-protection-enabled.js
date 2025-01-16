const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    ModifyLoadBalancerAttributesCommand,
    DeleteLoadBalancerCommand,
    DescribeLoadBalancersCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

const {
    EC2Client,
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

const { fromEnv } = require("@aws-sdk/credential-providers");

require('dotenv').config();

// Initialize clients
const getClients = () => {
    try {
        const config = {
            credentials: fromEnv(),
            region: process.env.AWS_REGION || 'us-east-1'
        };

        return {
            ec2Client: new EC2Client(config),
            elbClient: new ElasticLoadBalancingV2Client(config)
        };
    } catch (error) {
        console.error('Error initializing AWS clients:', error);
        throw error;
    }
};

// Get default VPC and its subnets
const getDefaultVpcAndSubnets = async (ec2Client) => {
    try {
        // Get default VPC
        const vpcResponse = await ec2Client.send(
            new DescribeVpcsCommand({
                Filters: [{
                    Name: 'isDefault',
                    Values: ['true']
                }]
            })
        );

        if (!vpcResponse.Vpcs || vpcResponse.Vpcs.length === 0) {
            throw new Error('No default VPC found in this region');
        }

        const defaultVpcId = vpcResponse.Vpcs[0].VpcId;
        console.log(`Found default VPC: ${defaultVpcId}`);

        // Get subnets in the default VPC
        const subnetResponse = await ec2Client.send(
            new DescribeSubnetsCommand({
                Filters: [{
                    Name: 'vpc-id',
                    Values: [defaultVpcId]
                }]
            })
        );

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
            throw new Error('Not enough subnets found in default VPC (need at least 2)');
        }

        // Get two subnets from different AZs
        const subnets = subnetResponse.Subnets.reduce((acc, subnet) => {
            if (Object.keys(acc).length < 2 && !acc[subnet.AvailabilityZone]) {
                acc[subnet.AvailabilityZone] = subnet.SubnetId;
            }
            return acc;
        }, {});

        const subnetIds = Object.values(subnets);
        if (subnetIds.length < 2) {
            throw new Error('Could not find 2 subnets in different AZs');
        }

        console.log(`Found subnets: ${subnetIds.join(', ')}`);

        return {
            vpcId: defaultVpcId,
            subnet1Id: subnetIds[0],
            subnet2Id: subnetIds[1]
        };
    } catch (error) {
        console.error('Error getting default VPC and subnets:', error);
        throw error;
    }
};

// Create ALB with deletion protection disabled (non-compliant)
const createALBWithoutProtection = async (elbClient, subnet1Id, subnet2Id) => {
    try {
        const createParams = {
            Name: `temp-alb-${Date.now()}`,
            Subnets: [subnet1Id, subnet2Id],
            Type: 'application',
            Scheme: 'internal'
        };

        const createResponse = await elbClient.send(
            new CreateLoadBalancerCommand(createParams)
        );

        const loadBalancerArn = createResponse.LoadBalancers[0].LoadBalancerArn;
        console.log(`Created ALB with ARN: ${loadBalancerArn}`);

        // Explicitly disable deletion protection (non-compliant state)
        await elbClient.send(
            new ModifyLoadBalancerAttributesCommand({
                LoadBalancerArn: loadBalancerArn,
                Attributes: [{
                    Key: 'deletion_protection.enabled',
                    Value: 'false'
                }]
            })
        );

        console.log('Disabled deletion protection (non-compliant state)');
        return loadBalancerArn;
    } catch (error) {
        console.error('Error creating ALB:', error);
        throw error;
    }
};

// Enable deletion protection (make compliant)
const enableDeletionProtection = async (elbClient, loadBalancerArn) => {
    try {
        await elbClient.send(
            new ModifyLoadBalancerAttributesCommand({
                LoadBalancerArn: loadBalancerArn,
                Attributes: [{
                    Key: 'deletion_protection.enabled',
                    Value: 'true'
                }]
            })
        );
        console.log('Enabled deletion protection (compliant state)');
    } catch (error) {
        console.error('Error enabling deletion protection:', error);
        throw error;
    }
};

// Disable deletion protection (for cleanup)
const disableDeletionProtection = async (elbClient, loadBalancerArn) => {
    try {
        await elbClient.send(
            new ModifyLoadBalancerAttributesCommand({
                LoadBalancerArn: loadBalancerArn,
                Attributes: [{
                    Key: 'deletion_protection.enabled',
                    Value: 'false'
                }]
            })
        );
        console.log('Disabled deletion protection for cleanup');
    } catch (error) {
        console.error('Error disabling deletion protection:', error);
        throw error;
    }
};

// Delete load balancer
const deleteLoadBalancer = async (elbClient, loadBalancerArn) => {
    try {
        // First, disable deletion protection
        await disableDeletionProtection(elbClient, loadBalancerArn);

        // Wait a bit for the attribute change to propagate
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Delete the load balancer
        await elbClient.send(
            new DeleteLoadBalancerCommand({
                LoadBalancerArn: loadBalancerArn
            })
        );
        console.log('Load balancer deletion initiated');

        // Wait for deletion to complete
        let isDeleted = false;
        while (!isDeleted) {
            try {
                await elbClient.send(
                    new DescribeLoadBalancersCommand({
                        LoadBalancerArns: [loadBalancerArn]
                    })
                );
                await new Promise(resolve => setTimeout(resolve, 10000));
            } catch (error) {
                if (error.name === 'LoadBalancerNotFoundException') {
                    isDeleted = true;
                    console.log('Load balancer deletion confirmed');
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error deleting load balancer:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    const { ec2Client, elbClient } = getClients();
    let loadBalancerArn = null;

    try {
        // Get default VPC and subnets
        const resources = await getDefaultVpcAndSubnets(ec2Client);

        // Create ALB without deletion protection (non-compliant)
        loadBalancerArn = await createALBWithoutProtection(
            elbClient,
            resources.subnet1Id,
            resources.subnet2Id
        );

        // Wait for load balancer to be fully created
        console.log('Waiting for load balancer to be ready...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Enable deletion protection (make compliant)
        await enableDeletionProtection(elbClient, loadBalancerArn);

        // Wait to observe the compliant state
        console.log('Waiting to observe the compliant state...');
        await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
        console.error('Error in main execution:', error);
    } finally {
        // Cleanup
        if (loadBalancerArn) {
            console.log('Starting cleanup...');
            await deleteLoadBalancer(elbClient, loadBalancerArn);
        }
    }
};

// Run the simulation
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
