const {
    ElasticBeanstalkClient,
    CreateApplicationCommand,
    CreateEnvironmentCommand,
    TerminateEnvironmentCommand,
    DeleteApplicationCommand,
    DescribeEnvironmentsCommand,
    UpdateEnvironmentCommand,
    ListAvailableSolutionStacksCommand
} = require("@aws-sdk/client-elastic-beanstalk");

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand,
    CreateInstanceProfileCommand,
    DeleteInstanceProfileCommand,
    AddRoleToInstanceProfileCommand,
    RemoveRoleFromInstanceProfileCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const beanstalkClient = new ElasticBeanstalkClient({ region: process.env.AWS_REGION });
const iamClient = new IAMClient({ region: process.env.AWS_REGION });

// Configuration
const CONFIG = {
    APP_NAME: `test-app-${Math.random()}`,
    ENV_NAME: `test-env-${Date.now()}`,
    SOLUTION_STACK: null, // Will be set dynamically
    INSTANCE_TYPE: 't2.micro',
    ROLE_NAME: `beanstalk-role-${Date.now()}`,
    INSTANCE_PROFILE: `beanstalk-instance-profile-${Date.now()}`
};

// Function to list available solution stacks
async function listSolutionStacks() {
    try {
        const response = await beanstalkClient.send(new ListAvailableSolutionStacksCommand({}));
        return response.SolutionStacks;
    } catch (error) {
        console.error('Error listing solution stacks:', error);
        throw error;
    }
}

// Function to create Elastic Beanstalk application
async function createApplication() {
    try {
        await beanstalkClient.send(new CreateApplicationCommand({
            ApplicationName: CONFIG.APP_NAME,
            Description: 'Test application for health reporting compliance check'
        }));
        console.log('Created Elastic Beanstalk application:', CONFIG.APP_NAME);
    } catch (error) {
        console.error('Error creating application:', error);
        throw error;
    }
}

// Function to create IAM roles
async function createIAMRoles() {
    try {
        // Create service role
        const serviceRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.ROLE_NAME,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'elasticbeanstalk.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            })
        }));

        // Attach service role policy
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.ROLE_NAME,
            PolicyName: 'beanstalk-service-policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        'elasticloadbalancing:*',
                        'autoscaling:*',
                        'cloudwatch:*',
                        'ec2:*'
                    ],
                    Resource: '*'
                }]
            })
        }));

        // Create instance profile
        await iamClient.send(new CreateInstanceProfileCommand({
            InstanceProfileName: CONFIG.INSTANCE_PROFILE
        }));

        // Create instance role
        await iamClient.send(new CreateRoleCommand({
            RoleName: CONFIG.INSTANCE_PROFILE,
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

        // Attach instance role policy
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: CONFIG.INSTANCE_PROFILE,
            PolicyName: 'beanstalk-instance-policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Action: [
                        's3:*',
                        'cloudwatch:*',
                        'elasticbeanstalk:*'
                    ],
                    Resource: '*'
                }]
            })
        }));

        // Add role to instance profile
        await iamClient.send(new AddRoleToInstanceProfileCommand({
            InstanceProfileName: CONFIG.INSTANCE_PROFILE,
            RoleName: CONFIG.INSTANCE_PROFILE
        }));

        // Wait for role propagation
        await new Promise(resolve => setTimeout(resolve, 10000));

        return {
            serviceRoleArn: serviceRoleResponse.Role.Arn,
            instanceProfileArn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:instance-profile/${CONFIG.INSTANCE_PROFILE}`
        };
    } catch (error) {
        console.error('Error creating IAM roles:', error);
        throw error;
    }
}

// Function to create non-compliant environment
async function createNonCompliantEnvironment(serviceRoleArn, instanceProfileArn) {
    try {
        const response = await beanstalkClient.send(new CreateEnvironmentCommand({
            ApplicationName: CONFIG.APP_NAME,
            EnvironmentName: CONFIG.ENV_NAME,
            SolutionStackName: CONFIG.SOLUTION_STACK,
            OptionSettings: [
                {
                    Namespace: 'aws:autoscaling:launchconfiguration',
                    OptionName: 'IamInstanceProfile',
                    Value: instanceProfileArn
                },
                {
                    Namespace: 'aws:autoscaling:launchconfiguration',
                    OptionName: 'InstanceType',
                    Value: CONFIG.INSTANCE_TYPE
                },
                {
                    Namespace: 'aws:elasticbeanstalk:environment',
                    OptionName: 'ServiceRole',
                    Value: serviceRoleArn
                },
                {
                    Namespace: 'aws:elasticbeanstalk:healthreporting:system',
                    OptionName: 'SystemType',
                    Value: 'basic' // Set to basic for non-compliance
                }
            ]
        }));

        console.log('Created Elastic Beanstalk environment:', response.EnvironmentId);
        return response.EnvironmentId;
    } catch (error) {
        console.error('Error creating environment:', error);
        throw error;
    }
}

// Function to wait for environment status
async function waitForEnvironmentStatus(environmentId, targetStatus) {
    try {
        let status;
        do {
            const response = await beanstalkClient.send(new DescribeEnvironmentsCommand({
                EnvironmentIds: [environmentId]
            }));
            
            status = response.Environments[0].Status;
            console.log('Environment status:', status);
            
            if (status !== targetStatus) {
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        } while (status !== targetStatus);

        return true;
    } catch (error) {
        console.error('Error checking environment status:', error);
        throw error;
    }
}

// Function to make environment compliant
async function makeEnvironmentCompliant(environmentId) {
    try {
        await beanstalkClient.send(new UpdateEnvironmentCommand({
            EnvironmentId: environmentId,
            OptionSettings: [{
                Namespace: 'aws:elasticbeanstalk:healthreporting:system',
                OptionName: 'SystemType',
                Value: 'enhanced'
            }]
        }));

        console.log('Updated environment to use enhanced health reporting');
    } catch (error) {
        console.error('Error updating environment:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(environmentId) {
    try {
        // Terminate Elastic Beanstalk environment
        if (environmentId) {
            try {
                console.log('Terminating Elastic Beanstalk environment...');
                await beanstalkClient.send(new TerminateEnvironmentCommand({
                    EnvironmentId: environmentId
                }));
                
                // Wait for environment to be terminated
                console.log('Waiting for environment termination...');
                let status;
                let attempts = 0;
                const maxAttempts = 30;

                do {
                    const response = await beanstalkClient.send(new DescribeEnvironmentsCommand({
                        EnvironmentIds: [environmentId]
                    }));
                    
                    if (response.Environments.length === 0) {
                        console.log('Environment no longer exists');
                        break;
                    }
                    
                    status = response.Environments[0].Status;
                    console.log('Environment status:', status);
                    
                    if (status !== 'Terminated') {
                        await new Promise(resolve => setTimeout(resolve, 10000));
                    }

                    attempts++;
                    if (attempts >= maxAttempts) {
                        console.log('Timeout waiting for environment termination');
                        break;
                    }
                } while (status !== 'Terminated');

                console.log('Environment termination complete');
            } catch (error) {
                console.error('Error terminating environment:', error);
            }
        }

        // Wait additional time for resources to be fully released
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Delete Elastic Beanstalk application
        try {
            console.log('Deleting Elastic Beanstalk application...');
            await beanstalkClient.send(new DeleteApplicationCommand({
                ApplicationName: CONFIG.APP_NAME,
                TerminateEnvByForce: true
            }));
            console.log('Deleted Elastic Beanstalk application');
        } catch (error) {
            console.error('Error deleting application:', error);
        }

        // Cleanup IAM roles
        try {
            // Remove role from instance profile
            await iamClient.send(new RemoveRoleFromInstanceProfileCommand({
                InstanceProfileName: CONFIG.INSTANCE_PROFILE,
                RoleName: CONFIG.INSTANCE_PROFILE
            }));

            // Delete instance profile
            await iamClient.send(new DeleteInstanceProfileCommand({
                InstanceProfileName: CONFIG.INSTANCE_PROFILE
            }));

            // Delete instance role policy
            await iamClient.send(new DeleteRolePolicyCommand({
                RoleName: CONFIG.INSTANCE_PROFILE,
                PolicyName: 'beanstalk-instance-policy'
            }));

            // Delete instance role
            await iamClient.send(new DeleteRoleCommand({
                RoleName: CONFIG.INSTANCE_PROFILE
            }));

            // Delete service role policy
            await iamClient.send(new DeleteRolePolicyCommand({
                RoleName: CONFIG.ROLE_NAME,
                PolicyName: 'beanstalk-service-policy'
            }));

            // Delete service role
            await iamClient.send(new DeleteRoleCommand({
                RoleName: CONFIG.ROLE_NAME
            }));

            console.log('Cleaned up IAM resources');
        } catch (error) {
            console.error('Error cleaning up IAM resources:', error);
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

// Main function to simulate non-compliance
async function simulateNonCompliance() {
    let environmentId = null;

    try {
        console.log('Starting Elastic Beanstalk health reporting compliance simulation...');

        // List available solution stacks
        console.log('Checking available solution stacks...');
        const solutionStacks = await listSolutionStacks();
        
        // Find the latest Node.js solution stack
        const nodeJsStack = solutionStacks.find(stack => 
            stack.includes('running Node.js') && 
            stack.includes('Amazon Linux 2')
        );

        if (!nodeJsStack) {
            throw new Error('No suitable Node.js solution stack found');
        }

        // Update the solution stack to use
        CONFIG.SOLUTION_STACK = nodeJsStack;
        console.log('Using solution stack:', CONFIG.SOLUTION_STACK);

        // Create Elastic Beanstalk application
        console.log('Creating Elastic Beanstalk application...');
        await createApplication();

        // Create IAM roles
        console.log('Creating IAM roles...');
        const { serviceRoleArn, instanceProfileArn } = await createIAMRoles();

        // Create non-compliant environment
        console.log('Creating non-compliant environment (basic health reporting)...');
        environmentId = await createNonCompliantEnvironment(serviceRoleArn, instanceProfileArn);

        // Wait for environment to be ready
        console.log('Waiting for environment to be ready...');
        await waitForEnvironmentStatus(environmentId, 'Ready');

        // Show non-compliant state
        console.log('\nEnvironment is now active in non-compliant state (basic health reporting)');
        
        // Wait for testing period
        console.log('Waiting 30 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 30000));

        // Make environment compliant
        console.log('\nMaking environment compliant...');
        await makeEnvironmentCompliant(environmentId);

        // Wait for changes to apply
        console.log('Waiting for changes to apply...');
        await waitForEnvironmentStatus(environmentId, 'Ready');

        console.log('Environment is now compliant with enhanced health reporting enabled');

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup resources
        console.log('\nCleaning up resources...');
        await cleanupResources(environmentId);
        console.log('Simulation completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
