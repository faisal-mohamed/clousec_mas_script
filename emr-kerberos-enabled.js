const {
    EMRClient,
    RunJobFlowCommand,
    TerminateJobFlowsCommand,
    DescribeClusterCommand,
    CreateSecurityConfigurationCommand,
    DeleteSecurityConfigurationCommand
} = require("@aws-sdk/client-emr");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand,
    GetRoleCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const emrClient = new EMRClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    CLUSTER_NAME: `test-cluster-${Date.now()}`,
    SECURITY_CONFIG_NAME: `test-security-config-${Date.now()}`,
    SERVICE_ROLE: 'EMR_DefaultRole',
    EC2_ROLE: 'EMR_EC2_DefaultRole',
    LOG_URI: `s3://aws-logs-${process.env.AWS_ACCOUNT_ID}-${process.env.AWS_REGION}/elasticmapreduce/`
};

// Function to ensure EMR roles exist
async function ensureEMRRoles() {
    try {
        // Check if roles exist
        try {
            await iamClient.send(new GetRoleCommand({ RoleName: CONFIG.SERVICE_ROLE }));
            await iamClient.send(new GetRoleCommand({ RoleName: CONFIG.EC2_ROLE }));
            console.log('EMR roles already exist');
            return;
        } catch (error) {
            console.log('Creating EMR roles...');
        }

        // Create service role
        await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.SERVICE_ROLE,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'elasticmapreduce.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Attach service role policy
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.SERVICE_ROLE,
            PolicyName: 'EMR_DefaultRole_Policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        'elasticmapreduce:*',
                        'iam:GetRole',
                        'iam:GetRolePolicy',
                        'iam:ListInstanceProfiles',
                        'iam:ListRolePolicies',
                        'iam:PassRole',
                        's3:*',
                        'sdb:*'
                    ],
                    Resource: '*'
                }]
            })
        }));

        // Create EC2 role
        await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.EC2_ROLE,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'ec2.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Attach EC2 role policy
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.EC2_ROLE,
            PolicyName: 'EMR_EC2_DefaultRole_Policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        's3:*',
                        'cloudwatch:*',
                        'dynamodb:*'
                    ],
                    Resource: '*'
                }]
            })
        }));

        console.log('Created EMR roles');

        // Wait for role propagation
        await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (error) {
        console.error('Error ensuring EMR roles:', error);
        throw error;
    }
}

// Function to create non-compliant cluster (without Kerberos)
async function createNonCompliantCluster() {
    try {
        const response = await emrClient.send(new RunJobFlowCommand({
            Name: CONFIG.CLUSTER_NAME,
            LogUri: CONFIG.LOG_URI,
            ReleaseLabel: 'emr-6.10.0',
            ServiceRole: CONFIG.SERVICE_ROLE,
            JobFlowRole: CONFIG.EC2_ROLE,
            VisibleToAllUsers: true,
            Instances: {
                InstanceGroups: [
                    {
                        Name: 'Primary',
                        Market: 'ON_DEMAND',
                        InstanceRole: 'MASTER',
                        InstanceType: 'm5.xlarge',
                        InstanceCount: 1
                    }
                ],
                KeepJobFlowAliveWhenNoSteps: true,
                TerminationProtected: false
            },
            Applications: [
                { Name: 'Hadoop' }
            ]
        }));

        console.log('Created EMR cluster:', response.JobFlowId);
        return response.JobFlowId;
    } catch (error) {
        console.error('Error creating cluster:', error);
        throw error;
    }
}

// Function to create compliant security configuration
async function createSecurityConfiguration() {
    try {
        await emrClient.send(new CreateSecurityConfigurationCommand({
            Name: CONFIG.SECURITY_CONFIG_NAME,
            SecurityConfiguration: JSON.stringify({
                AuthenticationConfiguration: {
                    KerberosConfiguration: {
                        Provider: 'ClusterDedicatedKdc',
                        ClusterDedicatedKdcConfiguration: {
                            TicketLifetimeInHours: 24,
                            CrossRealmTrustConfiguration: {
                                Realm: 'AD.DOMAIN.COM',
                                Domain: 'ad.domain.com',
                                AdminServer: 'ad.domain.com',
                                KdcServer: 'ad.domain.com'
                            }
                        }
                    }
                }
            })
        }));

        console.log('Created security configuration');
        return CONFIG.SECURITY_CONFIG_NAME;
    } catch (error) {
        console.error('Error creating security configuration:', error);
        throw error;
    }
}

// Function to wait for cluster state
async function waitForClusterState(clusterId, targetState) {
    try {
        let state;
        do {
            const response = await emrClient.send(new DescribeClusterCommand({
                ClusterId: clusterId
            }));
            
            state = response.Cluster.Status.State;
            console.log('Cluster state:', state);
            
            if (state !== targetState) {
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        } while (state !== targetState && state !== 'TERMINATED' && state !== 'TERMINATED_WITH_ERRORS');

        return state === targetState;
    } catch (error) {
        console.error('Error checking cluster state:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(clusterId) {
    try {
        // Terminate EMR cluster
        if (clusterId) {
            try {
                await emrClient.send(new TerminateJobFlowsCommand({
                    JobFlowIds: [clusterId]
                }));
                console.log('Terminated EMR cluster');

                // Wait for cluster termination
                await waitForClusterState(clusterId, 'TERMINATED');
            } catch (error) {
                console.error('Error terminating cluster:', error);
            }
        }

        // Delete security configuration
        try {
            await emrClient.send(new DeleteSecurityConfigurationCommand({
                Name: CONFIG.SECURITY_CONFIG_NAME
            }));
            console.log('Deleted security configuration');
        } catch (error) {
            console.error('Error deleting security configuration:', error);
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let clusterId = null;

    try {
        console.log('Starting EMR Kerberos compliance simulation...');

        // Ensure EMR roles exist
        console.log('Ensuring EMR roles exist...');
        await ensureEMRRoles();

        // Create non-compliant cluster
        console.log('Creating non-compliant cluster (without Kerberos)...');
        clusterId = await createNonCompliantCluster();

        // Wait for cluster to be ready
        console.log('Waiting for cluster to be ready...');
        await waitForClusterState(clusterId, 'WAITING');

        // Show non-compliant state
        console.log('\nCluster is now active in non-compliant state (no Kerberos)');
        
        // Create compliant security configuration
        console.log('\nCreating compliant security configuration with Kerberos...');
        await createSecurityConfiguration();

        // Note: We can't modify an existing cluster's security configuration
        console.log('\nNote: To make a cluster Kerberos-compliant, you need to create a new cluster with the security configuration');

        // Wait for testing period
        console.log('Waiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('\nCleaning up resources...');
        await cleanupResources(clusterId);
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
