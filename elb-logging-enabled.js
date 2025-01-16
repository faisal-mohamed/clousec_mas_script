// const { 
//     ElasticLoadBalancingV2Client, 
//     CreateLoadBalancerCommand,
//     DeleteLoadBalancerCommand,
//     DescribeLoadBalancersCommand,
//     ModifyLoadBalancerAttributesCommand,
//     DescribeLoadBalancerAttributesCommand
// } = require("@aws-sdk/client-elastic-load-balancing-v2");

// const { 
//     S3Client, 
//     CreateBucketCommand,
//     PutBucketPolicyCommand,
//     DeleteBucketCommand,
//     DeleteObjectsCommand,
//     ListObjectsV2Command,
//     HeadBucketCommand
// } = require("@aws-sdk/client-s3");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN,
//     region: process.env.AWS_REGION || 'ap-southeast-1'
// };

// // Initialize clients
// const elbv2Client = new ElasticLoadBalancingV2Client(credentials);
// const s3Client = new S3Client(credentials);

// // Configuration
// const config = {
//     loadBalancerName: 'test-non-compliant-alb',
//     bucketName: `alb-logs-${Date.now()}-${Math.random().toString(36).substring(7)}`,
//     createdResources: false,
//     loadBalancerArn: null
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function createS3Bucket() {
//     try {
//         const createBucketCommand = new CreateBucketCommand({
//             Bucket: config.bucketName,
//             ACL: 'private'
//         });
        
//         await s3Client.send(createBucketCommand);
//         console.log(`Created S3 bucket: ${config.bucketName}`);

//         await wait(2000);

//         // Add bucket policy for ALB logging
//         const bucketPolicy = {
//             Version: '2012-10-17',
//             Statement: [{
//                 Effect: 'Allow',
//                 Principal: {
//                     AWS: 'arn:aws:iam::013339790944:root' // Replace with actual ELB account ID
//                 },
//                 Action: 's3:PutObject',
//                 Resource: `arn:aws:s3:::${config.bucketName}/*`
//             }]
//         };

//         const putBucketPolicyCommand = new PutBucketPolicyCommand({
//             Bucket: config.bucketName,
//             Policy: JSON.stringify(bucketPolicy)
//         });

//         await s3Client.send(putBucketPolicyCommand);
//         console.log('Added bucket policy for ALB logging');
//     } catch (error) {
//         console.error('Error creating S3 bucket:', error);
//         throw error;
//     }
// }

// async function createLoadBalancer() {
//     try {
//         // Create Application Load Balancer
//         const createLBCommand = new CreateLoadBalancerCommand({
//             Name: config.loadBalancerName,
//             Subnets: ['subnet-0bcf3ec749e053002'], // Replace with actual subnet IDs
//             SecurityGroups: ['sg-019e82c3cbd4ada2e'], // Replace with actual security group ID
//             Scheme: 'internet-facing',
//             Type: 'application'
//         });

//         const response = await elbv2Client.send(createLBCommand);
//         config.loadBalancerArn = response.LoadBalancers[0].LoadBalancerArn;
//         config.createdResources = true;
        
//         console.log(`Created Load Balancer: ${config.loadBalancerName}`);
        
//         // Wait for load balancer to be active
//         await wait(30000);
//     } catch (error) {
//         console.error('Error creating Load Balancer:', error);
//         throw error;
//     }
// }

// async function makeNonCompliant() {
//     try {
//         // Disable access logs
//         const modifyAttributesCommand = new ModifyLoadBalancerAttributesCommand({
//             LoadBalancerArn: config.loadBalancerArn,
//             Attributes: [{
//                 Key: 'access_logs.s3.enabled',
//                 Value: 'false'
//             }]
//         });

//         await elbv2Client.send(modifyAttributesCommand);
//         console.log('Successfully disabled access logs');
//     } catch (error) {
//         console.error('Error making load balancer non-compliant:', error);
//         throw error;
//     }
// }

// async function verifyConfiguration() {
//     try {
//         const describeAttributesCommand = new DescribeLoadBalancerAttributesCommand({
//             LoadBalancerArn: config.loadBalancerArn
//         });

//         const response = await elbv2Client.send(describeAttributesCommand);
//         console.log('\nCurrent Configuration:');
//         console.log(JSON.stringify(response.Attributes, null, 2));
//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Delete Load Balancer
//             try {
//                 const deleteLBCommand = new DeleteLoadBalancerCommand({
//                     LoadBalancerArn: config.loadBalancerArn
//                 });
                
//                 await elbv2Client.send(deleteLBCommand);
//                 console.log('Deleted Load Balancer');
                
//                 // Wait for load balancer to be deleted
//                 await wait(30000);
//             } catch (error) {
//                 console.error('Error deleting load balancer:', error);
//             }

//             // Delete S3 bucket contents
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

//                 // Delete the bucket
//                 const deleteBucketCommand = new DeleteBucketCommand({
//                     Bucket: config.bucketName
//                 });
                
//                 await s3Client.send(deleteBucketCommand);
//                 console.log('Deleted S3 bucket');
//             } catch (error) {
//                 console.error('Error cleaning up S3:', error);
//             }
//         } else {
//             console.log('No resources to clean up - nothing was created');
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// }

// async function verifyCleanup() {
//     console.log('\nVerifying cleanup...');
//     try {
//         // Verify load balancer is gone
//         try {
//             const describeLBCommand = new DescribeLoadBalancersCommand({
//                 Names: [config.loadBalancerName]
//             });
            
//             await elbv2Client.send(describeLBCommand);
//             console.log('✗ Load Balancer still exists');
//         } catch (error) {
//             if (error.name === 'LoadBalancerNotFoundException') {
//                 console.log('✓ Load Balancer was successfully deleted');
//             } else {
//                 console.log('? Unable to verify Load Balancer status');
//             }
//         }

//         // Verify bucket is gone
//         try {
//             const headBucketCommand = new HeadBucketCommand({
//                 Bucket: config.bucketName
//             });
            
//             await s3Client.send(headBucketCommand);
//             console.log('✗ S3 bucket still exists');
//         } catch (error) {
//             if (error.name === 'NotFound') {
//                 console.log('✓ S3 bucket was successfully deleted');
//             } else {
//                 console.log('? Unable to verify S3 bucket status');
//             }
//         }
//     } catch (error) {
//         console.log('Cleanup verification error:', error);
//     }
// }

// async function main() {
//     try {
//         console.log('Starting ELB logging non-compliance simulation...');
        
//         // Create resources
//         await createS3Bucket();
//         await createLoadBalancer();

//         // Make it non-compliant
//         console.log('\nMaking load balancer non-compliant...');
//         await makeNonCompliant();

//         // Verify the configuration
//         await verifyConfiguration();

//         // Wait for a few seconds
//         console.log('\nWaiting for 5 seconds...');
//         await wait(5000);

//         // Cleanup
//         console.log('\nStarting cleanup...');
//         await cleanup();
        
//         // Verify cleanup
//         await verifyCleanup();
        
//         console.log('\nScript execution completed successfully');

//     } catch (error) {
//         console.error('Error in main execution:', error);
//         // Attempt cleanup even if there was an error
//         try {
//             await cleanup();
//             await verifyCleanup();
//         } catch (cleanupError) {
//             console.error('Error during cleanup:', cleanupError);
//         }
//     }
// }

// // Execute the script
// main();


const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    DeleteLoadBalancerCommand,
    DescribeLoadBalancersCommand,
    CreateListenerCommand,
    DeleteListenerCommand,
    ModifyLoadBalancerAttributesCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

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

// Get default VPC and subnet information
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

        // Get subnets in the VPC
        const subnetResponse = await ec2Client.send(
            new DescribeSubnetsCommand({
                Filters: [{
                    Name: 'vpc-id',
                    Values: [vpcId]
                }]
            })
        );

        if (!subnetResponse.Subnets || subnetResponse.Subnets.length < 2) {
            throw new Error('Not enough subnets found in VPC');
        }

        // Get two subnets from different AZs
        const subnets = subnetResponse.Subnets
            .sort(() => Math.random() - 0.5)
            .slice(0, 2)
            .map(subnet => subnet.SubnetId);

        return { vpcId, subnets };
    } catch (error) {
        console.error('Error getting network information:', error);
        throw error;
    }
};

// Create security group for ALB
const createSecurityGroup = async (vpcId) => {
    const ec2Client = getClient(EC2Client);

    try {
        // Create security group
        const createSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `non-compliant-alb-sg-${Date.now()}`,
                Description: 'Security group for non-compliant ALB testing',
                VpcId: vpcId
            })
        );

        const sgId = createSgResponse.GroupId;

        // Add inbound rules
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: sgId,
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }]
            })
        );

        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
};

// Create non-compliant ALB (without access logging)
const createNonCompliantALB = async (vpcId, subnets, sgId) => {
    const elbv2Client = getClient(ElasticLoadBalancingV2Client);
    const albName = `non-compliant-alb-${Date.now()}`;

    try {
        // Create ALB
        const createLbResponse = await elbv2Client.send(
            new CreateLoadBalancerCommand({
                Name: albName,
                Subnets: subnets,
                SecurityGroups: [sgId],
                Type: 'application',
                IpAddressType: 'ipv4'
            })
        );

        const albArn = createLbResponse.LoadBalancers[0].LoadBalancerArn;
        console.log(`Created ALB: ${albArn}`);

        // Wait for ALB to be active
        await waitForLoadBalancerStatus(elbv2Client, albArn, 'active');

        // Create HTTP listener
        const listenerResponse = await elbv2Client.send(
            new CreateListenerCommand({
                LoadBalancerArn: albArn,
                Protocol: 'HTTP',
                Port: 80,
                DefaultActions: [{
                    Type: 'fixed-response',
                    FixedResponseConfig: {
                        ContentType: 'text/plain',
                        StatusCode: '200',
                        MessageBody: 'OK'
                    }
                }]
            })
        );

        // Explicitly disable access logs (although they're disabled by default)
        await elbv2Client.send(
            new ModifyLoadBalancerAttributesCommand({
                LoadBalancerArn: albArn,
                Attributes: [{
                    Key: 'access_logs.s3.enabled',
                    Value: 'false'
                }]
            })
        );

        return {
            albArn,
            listenerArn: listenerResponse.Listeners[0].ListenerArn
        };
    } catch (error) {
        console.error('Error creating ALB:', error);
        throw error;
    }
};

// Wait for load balancer status
const waitForLoadBalancerStatus = async (elbv2Client, albArn, targetState) => {
    while (true) {
        try {
            const response = await elbv2Client.send(
                new DescribeLoadBalancersCommand({
                    LoadBalancerArns: [albArn]
                })
            );

            const state = response.LoadBalancers[0].State.Code;
            console.log(`Current ALB state: ${state}`);

            if (state === targetState) {
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
        } catch (error) {
            if (error.name === 'LoadBalancerNotFound' && targetState === 'deleted') {
                console.log('Load balancer deleted successfully');
                break;
            }
            throw error;
        }
    }
};

// Delete ALB and associated resources
const cleanup = async (resources) => {
    try {
        const elbv2Client = getClient(ElasticLoadBalancingV2Client);
        const ec2Client = getClient(EC2Client);

        console.log('\nStarting cleanup...');

        // Delete listener
        if (resources.listenerArn) {
            await elbv2Client.send(
                new DeleteListenerCommand({
                    ListenerArn: resources.listenerArn
                })
            );
            console.log('Listener deleted');
        }

        // Delete ALB
        if (resources.albArn) {
            await elbv2Client.send(
                new DeleteLoadBalancerCommand({
                    LoadBalancerArn: resources.albArn
                })
            );
            console.log('Waiting for ALB deletion...');
            await waitForLoadBalancerStatus(elbv2Client, resources.albArn, 'deleted');
        }

        // Delete security group
        if (resources.sgId) {
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for ALB deletion
            await ec2Client.send(
                new DeleteSecurityGroupCommand({
                    GroupId: resources.sgId
                })
            );
            console.log('Security group deleted');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    const resources = {};

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
        const { vpcId, subnets } = await getNetworkInfo();

        // Create security group
        resources.sgId = await createSecurityGroup(vpcId);

        // Create non-compliant ALB
        const albInfo = await createNonCompliantALB(vpcId, subnets, resources.sgId);
        resources.albArn = albInfo.albArn;
        resources.listenerArn = albInfo.listenerArn;

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        // Cleanup
        try {
            await cleanup(resources);
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
