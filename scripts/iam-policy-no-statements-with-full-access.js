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

async function createUserWithS3AdminPolicy() {
    try {
        const userName = `s3-admin-user-${Date.now()}`;
        const policyName = 's3-full-access-inline-policy';

        // Create user
        console.log('Creating IAM user...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [{
                Key: 'simulation-mas',
                Value: 'true'
            }]
        }));

        // S3 full access inline policy document
        const inlinePolicyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "S3FullAccess",
                    Effect: "Allow",
                    Action: "s3:*",
                    Resource: "*"
                },
                {
                    Sid: "ListAllBuckets",
                    Effect: "Allow",
                    Action: [
                        "s3:ListAllMyBuckets",
                        "s3:GetBucketLocation"
                    ],
                    Resource: "*"
                }
            ]
        };

        // Attach inline policy to user
        console.log('Attaching S3 admin inline policy...');
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

        console.log('Created user with S3 admin inline policy:', {
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
        console.error('Error creating user with S3 admin policy:', error.message);
        throw error;
    }
}

// Execute user and policy creation
createUserWithS3AdminPolicy()
    .then(result => {
        console.log('Successfully created user with S3 admin policy:', {
            UserArn: result.userArn,
            UserName: result.userName,
            PolicyName: result.policyName
        });
        console.log('\nPermissions Summary:', {
            service: 'Amazon S3',
            accessLevel: 'Full administrative access',
            actions: 'All S3 actions (s3:*)',
            resources: 'All S3 resources'
        });
    })
    .catch(error => {
        console.error('Failed to create user and policy:', error.message);
        process.exit(1);
    });
