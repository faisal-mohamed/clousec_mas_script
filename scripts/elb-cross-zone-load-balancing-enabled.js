const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    CreateTargetGroupCommand,
    ModifyTargetGroupAttributesCommand,
    DescribeLoadBalancersCommand
  } = require("@aws-sdk/client-elastic-load-balancing-v2");
  
  const {
    EC2Client,
    DescribeSubnetsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand
  } = require("@aws-sdk/client-ec2");

  require('dotenv').config();
  
  // Initialize clients
  const elbv2Client = new ElasticLoadBalancingV2Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
  });
  
  const ec2Client = new EC2Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
  });
  
  async function getSubnetsWithEnoughIPs(vpcId) {
    try {
      console.log(`Finding subnets in VPC: ${vpcId}`);
      
      const response = await ec2Client.send(
        new DescribeSubnetsCommand({
          Filters: [
            { Name: 'vpc-id', Values: [vpcId] }
          ]
        })
      );
  
      if (!response.Subnets || response.Subnets.length === 0) {
        throw new Error(`No subnets found in VPC ${vpcId}`);
      }
  
      // Log all subnets and their available IPs
      console.log('\nAll available subnets:');
      response.Subnets.forEach(subnet => {
        console.log(`- Subnet ID: ${subnet.SubnetId}`);
        console.log(`  AZ: ${subnet.AvailabilityZone}`);
        console.log(`  Available IPs: ${subnet.AvailableIpAddressCount}`);
        console.log(`  CIDR Block: ${subnet.CidrBlock}`);
      });
  
      // Filter subnets with at least 8 available IPs
      const suitableSubnets = response.Subnets.filter(
        subnet => subnet.AvailableIpAddressCount >= 8
      );
  
      console.log('\nSuitable subnets (with 8+ available IPs):');
      suitableSubnets.forEach(subnet => {
        console.log(`- ${subnet.SubnetId} (${subnet.AvailabilityZone}): ${subnet.AvailableIpAddressCount} IPs available`);
      });
  
      // Group suitable subnets by AZ
      const subnetsByAZ = suitableSubnets.reduce((acc, subnet) => {
        const az = subnet.AvailabilityZone;
        if (!acc[az]) {
          acc[az] = [];
        }
        acc[az].push(subnet);
        return acc;
      }, {});
  
      const availableAZs = Object.keys(subnetsByAZ);
      if (availableAZs.length < 2) {
        throw new Error(
          `Need subnets with 8+ available IPs in at least 2 AZs. ` +
          `Found only ${availableAZs.length} AZ(s) with suitable subnets.`
        );
      }
  
      // Select one subnet from each of the first two AZs
      const selectedSubnets = [
        subnetsByAZ[availableAZs[0]][0],
        subnetsByAZ[availableAZs[1]][0]
      ];
  
      console.log('\nSelected subnets for ELB:');
      selectedSubnets.forEach(subnet => {
        console.log(`- ${subnet.SubnetId} (${subnet.AvailabilityZone}): ${subnet.AvailableIpAddressCount} IPs available`);
      });
  
      return selectedSubnets.map(s => s.SubnetId);
    } catch (error) {
      console.error('Error getting subnets:', error);
      throw error;
    }
  }
  
  async function createSecurityGroup(vpcId) {
    try {
      const groupName = `elb-sg-${Date.now()}`;
      
      const createSgResponse = await ec2Client.send(
        new CreateSecurityGroupCommand({
          GroupName: groupName,
          Description: 'Security group for ELB',
          VpcId: vpcId,
          TagSpecifications: [{
            ResourceType: 'security-group',
            Tags: [{
              Key: 'simulation-mas',
              Value: 'true'
            }]
          }]
        })
      );
  
      const securityGroupId = createSgResponse.GroupId;
  
      await ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
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
  
      console.log(`Created security group: ${securityGroupId}`);
      return securityGroupId;
    } catch (error) {
      console.error('Error creating security group:', error);
      throw error;
    }
  }
  
  async function createLoadBalancer(vpcId) {
    try {
      const subnetIds = await getSubnetsWithEnoughIPs(vpcId);
      const securityGroupId = await createSecurityGroup(vpcId);
  
      // Create target group
      const targetGroupResponse = await elbv2Client.send(
        new CreateTargetGroupCommand({
          Name: `tg-${Date.now()}`.substring(0, 32),
          Protocol: 'HTTP',
          Port: 80,
          VpcId: vpcId,
          TargetType: 'instance',
          Tags: [{
            Key: 'simulation-mas',
            Value: 'true'
          }]
        })
      );
  
      const targetGroupArn = targetGroupResponse.TargetGroups[0].TargetGroupArn;
  
      // Disable cross-zone load balancing
      await elbv2Client.send(
        new ModifyTargetGroupAttributesCommand({
          TargetGroupArn: targetGroupArn,
          Attributes: [
            {
              Key: 'load_balancing.cross_zone.enabled',
              Value: 'false'
            }
          ]
        })
      );
  
      console.log('Created target group with cross-zone load balancing disabled');
  
      // Create load balancer
      const createLbResponse = await elbv2Client.send(
        new CreateLoadBalancerCommand({
          Name: `elb-${Date.now()}`.substring(0, 32),
          Subnets: subnetIds,
          SecurityGroups: [securityGroupId],
          Scheme: 'internet-facing',
          Type: 'application',
          IpAddressType: 'ipv4',
          Tags: [{
            Key: 'simulation-mas',
            Value: 'true'
          }]
        })
      );
  
      const loadBalancer = createLbResponse.LoadBalancers[0];
      console.log('\nLoad Balancer creation initiated:');
      console.log('------------------------');
      console.log(`ARN: ${loadBalancer.LoadBalancerArn}`);
      console.log(`DNS Name: ${loadBalancer.DNSName}`);
      console.log(`Security Group: ${securityGroupId}`);
      console.log(`Target Group: ${targetGroupArn}`);
      console.log('Cross-zone load balancing: Disabled');
      console.log('------------------------');
  
      // Wait for the load balancer to be active
      console.log('\nWaiting for load balancer to become active...');
      await waitForLoadBalancerActive(loadBalancer.LoadBalancerArn);
  
      return {
        loadBalancerArn: loadBalancer.LoadBalancerArn,
        targetGroupArn,
        dnsName: loadBalancer.DNSName
      };
    } catch (error) {
      console.error('Error creating load balancer:', error);
      throw error;
    }
  }
  
  async function waitForLoadBalancerActive(loadBalancerArn) {
    while (true) {
      try {
        const response = await elbv2Client.send(
          new DescribeLoadBalancersCommand({
            LoadBalancerArns: [loadBalancerArn]
          })
        );
  
        const state = response.LoadBalancers[0].State.Code;
        console.log(`Current state: ${state}`);
        
        if (state === 'active') {
          console.log('Load balancer is now active!');
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
      const vpcId = process.env.VPC_ID;
      if (!vpcId) {
        throw new Error('VPC_ID environment variable is required');
      }
  
      console.log('Creating load balancer with minimal configuration...');
      const result = await createLoadBalancer(vpcId);
      
      console.log('\nLoad Balancer created successfully!');
      console.log('------------------------');
      console.log(`DNS Name: ${result.dnsName}`);
      console.log(`Load Balancer ARN: ${result.loadBalancerArn}`);
      console.log(`Target Group ARN: ${result.targetGroupArn}`);
      console.log('------------------------');
  
    } catch (error) {
      console.error('Error in main execution:', error);
      process.exit(1);
    }
  }
  
  if (require.main === module) {
    main();
  }
  
  module.exports = {
    createLoadBalancer
  };
  