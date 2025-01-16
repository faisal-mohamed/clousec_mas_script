require('dotenv').config();
const {
  ElasticLoadBalancingV2Client,
  CreateLoadBalancerCommand,
  CreateListenerCommand,
  DeleteLoadBalancerCommand,
  DescribeLoadBalancersCommand,
  DescribeListenersCommand,
  DeleteListenerCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

const {
  EC2Client,
  DescribeSubnetsCommand,
  DescribeVpcsCommand
} = require("@aws-sdk/client-ec2");

// Initialize clients
const elbv2Client = new ElasticLoadBalancingV2Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

const ec2Client = new EC2Client({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Get available subnets from default VPC
async function getSubnets() {
  try {
    // Get default VPC
    const vpcsResponse = await ec2Client.send(
      new DescribeVpcsCommand({
        Filters: [{ Name: 'isDefault', Values: ['true'] }]
      })
    );

    if (!vpcsResponse.Vpcs || vpcsResponse.Vpcs.length === 0) {
      throw new Error('No default VPC found');
    }

    // Get subnets from default VPC
    const subnetsResponse = await ec2Client.send(
      new DescribeSubnetsCommand({
        Filters: [{ Name: 'vpc-id', Values: [vpcsResponse.Vpcs[0].VpcId] }]
      })
    );

    if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length < 2) {
      throw new Error('Not enough subnets found in default VPC');
    }

    // Return first two subnet IDs
    return subnetsResponse.Subnets.slice(0, 2).map(subnet => subnet.SubnetId);
  } catch (error) {
    console.error('Error getting subnets:', error);
    throw error;
  }
}

// Create non-compliant load balancer (without ACM certificate)
async function createNonCompliantLoadBalancer() {
  const lbName = `test-lb-non-compliant-${Date.now()}`.substring(0, 32);
  
  try {
    // Get subnets
    const subnetIds = await getSubnets();

    // Create load balancer
    const createLbResponse = await elbv2Client.send(
      new CreateLoadBalancerCommand({
        Name: lbName,
        Subnets: subnetIds,
        Type: 'application'
      })
    );

    const loadBalancer = createLbResponse.LoadBalancers[0];
    createdResources.push({
      type: 'LOAD_BALANCER',
      arn: loadBalancer.LoadBalancerArn,
      name: lbName
    });

    console.log(`Created load balancer: ${lbName}`);

    // Wait for load balancer to be active
    await waitForLoadBalancerActive(loadBalancer.LoadBalancerArn);

    // Create HTTPS listener without ACM certificate (using self-signed cert)
    const createListenerResponse = await elbv2Client.send(
      new CreateListenerCommand({
        LoadBalancerArn: loadBalancer.LoadBalancerArn,
        Protocol: 'HTTPS',
        Port: 443,
        Certificates: [
          {
            CertificateArn: process.env.SELF_SIGNED_CERT_ARN // ARN of a self-signed certificate
          }
        ],
        DefaultActions: [
          {
            Type: 'fixed-response',
            FixedResponseConfig: {
              ContentType: 'text/plain',
              MessageBody: 'Test response',
              StatusCode: '200'
            }
          }
        ]
      })
    );

    createdResources.push({
      type: 'LISTENER',
      arn: createListenerResponse.Listeners[0].ListenerArn,
      lbArn: loadBalancer.LoadBalancerArn
    });

    console.log('Added non-compliant HTTPS listener');
    return loadBalancer.LoadBalancerArn;
  } catch (error) {
    console.error('Error creating non-compliant load balancer:', error);
    throw error;
  }
}

// Wait for load balancer to be active
async function waitForLoadBalancerActive(loadBalancerArn) {
  console.log('Waiting for load balancer to be active...');
  
  while (true) {
    const response = await elbv2Client.send(
      new DescribeLoadBalancersCommand({
        LoadBalancerArns: [loadBalancerArn]
      })
    );

    if (response.LoadBalancers[0].State.Code === 'active') {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 10000));
  }
}

// Check load balancer compliance
async function checkLoadBalancerCompliance(loadBalancerArn) {
  try {
    // Get load balancer details
    const lbResponse = await elbv2Client.send(
      new DescribeLoadBalancersCommand({
        LoadBalancerArns: [loadBalancerArn]
      })
    );

    const loadBalancer = lbResponse.LoadBalancers[0];
    console.log(`\nAnalyzing Load Balancer: ${loadBalancer.LoadBalancerName}`);

    // Get listeners
    const listenersResponse = await elbv2Client.send(
      new DescribeListenersCommand({
        LoadBalancerArn: loadBalancerArn
      })
    );

    let isCompliant = true;
    console.log('\nListeners:');
    
    for (const listener of listenersResponse.Listeners) {
      console.log(`\nProtocol: ${listener.Protocol}`);
      console.log(`Port: ${listener.Port}`);
      
      if (listener.Protocol === 'HTTPS') {
        const certificates = listener.Certificates || [];
        console.log('Certificates:');
        
        for (const cert of certificates) {
          console.log(`- ARN: ${cert.CertificateArn}`);
          // Check if certificate is from ACM (ARN contains 'acm')
          const isAcmCert = cert.CertificateArn.includes('/acm/');
          console.log(`- ACM Certificate: ${isAcmCert}`);
          if (!isAcmCert) isCompliant = false;
        }
      }
    }

    console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    return isCompliant;
  } catch (error) {
    console.error('Error checking load balancer compliance:', error);
    throw error;
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'LISTENER':
          await elbv2Client.send(
            new DeleteListenerCommand({
              ListenerArn: resource.arn
            })
          );
          console.log(`Deleted listener: ${resource.arn}`);
          break;

        case 'LOAD_BALANCER':
          await elbv2Client.send(
            new DeleteLoadBalancerCommand({
              LoadBalancerArn: resource.arn
            })
          );
          console.log(`Deleted load balancer: ${resource.name}`);
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting load balancer certificate check...');
    
    // Create non-compliant load balancer
    console.log('\nCreating non-compliant load balancer...');
    const lbArn = await createNonCompliantLoadBalancer();
    
    // Check configuration
    await checkLoadBalancerCompliance(lbArn);
    
    // Wait before cleanup
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
