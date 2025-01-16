// const { 
//     ElasticLoadBalancingV2Client,
//     CreateLoadBalancerCommand,
//     CreateListenerCommand,
//     DeleteLoadBalancerCommand,
//     DescribeLoadBalancersCommand
// } = require("@aws-sdk/client-elastic-load-balancing-v2");

// const { 
//     EC2Client, 
//     CreateSecurityGroupCommand,
//     DeleteSecurityGroupCommand,
//     AuthorizeSecurityGroupIngressCommand,
//     DescribeVpcsCommand,
//     DescribeSubnetsCommand
// } = require("@aws-sdk/client-ec2");

// require('dotenv').config();

// // Create AWS client
// const createAwsClient = (ClientClass) => {
//     return new ClientClass({
//         region: process.env.AWS_REGION || 'us-east-1',
//         credentials: {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         }
//     });
// };

// // Get VPC and subnet information
// const getNetworkInfo = async (ec2Client) => {
//     try {
//         // Get default VPC
//         const vpcResponse = await ec2Client.send(
//             new DescribeVpcsCommand({
//                 Filters: [{ Name: 'isDefault', Values: ['true'] }]
//             })
//         );

//         const vpcId = vpcResponse.Vpcs[0].VpcId;

//         // Get subnets in the VPC
//         const subnetResponse = await ec2Client.send(
//             new DescribeSubnetsCommand({
//                 Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
//             })
//         );

//         // Get at least two subnets from different AZs
//         const subnets = subnetResponse.Subnets
//             .sort(() => Math.random() - 0.5)
//             .slice(0, 2)
//             .map(subnet => subnet.SubnetId);

//         return { vpcId, subnets };
//     } catch (error) {
//         console.error('Error getting network information:', error);
//         throw error;
//     }
// };

// // Create security group for ALB
// const createSecurityGroup = async (ec2Client, vpcId) => {
//     try {
//         // Create security group
//         const createSgResponse = await ec2Client.send(
//             new CreateSecurityGroupCommand({
//                 GroupName: 'non-compliant-alb-sg-' + Math.random().toString(36).substring(7),
//                 Description: 'Security group for non-compliant ALB testing',
//                 VpcId: vpcId
//             })
//         );

//         const sgId = createSgResponse.GroupId;

//         // Add inbound rules for HTTP and HTTPS
//         await ec2Client.send(
//             new AuthorizeSecurityGroupIngressCommand({
//                 GroupId: sgId,
//                 IpPermissions: [
//                     {
//                         IpProtocol: 'tcp',
//                         FromPort: 80,
//                         ToPort: 80,
//                         IpRanges: [{ CidrIp: '0.0.0.0/0' }]
//                     },
//                     {
//                         IpProtocol: 'tcp',
//                         FromPort: 443,
//                         ToPort: 443,
//                         IpRanges: [{ CidrIp: '0.0.0.0/0' }]
//                     }
//                 ]
//             })
//         );

//         return sgId;
//     } catch (error) {
//         console.error('Error creating security group:', error);
//         throw error;
//     }
// };

// // Wait for ALB creation
// const waitForAlbCreation = async (elbv2Client, albArn) => {
//     let isActive = false;
//     let attempts = 0;
//     const maxAttempts = 3;

//     while (!isActive && attempts < maxAttempts) {
//         try {
//             const response = await elbv2Client.send(
//                 new DescribeLoadBalancersCommand({
//                     LoadBalancerArns: [albArn]
//                 })
//             );

//             if (response.LoadBalancers[0].State.Code === 'active') {
//                 isActive = true;
//                 console.log('Load balancer is now active!');
//             } else {
//                 attempts++;
//                 console.log('Still creating load balancer... (attempt', attempts, 'of', maxAttempts, ')');
//                 await new Promise(resolve => setTimeout(resolve, 10000));
//             }
//         } catch (error) {
//             attempts++;
//             await new Promise(resolve => setTimeout(resolve, 10000));
//         }
//     }

//     if (!isActive) {
//         throw new Error('Load balancer creation timed out');
//     }
// };

// // Cleanup resources
// const cleanup = async (elbv2Client, ec2Client, resources) => {
//     try {
//         if (resources.albArn) {
//             console.log('\nCleaning up resources...');
//             await elbv2Client.send(
//                 new DeleteLoadBalancerCommand({
//                     LoadBalancerArn: resources.albArn
//                 })
//             );
//             console.log('Application Load Balancer deleted');
//         }

//         if (resources.sgId) {
//             // Wait for ALB to be fully deleted before deleting security group
//             await new Promise(resolve => setTimeout(resolve, 30000));
//             await ec2Client.send(
//                 new DeleteSecurityGroupCommand({
//                     GroupId: resources.sgId
//                 })
//             );
//             console.log('Security group deleted');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//     }
// };

// // Create non-compliant state
// const createNonCompliantState = async () => {
//     const elbv2Client = createAwsClient(ElasticLoadBalancingV2Client);
//     const ec2Client = createAwsClient(EC2Client);
//     const resources = {};

//     try {
//         console.log('Creating non-compliant Application Load Balancer...');

//         // Get network information
//         const { vpcId, subnets } = await getNetworkInfo(ec2Client);

//         // Create security group
//         const sgId = await createSecurityGroup(ec2Client, vpcId);
//         resources.sgId = sgId;

//         // Create ALB
//         const createLbResponse = await elbv2Client.send(
//             new CreateLoadBalancerCommand({
//                 Name: 'non-compliant-alb-' + Math.random().toString(36).substring(7),
//                 Subnets: subnets,
//                 SecurityGroups: [sgId],
//                 Type: 'application',
//                 IpAddressType: 'ipv4'
//             })
//         );

//         resources.albArn = createLbResponse.LoadBalancers[0].LoadBalancerArn;

//         console.log('\nWaiting for load balancer to be active...');
//         await waitForAlbCreation(elbv2Client, resources.albArn);

//         // Create HTTPS listener without ACM certificate (using self-signed cert)
//         await elbv2Client.send(
//             new CreateListenerCommand({
//                 LoadBalancerArn: resources.albArn,
//                 Protocol: 'HTTP',
//                 Port: 80,
//                 DefaultActions: [{
//                     Type: 'fixed-response',
//                     FixedResponseConfig: {
//                         ContentType: 'text/plain',
//                         StatusCode: '200',
//                         MessageBody: 'OK'
//                     }
//                 }]
//             })
//         );

//         console.log('\nNon-compliant state created:');
//         console.log(`ALB ARN: ${resources.albArn}`);
//         console.log('Status: Non-compliant - No ACM certificate configured');

//         // Wait for AWS Config to evaluate
//         console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
//         await new Promise(resolve => setTimeout(resolve, 120000));

//     } catch (error) {
//         console.error('Error creating non-compliant Application Load Balancer:', error);
//         throw error;
//     } finally {
//         await cleanup(elbv2Client, ec2Client, resources);
//     }
// };

// // Main function
// const main = async () => {
//     try {
//         await createNonCompliantState();
//     } catch (error) {
//         console.error('Script execution failed:', error);
//     }
// };

// // Run the script
// if (require.main === module) {
//     main();
// }

// module.exports = {
//     createNonCompliantState
// };



const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    CreateListenerCommand,
    DeleteLoadBalancerCommand,
    DescribeLoadBalancersCommand,
    DeleteListenerCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

const {
    EC2Client,
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize AWS clients
const getClient = (ServiceClient) => {
    try {
        const credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        };

        const config = {
            credentials: credentials,
            region: process.env.AWS_REGION || 'ap-southeast-1'
        };

        return new ServiceClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Get network information
const getNetworkInfo = async () => {
    const ec2Client = getClient(EC2Client);

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
            throw new Error('No default VPC found');
        }

        const vpcId = vpcResponse.Vpcs[0].VpcId;

        // Get subnets in the VPC
        const subnetResponse = await ec2Client.send(
            new DescribeSubnetsCommand({
                Filters: [{
                    Name: 'vpc-id',
                    Values: [vpcId]
                }]
            })
        );

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
            throw new Error('Not enough subnets found in VPC');
        }

        // Get two subnets from different AZs
        const subnets = subnetResponse.Subnets
            .sort(() => Math.random() - 0.5)
            .slice(0, 2)
            .map(subnet => subnet.SubnetId);

        return { vpcId, subnets };
    } catch (error) {
        console.error('Error getting network information:', error);
        throw error;
    }
};

// Create security group
const createSecurityGroup = async (vpcId) => {
    const ec2Client = getClient(EC2Client);

    try {
        // Create security group
        const createSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `non-compliant-alb-sg-${Date.now()}`,
                Description: 'Security group for non-compliant ALB testing',
                VpcId: vpcId
            })
        );

        const sgId = createSgResponse.GroupId;

        // Add inbound rule for HTTP only
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }]
            })
        );

        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
};

// Create non-compliant ALB (HTTP only)
const createNonCompliantALB = async (vpcId, subnets, sgId) => {
    const elbv2Client = getClient(ElasticLoadBalancingV2Client);
    const albName = `non-compliant-alb-${Date.now()}`;

    try {
        // Create ALB
        const createLbResponse = await elbv2Client.send(
            new CreateLoadBalancerCommand({
                Name: albName,
                Subnets: subnets,
                SecurityGroups: [sgId],
                Type: 'application',
                IpAddressType: 'ipv4'
            })
        );

        const albArn = createLbResponse.LoadBalancers[0].LoadBalancerArn;
        console.log(`Created ALB: ${albArn}`);

        // Wait for ALB to be active
        await waitForLoadBalancerStatus(elbv2Client, albArn, 'active');

        // Create HTTP listener only (non-compliant)
        const listenerResponse = await elbv2Client.send(
            new CreateListenerCommand({
                LoadBalancerArn: albArn,
                Protocol: 'HTTP',
                Port: 80,
                DefaultActions: [{
                    Type: 'fixed-response',
                    FixedResponseConfig: {
                        ContentType: 'text/plain',
                        StatusCode: '200',
                        MessageBody: 'OK'
                    }
                }]
            })
        );

        return {
            albArn,
            listenerArn: listenerResponse.Listeners[0].ListenerArn
        };
    } catch (error) {
        console.error('Error creating ALB:', error);
        throw error;
    }
};

// Wait for load balancer status
const waitForLoadBalancerStatus = async (elbv2Client, albArn, targetState) => {
    while (true) {
        try {
            const response = await elbv2Client.send(
                new DescribeLoadBalancersCommand({
                    LoadBalancerArns: [albArn]
                })
            );

            const state = response.LoadBalancers[0].State.Code;
            console.log(`Current ALB state: ${state}`);

            if (state === targetState) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (error) {
            if (error.name === 'LoadBalancerNotFound' && targetState === 'deleted') {
                console.log('Load balancer deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Cleanup resources
const cleanup = async (resources) => {
    try {
        const elbv2Client = getClient(ElasticLoadBalancingV2Client);
        const ec2Client = getClient(EC2Client);

        console.log('\nStarting cleanup...');

        // Delete listener
        if (resources.listenerArn) {
            await elbv2Client.send(
                new DeleteListenerCommand({
                    ListenerArn: resources.listenerArn
                })
            );
            console.log('Listener deleted');
        }

        // Delete ALB
        if (resources.albArn) {
            await elbv2Client.send(
                new DeleteLoadBalancerCommand({
                    LoadBalancerArn: resources.albArn
                })
            );
            console.log('Waiting for ALB deletion...');
            await waitForLoadBalancerStatus(elbv2Client, resources.albArn, 'deleted');
        }

        // Delete security group
        if (resources.sgId) {
            await new Promise(resolve => setTimeout(resolve, 30000));
            await ec2Client.send(
                new DeleteSecurityGroupCommand({
                    GroupId: resources.sgId
                })
            );
            console.log('Security group deleted');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    const resources = {};

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Get network information
        const { vpcId, subnets } = await getNetworkInfo();

        // Create security group
        resources.sgId = await createSecurityGroup(vpcId);

        // Create non-compliant ALB
        const albInfo = await createNonCompliantALB(vpcId, subnets, resources.sgId);
        resources.albArn = albInfo.albArn;
        resources.listenerArn = albInfo.listenerArn;

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        try {
            await cleanup(resources);
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
};

// Run the program
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
