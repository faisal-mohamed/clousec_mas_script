const {
    IAMClient,
    CreateUserCommand,
    PutUserPolicyCommand,
    GetUserPolicyCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();


// Initialize IAM client
const iamClient = new IAMClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createUserWithAdminPolicy() {
    try {
        const userName = `admin-test-user-${Date.now()}`;
        const policyName = 'admin-inline-policy';

        // Create user
        console.log('Creating IAM user...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [{
                Key: 'simulation-mas',
                Value: 'true'
            }]
        }));

        // Admin inline policy document
        const inlinePolicyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "FullAdministrativeAccess",
                    Effect: "Allow",
                    Action: "*",
                    Resource: "*"
                }
            ]
        };

        // Attach inline policy to user
        console.log('Attaching admin inline policy...');
        await iamClient.send(new PutUserPolicyCommand({
            UserName: userName,
            PolicyName: policyName,
            PolicyDocument: JSON.stringify(inlinePolicyDocument)
        }));

        // Verify inline policy
        const getPolicyResponse = await iamClient.send(new GetUserPolicyCommand({
            UserName: userName,
            PolicyName: policyName
        }));

        console.log('Created user with admin inline policy:', {
            UserName: userName,
            UserArn: createUserResponse.User.Arn,
            PolicyName: policyName,
            HasInlinePolicy: !!getPolicyResponse.PolicyDocument,
            CreationDate: createUserResponse.User.CreateDate
        });

        return {
            userArn: createUserResponse.User.Arn,
            userName: userName,
            policyName: policyName
        };
    } catch (error) {
        console.error('Error creating user with admin policy:', error.message);
        throw error;
    }
}

// Execute user and policy creation
createUserWithAdminPolicy()
    .then(result => {
        console.log('Successfully created user with admin policy:', {
            UserArn: result.userArn,
            UserName: result.userName,
            PolicyName: result.policyName
        });
        console.log('\nSecurity Warning:', {
            message: 'This user has full administrative access.',
            recommendation: 'For production use, consider implementing least-privilege permissions.',
            risk: 'High - Full access to all AWS resources'
        });
    })
    .catch(error => {
        console.error('Failed to create user and policy:', error.message);
        process.exit(1);
    });
