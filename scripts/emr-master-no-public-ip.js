const {
    EMRClient,
    RunJobFlowCommand
} = require("@aws-sdk/client-emr");

const {
    EC2Client,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
};

const region = process.env.AWS_REGION || 'us-east-1';
const emrClient = new EMRClient({ credentials, region });
const ec2Client = new EC2Client({ credentials, region });

const CONFIG = {
    CLUSTER_NAME: `test-emr-${Date.now()}`,
    SERVICE_ROLE: 'EMR_DefaultRole',
    EC2_ROLE: 'EMR_EC2_DefaultRole',
    VPC_ID: process.env.VPC_ID
};

async function getPublicSubnet() {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [CONFIG.VPC_ID]
                }
            ]
        }));

        if (!response.Subnets || response.Subnets.length === 0) {
            throw new Error(`No subnets found in VPC ${CONFIG.VPC_ID}`);
        }

        // Get first available subnet
        return response.Subnets[0].SubnetId;
    } catch (error) {
        console.error('Error getting subnets:', error);
        throw error;
    }
}

async function createEMRCluster() {
    try {
        const subnetId = await getPublicSubnet();
        console.log(`Selected subnet ID: ${subnetId}`);

        const response = await emrClient.send(new RunJobFlowCommand({
            Name: CONFIG.CLUSTER_NAME,
            ReleaseLabel: 'emr-6.10.0',
            ServiceRole: CONFIG.SERVICE_ROLE,
            JobFlowRole: CONFIG.EC2_ROLE,
            VisibleToAllUsers: true,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ],
            Instances: {
                Ec2SubnetId: subnetId,
                InstanceGroups: [
                    {
                        Name: 'Primary',
                        Market: 'ON_DEMAND', // Using ON_DEMAND for testing reliability
                        InstanceRole: 'MASTER',
                        InstanceType: 'm5.xlarge',
                        InstanceCount: 1
                    }
                ],
                KeepJobFlowAliveWhenNoSteps: true,
                TerminationProtected: false
            },
            Applications: [
                { Name: 'Spark' }
            ],
            Configurations: [
                {
                    Classification: "spark-defaults",
                    Properties: {
                        "spark.dynamicAllocation.enabled": "true",
                        "spark.shuffle.service.enabled": "true"
                    }
                }
            ],
            AutoTerminationPolicy: {
                IdleTimeout: 3600 // 1 hour idle timeout
            }
        }));

        console.log('Created EMR cluster:', response.JobFlowId);
        return response.JobFlowId;
    } catch (error) {
        console.error('Error creating EMR cluster:', {
            message: error.message,
            code: error.code,
            requestId: error.$metadata?.requestId
        });
        throw error;
    }
}

// Execute the cluster creation
createEMRCluster()
    .then(clusterId => {
        console.log('Successfully created test EMR cluster. ID:', clusterId);
    })
    .catch(error => {
        console.error('Failed to create cluster:', error.message);
        process.exit(1);
    });
