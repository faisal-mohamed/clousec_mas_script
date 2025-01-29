const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    CreateListenerCommand,
    CreateTargetGroupCommand,
  } = require("@aws-sdk/client-elastic-load-balancing-v2");
  
  const {
    EC2Client,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
  } = require("@aws-sdk/client-ec2");
  
  require("dotenv").config();
  
  // Configuration
  const CONFIG = {
    ALB: {
      NAME: "http-only-alb" + Date.now(),
      HTTP_PORT: 80,
    },
    TARGET_GROUP: {
      NAME: "http-only-tg" + Date.now(),
      PORT: 80,
    },
    SECURITY_GROUP: {
      NAME: "http-only-alb-sg" + Date.now(),
      DESCRIPTION: "Security group for HTTP-only ALB",
    },
    TAGS: [
      {
        Key: "simulation-mas",
        Value: "true",
      },
    ],
  };
  
  // Create AWS client with credentials from environment variables
  const createAwsClient = (ClientClass) => {
    if (
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY ||
      !process.env.AWS_SESSION_TOKEN
    ) {
      throw new Error(
        "AWS credentials are not properly set in environment variables"
      );
    }
  
    return new ClientClass({
      region: process.env.AWS_REGION || "us-east-1", // Provide default region if not set
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    });
  };
  
  async function createHttpOnlyALB() {
    // Validate environment variables
    if (!process.env.VPC_ID) {
      throw new Error("VPC_ID environment variable is not set");
    }
    if (!process.env.SUBNET_IDS) {
      throw new Error("SUBNET_IDS environment variable is not set");
    }
  
    const elbv2Client = createAwsClient(ElasticLoadBalancingV2Client);
    const ec2Client = createAwsClient(EC2Client);
  
    try {
      // Create security group
      const createSgResponse = await ec2Client.send(
        new CreateSecurityGroupCommand({
          GroupName: CONFIG.SECURITY_GROUP.NAME,
          Description: CONFIG.SECURITY_GROUP.DESCRIPTION,
          VpcId: process.env.VPC_ID,
          TagSpecifications: [
            {
              ResourceType: "security-group",
              Tags: CONFIG.TAGS,
            },
          ],
        })
      );
  
      const securityGroupId = createSgResponse.GroupId;
  
      // Add HTTP inbound rule
      await ec2Client.send(
        new AuthorizeSecurityGroupIngressCommand({
          GroupId: securityGroupId,
          IpPermissions: [
            {
              IpProtocol: "tcp",
              FromPort: CONFIG.ALB.HTTP_PORT,
              ToPort: CONFIG.ALB.HTTP_PORT,
              IpRanges: [{ CidrIp: "0.0.0.0/0" }],
            },
          ],
        })
      );
  
      // Create target group
      const createTgResponse = await elbv2Client.send(
        new CreateTargetGroupCommand({
          Name: CONFIG.TARGET_GROUP.NAME,
          Protocol: "HTTP",
          Port: CONFIG.TARGET_GROUP.PORT,
          VpcId: process.env.VPC_ID,
          TargetType: "ip",
          Tags: CONFIG.TAGS,
        })
      );
  
      const targetGroupArn = createTgResponse.TargetGroups[0].TargetGroupArn;
  
      // Create ALB
      const createAlbResponse = await elbv2Client.send(
        new CreateLoadBalancerCommand({
          Name: CONFIG.ALB.NAME,
          Subnets: process.env.SUBNET_IDS.split(","),
          SecurityGroups: [securityGroupId],
          Scheme: "internet-facing",
          Type: "application",
          IpAddressType: "ipv4",
          Tags: CONFIG.TAGS,
        })
      );
  
      const loadBalancerArn = createAlbResponse.LoadBalancers[0].LoadBalancerArn;
  
      // Create HTTP listener
      await elbv2Client.send(
        new CreateListenerCommand({
          LoadBalancerArn: loadBalancerArn,
          Protocol: "HTTP",
          Port: CONFIG.ALB.HTTP_PORT,
          DefaultActions: [
            {
              Type: "forward",
              TargetGroupArn: targetGroupArn,
            },
          ],
          Tags: CONFIG.TAGS,
        })
      );
  
      console.log("HTTP-only ALB created successfully:");
      console.log(`Load Balancer ARN: ${loadBalancerArn}`);
      console.log(`Target Group ARN: ${targetGroupArn}`);
      console.log(`Security Group ID: ${securityGroupId}`);
  
      return {
        loadBalancerArn,
        targetGroupArn,
        securityGroupId,
      };
    } catch (error) {
      console.error("Error creating HTTP-only ALB:", error);
      throw error;
    }
  }
  
  // Execute if running directly
  if (require.main === module) {
    createHttpOnlyALB().catch((error) => {
      console.error("Script execution failed:", error.message);
      process.exit(1);
    });
  }
  
  module.exports = {
    createHttpOnlyALB,
  };
  