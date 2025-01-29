const { 
    CodeBuildClient, 
    CreateProjectCommand,
} = require("@aws-sdk/client-codebuild");

const { 
    IAMClient, 
    CreateRoleCommand, 
    PutRolePolicyCommand,
    GetRoleCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const codebuildClient = new CodeBuildClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const iamClient = new IAMClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createServiceRole() {
    const roleName = `non-compliant-codebuild-role-${Date.now()}`;

    try {
        // Create role
        const createRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'codebuild.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            }),
            Tags: [{
                Key: 'simulation-mas',
                Value: 'true'
            }]
        }));

        // Add policy to role
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: 'codebuild-base-policy',
            PolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Resource: ['*'],
                        Action: [
                            'logs:CreateLogGroup',
                            'logs:CreateLogStream',
                            'logs:PutLogEvents'
                        ]
                    }
                ]
            })
        }));

        // Wait for role to propagate
        await new Promise(resolve => setTimeout(resolve, 10000));

        const getRole = await iamClient.send(new GetRoleCommand({
            RoleName: roleName
        }));

        return getRole.Role.Arn;
    } catch (error) {
        console.error('Error creating service role:', error);
        throw error;
    }
}

async function createNonCompliantCodeBuildProject() {
    try {
        const projectName = `non-compliant-project-${Date.now()}`;
        
        // Create service role first
        console.log('Creating service role...');
        const roleArn = await createServiceRole();
        console.log(`Service role created: ${roleArn}`);

        // Create CodeBuild project with credentials in environment variables
        const createProjectResponse = await codebuildClient.send(new CreateProjectCommand({
            name: projectName,
            description: 'Non-compliant project with credentials in environment variables',
            source: {
                type: 'NO_SOURCE',
                buildspec: 'version: 0.2\nphases:\n  build:\n    commands:\n      - echo "Hello World"'
            },
            artifacts: {
                type: 'NO_ARTIFACTS'
            },
            environment: {
                type: 'LINUX_CONTAINER',
                image: 'aws/codebuild/amazonlinux2-x86_64-standard:4.0',
                computeType: 'BUILD_GENERAL1_SMALL',
                environmentVariables: [
                    {
                        name: 'AWS_ACCESS_KEY_ID',
                        value: 'AKIAEXAMPLEKEY123456',  // Example credentials (non-compliant)
                        type: 'PLAINTEXT'
                    },
                    {
                        name: 'AWS_SECRET_ACCESS_KEY',
                        value: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',  // Example credentials (non-compliant)
                        type: 'PLAINTEXT'
                    }
                ]
            },
            serviceRole: roleArn,
            tags: [
                {
                    key: 'simulation-mas',
                    value: 'true'
                }
            ],
            logsConfig: {
                cloudWatchLogs: {
                    status: 'ENABLED'
                }
            }
        }));

        console.log('\nCreated non-compliant CodeBuild project:');
        console.log(`Project Name: ${projectName}`);
        console.log(`Project ARN: ${createProjectResponse.project.arn}`);
        console.log('\nNon-compliant configuration:');
        console.log('- AWS credentials stored in plaintext environment variables');
        console.log('- Credentials visible in CodeBuild console and API calls');
        console.log('- This is a security risk and violates AWS best practices');
        
        console.log('\nSecurity Warning:');
        console.log('- Storing AWS credentials in plaintext environment variables is unsafe');
        console.log('- Use AWS Secrets Manager or Systems Manager Parameter Store instead');
        console.log('- This configuration may expose sensitive credentials');
        console.log('- Update to use secure credential management');

        return {
            projectName,
            projectArn: createProjectResponse.project.arn
        };

    } catch (error) {
        console.error('Error creating CodeBuild project:', error);
        throw error;
    }
}

// Execute the script
async function main() {
    try {
        // Validate required environment variables
        if (!process.env.AWS_ACCESS_KEY_ID || 
            !process.env.AWS_SECRET_ACCESS_KEY || 
            !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }

        const result = await createNonCompliantCodeBuildProject();
        console.log('\nProject created successfully:');
        console.log(`Project Name: ${result.projectName}`);
        console.log(`Project ARN: ${result.projectArn}`);

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
