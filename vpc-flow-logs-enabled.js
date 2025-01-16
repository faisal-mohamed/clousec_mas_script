// const {
//     EC2Client,
//     CreateVpcCommand,
//     DeleteVpcCommand,
//     CreateFlowLogsCommand,
//     DescribeFlowLogsCommand,
//     DeleteFlowLogsCommand,
//     CreateTagsCommand,
//     DescribeVpcsCommand
// } = require("@aws-sdk/client-ec2");

// const {
//     IAMClient,
//     CreateRoleCommand,
//     PutRolePolicyCommand,
//     DeleteRoleCommand,
//     DeleteRolePolicyCommand
// } = require("@aws-sdk/client-iam");

// require('dotenv').config();

// // Initialize AWS clients
// const getClient = (ClientClass) => {
//     try {
//         const credentials = {
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             sessionToken: process.env.AWS_SESSION_TOKEN
//         };

//         const config = {
//             credentials: credentials,
//             region: process.env.AWS_REGION || 'ap-southeast-1'
//         };

//         return new ClientClass(config);
//     } catch (error) {
//         console.error('Error initializing AWS client:', error);
//         throw error;
//     }
// };

// // Create IAM role for VPC Flow Logs
// const createFlowLogsRole = async () => {
//     const iamClient = getClient(IAMClient);
//     const roleName = `vpc-flow-logs-role-${Date.now()}`;

//     try {
//         console.log('Creating IAM role for VPC Flow Logs...');

//         // Create role
//         const assumeRolePolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Effect: 'Allow',
//                     Principal: {
//                         Service: 'vpc-flow-logs.amazonaws.com'
//                     },
//                     Action: 'sts:AssumeRole'
//                 }
//             ]
//         };

//         const createRoleResponse = await iamClient.send(
//             new CreateRoleCommand({
//                 RoleName: roleName,
//                 AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
//             })
//         );

//         // Create role policy
//         const rolePolicy = {
//             Version: '2012-10-17',
//             Statement: [
//                 {
//                     Effect: 'Allow',
//                     Action: [
//                         'logs:CreateLogGroup',
//                         'logs:CreateLogStream',
//                         'logs:PutLogEvents',
//                         'logs:DescribeLogGroups',
//                         'logs:DescribeLogStreams'
//                     ],
//                     Resource: '*'
//                 }
//             ]
//         };

//         await iamClient.send(
//             new PutRolePolicyCommand({
//                 RoleName: roleName,
//                 PolicyName: 'vpc-flow-logs-policy',
//                 PolicyDocument: JSON.stringify(rolePolicy)
//             })
//         );

//         // Wait for role to be available
//         await new Promise(resolve => setTimeout(resolve, 10000));

//         console.log('IAM role created successfully');
//         return { roleName, roleArn: createRoleResponse.Role.Arn };
//     } catch (error) {
//         console.error('Error creating IAM role:', error);
//         throw error;
//     }
// };

// // Create non-compliant VPC (without flow logs)
// const createNonCompliantVpc = async () => {
//     const ec2Client = getClient(EC2Client);

//     try {
//         console.log('Creating VPC...');
//         const createVpcResponse = await ec2Client.send(
//             new CreateVpcCommand({
//                 CidrBlock: '10.0.0.0/16',
//                 TagSpecifications: [
//                     {
//                         ResourceType: 'vpc',
//                         Tags: [
//                             {
//                                 Key: 'Name',
//                                 Value: `non-compliant-vpc-${Date.now()}`
//                             }
//                         ]
//                     }
//                 ]
//             })
//         );

//         const vpcId = createVpcResponse.Vpc.VpcId;
//         console.log(`VPC created successfully: ${vpcId}`);

//         // Wait for VPC to be available
//         await waitForVpcAvailable(vpcId);

//         return vpcId;
//     } catch (error) {
//         console.error('Error creating VPC:', error);
//         throw error;
//     }
// };

// // Wait for VPC to be available
// const waitForVpcAvailable = async (vpcId) => {
//     const ec2Client = getClient(EC2Client);
//     console.log(`Waiting for VPC ${vpcId} to be available...`);

//     while (true) {
//         try {
//             const response = await ec2Client.send(
//                 new DescribeVpcsCommand({
//                     VpcIds: [vpcId]
//                 })
//             );

//             const state = response.Vpcs[0].State;
//             console.log(`Current VPC state: ${state}`);

//             if (state === 'available') {
//                 break;
//             }

//             await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5 seconds
//         } catch (error) {
//             console.error('Error checking VPC state:', error);
//             throw error;
//         }
//     }
// };

// // Check flow logs status
// const checkFlowLogsStatus = async (vpcId) => {
//     const ec2Client = getClient(EC2Client);

//     try {
//         const response = await ec2Client.send(
//             new DescribeFlowLogsCommand({
//                 Filter: [
//                     {
//                         Name: 'resource-id',
//                         Values: [vpcId]
//                     }
//                 ]
//             })
//         );

//         return response.FlowLogs.length > 0;
//     } catch (error) {
//         console.error('Error checking flow logs status:', error);
//         throw error;
//     }
// };

// // Make VPC compliant by enabling flow logs
// const makeCompliant = async (vpcId, roleArn) => {
//     const ec2Client = getClient(EC2Client);

//     try {
//         console.log('Enabling VPC Flow Logs...');
//         await ec2Client.send(
//             new CreateFlowLogsCommand({
//                 ResourceIds: [vpcId],
//                 ResourceType: 'VPC',
//                 TrafficType: 'ALL',
//                 LogDestinationType: 'cloud-watch-logs',
//                 LogGroupName: `/aws/vpc/flow-logs/${vpcId}`,
//                 DeliverLogsPermissionArn: roleArn
//             })
//         );

//         console.log('VPC Flow Logs enabled successfully');
//     } catch (error) {
//         console.error('Error enabling flow logs:', error);
//         throw error;
//     }
// };

// // Cleanup resources
// const cleanup = async (resources) => {
//     const ec2Client = getClient(EC2Client);
//     const iamClient = getClient(IAMClient);

//     try {
//         console.log('\nStarting cleanup...');

//         // Delete flow logs if they exist
//         if (resources.vpcId) {
//             const flowLogs = await ec2Client.send(
//                 new DescribeFlowLogsCommand({
//                     Filter: [
//                         {
//                             Name: 'resource-id',
//                             Values: [resources.vpcId]
//                         }
//                     ]
//                 })
//             );

//             for (const flowLog of flowLogs.FlowLogs) {
//                 await ec2Client.send(
//                     new DeleteFlowLogsCommand({
//                         FlowLogIds: [flowLog.FlowLogId]
//                     })
//                 );
//             }
//         }

//         // Delete VPC
//         if (resources.vpcId) {
//             console.log('Deleting VPC...');
//             await ec2Client.send(
//                 new DeleteVpcCommand({
//                     VpcId: resources.vpcId
//                 })
//             );
//         }

//         // Delete IAM role
//         if (resources.roleName) {
//             console.log('Cleaning up IAM role...');
//             await iamClient.send(
//                 new DeleteRolePolicyCommand({
//                     RoleName: resources.roleName,
//                     PolicyName: 'vpc-flow-logs-policy'
//                 })
//             );

//             await iamClient.send(
//                 new DeleteRoleCommand({
//                     RoleName: resources.roleName
//                 })
//             );
//         }

//         console.log('Cleanup completed successfully');
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// };

// // Main function
// const main = async () => {
//     const resources = {};

//     try {
//         // Validate required environment variables
//         const requiredEnvVars = [
//             'AWS_ACCESS_KEY_ID',
//             'AWS_SECRET_ACCESS_KEY',
//             'AWS_SESSION_TOKEN'
//         ];

//         const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
//         if (missingVars.length > 0) {
//             throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
//         }

//         // Create IAM role
//         const { roleName, roleArn } = await createFlowLogsRole();
//         resources.roleName = roleName;

//         // Create non-compliant VPC
//         const vpcId = await createNonCompliantVpc();
//         resources.vpcId = vpcId;

//         // Check initial flow logs status
//         const hasFlowLogs = await checkFlowLogsStatus(vpcId);
//         console.log(`Initial flow logs status: ${hasFlowLogs ? 'Enabled' : 'Disabled'}`);

//         // Wait to observe the non-compliant state
//         console.log('\nWaiting 60 seconds to observe non-compliant state...');
//         console.log('VPC created without flow logs enabled.');
//         console.log('To be compliant, the VPC should have:');
//         console.log('1. Flow logs enabled');
//         console.log('2. Proper IAM role configured');
//         console.log('3. Log destination configured (CloudWatch Logs)');
//         await new Promise(resolve => setTimeout(resolve, 60000));

//         // Optional: Make the VPC compliant
//         // await makeCompliant(vpcId, roleArn);
//         // console.log('\nWaiting 60 seconds to observe compliant state...');
//         // const finalStatus = await checkFlowLogsStatus(vpcId);
//         // console.log(`Final flow logs status: ${finalStatus ? 'Enabled' : 'Disabled'}`);
//         // await new Promise(resolve => setTimeout(resolve, 60000));

//     } catch (error) {
//         console.error('Fatal error:', error);
//     } finally {
//         // Cleanup
//         try {
//             await cleanup(resources);
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// };

// // Run the program
// if (require.main === module) {
//     main().catch(error => {
//         console.error('Unhandled error:', error);
//         process.exit(1);
//     });
// }


const {
    EC2Client,
    CreateVpcCommand,
    DeleteVpcCommand,
    CreateFlowLogsCommand,
    DeleteFlowLogsCommand,
    DescribeFlowLogsCommand,
    DescribeVpcsCommand,
    CreateTagsCommand
} = require("@aws-sdk/client-ec2");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand
} = require("@aws-sdk/client-iam");

const {
    CloudWatchLogsClient,
    CreateLogGroupCommand,
    DeleteLogGroupCommand,
    PutRetentionPolicyCommand
} = require("@aws-sdk/client-cloudwatch-logs");

require('dotenv').config();

// Initialize clients
const ec2Client = new EC2Client({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });
const logsClient = new CloudWatchLogsClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    VPC_CIDR: '10.0.0.0/16',
    LOG_GROUP_NAME: `/aws/vpc/flow-logs-test-${Date.now()}`,
    ROLE_NAME: `vpc-flow-logs-role-${Date.now()}`
};

// Function to create IAM role for VPC Flow Logs
async function createFlowLogsRole() {
    try {
        // Create role
        const createRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'vpc-flow-logs.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Create role policy
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.ROLE_NAME,
            PolicyName: 'vpc-flow-logs-policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        'logs:CreateLogGroup',
                        'logs:CreateLogStream',
                        'logs:PutLogEvents',
                        'logs:DescribeLogGroups',
                        'logs:DescribeLogStreams'
                    ],
                    Resource: '*'
                }]
            })
        }));

        // Wait for role propagation
        await new Promise(resolve => setTimeout(resolve, 10000));

        return createRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error);
        throw error;
    }
}

// Function to create CloudWatch log group
async function createLogGroup() {
    try {
        await logsClient.send(new CreateLogGroupCommand({
            logGroupName: CONFIG.LOG_GROUP_NAME
        }));

        await logsClient.send(new PutRetentionPolicyCommand({
            logGroupName: CONFIG.LOG_GROUP_NAME,
            retentionInDays: 7
        }));

        console.log('Created CloudWatch log group');
    } catch (error) {
        console.error('Error creating log group:', error);
        throw error;
    }
}

// Function to create non-compliant VPC (without flow logs)
async function createNonCompliantVpc() {
    try {
        const response = await ec2Client.send(new CreateVpcCommand({
            CidrBlock: CONFIG.VPC_CIDR,
            TagSpecifications: [{
                ResourceType: 'vpc',
                Tags: [{
                    Key: 'Name',
                    Value: 'Flow-Logs-Test-VPC'
                }]
            }]
        }));

        const vpcId = response.Vpc.VpcId;
        console.log('Created VPC:', vpcId);

        // Wait for VPC to be available
        await waitForVpcAvailable(vpcId);

        return vpcId;
    } catch (error) {
        console.error('Error creating VPC:', error);
        throw error;
    }
}

// Function to wait for VPC to be available
async function waitForVpcAvailable(vpcId) {
    try {
        let state;
        do {
            const response = await ec2Client.send(new DescribeVpcsCommand({
                VpcIds: [vpcId]
            }));
            
            state = response.Vpcs[0].State;
            console.log('VPC state:', state);
            
            if (state === 'pending') {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } while (state === 'pending');

        return state === 'available';
    } catch (error) {
        console.error('Error waiting for VPC:', error);
        throw error;
    }
}

// Function to enable flow logs (make compliant)
async function enableFlowLogs(vpcId, roleArn) {
    try {
        const response = await ec2Client.send(new CreateFlowLogsCommand({
            ResourceIds: [vpcId],
            ResourceType: 'VPC',
            TrafficType: 'ALL',
            LogGroupName: CONFIG.LOG_GROUP_NAME,
            DeliverLogsPermissionArn: roleArn,
            LogFormat: '${version} ${account-id} ${interface-id} ${srcaddr} ${dstaddr} ${srcport} ${dstport} ${protocol} ${packets} ${bytes} ${start} ${end} ${action} ${log-status}',
            MaxAggregationInterval: 60,
            Tags: [{
                Key: 'Name',
                Value: 'Test-Flow-Logs'
            }]
        }));

        console.log('Enabled flow logs:', response.FlowLogIds[0]);
        return response.FlowLogIds[0];
    } catch (error) {
        console.error('Error enabling flow logs:', error);
        throw error;
    }
}

// Function to check flow logs status
async function checkFlowLogsStatus(vpcId) {
    try {
        const response = await ec2Client.send(new DescribeFlowLogsCommand({
            Filter: [{
                Name: 'resource-id',
                Values: [vpcId]
            }]
        }));

        if (response.FlowLogs.length > 0) {
            console.log('Flow logs status:', {
                FlowLogId: response.FlowLogs[0].FlowLogId,
                Status: response.FlowLogs[0].FlowLogStatus,
                LogGroupName: response.FlowLogs[0].LogGroupName
            });
        } else {
            console.log('No flow logs configured');
        }

        return response.FlowLogs;
    } catch (error) {
        console.error('Error checking flow logs status:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(vpcId, flowLogId) {
    try {
        // Delete flow logs
        if (flowLogId) {
            try {
                await ec2Client.send(new DeleteFlowLogsCommand({
                    FlowLogIds: [flowLogId]
                }));
                console.log('Deleted flow logs');
            } catch (error) {
                console.error('Error deleting flow logs:', error);
            }
        }

        // Delete VPC
        if (vpcId) {
            try {
                await ec2Client.send(new DeleteVpcCommand({
                    VpcId: vpcId
                }));
                console.log('Deleted VPC');
            } catch (error) {
                console.error('Error deleting VPC:', error);
            }
        }

        // Delete log group
        try {
            await logsClient.send(new DeleteLogGroupCommand({
                logGroupName: CONFIG.LOG_GROUP_NAME
            }));
            console.log('Deleted log group');
        } catch (error) {
            console.error('Error deleting log group:', error);
        }

        // Delete IAM role
        try {
            await iamClient.send(new DeleteRolePolicyCommand({
                RoleName: CONFIG.ROLE_NAME,
                PolicyName: 'vpc-flow-logs-policy'
            }));

            await iamClient.send(new DeleteRoleCommand({
                RoleName: CONFIG.ROLE_NAME
            }));
            console.log('Deleted IAM role');
        } catch (error) {
            console.error('Error deleting IAM role:', error);
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let vpcId = null;
    let flowLogId = null;
    let roleArn = null;

    try {
        console.log('Starting VPC Flow Logs compliance simulation...');

        // Create IAM role
        console.log('Creating IAM role...');
        roleArn = await createFlowLogsRole();

        // Create log group
        console.log('Creating CloudWatch log group...');
        await createLogGroup();

        // Create non-compliant VPC
        console.log('Creating non-compliant VPC (without flow logs)...');
        vpcId = await createNonCompliantVpc();

        // Check initial flow logs status
        console.log('\nChecking initial flow logs status (should be none)...');
        await checkFlowLogsStatus(vpcId);

        // Wait to simulate testing period
        console.log('\nWaiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Enable flow logs to make compliant
        console.log('\nEnabling flow logs to make VPC compliant...');
        flowLogId = await enableFlowLogs(vpcId, roleArn);

        // Wait for flow logs to be active
        console.log('Waiting for flow logs to be active...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Check final flow logs status
        console.log('\nChecking final flow logs status...');
        await checkFlowLogsStatus(vpcId);

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('\nCleaning up resources...');
        await cleanupResources(vpcId, flowLogId);
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
