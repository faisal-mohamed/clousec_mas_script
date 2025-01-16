// const {
//     ElasticLoadBalancingV2Client,
//     CreateLoadBalancerCommand,
//     ModifyLoadBalancerAttributesCommand,
//     DeleteLoadBalancerCommand,
//     DescribeLoadBalancersCommand
// } = require("@aws-sdk/client-elastic-load-balancing-v2");

// const {
//     EC2Client,
//     CreateVpcCommand,
//     CreateSubnetCommand,
//     DeleteVpcCommand,
//     DeleteSubnetCommand,
//     DescribeVpcsCommand,
//     CreateInternetGatewayCommand,
//     AttachInternetGatewayCommand,
//     DetachInternetGatewayCommand,
//     DeleteInternetGatewayCommand,
//     ModifyVpcAttributeCommand,
//     DescribeVpcsCommandOutput
// } = require("@aws-sdk/client-ec2");

// const { fromEnv } = require("@aws-sdk/credential-providers");

// require('dotenv').config();

// // Initialize clients
// const getClients = () => {
//     try {
//         const config = {
//             credentials: fromEnv(),
//             region: process.env.AWS_REGION || 'us-east-1'
//         };

//         return {
//             ec2Client: new EC2Client(config),
//             elbClient: new ElasticLoadBalancingV2Client(config)
//         };
//     } catch (error) {
//         console.error('Error initializing AWS clients:', error);
//         throw error;
//     }
// };

// // Create VPC and network resources
// const createNetworkResources = async (ec2Client) => {
//     try {
//         // Create VPC
//         const createVpcResponse = await ec2Client.send(
//             new CreateVpcCommand({
//                 CidrBlock: '10.0.0.0/16',
//                 TagSpecifications: [{
//                     ResourceType: 'vpc',
//                     Tags: [{
//                         Key: 'Name',
//                         Value: `temp-vpc-${Date.now()}`
//                     }]
//                 }]
//             })
//         );

//         const vpcId = createVpcResponse.Vpc.VpcId;
//         console.log(`Created VPC: ${vpcId}`);

//         // Wait for VPC to be available
//         let vpcAvailable = false;
//         while (!vpcAvailable) {
//             const describeResponse = await ec2Client.send(
//                 new DescribeVpcsCommand({
//                     VpcIds: [vpcId]
//                 })
//             );
            
//             if (describeResponse.Vpcs[0].State === 'available') {
//                 vpcAvailable = true;
//             } else {
//                 await new Promise(resolve => setTimeout(resolve, 5000));
//             }
//         }

//         // Enable DNS hostnames
//         await ec2Client.send(
//             new ModifyVpcAttributeCommand({
//                 VpcId: vpcId,
//                 EnableDnsHostnames: { Value: true }
//             })
//         );

//         // Create Internet Gateway
//         const createIgwResponse = await ec2Client.send(
//             new CreateInternetGatewayCommand({
//                 TagSpecifications: [{
//                     ResourceType: 'internet-gateway',
//                     Tags: [{
//                         Key: 'Name',
//                         Value: `temp-igw-${Date.now()}`
//                     }]
//                 }]
//             })
//         );

//         const igwId = createIgwResponse.InternetGateway.InternetGatewayId;
//         console.log(`Created Internet Gateway: ${igwId}`);

//         // Attach Internet Gateway to VPC
//         await ec2Client.send(
//             new AttachInternetGatewayCommand({
//                 InternetGatewayId: igwId,
//                 VpcId: vpcId
//             })
//         );

//         // Create subnets in different AZs
//         const subnet1Response = await ec2Client.send(
//             new CreateSubnetCommand({
//                 VpcId: vpcId,
//                 CidrBlock: '10.0.1.0/24',
//                 AvailabilityZone: 'ap-southeast-1a',
//                 TagSpecifications: [{
//                     ResourceType: 'subnet',
//                     Tags: [{
//                         Key: 'Name',
//                         Value: `temp-subnet-1-${Date.now()}`
//                     }]
//                 }]
//             })
//         );

//         const subnet2Response = await ec2Client.send(
//             new CreateSubnetCommand({
//                 VpcId: vpcId,
//                 CidrBlock: '10.0.2.0/24',
//                 AvailabilityZone: 'ap-southeast-1b',
//                 TagSpecifications: [{
//                     ResourceType: 'subnet',
//                     Tags: [{
//                         Key: 'Name',
//                         Value: `temp-subnet-2-${Date.now()}`
//                     }]
//                 }]
//             })
//         );

//         const subnet1Id = subnet1Response.Subnet.SubnetId;
//         const subnet2Id = subnet2Response.Subnet.SubnetId;
//         console.log(`Created Subnets: ${subnet1Id}, ${subnet2Id}`);

//         return {
//             vpcId,
//             igwId,
//             subnet1Id,
//             subnet2Id
//         };
//     } catch (error) {
//         console.error('Error creating network resources:', error);
//         throw error;
//     }
// };

// // Wait for load balancer deletion
// const waitForLoadBalancerDeletion = async (elbClient, loadBalancerArn) => {
//     try {
//         let isDeleted = false;
//         while (!isDeleted) {
//             try {
//                 const response = await elbClient.send(
//                     new DescribeLoadBalancersCommand({
//                         LoadBalancerArns: [loadBalancerArn]
//                     })
//                 );
//                 await new Promise(resolve => setTimeout(resolve, 10000));
//             } catch (error) {
//                 if (error.name === 'LoadBalancerNotFoundException') {
//                     isDeleted = true;
//                 } else {
//                     throw error;
//                 }
//             }
//         }
//         console.log('Load balancer deletion confirmed');
//     } catch (error) {
//         console.error('Error waiting for load balancer deletion:', error);
//         throw error;
//     }
// };

// // Delete load balancer
// const deleteLoadBalancer = async (elbClient, loadBalancerArn) => {
//     try {
//         await elbClient.send(
//             new DeleteLoadBalancerCommand({
//                 LoadBalancerArn: loadBalancerArn
//             })
//         );
//         console.log('Load balancer deletion initiated');
//         await waitForLoadBalancerDeletion(elbClient, loadBalancerArn);
//     } catch (error) {
//         console.error('Error deleting load balancer:', error);
//         throw error;
//     }
// };

// // Delete network resources
// const deleteNetworkResources = async (ec2Client, resources) => {
//     try {
//         // Wait before starting deletion
//         await new Promise(resolve => setTimeout(resolve, 10000));

//         // Detach and delete Internet Gateway
//         console.log('Detaching Internet Gateway...');
//         await ec2Client.send(
//             new DetachInternetGatewayCommand({
//                 InternetGatewayId: resources.igwId,
//                 VpcId: resources.vpcId
//             })
//         );

//         console.log('Deleting Internet Gateway...');
//         await ec2Client.send(
//             new DeleteInternetGatewayCommand({
//                 InternetGatewayId: resources.igwId
//             })
//         );

//         // Delete subnets with retries
//         const deleteSubnet = async (ec2Client, subnetId) => {
//             let retries = 5;
//             while (retries > 0) {
//                 try {
//                     console.log(`Attempting to delete subnet ${subnetId}...`);
//                     await ec2Client.send(
//                         new DeleteSubnetCommand({
//                             SubnetId: subnetId
//                         })
//                     );
//                     console.log(`Successfully deleted subnet ${subnetId}`);
//                     break;
//                 } catch (error) {
//                     if (error.Code === 'DependencyViolation' && retries > 1) {
//                         console.log(`Waiting for dependencies to clear for subnet ${subnetId}...`);
//                         await new Promise(resolve => setTimeout(resolve, 15000));
//                         retries--;
//                     } else {
//                         throw error;
//                     }
//                 }
//             }
//         };

//         // Delete subnets
//         await Promise.all([
//             deleteSubnet(ec2Client, resources.subnet1Id),
//             deleteSubnet(ec2Client, resources.subnet2Id)
//         ]);

//         // Delete VPC with retries
//         let retries = 5;
//         while (retries > 0) {
//             try {
//                 console.log('Attempting to delete VPC...');
//                 await ec2Client.send(
//                     new DeleteVpcCommand({
//                         VpcId: resources.vpcId
//                     })
//                 );
//                 console.log('Successfully deleted VPC');
//                 break;
//             } catch (error) {
//                 if (error.Code === 'DependencyViolation' && retries > 1) {
//                     console.log('Waiting for VPC dependencies to clear...');
//                     await new Promise(resolve => setTimeout(resolve, 15000));
//                     retries--;
//                 } else {
//                     throw error;
//                 }
//             }
//         }

//         console.log('Deleted all network resources');
//     } catch (error) {
//         console.error('Error deleting network resources:', error);
//         throw error;
//     }
// };

// // Create NLB with cross-zone load balancing disabled
// const createNLBWithoutCrossZone = async (elbClient, subnet1Id, subnet2Id) => {
//     try {
//         const createParams = {
//             Name: `temp-nlb-${Date.now()}`,
//             Subnets: [subnet1Id, subnet2Id],
//             Type: 'network',
//             Scheme: 'internal'
//         };

//         const createResponse = await elbClient.send(
//             new CreateLoadBalancerCommand(createParams)
//         );

//         const loadBalancerArn = createResponse.LoadBalancers[0].LoadBalancerArn;
//         console.log(`Created NLB with ARN: ${loadBalancerArn}`);

//         // Disable cross-zone load balancing
//         await elbClient.send(
//             new ModifyLoadBalancerAttributesCommand({
//                 LoadBalancerArn: loadBalancerArn,
//                 Attributes: [{
//                     Key: 'load_balancing.cross_zone.enabled',
//                     Value: 'false'
//                 }]
//             })
//         );

//         console.log('Disabled cross-zone load balancing');
//         return loadBalancerArn;
//     } catch (error) {
//         console.error('Error creating NLB:', error);
//         throw error;
//     }
// };

// // Main function
// const main = async () => {
//     const { ec2Client, elbClient } = getClients();
//     let resources = null;
//     let loadBalancerArn = null;

//     try {
//         // Create VPC and subnets
//         resources = await createNetworkResources(ec2Client);

//         // Create NLB with cross-zone load balancing disabled
//         loadBalancerArn = await createNLBWithoutCrossZone(
//             elbClient,
//             resources.subnet1Id,
//             resources.subnet2Id
//         );

//         // Wait for a bit to observe the configuration
//         console.log('Waiting for 30 seconds to observe the configuration...');
//         await new Promise(resolve => setTimeout(resolve, 30000));

//     } catch (error) {
//         console.error('Error in main execution:', error);
//     } finally {
//         // Cleanup
//         console.log('Starting cleanup...');
//         if (loadBalancerArn) {
//             await deleteLoadBalancer(elbClient, loadBalancerArn);
//             // Add wait time after load balancer deletion
//             await new Promise(resolve => setTimeout(resolve, 20000));
//         }
//         if (resources) {
//             await deleteNetworkResources(ec2Client, resources);
//         }
//     }
// };

// // Run the simulation
// if (require.main === module) {
//     main().catch(error => {
//         console.error('Unhandled error:', error);
//         process.exit(1);
//     });
// }


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

// Wait for load balancer deletion
const waitForLoadBalancerDeletion = async (elbClient, loadBalancerArn) => {
    try {
        let isDeleted = false;
        while (!isDeleted) {
            try {
                const response = await elbClient.send(
                    new DescribeLoadBalancersCommand({
                        LoadBalancerArns: [loadBalancerArn]
                    })
                );
                await new Promise(resolve => setTimeout(resolve, 10000));
            } catch (error) {
                if (error.name === 'LoadBalancerNotFoundException') {
                    isDeleted = true;
                } else {
                    throw error;
                }
            }
        }
        console.log('Load balancer deletion confirmed');
    } catch (error) {
        console.error('Error waiting for load balancer deletion:', error);
        throw error;
    }
};

// Create NLB with cross-zone load balancing disabled
const createNLBWithoutCrossZone = async (elbClient, subnet1Id, subnet2Id) => {
    try {
        const createParams = {
            Name: `temp-nlb-${Date.now()}`,
            Subnets: [subnet1Id, subnet2Id],
            Type: 'network',
            Scheme: 'internal'
        };

        const createResponse = await elbClient.send(
            new CreateLoadBalancerCommand(createParams)
        );

        const loadBalancerArn = createResponse.LoadBalancers[0].LoadBalancerArn;
        console.log(`Created NLB with ARN: ${loadBalancerArn}`);

        // Disable cross-zone load balancing
        await elbClient.send(
            new ModifyLoadBalancerAttributesCommand({
                LoadBalancerArn: loadBalancerArn,
                Attributes: [{
                    Key: 'load_balancing.cross_zone.enabled',
                    Value: 'false'
                }]
            })
        );

        console.log('Disabled cross-zone load balancing');
        return loadBalancerArn;
    } catch (error) {
        console.error('Error creating NLB:', error);
        throw error;
    }
};

// Delete load balancer
const deleteLoadBalancer = async (elbClient, loadBalancerArn) => {
    try {
        await elbClient.send(
            new DeleteLoadBalancerCommand({
                LoadBalancerArn: loadBalancerArn
            })
        );
        console.log('Load balancer deletion initiated');
        await waitForLoadBalancerDeletion(elbClient, loadBalancerArn);
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

        // Create NLB with cross-zone load balancing disabled
        loadBalancerArn = await createNLBWithoutCrossZone(
            elbClient,
            resources.subnet1Id,
            resources.subnet2Id
        );

        // Wait for a bit to observe the configuration
        console.log('Waiting for 30 seconds to observe the configuration...');
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
