const { 
    ElasticLoadBalancingClient,
    CreateLoadBalancerCommand,
    DeleteLoadBalancerCommand,
    CreateLoadBalancerListenersCommand,
    DescribeLoadBalancersCommand
} = require("@aws-sdk/client-elastic-load-balancing");

const { 
    EC2Client, 
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeVpcsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Create AWS client
const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

// Create security group for ELB
const createSecurityGroup = async (ec2Client) => {
    try {
        // Get default VPC ID
        const vpcResponse = await ec2Client.send(
            new DescribeVpcsCommand({
                Filters: [{ Name: 'isDefault', Values: ['true'] }]
            })
        );

        const vpcId = vpcResponse.Vpcs[0].VpcId;
        
        // Create security group
        const createSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: 'non-compliant-elb-sg-' + Math.random().toString(36).substring(7),
                Description: 'Security group for non-compliant ELB testing'
            })
        );

        const sgId = createSgResponse.GroupId;

        // Add inbound rules
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: [
                    {
                        IpProtocol: 'tcp',
                        FromPort: 80,
                        ToPort: 80,
                        IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                    }
                ]
            })
        );

        return { sgId, vpcId };
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
};

// Wait for ELB creation
const waitForElbCreation = async (elbClient, lbName) => {
    let isCreated = false;
    let attempts = 0;
    const maxAttempts = 30;

    while (!isCreated && attempts < maxAttempts) {
        try {
            const response = await elbClient.send(
                new DescribeLoadBalancersCommand({
                    LoadBalancerNames: [lbName]
                })
            );

            if (response.LoadBalancerDescriptions[0].DNSName) {
                isCreated = true;
                console.log('Load balancer creation completed!');
            } else {
                attempts++;
                console.log('Still creating load balancer... (attempt', attempts, 'of', maxAttempts, ')');
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        } catch (error) {
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    if (!isCreated) {
        throw new Error('Load balancer creation timed out');
    }
};

// Cleanup resources
const cleanup = async (elbClient, ec2Client, resources) => {
    try {
        if (resources.lbName) {
            console.log('\nCleaning up resources...');
            await elbClient.send(
                new DeleteLoadBalancerCommand({
                    LoadBalancerName: resources.lbName
                })
            );
            console.log('Load balancer deleted');
        }

        if (resources.sgId) {
            // Wait for ELB to be fully deleted before deleting security group
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
    }
};

// Create non-compliant state
const createNonCompliantState = async () => {
    const elbClient = createAwsClient(ElasticLoadBalancingClient);
    const ec2Client = createAwsClient(EC2Client);
    const resources = {
        lbName: 'non-compliant-lb-' + Math.random().toString(36).substring(7)
    };

    try {
        console.log('Creating non-compliant Classic Load Balancer with HTTP listener...');

        // Create security group
        const { sgId, vpcId } = await createSecurityGroup(ec2Client);
        resources.sgId = sgId;

        // Create load balancer with HTTP listener only
        await elbClient.send(
            new CreateLoadBalancerCommand({
                LoadBalancerName: resources.lbName,
                Listeners: [
                    {
                        Protocol: 'HTTP',
                        LoadBalancerPort: 80,
                        InstanceProtocol: 'HTTP',
                        InstancePort: 80
                    }
                ],
                AvailabilityZones: [
                    process.env.AWS_REGION + 'a',
                    process.env.AWS_REGION + 'b'
                ],
                SecurityGroups: [sgId]
            })
        );

        console.log('\nWaiting for load balancer to be created...');
        await waitForElbCreation(elbClient, resources.lbName);

        console.log('\nNon-compliant state created:');
        console.log(`Load Balancer Name: ${resources.lbName}`);
        console.log('Protocol: HTTP (non-compliant - should be HTTPS)');

        // Wait for AWS Config to evaluate
        console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('Error creating non-compliant Classic Load Balancer:', error);
        throw error;
    } finally {
        await cleanup(elbClient, ec2Client, resources);
    }
};

// Main function
const main = async () => {
    try {
        await createNonCompliantState();
    } catch (error) {
        console.error('Script execution failed:', error);
    }
};

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    createNonCompliantState
};
