// const { 
//     RedshiftClient, 
//     CreateClusterCommand,
//     DeleteClusterCommand,
//     DescribeClustersCommand,
//     ModifyClusterCommand,
//     DescribeLoggingStatusCommand,
//     DisableLoggingCommand
// } = require("@aws-sdk/client-redshift");

// const { 
//     IAMClient,
//     CreateRoleCommand,
//     PutRolePolicyCommand,
//     DeleteRoleCommand,
//     DeleteRolePolicyCommand
// } = require("@aws-sdk/client-iam");

// const {
//     S3Client,
//     CreateBucketCommand,
//     PutBucketPolicyCommand,
//     DeleteBucketCommand,
//     DeleteObjectsCommand,
//     ListObjectsV2Command
// } = require("@aws-sdk/client-s3");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN,
//     region: process.env.AWS_REGION || 'ap-southeast-1'
// };

// // Initialize clients
// const redshiftClient = new RedshiftClient(credentials);
// const iamClient = new IAMClient(credentials);
// const s3Client = new S3Client(credentials);

// // Configuration
// const config = {
//     clusterIdentifier: 'test-non-compliant-cluster',
//     databaseName: 'testdb',
//     masterUsername: 'testadmin',
//     masterPassword: 'TestPassword123!',
//     nodeType: 'dc2.large',
//     numberOfNodes: 2,
//     bucketName: `redshift-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`,
//     iamRoleName: `RedshiftLoggingRole2${Date.now()}`,
//     createdResources: false
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function setupIAMRole() {
//     try {
//         console.log('Setting up IAM role for Redshift...');

//         // Create IAM role
//         const createRoleCommand = new CreateRoleCommand({
//             RoleName: config.iamRoleName,
//             AssumeRolePolicyDocument: JSON.stringify({
//                 Version: '2012-10-17',
//                 Statement: [{
//                     Effect: 'Allow',
//                     Principal: {
//                         Service: 'redshift.amazonaws.com'
//                     },
//                     Action: 'sts:AssumeRole'
//                 }]
//             })
//         });

//         const roleResponse = await iamClient.send(createRoleCommand);
//         config.roleArn = roleResponse.Role.Arn;

//         // Add policy to role
//         const putPolicyCommand = new PutRolePolicyCommand({
//             RoleName: config.iamRoleName,
//             PolicyName: 'RedshiftLoggingPolicy',
//             PolicyDocument: JSON.stringify({
//                 Version: '2012-10-17',
//                 Statement: [{
//                     Effect: 'Allow',
//                     Action: [
//                         's3:PutObject',
//                         's3:GetBucketAcl'
//                     ],
//                     Resource: [
//                         `arn:aws:s3:::${config.bucketName}`,
//                         `arn:aws:s3:::${config.bucketName}/*`
//                     ]
//                 }]
//             })
//         });

//         await iamClient.send(putPolicyCommand);
//         console.log('Created IAM role and policy');

//         // Wait for role to be available
//         await wait(10000);
//     } catch (error) {
//         console.error('Error setting up IAM role:', error);
//         throw error;
//     }
// }

// async function createS3Bucket() {
//     try {
//         console.log('Creating S3 bucket for logs...');

//         const createBucketCommand = new CreateBucketCommand({
//             Bucket: config.bucketName,
//             ACL: 'private'
//         });
        
//         await s3Client.send(createBucketCommand);

//         // Add bucket policy
//         const bucketPolicy = {
//             Version: '2012-10-17',
//             Statement: [{
//                 Sid: 'RedshiftLoggingPolicy',
//                 Effect: 'Allow',
//                 Principal: {
//                     Service: 'redshift.amazonaws.com'
//                 },
//                 Action: [
//                     's3:PutObject',
//                     's3:GetBucketAcl'
//                 ],
//                 Resource: [
//                     `arn:aws:s3:::${config.bucketName}`,
//                     `arn:aws:s3:::${config.bucketName}/*`
//                 ]
//             }]
//         };

//         const putBucketPolicyCommand = new PutBucketPolicyCommand({
//             Bucket: config.bucketName,
//             Policy: JSON.stringify(bucketPolicy)
//         });

//         await s3Client.send(putBucketPolicyCommand);
//         console.log('Created and configured S3 bucket');
//     } catch (error) {
//         console.error('Error creating S3 bucket:', error);
//         throw error;
//     }
// }

// async function createNonCompliantCluster() {
//     try {
//         console.log('Creating non-compliant Redshift cluster...');

//         const createClusterCommand = new CreateClusterCommand({
//             ClusterIdentifier: config.clusterIdentifier,
//             DBName: config.databaseName,
//             MasterUsername: config.masterUsername,
//             MasterUserPassword: config.masterPassword,
//             NodeType: config.nodeType,
//             NumberOfNodes: config.numberOfNodes, // Now using 2 nodes
//             ClusterType: 'multi-node', // Explicitly specify multi-node
//             Encrypted: false, // Non-compliant: No encryption
//             PubliclyAccessible: false,
//             IamRoles: [config.roleArn]
//         });

//         await redshiftClient.send(createClusterCommand);
//         config.createdResources = true;
//         console.log('Created Redshift cluster');

//         // Wait for cluster to be available
//         await waitForClusterStatus('available');

//         // Disable logging (non-compliant)
//         const disableLoggingCommand = new DisableLoggingCommand({
//             ClusterIdentifier: config.clusterIdentifier
//         });

//         await redshiftClient.send(disableLoggingCommand);
//         console.log('Disabled audit logging');
//     } catch (error) {
//         console.error('Error creating Redshift cluster:', error);
//         throw error;
//     }
// }
// async function waitForClusterStatus(targetStatus) {
//     console.log(`Waiting for cluster to be ${targetStatus}...`);
//     while (true) {
//         try {
//             const describeCommand = new DescribeClustersCommand({
//                 ClusterIdentifier: config.clusterIdentifier
//             });
            
//             const response = await redshiftClient.send(describeCommand);
//             const status = response.Clusters[0].ClusterStatus;
            
//             if (status === targetStatus) {
//                 console.log(`Cluster is ${targetStatus}`);
//                 return;
//             }
            
//             console.log(`Current status: ${status}`);
//             await wait(30000); // Wait 30 seconds before checking again
//         } catch (error) {
//             if (targetStatus === 'deleted' && error.name === 'ClusterNotFoundFault') {
//                 console.log('Cluster has been deleted');
//                 return;
//             }
//             throw error;
//         }
//     }
// }

// async function verifyConfiguration() {
//     try {
//         console.log('\nVerifying cluster configuration...');

//         // Check cluster configuration
//         const describeCommand = new DescribeClustersCommand({
//             ClusterIdentifier: config.clusterIdentifier
//         });
        
//         const clusterResponse = await redshiftClient.send(describeCommand);
//         const cluster = clusterResponse.Clusters[0];

//         console.log('\nCluster Configuration:');
//         console.log(JSON.stringify({
//             ClusterIdentifier: cluster.ClusterIdentifier,
//             Encrypted: cluster.Encrypted,
//             NodeType: cluster.NodeType,
//             NumberOfNodes: cluster.NumberOfNodes,
//             PubliclyAccessible: cluster.PubliclyAccessible
//         }, null, 2));

//         // Check logging status
//         const loggingStatusCommand = new DescribeLoggingStatusCommand({
//             ClusterIdentifier: config.clusterIdentifier
//         });

//         const loggingResponse = await redshiftClient.send(loggingStatusCommand);
//         console.log('\nLogging Status:');
//         console.log(JSON.stringify(loggingResponse, null, 2));
//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Delete Redshift cluster
//             try {
//                 const deleteClusterCommand = new DeleteClusterCommand({
//                     ClusterIdentifier: config.clusterIdentifier,
//                     SkipFinalClusterSnapshot: true
//                 });

//                 await redshiftClient.send(deleteClusterCommand);
//                 console.log('Initiated cluster deletion');
//                 await waitForClusterStatus('deleted');
//             } catch (error) {
//                 console.error('Error deleting cluster:', error);
//             }

//             // Delete IAM role policy and role
//             try {
//                 const deleteRolePolicyCommand = new DeleteRolePolicyCommand({
//                     RoleName: config.iamRoleName,
//                     PolicyName: 'RedshiftLoggingPolicy'
//                 });
//                 await iamClient.send(deleteRolePolicyCommand);

//                 const deleteRoleCommand = new DeleteRoleCommand({
//                     RoleName: config.iamRoleName
//                 });
//                 await iamClient.send(deleteRoleCommand);
//                 console.log('Deleted IAM role and policy');
//             } catch (error) {
//                 console.error('Error cleaning up IAM resources:', error);
//             }

//             // Delete S3 bucket contents and bucket
//             try {
//                 const listObjectsCommand = new ListObjectsV2Command({
//                     Bucket: config.bucketName
//                 });
                
//                 const listedObjects = await s3Client.send(listObjectsCommand);

//                 if (listedObjects.Contents && listedObjects.Contents.length > 0) {
//                     const deleteObjectsCommand = new DeleteObjectsCommand({
//                         Bucket: config.bucketName,
//                         Delete: {
//                             Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
//                         }
//                     });

//                     await s3Client.send(deleteObjectsCommand);
//                     console.log('Deleted all objects from S3 bucket');
//                 }

//                 const deleteBucketCommand = new DeleteBucketCommand({
//                     Bucket: config.bucketName
//                 });
                
//                 await s3Client.send(deleteBucketCommand);
//                 console.log('Deleted S3 bucket');
//             } catch (error) {
//                 console.error('Error cleaning up S3:', error);
//             }
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// }

// async function main() {
//     try {
//         console.log('Starting Redshift configuration non-compliance simulation...');
        
//         await setupIAMRole();
//         await createS3Bucket();
        
//         // Choose either multi-node or single-node configuration
//         await createNonCompliantCluster(); // For multi-node (2 nodes)
//         // OR
//         // await createSingleNodeCluster(); // For single-node

//         await verifyConfiguration();

//         console.log('\nWaiting for 5 seconds...');
//         await wait(5000);

//         await cleanup();
        
//         console.log('\nScript execution completed successfully');

//     } catch (error) {
//         console.error('Error in main execution:', error);
//         try {
//             await cleanup();
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// }

// // Execute the script
// main();


const {
    RedshiftClient,
    CreateClusterCommand,
    DeleteClusterCommand,
    DescribeClustersCommand,
    ModifyClusterCommand
} = require("@aws-sdk/client-redshift");

const {
    EC2Client,
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();

// Initialize AWS clients
const getClient = (ServiceClient) => {
    try {
        const credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        };

        const config = {
            credentials: credentials,
            region: process.env.AWS_REGION || 'ap-southeast-1'
        };

        return new ServiceClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Get network information
const getNetworkInfo = async () => {
    const ec2Client = getClient(EC2Client);

    try {
        // Get default VPC
        const vpcResponse = await ec2Client.send(
            new DescribeVpcsCommand({
                Filters: [{
                    Name: 'isDefault',
                    Values: ['true']
                }]
            })
        );

        if (!vpcResponse.Vpcs || vpcResponse.Vpcs.length === 0) {
            throw new Error('No default VPC found');
        }

        const vpcId = vpcResponse.Vpcs[0].VpcId;
        console.log(`Found default VPC: ${vpcId}`);

        return { vpcId };
    } catch (error) {
        console.error('Error getting network information:', error);
        throw error;
    }
};

// Create security group for Redshift
const createSecurityGroup = async (vpcId) => {
    const ec2Client = getClient(EC2Client);

    try {
        // Create security group
        const createSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `non-compliant-redshift-sg-${Date.now()}`,
                Description: 'Security group for non-compliant Redshift testing',
                VpcId: vpcId
            })
        );

        const sgId = createSgResponse.GroupId;

        // Add inbound rule for Redshift
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 5439,
                    ToPort: 5439,
                    IpRanges: [{ CidrIp: '10.0.0.0/16' }]
                }]
            })
        );

        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
};

// Create non-compliant Redshift cluster
const createNonCompliantCluster = async (sgId) => {
    const client = getClient(RedshiftClient);
    const clusterIdentifier = `non-compliant-cluster-${Date.now()}`;

    try {
        // Create cluster without encryption and audit logging
        const params = {
            ClusterIdentifier: clusterIdentifier,
            NodeType: 'dc2.large',
            MasterUsername: 'admin',
            MasterUserPassword: 'Password123!',
            VpcSecurityGroupIds: [sgId],
            NumberOfNodes: 1,
            PubliclyAccessible: false,
            Encrypted: false, // Non-compliant: No encryption
            Port: 5439,
            ClusterType: 'single-node',
            AutomatedSnapshotRetentionPeriod: 1,
            LoggingProperties: {
                EnableLogging: false // Non-compliant: No audit logging
            },
            Tags: [{
                Key: 'Environment',
                Value: 'Test'
            }]
        };

        console.log('Creating Redshift cluster...');
        await client.send(new CreateClusterCommand(params));

        // Wait for cluster to be available
        await waitForClusterStatus(client, clusterIdentifier, 'available');
        console.log('Redshift cluster created successfully');

        return clusterIdentifier;
    } catch (error) {
        console.error('Error creating Redshift cluster:', error);
        throw error;
    }
};

// Wait for cluster status
const waitForClusterStatus = async (client, clusterIdentifier, targetStatus) => {
    while (true) {
        try {
            const response = await client.send(
                new DescribeClustersCommand({
                    ClusterIdentifier: clusterIdentifier
                })
            );

            const status = response.Clusters[0].ClusterStatus;
            console.log(`Current cluster status: ${status}`);

            if (status === targetStatus) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'ClusterNotFound' && targetStatus === 'deleted') {
                console.log('Cluster deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Make cluster compliant
const makeCompliant = async (clusterIdentifier) => {
    const client = getClient(RedshiftClient);

    try {
        console.log('Modifying cluster to be compliant...');
        await client.send(
            new ModifyClusterCommand({
                ClusterIdentifier: clusterIdentifier,
                Encrypted: true,
                LoggingProperties: {
                    EnableLogging: true,
                    BucketName: process.env.LOGGING_BUCKET_NAME,
                    S3KeyPrefix: 'redshift-logs/'
                }
            })
        );

        await waitForClusterStatus(client, clusterIdentifier, 'available');
        console.log('Cluster modified successfully');
    } catch (error) {
        console.error('Error modifying cluster:', error);
        throw error;
    }
};

// Delete Redshift cluster
const deleteCluster = async (clusterIdentifier) => {
    const client = getClient(RedshiftClient);

    try {
        console.log('Deleting Redshift cluster...');
        await client.send(
            new DeleteClusterCommand({
                ClusterIdentifier: clusterIdentifier,
                SkipFinalClusterSnapshot: true
            })
        );

        await waitForClusterStatus(client, clusterIdentifier, 'deleted');
    } catch (error) {
        console.error('Error deleting cluster:', error);
        throw error;
    }
};

// Delete security group
const deleteSecurityGroup = async (sgId) => {
    const ec2Client = getClient(EC2Client);

    try {
        console.log('Deleting security group...');
        await ec2Client.send(
            new DeleteSecurityGroupCommand({
                GroupId: sgId
            })
        );
        console.log('Security group deleted successfully');
    } catch (error) {
        console.error('Error deleting security group:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    let clusterIdentifier = null;
    let sgId = null;

    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Get network information
        const { vpcId } = await getNetworkInfo();

        // Create security group
        sgId = await createSecurityGroup(vpcId);

        // Create non-compliant cluster
        clusterIdentifier = await createNonCompliantCluster(sgId);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the cluster compliant
        // if (process.env.LOGGING_BUCKET_NAME) {
        //     await makeCompliant(clusterIdentifier);
        //     console.log('\nWaiting 60 seconds to observe compliant state...');
        //     await new Promise(resolve => setTimeout(resolve, 60000));
        // }

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        console.log('\nStarting cleanup...');
        try {
            if (clusterIdentifier) {
                await deleteCluster(clusterIdentifier);
            }
            if (sgId) {
                // Wait for cluster deletion to complete
                await new Promise(resolve => setTimeout(resolve, 30000));
                await deleteSecurityGroup(sgId);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
};

// Run the program
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}




