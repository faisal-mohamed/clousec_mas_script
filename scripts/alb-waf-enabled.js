require('dotenv').config();

const {
  ElasticLoadBalancingV2Client,
  CreateLoadBalancerCommand,
  CreateTargetGroupCommand,
  CreateListenerCommand,
  DescribeLoadBalancersCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

const {
  EC2Client,
  DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const vpcId = process.env.VPC_ID;

const elbv2Client = new ElasticLoadBalancingV2Client({ credentials, region });
const ec2Client = new EC2Client({ credentials, region });

// Generate unique names with timestamp
const timestamp = Date.now();
const albName = `test-alb-${timestamp}`;
const tgName = `test-tg-${timestamp}`;

async function getVpcSubnets() {
  try {
    const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
      Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
    }));

    if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
      throw new Error('Need at least 2 subnets in the VPC for ALB creation');
    }

    // Return first two subnet IDs
    return subnetResponse.Subnets.slice(0, 2).map(subnet => subnet.SubnetId);
  } catch (error) {
    console.error("Error getting subnet information:", error);
    throw error;
  }
}

async function createALB() {
  try {
    console.log("Getting subnet information...");
    const subnetIds = await getVpcSubnets();

    // Create ALB
    console.log(`Creating Application Load Balancer: ${albName}`);
    const createAlbResponse = await elbv2Client.send(new CreateLoadBalancerCommand({
      Name: albName,
      Subnets: subnetIds,
      Type: 'application',
      IpAddressType: 'ipv4'
    }));

    const loadBalancerArn = createAlbResponse.LoadBalancers[0].LoadBalancerArn;
    console.log(`ALB created with ARN: ${loadBalancerArn}`);

    // Create target group
    console.log(`Creating target group: ${tgName}`);
    const createTgResponse = await elbv2Client.send(new CreateTargetGroupCommand({
      Name: tgName,
      Protocol: 'HTTP',
      Port: 80,
      VpcId: vpcId,
      TargetType: 'ip',
      HealthCheckEnabled: true,
      HealthCheckPath: '/'
    }));

    const targetGroupArn = createTgResponse.TargetGroups[0].TargetGroupArn;
    console.log(`Target group created with ARN: ${targetGroupArn}`);

    // Create listener
    console.log("Creating listener...");
    await elbv2Client.send(new CreateListenerCommand({
      LoadBalancerArn: loadBalancerArn,
      Protocol: 'HTTP',
      Port: 80,
      DefaultActions: [{
        Type: 'forward',
        TargetGroupArn: targetGroupArn
      }]
    }));

    console.log("ALB creation completed successfully");
    return loadBalancerArn;
  } catch (error) {
    console.error("Error creating ALB:", error);
    throw error;
  }
}

// Function to monitor ALB status
async function checkAlbStatus(albName) {
  try {
    const response = await elbv2Client.send(new DescribeLoadBalancersCommand({
      Names: [albName]
    }));

    console.log("ALB Status:", {
      LoadBalancerName: response.LoadBalancers[0].LoadBalancerName,
      DNSName: response.LoadBalancers[0].DNSName,
      State: response.LoadBalancers[0].State,
      Type: response.LoadBalancers[0].Type
    });
  } catch (error) {
    console.error("Error checking ALB status:", error);
    throw error;
  }
}

// Main execution
async function main() {
  try {
    await createALB();
    await checkAlbStatus(albName);
  } catch (error) {
    console.error("Error in main execution:", error);
  }
}

main();
