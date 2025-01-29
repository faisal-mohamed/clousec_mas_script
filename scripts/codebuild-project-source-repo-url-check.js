const { 
    CodeBuildClient, 
    CreateProjectCommand,
    DeleteProjectCommand
} = require("@aws-sdk/client-codebuild");

const { 
    IAMClient, 
    CreateRoleCommand, 
    PutRolePolicyCommand,
    GetRoleCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand
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
    const roleName = `invalid-source-codebuild-role-${Date.now()}`;

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

        return {
            roleArn: getRole.Role.Arn,
            roleName: roleName
        };
    } catch (error) {
        console.error('Error creating service role:', error);
        throw error;
    }
}

async function cleanupResources(projectName, roleName) {
    try {
        // Delete CodeBuild project
        if (projectName) {
            await codebuildClient.send(new DeleteProjectCommand({
                name: projectName
            }));
            console.log(`Deleted CodeBuild project: ${projectName}`);
        }

        // Delete IAM role and policy
        if (roleName) {
            await iamClient.send(new DeleteRolePolicyCommand({
                RoleName: roleName,
                PolicyName: 'codebuild-base-policy'
            }));
            await iamClient.send(new DeleteRoleCommand({
                RoleName: roleName
            }));
            console.log(`Deleted IAM role: ${roleName}`);
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

async function createNonCompliantCodeBuildProject() {
    let projectName = null;
    let roleName = null;

    try {
        projectName = `invalid-source-project-${Date.now()}`;
        
        // Create service role first
        console.log('Creating service role...');
        const roleResult = await createServiceRole();
        roleName = roleResult.roleName;
        console.log(`Service role created: ${roleResult.roleArn}`);

        // Create CodeBuild project with invalid source repository
        const createProjectResponse = await codebuildClient.send(new CreateProjectCommand({
            name: projectName,
            description: 'Non-compliant project with invalid source repository',
            source: {
                type: 'GITHUB',
                location: 'https://github.com/invalid/nonexistent-repo.git', // Invalid repository URL
                buildspec: 'version: 0.2\nphases:\n  build:\n    commands:\n      - echo "Hello World"'
            },
            artifacts: {
                type: 'NO_ARTIFACTS'
            },
            environment: {
                type: 'LINUX_CONTAINER',
                image: 'aws/codebuild/amazonlinux2-x86_64-standard:4.0',
                computeType: 'BUILD_GENERAL1_SMALL'
            },
            serviceRole: roleResult.roleArn,
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
        console.log('- Invalid source repository URL configured');
        console.log('- Source repository does not exist');
        console.log('- Builds will fail due to invalid source');
        
        console.log('\nConfiguration Warning:');
        console.log('- The source repository URL is invalid');
        console.log('- No source code will be available for builds');
        console.log('- Build attempts will fail during source download');
        console.log('- Update with valid repository URL for proper operation');

        return {
            projectName,
            projectArn: createProjectResponse.project.arn,
            roleName
        };

    } catch (error) {
        console.error('Error creating CodeBuild project:', error);
        // Cleanup on error
        await cleanupResources(projectName, roleName);
        throw error;
    }
}

// Execute the script
async function main() {
    let resources = null;

    try {
        // Validate required environment variables
        if (!process.env.AWS_ACCESS_KEY_ID || 
            !process.env.AWS_SECRET_ACCESS_KEY || 
            !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }

        resources = await createNonCompliantCodeBuildProject();
        console.log('\nProject created successfully:');
        console.log(`Project Name: ${resources.projectName}`);
        console.log(`Project ARN: ${resources.projectArn}`);

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    } finally {
        // Cleanup resources
    //     if (resources) {
    //         console.log('\nCleaning up resources...');
    //         await cleanupResources(resources.projectName, resources.roleName);
    //     }
    }
}

main();
