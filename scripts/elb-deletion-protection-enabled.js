const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    CreateListenerCommand,
    CreateTargetGroupCommand,
    DescribeLoadBalancersCommand,
    ModifyLoadBalancerAttributesCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");
const {
    EC2Client,
    DescribeSubnetsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeNetworkInterfacesCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize clients
const elbv2Client = new ElasticLoadBalancingV2Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

const ec2Client = new EC2Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

async function getAvailableIpsInSubnet(subnetId) {
    try {
        // Get subnet information
        const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
            SubnetIds: [subnetId]
        }));

        const subnet = subnetResponse.Subnets[0];
        const totalIps = calculateTotalIps(subnet.CidrBlock);

        // Get used IPs in the subnet
        const interfacesResponse = await ec2Client.send(new DescribeNetworkInterfacesCommand({
            Filters: [
                {
                    Name: 'subnet-id',
                    Values: [subnetId]
                }
            ]
        }));

        const usedIps = interfacesResponse.NetworkInterfaces.length;
        const availableIps = totalIps - usedIps - 5; // Subtract 5 for AWS reserved IPs

        console.log(`Subnet ${subnetId}:`, {
            CidrBlock: subnet.CidrBlock,
            AvailableIps: availableIps,
            MapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch,
            AvailabilityZone: subnet.AvailabilityZone
        });

        return {
            subnetId,
            availableIps,
            isPublic: subnet.MapPublicIpOnLaunch,
            az: subnet.AvailabilityZone
        };
    } catch (error) {
        console.error(`Error checking available IPs for subnet ${subnetId}:`, error);
        return null;
    }
}

function calculateTotalIps(cidrBlock) {
    const mask = parseInt(cidrBlock.split('/')[1]);
    return Math.pow(2, 32 - mask) - 5; // Subtract 5 for AWS reserved IPs
}

async function getEligibleSubnets(requirePublic = true, minIpsRequired = 8) {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [process.env.VPC_ID]
                }
            ]
        }));

        if (response.Subnets.length === 0) {
            throw new Error('No subnets found in the specified VPC');
        }

        // Check each subnet for IP availability and public IP capability
        const subnetPromises = response.Subnets.map(subnet => 
            getAvailableIpsInSubnet(subnet.SubnetId)
        );
        const subnetDetails = (await Promise.all(subnetPromises)).filter(Boolean);

        // Group eligible subnets by AZ
        const azSubnets = new Map();
        for (const subnet of subnetDetails) {
            if (subnet.availableIps >= minIpsRequired && 
                (!requirePublic || subnet.isPublic)) {
                if (!azSubnets.has(subnet.az)) {
                    azSubnets.set(subnet.az, []);
                }
                azSubnets.get(subnet.az).push(subnet);
            }
        }

        // Select best subnet from each AZ
        const selectedSubnets = [];
        for (const [az, subnets] of azSubnets) {
            if (subnets.length > 0) {
                // Sort by available IPs and select the one with most available IPs
                const bestSubnet = subnets.sort((a, b) => b.availableIps - a.availableIps)[0];
                selectedSubnets.push(bestSubnet);
            }
            if (selectedSubnets.length >= 2) break;
        }

        if (selectedSubnets.length < 2) {
            throw new Error(
                `Need at least 2 subnets in different AZs with ${minIpsRequired}+ free IPs` +
                `${requirePublic ? ' and public IP mapping enabled' : ''}`
            );
        }

        console.log('Selected eligible subnets:', selectedSubnets.map(s => ({
            SubnetId: s.subnetId,
            AvailabilityZone: s.az,
            AvailableIPs: s.availableIps,
            IsPublic: s.isPublic
        })));

        return selectedSubnets.map(s => s.subnetId);
    } catch (error) {
        console.error('Error getting eligible subnets:', error);
        throw error;
    }
}

async function createSecurityGroup() {
    try {
        const createSgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: `alb-sg-${Date.now()}`,
            Description: 'Security group for Application Load Balancer',
            VpcId: process.env.VPC_ID,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [
                    {
                        Key: 'simulation-mas',
                        Value: 'true'
                    },
                    {
                        Key: 'Name',
                        Value: 'alb-security-group'
                    }
                ]
            }]
        }));

        const sgId = createSgResponse.GroupId;

        // Add inbound rules for HTTP
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgId,
            IpPermissions: [
                {
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }
            ]
        }));

        console.log('Created security group:', sgId);
        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
}

async function createTargetGroup() {
    try {
        const response = await elbv2Client.send(new CreateTargetGroupCommand({
            Name: `alb-tg-${Date.now()}`.substring(0, 32),
            Protocol: 'HTTP',
            Port: 80,
            VpcId: process.env.VPC_ID,
            HealthCheckProtocol: 'HTTP',
            HealthCheckPath: '/',
            HealthCheckIntervalSeconds: 30,
            HealthCheckTimeoutSeconds: 5,
            HealthyThresholdCount: 2,
            UnhealthyThresholdCount: 2,
            Matcher: {
                HttpCode: '200'
            },
            TargetType: 'instance',
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        console.log('Created target group:', response.TargetGroups[0].TargetGroupArn);
        return response.TargetGroups[0];
    } catch (error) {
        console.error('Error creating target group:', error);
        throw error;
    }
}

async function createLoadBalancer() {
    try {
        // Get subnets with enough IPs, but don't require public IP mapping
        const subnetIds = await getEligibleSubnets(false, 8); // Changed to false for internal ALB
        const securityGroupId = await createSecurityGroup();
        const targetGroup = await createTargetGroup();

        // Create the load balancer as internal
        const createLbResponse = await elbv2Client.send(new CreateLoadBalancerCommand({
            Name: `test-alb-${Date.now()}`.substring(0, 32),
            Subnets: subnetIds,
            SecurityGroups: [securityGroupId],
            Scheme: 'internal', // Changed to internal
            Type: 'application',
            IpAddressType: 'ipv4',
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        }));

        const loadBalancer = createLbResponse.LoadBalancers[0];
        console.log('Load balancer creation initiated:', {
            LoadBalancerArn: loadBalancer.LoadBalancerArn,
            DNSName: loadBalancer.DNSName,
            Scheme: 'internal'
        });

        // Wait for the load balancer to be active
        await waitForLoadBalancerActive(loadBalancer.LoadBalancerArn);

        // Explicitly disable deletion protection
        await elbv2Client.send(new ModifyLoadBalancerAttributesCommand({
            LoadBalancerArn: loadBalancer.LoadBalancerArn,
            Attributes: [
                {
                    Key: 'deletion_protection.enabled',
                    Value: 'false'
                }
            ]
        }));

        console.log('Disabled deletion protection');

        // Create HTTP listener
        const createListenerResponse = await elbv2Client.send(new CreateListenerCommand({
            LoadBalancerArn: loadBalancer.LoadBalancerArn,
            Protocol: 'HTTP',
            Port: 80,
            DefaultActions: [
                {
                    Type: 'forward',
                    TargetGroupArn: targetGroup.TargetGroupArn
                }
            ]
        }));

        console.log('Created HTTP listener:', {
            ListenerArn: createListenerResponse.Listeners[0].ListenerArn,
            Protocol: 'HTTP',
            Port: 80,
            TargetGroup: targetGroup.TargetGroupArn
        });

        return loadBalancer;

    } catch (error) {
        console.error('Error creating load balancer:', error);
        throw error;
    }
}


async function waitForLoadBalancerActive(loadBalancerArn) {
    console.log('Waiting for load balancer to be active...');
    
    while (true) {
        try {
            const response = await elbv2Client.send(new DescribeLoadBalancersCommand({
                LoadBalancerArns: [loadBalancerArn]
            }));

            const state = response.LoadBalancers[0].State.Code;
            console.log(`Load balancer state: ${state}`);
            
            if (state === 'active') {
                console.log('Load balancer is active');
                console.log('Configuration:', {
                    DNSName: response.LoadBalancers[0].DNSName,
                    VpcId: response.LoadBalancers[0].VpcId,
                    Type: response.LoadBalancers[0].Type,
                    Scheme: response.LoadBalancers[0].Scheme,
                    DeletionProtection: 'Disabled',
                    AvailabilityZones: response.LoadBalancers[0].AvailabilityZones.map(az => az.ZoneName)
                });
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000));
            
        } catch (error) {
            console.error('Error checking load balancer status:', error);
            throw error;
        }
    }
}

async function main() {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_REGION',
            'VPC_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        await createLoadBalancer();

    } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
    }
}

// Execute if running directly
if (require.main === module) {
    main();
}

module.exports = {
    createLoadBalancer
};
