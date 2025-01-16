require('dotenv').config();

const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    DeleteLoadBalancerCommand,
    DescribeLoadBalancersCommand,
    CreateTargetGroupCommand,
    DeleteTargetGroupCommand,
    CreateListenerCommand,
    DeleteListenerCommand,
    DescribeListenersCommand  // Add this import
  } = require("@aws-sdk/client-elastic-load-balancing-v2");
  
const {
  EC2Client,
  DescribeVpcsCommand,
  DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

// Configure AWS credentials using dotenv
const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION;
const elbv2Client = new ElasticLoadBalancingV2Client({ credentials, region });
const ec2Client = new EC2Client({ credentials, region });

// Generate unique names with timestamp
const timestamp = Date.now();
const albName = `non-compliant-alb-${timestamp}`;
const tgName = `alb-target-group-${timestamp}`;
let loadBalancerArn = '';
let targetGroupArn = '';

async function getDefaultVpcSubnets() {
  try {
    // Get default VPC
    const vpcResponse = await ec2Client.send(new DescribeVpcsCommand({
      Filters: [{ Name: 'isDefault', Values: ['true'] }]
    }));

    if (!vpcResponse.Vpcs || vpcResponse.Vpcs.length === 0) {
      throw new Error('No default VPC found');
    }

    const vpcId = vpcResponse.Vpcs[0].VpcId;

    // Get subnets in the default VPC
    const subnetResponse = await ec2Client.send(new DescribeSubnetsCommand({
      Filters: [{ Name: 'vpc-id', Values: [vpcId] }]
    }));

    if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
      throw new Error('Not enough subnets found in default VPC');
    }

    // Return first two subnet IDs (ALB requires at least two subnets)
    return subnetResponse.Subnets.slice(0, 2).map(subnet => subnet.SubnetId);
  } catch (error) {
    console.error("Error getting VPC and subnet information:", error);
    throw error;
  }
}

async function createNonCompliantALB() {
  try {
    console.log("Getting subnet information...");
    const subnetIds = await getDefaultVpcSubnets();

    // Create ALB
    console.log(`Creating Application Load Balancer: ${albName}`);
    const createAlbResponse = await elbv2Client.send(new CreateLoadBalancerCommand({
      Name: albName,
      Subnets: subnetIds,
      Type: 'application',
      IpAddressType: 'ipv4'
    }));

    loadBalancerArn = createAlbResponse.LoadBalancers[0].LoadBalancerArn;
    console.log(`ALB created with ARN: ${loadBalancerArn}`);

    // Wait for ALB to be active
    await waitForAlbStatus('active');

    // Create target group
    console.log(`Creating target group: ${tgName}`);
    const createTgResponse = await elbv2Client.send(new CreateTargetGroupCommand({
      Name: tgName,
      Protocol: 'HTTP',
      Port: 80,
      VpcId: createAlbResponse.LoadBalancers[0].VpcId,
      TargetType: 'ip'
    }));

    targetGroupArn = createTgResponse.TargetGroups[0].TargetGroupArn;
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

    console.log("Listener created successfully");
    return loadBalancerArn;
  } catch (error) {
    console.error("Error creating ALB:", error);
    throw error;
  }
}

async function waitForAlbStatus(desiredState, maxAttempts = 60) {
  console.log(`Waiting for ALB to reach ${desiredState} state...`);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await elbv2Client.send(new DescribeLoadBalancersCommand({
        Names: [albName]
      }));

      const state = response.LoadBalancers[0].State.Code.toLowerCase();
      console.log(`Current state: ${state}`);

      if (state === desiredState) {
        return true;
      }

      if (state === 'failed') {
        throw new Error('ALB creation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds between checks
    } catch (error) {
      if (attempt === maxAttempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  throw new Error(`Timeout waiting for ALB to reach ${desiredState} state`);
}

async function cleanup() {
    try {
      console.log("Starting cleanup...");
  
      if (loadBalancerArn) {
        // Delete listeners first
        console.log("Deleting listeners...");
        try {
          const listeners = await elbv2Client.send(new DescribeListenersCommand({
            LoadBalancerArn: loadBalancerArn
          }));
          
          // Delete each listener
          for (const listener of listeners.Listeners) {
            console.log(`Deleting listener: ${listener.ListenerArn}`);
            await elbv2Client.send(new DeleteListenerCommand({
              ListenerArn: listener.ListenerArn
            }));
          }
          console.log("All listeners deleted successfully");
        } catch (error) {
          console.log("Error deleting listeners:", error);
        }
  
        // Wait a short time for listener deletion to propagate
        await new Promise(resolve => setTimeout(resolve, 5000));
  
        // Delete the ALB
        console.log("Deleting Application Load Balancer...");
        await elbv2Client.send(new DeleteLoadBalancerCommand({
          LoadBalancerArn: loadBalancerArn
        }));
  
        // Wait for ALB to be deleted
        await waitForAlbDeletion();
      }
  
      // Wait additional time for ALB deletion to fully propagate
      await new Promise(resolve => setTimeout(resolve, 5000));
  
      // Delete target group
      if (targetGroupArn) {
        console.log("Deleting target group...");
        try {
          await elbv2Client.send(new DeleteTargetGroupCommand({
            TargetGroupArn: targetGroupArn
          }));
          console.log("Target group deleted successfully");
        } catch (error) {
          if (error.name === 'ResourceInUseException') {
            console.log("Target group still in use, waiting additional time...");
            await new Promise(resolve => setTimeout(resolve, 10000));
            // Try one more time
            await elbv2Client.send(new DeleteTargetGroupCommand({
              TargetGroupArn: targetGroupArn
            }));
          } else {
            throw error;
          }
        }
      }
  
      console.log("Cleanup completed successfully");
    } catch (error) {
      console.error("Error during cleanup:", error);
      throw error;
    }
  }
  
  async function waitForAlbDeletion(maxAttempts = 60) {
    console.log("Waiting for ALB deletion...");
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await elbv2Client.send(new DescribeLoadBalancersCommand({
          Names: [albName]
        }));
        console.log("ALB still exists, waiting...");
        await new Promise(resolve => setTimeout(resolve, 10000));
      } catch (error) {
        if (error.name === 'LoadBalancerNotFoundException') {
          console.log("ALB deleted successfully");
          return true;
        }
        throw error;
      }
    }
    throw new Error('Timeout waiting for ALB deletion');
  }
  

async function waitForAlbDeletion(maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      await elbv2Client.send(new DescribeLoadBalancersCommand({
        Names: [albName]
      }));
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
      if (error.name === 'LoadBalancerNotFoundException') {
        return true;
      }
      throw error;
    }
  }
  throw new Error('Timeout waiting for ALB deletion');
}

async function monitorAlb() {
  try {
    const response = await elbv2Client.send(new DescribeLoadBalancersCommand({
      Names: [albName]
    }));

    console.log("Current ALB Configuration:");
    console.log(JSON.stringify({
      LoadBalancerName: response.LoadBalancers[0].LoadBalancerName,
      DNSName: response.LoadBalancers[0].DNSName,
      State: response.LoadBalancers[0].State,
      Type: response.LoadBalancers[0].Type,
      Scheme: response.LoadBalancers[0].Scheme
    }, null, 2));

    return response.LoadBalancers[0];
  } catch (error) {
    console.error("Error monitoring ALB:", error);
    throw error;
  }
}

async function main() {
  console.log(`Starting ALB WAF compliance simulation in region ${region}`);

  try {
    // Create non-compliant ALB
    await createNonCompliantALB();

    // Monitor the configuration
    await monitorAlb();

    // Wait for a short period to simulate the test scenario
    console.log("Waiting for 2 minutes before cleanup...");
    await new Promise(resolve => setTimeout(resolve, 120000));

    // Cleanup
    await cleanup();
    console.log("Simulation completed successfully");
  } catch (error) {
    console.error("Script execution failed:", error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("Cleanup after error failed:", cleanupError);
    }
  }
}

// Validate environment variables
function validateEnvironmentVariables() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Execute the script with environment validation
if (require.main === module) {
  try {
    validateEnvironmentVariables();
    main();
  } catch (error) {
    console.error("Initialization error:", error.message);
    process.exit(1);
  }
}

module.exports = {
  createNonCompliantALB,
  cleanup,
  monitorAlb
};
