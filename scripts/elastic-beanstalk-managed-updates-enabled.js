const {
    ElasticBeanstalkClient,
    CreateEnvironmentCommand,
    ListAvailableSolutionStacksCommand,
    CreateApplicationCommand,
    CreateApplicationVersionCommand
} = require("@aws-sdk/client-elastic-beanstalk");

const {
    IAMClient,
    CreateRoleCommand,
    AttachRolePolicyCommand,
    GetRoleCommand
} = require("@aws-sdk/client-iam");

const {
    S3Client,
    PutObjectCommand,
    CreateBucketCommand
} = require("@aws-sdk/client-s3");

require('dotenv').config();

async function createRequiredRoles(iamClient) {
    const ebServiceRoleName = "aws-elasticbeanstalk-service-role";
    const ebInstanceRoleName = "aws-elasticbeanstalk-ec2-role";

    // Trust policies
    const ebServiceTrustPolicy = {
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                Service: "elasticbeanstalk.amazonaws.com"
            },
            Action: "sts:AssumeRole"
        }]
    };

    const ebInstanceTrustPolicy = {
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                Service: "ec2.amazonaws.com"
            },
            Action: "sts:AssumeRole"
        }]
    };

    // Function to check if role exists
    async function checkRoleExists(roleName) {
        try {
            await iamClient.send(new GetRoleCommand({ RoleName: roleName }));
            return true;
        } catch (error) {
            if (error.name === 'NoSuchEntityException') {
                return false;
            }
            throw error;
        }
    }

    // Function to create role and attach policies
    async function setupRole(roleName, trustPolicy, policyArns) {
        const roleExists = await checkRoleExists(roleName);
        if (!roleExists) {
            console.log(`Creating role: ${roleName}`);
            await iamClient.send(new CreateRoleCommand({
                RoleName: roleName,
                AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
                Tags: [{
                    Key: "simulation-mas",
                    Value: "true"
                }]
            }));

            // Wait for role to be available
            await new Promise(resolve => setTimeout(resolve, 10000));

            // Attach policies
            for (const policyArn of policyArns) {
                await iamClient.send(new AttachRolePolicyCommand({
                    RoleName: roleName,
                    PolicyArn: policyArn
                }));
                console.log(`Attached policy ${policyArn} to role ${roleName}`);
            }
        } else {
            console.log(`Role ${roleName} already exists`);
        }
    }

    // Create service role
    await setupRole(ebServiceRoleName, ebServiceTrustPolicy, [
        "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService",
        "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth"
    ]);

    // Create instance role
    await setupRole(ebInstanceRoleName, ebInstanceTrustPolicy, [
        "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier",
        "arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker",
        "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier"
    ]);
}

async function createS3Bucket(s3Client, bucketName, region) {
    try {
        // Create the S3 bucket
        console.log(`Creating S3 bucket: ${bucketName}`);
        await s3Client.send(new CreateBucketCommand({
            Bucket: bucketName,
            CreateBucketConfiguration: {
                LocationConstraint: region === 'us-east-1' ? undefined : region
            }
        }));

        // Wait for bucket to be available
        console.log('Waiting for bucket to be available...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Create sample application code
        const sampleApp = `
            const express = require('express');
            const app = express();
            const port = process.env.PORT || 3000;

            app.get('/', (req, res) => {
                res.send('Hello from Elastic Beanstalk!');
            });

            app.listen(port, () => {
                console.log(\`Server running on port \${port}\`);
            });
        `;

        // Create package.json
        const packageJson = {
            name: "sample-app",
            version: "1.0.0",
            main: "app.js",
            dependencies: {
                express: "^4.17.1"
            }
        };

        // Create zip buffer
        const zipContent = Buffer.from(JSON.stringify({
            'app.js': sampleApp,
            'package.json': JSON.stringify(packageJson, null, 2)
        }));

        // Upload to S3
        await s3Client.send(new PutObjectCommand({
            Bucket: bucketName,
            Key: 'app-v1.zip',
            Body: zipContent,
            ContentType: 'application/zip'
        }));

        console.log('Sample application uploaded to S3');
        return `s3://${bucketName}/app-v1.zip`;
    } catch (error) {
        console.error('Error creating S3 bucket or uploading file:', error);
        throw error;
    }
}

async function createBeanstalkApplication(ebClient, applicationName) {
    try {
        const createAppCommand = new CreateApplicationCommand({
            ApplicationName: applicationName,
            Description: "Node.js application created via automation",
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                }
            ]
        });

        console.log(`Creating Elastic Beanstalk application: ${applicationName}`);
        const response = await ebClient.send(createAppCommand);
        console.log("Application created successfully:", response);
        return response;
    } catch (error) {
        if (error.name === 'ApplicationAlreadyExistsException') {
            console.log(`Application ${applicationName} already exists`);
            return null;
        }
        throw error;
    }
}

async function createApplicationVersion(ebClient, applicationName, versionLabel, s3Location) {
    try {
        const createVersionCommand = new CreateApplicationVersionCommand({
            ApplicationName: applicationName,
            VersionLabel: versionLabel,
            Description: "Initial version",
            SourceBundle: {
                S3Bucket: s3Location.split('/')[2],
                S3Key: s3Location.split('/')[3]
            },
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                }
            ]
        });

        console.log(`Creating application version: ${versionLabel}`);
        const response = await ebClient.send(createVersionCommand);
        console.log("Application version created successfully:", response);
        return response;
    } catch (error) {
        console.error("Error creating application version:", error);
        throw error;
    }
}

async function createBeanstalkEnvironment() {
    const credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    };

    const region = process.env.AWS_REGION;
    
    if (!region) {
        throw new Error("AWS_REGION environment variable is not set");
    }

    // Initialize clients
    const iamClient = new IAMClient({ region, credentials });
    const ebClient = new ElasticBeanstalkClient({ region, credentials });
    const s3Client = new S3Client({ region, credentials });

    const applicationName = "MyNodeJsApp"+Date.now();
    const versionLabel = "v1";
    const bucketName = `elasticbeanstalk-${region}-${Date.now()}`;

    try {
        // Create required IAM roles
        console.log("Setting up required IAM roles...");
        await createRequiredRoles(iamClient);
        console.log("IAM roles setup completed");

        // Create S3 bucket and upload sample application
        console.log("Creating S3 bucket and uploading sample application...");
        const s3Location = await createS3Bucket(s3Client, bucketName, region);

        // Create Elastic Beanstalk application
        await createBeanstalkApplication(ebClient, applicationName);

        // Create application version
        await createApplicationVersion(ebClient, applicationName, versionLabel, s3Location);

        // Get available solution stacks
        const listStacksCommand = new ListAvailableSolutionStacksCommand({});
        const stackResponse = await ebClient.send(listStacksCommand);
        
        const nodejsStacks = stackResponse.SolutionStacks.filter(stack => 
            stack.includes('Node.js')
        );

        if (nodejsStacks.length === 0) {
            throw new Error("No Node.js solution stacks found");
        }

        const latestNodeStack = nodejsStacks[0];
        console.log("Selected solution stack:", latestNodeStack);

        // Create environment configuration
        const params = {
            ApplicationName: applicationName,
            EnvironmentName: "MyNodeJsEnv-" + Date.now(),
            SolutionStackName: latestNodeStack,
            OptionSettings: [
                {
                    Namespace: "aws:elasticbeanstalk:healthreporting:system",
                    OptionName: "SystemType",
                    Value: "basic"
                },
                {
                    Namespace: "aws:autoscaling:launchconfiguration",
                    OptionName: "IamInstanceProfile",
                    Value: "aws-elasticbeanstalk-ec2-role"
                },
                {
                    Namespace: "aws:elasticbeanstalk:environment",
                    OptionName: "ServiceRole",
                    Value: "aws-elasticbeanstalk-service-role"
                },
                // Disable managed updates
                {
                    Namespace: "aws:elasticbeanstalk:managedactions",
                    OptionName: "ManagedActionsEnabled",
                    Value: "false"
                },
                {
                    Namespace: "aws:elasticbeanstalk:managedactions",
                    OptionName: "PreferredStartTime",
                    Value: "Tue:09:00"
                },
                {
                    Namespace: "aws:elasticbeanstalk:managedactions:platformupdate",
                    OptionName: "UpdateLevel",
                    Value: "minor"
                },
                {
                    Namespace: "aws:elasticbeanstalk:managedactions:platformupdate",
                    OptionName: "InstanceRefreshEnabled",
                    Value: "false"
                }
            ],
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                }
            ],
            VersionLabel: versionLabel,
            Tier: {
                Name: "WebServer",
                Type: "Standard"
            }
        };

        // Create the environment
        const command = new CreateEnvironmentCommand(params);
        const response = await ebClient.send(command);
        console.log("Environment creation initiated:", response);
        return response;

    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
}

// Execute the function
createBeanstalkEnvironment().catch(console.error);
