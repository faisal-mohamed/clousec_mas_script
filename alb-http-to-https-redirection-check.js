const { 
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    CreateListenerCommand,
    DeleteLoadBalancerCommand,
    DescribeLoadBalancersCommand,
    CreateTargetGroupCommand,
    DeleteTargetGroupCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

const { 
    EC2Client,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Configuration
const CONFIG = {
    ALB: {
        NAME: 'test-http-alb',
        HTTP_PORT: 80,
        HTTPS_PORT: 443
    },
    TARGET_GROUP: {
        NAME: 'test-http-tg',
        PORT: 80
    },
    SECURITY_GROUP: {
        NAME: 'test-alb-sg',
        DESCRIPTION: 'Security group for test ALB'
    }
};

const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

async function getDefaultVpcSubnets() {
    const ec2Client = createAwsClient(EC2Client);

    try {
        // Get default VPC
        const vpcResponse = await ec2Client.send(new DescribeVpcsCommand({
            Filters: [{ Name: 'isDefault', Values: ['true'] }]
        }));

        if (!vpcResponse.Vpcs || vpcResponse.Vpcs.length === 0) {
            throw new Error('No default VPC found');
        }

        const vpcId = vpcResponse.Vpcs[0].VpcId;

        // Get subnets in default VPC
        const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
        }));

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
            throw new Error('Not enough subnets found in default VPC');
        }

        return {
            vpcId,
            subnetIds: subnetResponse.Subnets.slice(0, 2).map(subnet => subnet.SubnetId)
        };
    } catch (error) {
        console.error('Error getting VPC and subnet information:', error);
        throw error;
    }
}

async function createSecurityGroup(vpcId) {
    const ec2Client = createAwsClient(EC2Client);

    try {
        // Create security group
        const createSgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: CONFIG.SECURITY_GROUP.NAME,
            Description: CONFIG.SECURITY_GROUP.DESCRIPTION,
            VpcId: vpcId
        }));

        const securityGroupId = createSgResponse.GroupId;

        // Add inbound rules
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: securityGroupId,
            IpPermissions: [
                {
                    IpProtocol: 'tcp',
                    FromPort: CONFIG.ALB.HTTP_PORT,
                    ToPort: CONFIG.ALB.HTTP_PORT,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                },
                {
                    IpProtocol: 'tcp',
                    FromPort: CONFIG.ALB.HTTPS_PORT,
                    ToPort: CONFIG.ALB.HTTPS_PORT,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }
            ]
        }));

        return securityGroupId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
}

async function waitForLoadBalancer(elbv2Client, loadBalancerArn) {
    console.log('Waiting for load balancer to be active...');
    
    while (true) {
        const response = await elbv2Client.send(new DescribeLoadBalancersCommand({
            LoadBalancerArns: [loadBalancerArn]
        }));
        
        const state = response.LoadBalancers[0].State.Code;
        if (state === 'active') break;
        
        await new Promise(resolve => setTimeout(resolve, 10000));
    }
}

async function createNonCompliantALB() {
    const elbv2Client = createAwsClient(ElasticLoadBalancingV2Client);

    try {
        // Get VPC and subnet information
        const { vpcId, subnetIds } = await getDefaultVpcSubnets();

        // Create security group
        const securityGroupId = await createSecurityGroup(vpcId);

        // Create target group
        console.log('Creating target group...');
        const createTgResponse = await elbv2Client.send(new CreateTargetGroupCommand({
            Name: CONFIG.TARGET_GROUP.NAME,
            Protocol: 'HTTP',
            Port: CONFIG.TARGET_GROUP.PORT,
            VpcId: vpcId,
            TargetType: 'ip'
        }));

        const targetGroupArn = createTgResponse.TargetGroups[0].TargetGroupArn;

        // Create ALB
        console.log('Creating Application Load Balancer...');
        const createAlbResponse = await elbv2Client.send(new CreateLoadBalancerCommand({
            Name: CONFIG.ALB.NAME,
            Subnets: subnetIds,
            SecurityGroups: [securityGroupId],
            Scheme: 'internet-facing',
            Type: 'application',
            IpAddressType: 'ipv4'
        }));

        const loadBalancerArn = createAlbResponse.LoadBalancers[0].LoadBalancerArn;
        await waitForLoadBalancer(elbv2Client, loadBalancerArn);

        // Create HTTP listener without HTTPS redirection
        console.log('Creating HTTP listener without HTTPS redirection...');
        await elbv2Client.send(new CreateListenerCommand({
            LoadBalancerArn: loadBalancerArn,
            Protocol: 'HTTP',
            Port: CONFIG.ALB.HTTP_PORT,
            DefaultActions: [{
                Type: 'forward',
                TargetGroupArn: targetGroupArn
            }]
        }));

        console.log('\nNon-compliant state created:');
        console.log(`Load Balancer ARN: ${loadBalancerArn}`);
        console.log(`Target Group ARN: ${targetGroupArn}`);
        console.log(`Security Group ID: ${securityGroupId}`);
        console.log('HTTP Listener: Configured without HTTPS redirection');

        return {
            loadBalancerArn,
            targetGroupArn,
            securityGroupId
        };

    } catch (error) {
        console.error('Error creating non-compliant ALB:', error);
        throw error;
    }
}

async function cleanupResources(resources) {
    const elbv2Client = createAwsClient(ElasticLoadBalancingV2Client);
    const ec2Client = createAwsClient(EC2Client);

    console.log('\nCleaning up resources...');

    try {
        // Delete load balancer
        if (resources.loadBalancerArn) {
            await elbv2Client.send(new DeleteLoadBalancerCommand({
                LoadBalancerArn: resources.loadBalancerArn
            }));
            
            // Wait for load balancer to be deleted
            await new Promise(resolve => setTimeout(resolve, 30000));
        }

        // Delete target group
        if (resources.targetGroupArn) {
            await elbv2Client.send(new DeleteTargetGroupCommand({
                TargetGroupArn: resources.targetGroupArn
            }));
        }

        // Delete security group
        if (resources.securityGroupId) {
            await ec2Client.send(new DeleteSecurityGroupCommand({
                GroupId: resources.securityGroupId
            }));
        }

        console.log('Cleanup completed');
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

async function main() {
    let resources = {};
    try {
        console.log('Creating non-compliant state for alb-http-to-https-redirection-check...');
        resources = await createNonCompliantALB();
        
        // Wait for AWS Config to evaluate
        console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('Error in main execution:', error);
    } finally {
        // Cleanup
        await cleanupResources(resources);
    }
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createNonCompliantState: main
};
