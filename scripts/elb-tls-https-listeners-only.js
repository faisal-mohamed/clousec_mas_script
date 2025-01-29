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
    DescribeNetworkInterfacesCommand,
    DescribeVpcsCommand
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

async function getVpcCidr() {
    try {
        const response = await ec2Client.send(new DescribeVpcsCommand({
            VpcIds: [process.env.VPC_ID]
        }));

        if (response.Vpcs && response.Vpcs.length > 0) {
            const vpcCidr = response.Vpcs[0].CidrBlock;
            console.log('VPC CIDR:', vpcCidr);
            return vpcCidr;
        }
        throw new Error('VPC not found');
    } catch (error) {
        console.error('Error getting VPC CIDR:', error);
        throw error;
    }
}

async function getAvailableIpsInSubnet(subnetId) {
    try {
        const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
            SubnetIds: [subnetId]
        }));

        const subnet = subnetResponse.Subnets[0];
        const totalIps = calculateTotalIps(subnet.CidrBlock);

        const interfacesResponse = await ec2Client.send(new DescribeNetworkInterfacesCommand({
            Filters: [
                {
                    Name: 'subnet-id',
                    Values: [subnetId]
                }
            ]
        }));

        const usedIps = interfacesResponse.NetworkInterfaces.length;
        const availableIps = totalIps - usedIps - 5;

        console.log(`Subnet ${subnetId}:`, {
            CidrBlock: subnet.CidrBlock,
            AvailableIps: availableIps,
            AvailabilityZone: subnet.AvailabilityZone
        });

        return {
            subnetId,
            availableIps,
            az: subnet.AvailabilityZone
        };
    } catch (error) {
        console.error(`Error checking available IPs for subnet ${subnetId}:`, error);
        return null;
    }
}

function calculateTotalIps(cidrBlock) {
    const mask = parseInt(cidrBlock.split('/')[1]);
    return Math.pow(2, 32 - mask) - 5;
}

async function getEligibleSubnets(minIpsRequired = 8) {
    try {
        if (process.env.SUBNET_ID_1 && process.env.SUBNET_ID_2) {
            const subnetIds = [process.env.SUBNET_ID_1, process.env.SUBNET_ID_2];
            console.log('Using specified subnets:', subnetIds);
            return subnetIds;
        }

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

        const subnetPromises = response.Subnets.map(subnet => 
            getAvailableIpsInSubnet(subnet.SubnetId)
        );
        const subnetDetails = (await Promise.all(subnetPromises)).filter(Boolean);

        const azSubnets = new Map();
        for (const subnet of subnetDetails) {
            if (subnet.availableIps >= minIpsRequired) {
                if (!azSubnets.has(subnet.az)) {
                    azSubnets.set(subnet.az, []);
                }
                azSubnets.get(subnet.az).push(subnet);
            }
        }

        const selectedSubnets = [];
        for (const [az, subnets] of azSubnets) {
            if (subnets.length > 0) {
                const bestSubnet = subnets.sort((a, b) => b.availableIps - a.availableIps)[0];
                selectedSubnets.push(bestSubnet);
            }
            if (selectedSubnets.length >= 2) break;
        }

        if (selectedSubnets.length < 2) {
            throw new Error(`Need at least 2 subnets in different AZs with ${minIpsRequired}+ free IPs`);
        }

        console.log('Selected eligible subnets:', selectedSubnets.map(s => ({
            SubnetId: s.subnetId,
            AvailabilityZone: s.az,
            AvailableIPs: s.availableIps
        })));

        return selectedSubnets.map(s => s.subnetId);
    } catch (error) {
        console.error('Error getting eligible subnets:', error);
        throw error;
    }
}

async function createSecurityGroup() {
    try {
        const vpcCidr = await getVpcCidr();

        const createSgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: `http-only-alb-sg-${Date.now()}`,
            Description: 'Security group for HTTP-only Application Load Balancer',
            VpcId: process.env.VPC_ID,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [
                    {
                        Key: 'Name',
                        Value: 'http-only-alb-security-group'
                    },
                    {
                        Key: 'simulation-mas',
                        Value: 'http-only-alb-security-group'
                    }
                ]
            }]
        }));

        const sgId = createSgResponse.GroupId;

        // Only allow HTTP traffic
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
            Name: `http-alb-tg-${Date.now()}`.substring(0, 32),
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
            // Correct tag format as an array of TagSpecification
            TagSpecifications: [
                {
                    ResourceType: 'target-group',
                    Tags: [
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'Name',
                            Value: 'http-only-alb-target-group'
                        }
                    ]
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
        const subnetIds = await getEligibleSubnets(8);
        const securityGroupId = await createSecurityGroup();
        const targetGroup = await createTargetGroup();

        const createLbResponse = await elbv2Client.send(new CreateLoadBalancerCommand({
            Name: `http-only-alb-${Date.now()}`.substring(0, 32),
            Subnets: subnetIds,
            SecurityGroups: [securityGroupId],
            Scheme: 'internet-facing',
            Type: 'application',
            IpAddressType: 'ipv4',
            // Correct tag format as an array of TagSpecification
            TagSpecifications: [
                {
                    ResourceType: 'loadbalancer',
                    Tags: [
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'Name',
                            Value: 'http-only-alb'
                        }
                    ]
                }
            ]
        }));

        const loadBalancer = createLbResponse.LoadBalancers[0];
        console.log('Load balancer creation initiated:', {
            LoadBalancerArn: loadBalancer.LoadBalancerArn,
            DNSName: loadBalancer.DNSName
        });

        await waitForLoadBalancerActive(loadBalancer.LoadBalancerArn);

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

        // Disable deletion protection and access logs
        await elbv2Client.send(new ModifyLoadBalancerAttributesCommand({
            LoadBalancerArn: loadBalancer.LoadBalancerArn,
            Attributes: [
                {
                    Key: 'deletion_protection.enabled',
                    Value: 'false'
                },
                {
                    Key: 'access_logs.s3.enabled',
                    Value: 'false'
                }
            ]
        }));

        console.log('Disabled deletion protection and access logs');

        return loadBalancer;

    } catch (error) {
        console.error('Error creating load balancer:', error);
        throw error;
    }
}


async function waitForLoadBalancerActive(loadBalancerArn) {
    console.log('Waiting for load balancer to be active...');
    let retries = 0;
    const maxRetries = 30;
    
    while (retries < maxRetries) {
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
                    Listeners: 'HTTP only',
                    AccessLogs: 'Disabled',
                    DeletionProtection: 'Disabled',
                    AvailabilityZones: response.LoadBalancers[0].AvailabilityZones.map(az => az.ZoneName)
                });
                return;
            }

            retries++;
            await new Promise(resolve => setTimeout(resolve, 30000));
            
        } catch (error) {
            console.error('Error checking load balancer status:', error);
            throw error;
        }
    }
    
    throw new Error('Timeout waiting for load balancer to become active');
}

async function main() {
    try {
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

if (require.main === module) {
    main();
}

module.exports = {
    createLoadBalancer
};
