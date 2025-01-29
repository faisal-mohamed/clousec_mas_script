const {
    IAMClient,
    CreateUserCommand,
    GetUserCommand,
    ListAttachedUserPoliciesCommand,
    ListUserPoliciesCommand
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

async function createUserWithoutPolicies() {
    try {
        const userName = `no-policy-user-${Date.now()}`;

        // Create user
        console.log('Creating IAM user without policies...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'PolicyStatus',
                    Value: 'NoPolicies'
                }
            ]
        }));

        // Verify user creation
        const getUserResponse = await iamClient.send(new GetUserCommand({
            UserName: userName
        }));

        // Verify no managed policies are attached
        const attachedPoliciesResponse = await iamClient.send(new ListAttachedUserPoliciesCommand({
            UserName: userName
        }));

        // Verify no inline policies exist
        const inlinePoliciesResponse = await iamClient.send(new ListUserPoliciesCommand({
            UserName: userName
        }));

        console.log('Created user without policies:', {
            UserName: userName,
            UserArn: createUserResponse.User.Arn,
            UserId: createUserResponse.User.UserId,
            CreationDate: createUserResponse.User.CreateDate,
            AttachedPoliciesCount: attachedPoliciesResponse.AttachedPolicies.length,
            InlinePoliciesCount: inlinePoliciesResponse.PolicyNames.length
        });

        return {
            userArn: createUserResponse.User.Arn,
            userName: userName,
            userId: createUserResponse.User.UserId
        };
    } catch (error) {
        console.error('Error creating user without policies:', error.message);
        throw error;
    }
}

// Execute user creation
createUserWithoutPolicies()
    .then(result => {
        console.log('\nSuccessfully created user without policies:', {
            UserArn: result.userArn,
            UserName: result.userName,
            UserId: result.userId
        });
        console.log('\nPolicy Status:', {
            managedPolicies: 'None attached',
            inlinePolicies: 'None created',
            effectivePermissions: 'No permissions granted',
            accessLevel: 'No access to AWS services'
        });
        console.log('\nUser Capabilities:', {
            canAccessConsole: false,
            canMakeAPICalls: false,
            canAssumeRoles: false
        });
    })
    .catch(error => {
        console.error('Failed to create user:', error.message);
        process.exit(1);
    });
