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

async function createUserWithInlinePolicy() {
    try {
        const userName = `test-user-${Date.now()}`;
        const policyName = 'test-inline-policy';

        // Create user
        console.log('Creating IAM user...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [{
                Key: 'simulation-mas',
                Value: 'true'
            }]
        }));

        // Inline policy document
        const inlinePolicyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "AllowS3Actions",
                    Effect: "Allow",
                    Action: [
                        "s3:GetObject",
                        "s3:ListBucket"
                    ],
                    Resource: [
                        "arn:aws:s3:::example-bucket",
                        "arn:aws:s3:::example-bucket/*"
                    ]
                },
                {
                    Sid: "AllowEC2Describe",
                    Effect: "Allow",
                    Action: [
                        "ec2:DescribeInstances",
                        "ec2:DescribeImages",
                        "ec2:DescribeTags",
                        "ec2:DescribeSnapshots"
                    ],
                    Resource: "*"
                }
            ]
        };

        // Attach inline policy to user
        console.log('Attaching inline policy...');
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

        console.log('Created user with inline policy:', {
            UserName: userName,
            UserArn: createUserResponse.User.Arn,
            PolicyName: policyName,
            HasInlinePolicy: !!getPolicyResponse.PolicyDocument
        });

        return {
            userArn: createUserResponse.User.Arn,
            userName: userName,
            policyName: policyName
        };
    } catch (error) {
        console.error('Error creating user with inline policy:', error.message);
        throw error;
    }
}

// Execute user and policy creation
createUserWithInlinePolicy()
    .then(result => {
        console.log('Successfully created user with inline policy:', {
            UserArn: result.userArn,
            UserName: result.userName,
            PolicyName: result.policyName
        });
    })
    .catch(error => {
        console.error('Failed to create user and policy:', error.message);
        process.exit(1);
    });
