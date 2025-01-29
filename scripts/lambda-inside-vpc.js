const {
    LambdaClient,
    CreateFunctionCommand,
    GetFunctionCommand
} = require("@aws-sdk/client-lambda");

const {
    IAMClient,
    CreateRoleCommand,
    AttachRolePolicyCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();


// Initialize clients
const lambdaClient = new LambdaClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'ap-southeast-1'
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

        // Attach basic Lambda execution policy
        await iamClient.send(new AttachRolePolicyCommand({
            RoleName: roleName,
            PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole'
        }));

        // Wait for role propagation
        await new Promise(resolve => setTimeout(resolve, 10000));

        return createRoleResponse.Role.Arn;
    } catch (error) {
        console.error('Error creating IAM role:', error.message);
        throw error;
    }
}

async function createNonVPCLambda(roleArn) {
    try {
        const functionName = `non-vpc-lambda-${Date.now()}`;
        
        // Sample Lambda function code
        const functionCode = `
exports.handler = async (event) => {
    console.log('Function running without VPC configuration');
    const response = {
        statusCode: 200,
        body: JSON.stringify({
            message: 'Hello from Lambda without VPC!',
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

        // Create Lambda function without VPC config
        console.log('Creating Lambda function without VPC...');
        const createFunctionResponse = await lambdaClient.send(new CreateFunctionCommand({
            FunctionName: functionName,
            Runtime: 'nodejs18.x',
            Role: roleArn,
            Handler: 'index.handler',
            Code: {
                ZipFile: zipBuffer
            },
            Description: 'Lambda function without VPC configuration',
            Timeout: 30,
            MemorySize: 128,
            Publish: true,
            Tags: {
                'simulation-mas': 'true',
                'vpc-status': 'none'
            }
            // Note: VPC configuration is intentionally omitted
        }));

        // Verify function configuration
        const getFunctionResponse = await lambdaClient.send(new GetFunctionCommand({
            FunctionName: functionName
        }));

        return {
            functionName: functionName,
            functionArn: createFunctionResponse.FunctionArn,
            vpcConfig: getFunctionResponse.Configuration.VpcConfig,
            role: roleArn
        };
    } catch (error) {
        console.error('Error creating Lambda function:', error.message);
        throw error;
    }
}

async function deployNonVPCLambda() {
    try {
        const roleName = `lambda-non-vpc-role-${Date.now()}`;
        
        // Create IAM role
        console.log('Step 1: Creating IAM role...');
        const roleArn = await createLambdaRole(roleName);
        
        // Create Lambda function without VPC
        console.log('Step 2: Creating Lambda function...');
        const result = await createNonVPCLambda(roleArn);

        console.log('\nDeployment Summary:', {
            FunctionName: result.functionName,
            FunctionArn: result.functionArn,
            RoleArn: result.role,
            VPCStatus: 'Not configured',
            NetworkAccess: 'Direct internet access'
        });

        console.log('\nNetwork Configuration:', {
            vpc: 'None',
            internetAccess: 'Direct',
            networkInterfaces: 'None (uses Lambda service network)',
            securityGroups: 'None required'
        });

        console.log('\nConnectivity Note:', {
            status: 'Function has direct internet access',
            benefits: [
                'No VPC configuration required',
                'Direct access to internet resources',
                'No NAT Gateway costs',
                'Lower latency for external calls'
            ]
        });

        return result;
    } catch (error) {
        console.error('Deployment failed:', error.message);
        throw error;
    }
}

// Execute deployment
deployNonVPCLambda()
    .then(result => {
        console.log('\nFunction ready for invocation:', {
            name: result.functionName,
            networkType: 'No VPC (Lambda service network)',
            status: 'Active'
        });
    })
    .catch(error => {
        console.error('Failed to deploy:', error.message);
        process.exit(1);
    });
