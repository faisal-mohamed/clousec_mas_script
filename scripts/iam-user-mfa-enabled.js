const {
    IAMClient,
    CreateUserCommand,
    CreateLoginProfileCommand,
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

async function createUserWithoutMFA() {
    try {
        const userName = `no-mfa-user-${Date.now()}`;
        // Generate a random password that meets AWS requirements
        const initialPassword = generateSecurePassword();

        // Create user
        console.log('Creating IAM user without MFA...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'MFAStatus',
                    Value: 'Disabled'
                }
            ]
        }));

        // Create login profile (console access) without requiring MFA
        console.log('Setting up console access...');
        await iamClient.send(new CreateLoginProfileCommand({
            UserName: userName,
            Password: initialPassword,
            PasswordResetRequired: true
        }));

        // Verify user creation
        const getUserResponse = await iamClient.send(new GetUserCommand({
            UserName: userName
        }));

        console.log('Created user without MFA:', {
            UserName: userName,
            UserArn: createUserResponse.User.Arn,
            UserId: createUserResponse.User.UserId,
            CreationDate: createUserResponse.User.CreateDate,
            Path: createUserResponse.User.Path
        });

        return {
            userArn: createUserResponse.User.Arn,
            userName: userName,
            userId: createUserResponse.User.UserId,
            initialPassword: initialPassword
        };
    } catch (error) {
        console.error('Error creating user without MFA:', error.message);
        throw error;
    }
}

// Helper function to generate a secure password
function generateSecurePassword() {
    const length = 16;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|';
    let password = '';
    
    // Ensure at least one of each required character type
    password += 'A'; // uppercase
    password += 'a'; // lowercase
    password += '1'; // number
    password += '!'; // special character
    
    // Fill rest with random characters
    for (let i = password.length; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Execute user creation
createUserWithoutMFA()
    .then(result => {
        console.log('\nSuccessfully created user without MFA:', {
            UserArn: result.userArn,
            UserName: result.userName,
            UserId: result.userId
        });
        console.log('\nInitial Login Credentials:', {
            username: result.userName,
            password: result.initialPassword,
            passwordResetRequired: true
        });
        console.log('\nSecurity Status:', {
            mfaEnabled: false,
            passwordStatus: 'Temporary password set',
            securityRecommendation: 'Consider enabling MFA for production use'
        });
    })
    .catch(error => {
        console.error('Failed to create user:', error.message);
        process.exit(1);
    });
