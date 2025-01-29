const {
    LambdaClient,
    CreateFunctionCommand,
    CreateFunctionUrlConfigCommand,
    AddPermissionCommand
} = require("@aws-sdk/client-lambda");

require('dotenv').config();


const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    AttachRolePolicyCommand
} = require("@aws-sdk/client-iam");

// Initialize clients
const lambdaClient = new LambdaClient({
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

async function createLambdaRole(roleName) {
    try {
        console.log('Creating IAM role for Lambda...');
        
        // Create role with trust policy
        const createRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify({
                Version: '2012-10-17',
                Statement: [{
                    Effect: 'Allow',
                    Principal: {
                        Service: 'lambda.amazonaws.com'
                    },
                    Action: 'sts:AssumeRole'
                }]
            }),
            Tags: [{
                Key: 'simulation-mas',
                Value: 'true'
            }]
        }));

        // Attach AWS managed policy for basic Lambda execution
        await iamClient.send(new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        }));

        // Add inline policy for additional permissions if needed
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: 'additional-permissions',
            PolicyDocument: JSON.stringify({
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
            })
        }));

        // Wait for role to propagate
        await new Promise(resolve => setTimeout(resolve, 10000));

        return createRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error.message);
        throw error;
    }
}

async function createPublicLambdaFunction(roleArn) {
    try {
        const functionName = `public-lambda-${Date.now()}`;
        
        // Basic Lambda function code
        const functionCode = `
exports.handler = async (event) => {
    const response = {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: "Hello from public Lambda!",
            timestamp: new Date().toISOString(),
            event: event
        })
    };
    return response;
};`;

        // Create ZIP buffer for function code
        const zip = new require('adm-zip')();
        zip.addFile('index.js', Buffer.from(functionCode));
        const zipBuffer = zip.toBuffer();

        // Create Lambda function
        console.log('Creating Lambda function...');
        const createFunctionResponse = await lambdaClient.send(new CreateFunctionCommand({
            FunctionName: functionName,
            Runtime: 'nodejs18.x',
            Role: roleArn,
            Handler: 'index.handler',
            Code: {
                ZipFile: zipBuffer
            },
            Description: 'Public Lambda function with URL access',
            Timeout: 30,
            MemorySize: 128,
            Publish: true,
            Tags: {
                'simulation-mas': 'true',
                'public-access': 'true'
            }
        }));

        // Create function URL with public access
        console.log('Creating public function URL...');
        const urlConfigResponse = await lambdaClient.send(new CreateFunctionUrlConfigCommand({
            FunctionName: functionName,
            AuthType: 'NONE',
            Cors: {
                AllowOrigins: ['*'],
                AllowMethods: ['*'],
                AllowHeaders: ['*'],
                ExposeHeaders: ['*'],
                MaxAge: 86400
            }
        }));

        // Add permission for public access
        console.log('Adding public access permission...');
        await lambdaClient.send(new AddPermissionCommand({
            FunctionName: functionName,
            StatementId: 'PublicFunctionURL',
            Action: 'lambda:InvokeFunctionUrl',
            Principal: '*',
            FunctionUrlAuthType: 'NONE'
        }));

        return {
            functionName: functionName,
            functionArn: createFunctionResponse.FunctionArn,
            functionUrl: urlConfigResponse.FunctionUrl,
            roleArn: roleArn
        };
    } catch (error) {
        console.error('Error creating public Lambda function:', error.message);
        throw error;
    }
}

async function deployPublicLambda() {
    try {
        const roleName = `lambda-public-role-${Date.now()}`;
        
        // Create IAM role
        console.log('Step 1: Creating IAM role...');
        const roleArn = await createLambdaRole(roleName);
        
        // Create Lambda function with public access
        console.log('Step 2: Creating Lambda function...');
        const result = await createPublicLambdaFunction(roleArn);

        console.log('\nDeployment Summary:', {
            FunctionName: result.functionName,
            FunctionArn: result.functionArn,
            RoleArn: result.roleArn,
            PublicUrl: result.functionUrl,
            AccessType: 'Public - No Authentication Required',
            CorsConfig: 'Enabled for all origins'
        });

        console.log('\nAccess Information:', {
            endpoint: result.functionUrl,
            method: 'Any HTTP method (GET, POST, etc.)',
            authentication: 'None required',
            cors: 'Enabled for all origins'
        });

        console.log('\nSecurity Note:', {
            warning: 'Function is publicly accessible without authentication',
            recommendation: 'Monitor invocations and implement rate limiting if needed',
            access: 'Anyone with the URL can invoke the function'
        });

        return result;
    } catch (error) {
        console.error('Deployment failed:', error.message);
        throw error;
    }
}

// Execute deployment
deployPublicLambda()
    .catch(error => {
        console.error('Failed to deploy:', error.message);
        process.exit(1);
    });
