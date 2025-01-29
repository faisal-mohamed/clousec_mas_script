const {
    IAMClient,
    CreateUserCommand,
    GetUserCommand
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

async function createStandaloneUser() {
    try {
        const userName = `standalone-user-${Date.now()}`;

        // Create user
        console.log('Creating standalone IAM user...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'Type',
                    Value: 'Standalone'
                }
            ]
        }));

        // Verify user creation
        const getUserResponse = await iamClient.send(new GetUserCommand({
            UserName: userName
        }));

        console.log('Created standalone user:', {
            UserName: userName,
            UserArn: createUserResponse.User.Arn,
            UserId: createUserResponse.User.UserId,
            CreationDate: createUserResponse.User.CreateDate,
            Path: createUserResponse.User.Path
        });

        return {
            userArn: createUserResponse.User.Arn,
            userName: userName,
            userId: createUserResponse.User.UserId
        };
    } catch (error) {
        console.error('Error creating standalone user:', error.message);
        throw error;
    }
}

// Execute user creation
createStandaloneUser()
    .then(result => {
        console.log('\nSuccessfully created standalone user:', {
            UserArn: result.userArn,
            UserName: result.userName,
            UserId: result.userId
        });
        console.log('\nUser Status:', {
            groupMembership: 'None',
            permissions: 'None - User has no permissions',
            accessKeys: 'None created',
            passwordStatus: 'No console access password set'
        });
    })
    .catch(error => {
        console.error('Failed to create user:', error.message);
        process.exit(1);
    });
