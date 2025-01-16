// const {
//     AutoScalingClient,
//     CreateAutoScalingGroupCommand,
//     DeleteAutoScalingGroupCommand,
//     DescribeAutoScalingGroupsCommand,
//     UpdateAutoScalingGroupCommand,
//     CreateLaunchTemplateVersionCommand,
//     DeleteLaunchTemplateCommand
// } = require("@aws-sdk/client-auto-scaling");

// const {
//     EC2Client,
//     CreateLaunchTemplateCommand,
//     RunInstancesCommand,
//     CreateSecurityGroupCommand,
//     AuthorizeSecurityGroupIngressCommand,
//     DescribeVpcsCommand,
//     DescribeSubnetsCommand
// } = require("@aws-sdk/client-ec2");

// const {
//     ElasticLoadBalancingV2Client,
//     CreateLoadBalancerCommand,
//     CreateTargetGroupCommand,
//     DeleteLoadBalancerCommand,
//     DeleteTargetGroupCommand,
//     DescribeLoadBalancersCommand
// } = require("@aws-sdk/client-elastic-load-balancing-v2");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN,
//     region: process.env.AWS_REGION || 'ap-southeast-1'
// };

// // Initialize clients
// const autoScalingClient = new AutoScalingClient(credentials);
// const ec2Client = new EC2Client(credentials);
// const elbv2Client = new ElasticLoadBalancingV2Client(credentials);

// // Configuration
// const config = {
//     asgName: `test-asg-${Date.now()}`,
//     launchTemplateName: `test-lt-${Date.now()}`,
//     loadBalancerName: `test-alb-${Date.now()}`,
//     targetGroupName: `test-tg-${Date.now()}`,
//     securityGroupName: `test-sg-${Date.now()}`,
//     createdResources: false,
//     vpcId: '',
//     subnetIds: [],
//     launchTemplateId: '',
//     launchTemplateVersion: '1',
//     targetGroupArn: '',
//     loadBalancerArn: '',
//     securityGroupId: ''
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function getNetworkConfig() {
//     try {
//         console.log('Getting network configuration...');

//         // Get default VPC
//         const describeVpcsCommand = new DescribeVpcsCommand({
//             Filters: [{ Name: 'isDefault', Values: ['true'] }]
//         });
//         const vpcsResponse = await ec2Client.send(describeVpcsCommand);
        
//         if (!vpcsResponse.Vpcs || vpcsResponse.Vpcs.length === 0) {
//             throw new Error('No default VPC found');
//         }
        
//         config.vpcId = vpcsResponse.Vpcs[0].VpcId;

//         // Get subnets in the VPC
//         const describeSubnetsCommand = new DescribeSubnetsCommand({
//             Filters: [{ Name: 'vpc-id', Values: [config.vpcId] }]
//         });
//         const subnetsResponse = await ec2Client.send(describeSubnetsCommand);
        
//         if (!subnetsResponse.Subnets || subnetsResponse.Subnets.length === 0) {
//             throw new Error('No subnets found in default VPC');
//         }

//         config.subnetIds = subnetsResponse.Subnets.slice(0, 2).map(subnet => subnet.SubnetId);
//         console.log('Network configuration retrieved successfully');

//     } catch (error) {
//         console.error('Error getting network configuration:', error);
//         throw error;
//     }
// }

// async function createSecurityGroup() {
//     try {
//         console.log('Creating security group...');

//         const createSgCommand = new CreateSecurityGroupCommand({
//             GroupName: config.securityGroupName,
//             Description: 'Security group for ASG test',
//             VpcId: config.vpcId
//         });
        
//         const sgResponse = await ec2Client.send(createSgCommand);
//         config.securityGroupId = sgResponse.GroupId;

//         // Add inbound rules
//         const authorizeSgCommand = new AuthorizeSecurityGroupIngressCommand({
//             GroupId: config.securityGroupId,
//             IpPermissions: [
//                 {
//                     IpProtocol: 'tcp',
//                     FromPort: 80,
//                     ToPort: 80,
//                     IpRanges: [{ CidrIp: '0.0.0.0/0' }]
//                 }
//             ]
//         });

//         await ec2Client.send(authorizeSgCommand);
//         console.log('Created security group');

//     } catch (error) {
//         console.error('Error creating security group:', error);
//         throw error;
//     }
// }

// async function createLaunchTemplate() {
//     try {
//         console.log('Creating launch template...');

//         const createLaunchTemplateCommand = new CreateLaunchTemplateCommand({
//             LaunchTemplateName: config.launchTemplateName,
//             LaunchTemplateData: {
//                 ImageId: 'ami-0e48a8a6b7dc1d30b', // Amazon Linux 2 AMI - update as needed
//                 InstanceType: 't2.micro',
//                 SecurityGroupIds: [config.securityGroupId],
//                 UserData: Buffer.from(`#!/bin/bash
//                     yum update -y
//                     yum install -y httpd
//                     systemctl start httpd
//                     systemctl enable httpd`).toString('base64')
//             }
//         });

//         const response = await ec2Client.send(createLaunchTemplateCommand);
//         config.launchTemplateId = response.LaunchTemplate.LaunchTemplateId;
//         console.log('Created launch template');

//     } catch (error) {
//         console.error('Error creating launch template:', error);
//         throw error;
//     }
// }

// async function createLoadBalancer() {
//     try {
//         console.log('Creating load balancer and target group...');

//         // Create target group
//         const createTgCommand = new CreateTargetGroupCommand({
//             Name: config.targetGroupName,
//             Protocol: 'HTTP',
//             Port: 80,
//             VpcId: config.vpcId,
//             HealthCheckProtocol: 'HTTP',
//             HealthCheckPath: '/',
//             HealthCheckIntervalSeconds: 30,
//             HealthCheckTimeoutSeconds: 5,
//             HealthyThresholdCount: 2,
//             UnhealthyThresholdCount: 2,
//             TargetType: 'instance'
//         });

//         const tgResponse = await elbv2Client.send(createTgCommand);
//         config.targetGroupArn = tgResponse.TargetGroups[0].TargetGroupArn;

//         // Create ALB
//         const createLbCommand = new CreateLoadBalancerCommand({
//             Name: config.loadBalancerName,
//             Subnets: config.subnetIds,
//             SecurityGroups: [config.securityGroupId],
//             Scheme: 'internet-facing',
//             Type: 'application'
//         });

//         const lbResponse = await elbv2Client.send(createLbCommand);
//         config.loadBalancerArn = lbResponse.LoadBalancers[0].LoadBalancerArn;

//         console.log('Created load balancer and target group');

//         // Wait for load balancer to be active
//         console.log('Waiting for load balancer to be active...');
//         let lbActive = false;
//         while (!lbActive) {
//             const describeLbCommand = new DescribeLoadBalancersCommand({
//                 LoadBalancerArns: [config.loadBalancerArn]
//             });
//             const lbStatus = await elbv2Client.send(describeLbCommand);
//             if (lbStatus.LoadBalancers[0].State.Code === 'active') {
//                 lbActive = true;
//             } else {
//                 await wait(20000);
//             }
//         }
//         console.log('Load balancer is active');

//     } catch (error) {
//         console.error('Error creating load balancer:', error);
//         throw error;
//     }
// }

// async function createNonCompliantASG() {
//     try {
//         console.log('Creating non-compliant Auto Scaling group...');

//         const createAsgCommand = new CreateAutoScalingGroupCommand({
//             AutoScalingGroupName: config.asgName,
//             LaunchTemplate: {
//                 LaunchTemplateId: config.launchTemplateId,
//                 Version: config.launchTemplateVersion
//             },
//             MinSize: 1,
//             MaxSize: 3,
//             DesiredCapacity: 2,
//             VPCZoneIdentifier: config.subnetIds.join(','),
//             TargetGroupARNs: [config.targetGroupArn],
//             HealthCheckType: 'EC2', // Non-compliant: Using EC2 instead of ELB health checks
//             HealthCheckGracePeriod: 300,
//             Tags: [
//                 {
//                     Key: 'Name',
//                     Value: config.asgName,
//                     PropagateAtLaunch: true
//                 }
//             ]
//         });

//         await autoScalingClient.send(createAsgCommand);
//         config.createdResources = true;
//         console.log('Created Auto Scaling group with EC2 health checks (non-compliant)');

//     } catch (error) {
//         console.error('Error creating Auto Scaling group:', error);
//         throw error;
//     }
// }

// async function makeCompliant() {
//     try {
//         console.log('\nUpdating Auto Scaling group to be compliant...');

//         const updateAsgCommand = new UpdateAutoScalingGroupCommand({
//             AutoScalingGroupName: config.asgName,
//             HealthCheckType: 'ELB',
//             HealthCheckGracePeriod: 300
//         });

//         await autoScalingClient.send(updateAsgCommand);
//         console.log('Updated to use ELB health checks (compliant)');

//     } catch (error) {
//         console.error('Error updating Auto Scaling group:', error);
//     }
// }

// async function verifyConfiguration() {
//     try {
//         console.log('\nVerifying Auto Scaling group configuration...');

//         const describeAsgCommand = new DescribeAutoScalingGroupsCommand({
//             AutoScalingGroupNames: [config.asgName]
//         });

//         const response = await autoScalingClient.send(describeAsgCommand);
//         const asg = response.AutoScalingGroups[0];

//         console.log('\nAuto Scaling Group Configuration:');
//         console.log(`Name: ${asg.AutoScalingGroupName}`);
//         console.log(`Health Check Type: ${asg.HealthCheckType}`);
//         console.log(`Health Check Grace Period: ${asg.HealthCheckGracePeriod}`);
//         console.log(`Target Groups: ${asg.TargetGroupARNs.join(', ')}`);
//         console.log(`Compliant: ${asg.HealthCheckType === 'ELB' ? 'Yes' : 'No'}`);

//     } catch (error) {
//         console.error('Error verifying configuration:', error);
//     }
// }

// async function cleanup() {
//     try {
//         if (config.createdResources) {
//             console.log('\nStarting cleanup process...');

//             // Delete Auto Scaling group
//             try {
//                 const deleteAsgCommand = new DeleteAutoScalingGroupCommand({
//                     AutoScalingGroupName: config.asgName,
//                     ForceDelete: true
//                 });
//                 await autoScalingClient.send(deleteAsgCommand);
//                 console.log('Deleted Auto Scaling group');
//             } catch (error) {
//                 console.error('Error deleting Auto Scaling group:', error);
//             }

//             // Delete load balancer
//             try {
//                 if (config.loadBalancerArn) {
//                     const deleteLbCommand = new DeleteLoadBalancerCommand({
//                         LoadBalancerArn: config.loadBalancerArn
//                     });
//                     await elbv2Client.send(deleteLbCommand);
//                     console.log('Deleted load balancer');
//                 }
//             } catch (error) {
//                 console.error('Error deleting load balancer:', error);
//             }

//             // Delete target group
//             try {
//                 if (config.targetGroupArn) {
//                     await wait(30000); // Wait for load balancer deletion
//                     const deleteTgCommand = new DeleteTargetGroupCommand({
//                         TargetGroupArn: config.targetGroupArn
//                     });
//                     await elbv2Client.send(deleteTgCommand);
//                     console.log('Deleted target group');
//                 }
//             } catch (error) {
//                 console.error('Error deleting target group:', error);
//             }

//             // Delete launch template
//             try {
//                 if (config.launchTemplateId) {
//                     const deleteLtCommand = new DeleteLaunchTemplateCommand({
//                         LaunchTemplateId: config.launchTemplateId
//                     });
//                     await ec2Client.send(deleteLtCommand);
//                     console.log('Deleted launch template');
//                 }
//             } catch (error) {
//                 console.error('Error deleting launch template:', error);
//             }
//         }
//     } catch (error) {
//         console.error('Error during cleanup:', error);
//         throw error;
//     }
// }

// async function main() {
//     try {
//         console.log('Starting Auto Scaling group health check non-compliance simulation...');
        
//         await getNetworkConfig();
//         await createSecurityGroup();
//         await createLaunchTemplate();
//         await createLoadBalancer();
//         await createNonCompliantASG();
//         await verifyConfiguration();

//         // Optional: Make compliant by enabling ELB health checks
//         // Uncomment the next lines to make the ASG compliant
//         // await makeCompliant();
//         // await verifyConfiguration();

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
    AutoScalingClient,
    CreateAutoScalingGroupCommand,
    DeleteAutoScalingGroupCommand,
    CreateLaunchTemplateCommand,
    DeleteLaunchTemplateCommand,
    DescribeAutoScalingGroupsCommand
} = require("@aws-sdk/client-auto-scaling");

const {
    EC2Client,
    CreateSecurityGroupCommand,
    DeleteSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeVpcsCommand,
    DescribeSubnetsCommand,
    CreateLaunchTemplateCommand: EC2CreateLaunchTemplateCommand,
    DeleteLaunchTemplateCommand: EC2DeleteLaunchTemplateCommand
} = require("@aws-sdk/client-ec2");

const {
    ElasticLoadBalancingV2Client,
    CreateLoadBalancerCommand,
    DeleteLoadBalancerCommand,
    CreateTargetGroupCommand,
    DeleteTargetGroupCommand,
    CreateListenerCommand
} = require("@aws-sdk/client-elastic-load-balancing-v2");

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

// Create security groups
const createSecurityGroups = async (vpcId) => {
    const ec2Client = getClient(EC2Client);

    try {
        // Create security group for ALB
        const albSgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `non-compliant-alb-sg-${Date.now()}`,
                Description: 'Security group for ALB',
                VpcId: vpcId
            })
        );

        const albSgId = albSgResponse.GroupId;

        // Create security group for EC2 instances
        const ec2SgResponse = await ec2Client.send(
            new CreateSecurityGroupCommand({
                GroupName: `non-compliant-ec2-sg-${Date.now()}`,
                Description: 'Security group for EC2 instances',
                VpcId: vpcId
            })
        );

        const ec2SgId = ec2SgResponse.GroupId;

        // Add inbound rules
        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: albSgId,
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }]
            })
        );

        await ec2Client.send(
            new AuthorizeSecurityGroupIngressCommand({
                GroupId: ec2SgId,
                IpPermissions: [{
                    IpProtocol: 'tcp',
                    FromPort: 80,
                    ToPort: 80,
                    UserIdGroupPairs: [{ GroupId: albSgId }]
                }]
            })
        );

        return { albSgId, ec2SgId };
    } catch (error) {
        console.error('Error creating security groups:', error);
        throw error;
    }
};

// Create launch template
const createLaunchTemplate = async (sgId) => {
    const ec2Client = getClient(EC2Client);
    const templateName = `non-compliant-template-${Date.now()}`;

    try {
        const response = await ec2Client.send(
            new EC2CreateLaunchTemplateCommand({
                LaunchTemplateName: templateName,
                LaunchTemplateData: {
                    ImageId: 'ami-0df7a207adb9748c7', // Amazon Linux 2 AMI
                    InstanceType: 't2.micro',
                    SecurityGroupIds: [sgId],
                    UserData: Buffer.from(`#!/bin/bash
                        yum update -y
                        yum install -y httpd
                        systemctl start httpd
                        systemctl enable httpd`).toString('base64')
                }
            })
        );

        return {
            templateId: response.LaunchTemplate.LaunchTemplateId,
            templateName: templateName
        };
    } catch (error) {
        console.error('Error creating launch template:', error);
        throw error;
    }
};

// Create ALB and target group
const createLoadBalancer = async (vpcId, subnets, sgId) => {
    const elbv2Client = getClient(ElasticLoadBalancingV2Client);
    const lbName = `non-compliant-alb-${Date.now()}`.substring(0, 32);

    try {
        // Create ALB
        const lbResponse = await elbv2Client.send(
            new CreateLoadBalancerCommand({
                Name: lbName,
                Subnets: subnets,
                SecurityGroups: [sgId],
                Type: 'application',
                IpAddressType: 'ipv4'
            })
        );

        // Create target group
        const tgResponse = await elbv2Client.send(
            new CreateTargetGroupCommand({
                Name: `non-compliant-tg-${Date.now()}`.substring(0, 32),
                Protocol: 'HTTP',
                Port: 80,
                VpcId: vpcId,
                TargetType: 'instance',
                HealthCheckProtocol: 'HTTP',
                HealthCheckPath: '/',
                HealthCheckEnabled: true
            })
        );

        // Create listener
        await elbv2Client.send(
            new CreateListenerCommand({
                LoadBalancerArn: lbResponse.LoadBalancers[0].LoadBalancerArn,
                Protocol: 'HTTP',
                Port: 80,
                DefaultActions: [{
                    Type: 'forward',
                    TargetGroupArn: tgResponse.TargetGroups[0].TargetGroupArn
                }]
            })
        );

        return {
            lbArn: lbResponse.LoadBalancers[0].LoadBalancerArn,
            tgArn: tgResponse.TargetGroups[0].TargetGroupArn
        };
    } catch (error) {
        console.error('Error creating load balancer:', error);
        throw error;
    }
};

// Create non-compliant Auto Scaling group
const createNonCompliantASG = async (templateId, subnets, targetGroupArn) => {
    const asgClient = getClient(AutoScalingClient);
    const asgName = `non-compliant-asg-${Date.now()}`;

    try {
        await asgClient.send(
            new CreateAutoScalingGroupCommand({
                AutoScalingGroupName: asgName,
                LaunchTemplate: {
                    LaunchTemplateId: templateId,
                    Version: '$Latest'
                },
                MinSize: 1,
                MaxSize: 3,
                DesiredCapacity: 2,
                VPCZoneIdentifier: subnets.join(','),
                TargetGroupARNs: [targetGroupArn],
                HealthCheckType: 'EC2', // Non-compliant: Using EC2 instead of ELB
                HealthCheckGracePeriod: 300,
                Tags: [{
                    Key: 'Environment',
                    Value: 'Test',
                    PropagateAtLaunch: true
                }]
            })
        );

        console.log('Auto Scaling group created successfully');
        return asgName;
    } catch (error) {
        console.error('Error creating Auto Scaling group:', error);
        throw error;
    }
};

// Make ASG compliant
const makeCompliant = async (asgName) => {
    const asgClient = getClient(AutoScalingClient);

    try {
        await asgClient.send(
            new UpdateAutoScalingGroupCommand({
                AutoScalingGroupName: asgName,
                HealthCheckType: 'ELB',
                HealthCheckGracePeriod: 300
            })
        );
        console.log('Auto Scaling group updated to use ELB health checks');
    } catch (error) {
        console.error('Error updating Auto Scaling group:', error);
        throw error;
    }
};

// Delete resources
const cleanup = async (resources) => {
    try {
        const asgClient = getClient(AutoScalingClient);
        const elbv2Client = getClient(ElasticLoadBalancingV2Client);
        const ec2Client = getClient(EC2Client);

        console.log('\nStarting cleanup...');

        // Delete Auto Scaling group
        if (resources.asgName) {
            await asgClient.send(
                new DeleteAutoScalingGroupCommand({
                    AutoScalingGroupName: resources.asgName,
                    ForceDelete: true
                })
            );
            console.log('Auto Scaling group deleted');
        }

        // Delete launch template
        if (resources.templateId) {
            await ec2Client.send(
                new EC2DeleteLaunchTemplateCommand({
                    LaunchTemplateId: resources.templateId
                })
            );
            console.log('Launch template deleted');
        }

        // Delete load balancer
        if (resources.lbArn) {
            await elbv2Client.send(
                new DeleteLoadBalancerCommand({
                    LoadBalancerArn: resources.lbArn
                })
            );
            console.log('Load balancer deleted');
        }

        // Delete target group
        if (resources.tgArn) {
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for LB deletion
            await elbv2Client.send(
                new DeleteTargetGroupCommand({
                    TargetGroupArn: resources.tgArn
                })
            );
            console.log('Target group deleted');
        }

        // Delete security groups
        if (resources.sgIds) {
            await new Promise(resolve => setTimeout(resolve, 30000)); // Wait for dependencies
            for (const sgId of resources.sgIds) {
                await ec2Client.send(
                    new DeleteSecurityGroupCommand({
                        GroupId: sgId
                    })
                );
            }
            console.log('Security groups deleted');
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

        // Create security groups
        const { albSgId, ec2SgId } = await createSecurityGroups(vpcId);
        resources.sgIds = [albSgId, ec2SgId];

        // Create launch template
        const { templateId, templateName } = await createLaunchTemplate(ec2SgId);
        resources.templateId = templateId;

        // Create ALB and target group
        const { lbArn, tgArn } = await createLoadBalancer(vpcId, subnets, albSgId);
        resources.lbArn = lbArn;
        resources.tgArn = tgArn;

        // Create non-compliant Auto Scaling group
        const asgName = await createNonCompliantASG(templateId, subnets, tgArn);
        resources.asgName = asgName;

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Auto Scaling group created with EC2 health checks (non-compliant).');
        console.log('To be compliant, the Auto Scaling group should:');
        console.log('1. Use ELB health checks (HealthCheckType: ELB)');
        console.log('2. Have appropriate health check grace period');
        await new Promise(resolve => setTimeout(resolve, 60000));

        // Optional: Make the ASG compliant
        // await makeCompliant(asgName);
        // console.log('\nWaiting 60 seconds to observe compliant state...');
        // await new Promise(resolve => setTimeout(resolve, 60000));

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
