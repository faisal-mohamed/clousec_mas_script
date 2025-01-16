const { 
    CodeBuildClient, 
    CreateProjectCommand,
    DeleteProjectCommand,
    ListProjectsCommand
} = require("@aws-sdk/client-codebuild");

const { 
    IAMClient, 
    CreateRoleCommand, 
    DeleteRoleCommand,
    PutRolePolicyCommand,
    DeleteRolePolicyCommand,
    GetRoleCommand
} = require("@aws-sdk/client-iam");

const { 
    STSClient, 
    GetCallerIdentityCommand 
} = require("@aws-sdk/client-sts");

require('dotenv').config();

const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

async function createServiceRole(iamClient, roleName) {
    const assumeRolePolicy = {
        Version: '2012-10-17',
        Statement: [{
            Effect: 'Allow',
            Principal: {
                Service: 'codebuild.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
        }]
    };

    try {
        // Create role
        await iamClient.send(new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy)
        }));

        // Add policy to role
        const policyDocument = {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Action: [
                    'logs:CreateLogGroup',
                    'logs:CreateLogStream',
                    'logs:PutLogEvents'
                ],
                Resource: '*'
            }]
        };

        await iamClient.send(new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: `${roleName}-policy`,
            PolicyDocument: JSON.stringify(policyDocument)
        }));

        // Wait for role to propagate
        await new Promise(resolve => setTimeout(resolve, 10000));

        const getRoleResponse = await iamClient.send(new GetRoleCommand({
            RoleName: roleName
        }));

        return getRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating service role:', error);
        throw error;
    }
}

async function cleanupServiceRole(iamClient, roleName) {
    try {
        await iamClient.send(new DeleteRolePolicyCommand({
            RoleName: roleName,
            PolicyName: `${roleName}-policy`
        }));

        await iamClient.send(new DeleteRoleCommand({
            RoleName: roleName
        }));
    } catch (error) {
        console.error('Error cleaning up service role:', error);
    }
}

async function simulateNonCompliance() {
    const codebuildClient = createAwsClient(CodeBuildClient);
    const iamClient = createAwsClient(IAMClient);
    
    const projectName = 'non-compliant-test-project';
    const roleName = 'non-compliant-test-role';
    
    try {
        console.log('Starting simulation for codebuild-project-envvar-awscred-check...');

        // Create service role
        console.log('Creating service role...');
        const roleArn = await createServiceRole(iamClient, roleName);

        // Create non-compliant CodeBuild project
        const createProjectParams = {
            name: projectName,
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
                        value: 'EXAMPLE_ACCESS_KEY',
                        type: 'PLAINTEXT'
                    },
                    {
                        name: 'AWS_SECRET_ACCESS_KEY',
                        value: 'EXAMPLE_SECRET_KEY',
                        type: 'PLAINTEXT'
                    }
                ]
            },
            serviceRole: roleArn
        };

        console.log('Creating non-compliant CodeBuild project...');
        await codebuildClient.send(new CreateProjectCommand(createProjectParams));
        
        // Verify project creation
        const listProjectsResponse = await codebuildClient.send(new ListProjectsCommand({}));
        const projectExists = listProjectsResponse.projects.includes(projectName);
        
        console.log('\nNon-compliant state created successfully:');
        console.log('- Project created with plaintext AWS credentials in environment variables');
        console.log('- This violates the CIS benchmark requirement');
        console.log(`- Project status: ${projectExists ? 'Created' : 'Failed to create'}`);

    } catch (error) {
        console.error('Error during simulation:', error);
        throw error;
    } finally {
        // Cleanup
        console.log('\nCleaning up resources...');
        try {
            await codebuildClient.send(new DeleteProjectCommand({
                name: projectName
            }));
            await cleanupServiceRole(iamClient, roleName);
            console.log('Cleanup completed successfully');
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

async function main() {
    try {
        // Verify credentials
        const stsClient = createAwsClient(STSClient);
        const identity = await stsClient.send(new GetCallerIdentityCommand({}));
        console.log('Credentials verified for account:', identity.Account);

        // Run simulation
        await simulateNonCompliance();
    } catch (error) {
        console.error('Error in main execution:', error);
        process.exit(1);
    }
}

main().catch(console.error);
