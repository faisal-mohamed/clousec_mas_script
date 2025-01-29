const { EMRClient, RunJobFlowCommand } = require("@aws-sdk/client-emr");
const { EC2Client, DescribeSubnetsCommand } = require("@aws-sdk/client-ec2");

require('dotenv').config();



async function getSubnetsFromVpc(ec2Client, vpcId) {
    try {
        const command = new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [vpcId]
                }
            ]
        });

        const response = await ec2Client.send(command);
        
        if (!response.Subnets || response.Subnets.length === 0) {
            throw new Error(`No subnets found in VPC ${vpcId}`);
        }

        // Get the first available subnet
        const subnet = response.Subnets[0];
        console.log(`Using subnet: ${subnet.SubnetId} from VPC ${vpcId}`);
        return subnet.SubnetId;

    } catch (error) {
        console.error("Error getting subnets:", error);
        throw error;
    }
}

async function createEMRCluster() {
    const credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    };

    const region = process.env.AWS_REGION;
    const vpcId = process.env.VPC_ID;
    
    if (!region) {
        throw new Error("AWS_REGION environment variable is not set");
    }

    if (!vpcId) {
        throw new Error("VPC_ID environment variable is not set");
    }

    // Initialize EMR and EC2 clients
    const emrClient = new EMRClient({ region, credentials });
    const ec2Client = new EC2Client({ region, credentials });

    try {
        // Get subnet ID from VPC
        const subnetId = await getSubnetsFromVpc(ec2Client, vpcId);

        const params = {
            Name: "EMR-Cluster-" + Date.now(),
            ReleaseLabel: "emr-6.10.0",
            Applications: [
                { Name: "Hadoop" },
                { Name: "Spark" },
                { Name: "Hive" },
                { Name: "Pig" }
            ],
            ServiceRole: "EMR_DefaultRole",
            JobFlowRole: "EMR_EC2_DefaultRole",
            VisibleToAllUsers: true,
            LogUri: "s3://aws-logs-" + Date.now() + "-" + region + "/elasticmapreduce/",
            Instances: {
                InstanceGroups: [
                    {
                        Name: "Primary node",
                        Market: "ON_DEMAND",
                        InstanceRole: "MASTER",
                        InstanceType: "m5.xlarge",
                        InstanceCount: 1
                    },
                    {
                        Name: "Core nodes",
                        Market: "ON_DEMAND",
                        InstanceRole: "CORE",
                        InstanceType: "m5.xlarge",
                        InstanceCount: 2
                    }
                ],
                KeepJobFlowAliveWhenNoSteps: true,
                TerminationProtected: false,
                Ec2SubnetId: subnetId
            },
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                },
                {
                    Key: "Name",
                    Value: "EMR-Cluster"
                }
            ],
            Configurations: [
                {
                    Classification: "spark-defaults",
                    Properties: {
                        "spark.driver.memory": "2g",
                        "spark.executor.memory": "2g",
                        "spark.executor.cores": "2"
                    }
                },
                {
                    Classification: "yarn-site",
                    Properties: {
                        "yarn.nodemanager.vmem-check-enabled": "false",
                        "yarn.nodemanager.pmem-check-enabled": "false"
                    }
                }
            ],
            ScaleDownBehavior: "TERMINATE_AT_TASK_COMPLETION",
            EbsRootVolumeSize: 32,
            CustomAmiId: process.env.CUSTOM_AMI_ID,
            SecurityConfiguration: process.env.SECURITY_CONFIGURATION
        };

        // Create the EMR cluster
        console.log("Creating EMR cluster...");
        const command = new RunJobFlowCommand(params);
        const response = await emrClient.send(command);
        
        console.log("EMR cluster creation initiated. Cluster ID:", response.JobFlowId);
        return response;

    } catch (error) {
        console.error("Error creating EMR cluster:", error);
        throw error;
    }
}

async function main() {
    try {
        // Validate required environment variables
        const requiredEnvVars = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'VPC_ID'];
        const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
        
        if (missingEnvVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
        }

        // Create EMR cluster
        const result = await createEMRCluster();
        console.log("Cluster creation result:", result);
    } catch (error) {
        console.error("Error in main:", error);
        process.exit(1);
    }
}

// Execute the script
main();
