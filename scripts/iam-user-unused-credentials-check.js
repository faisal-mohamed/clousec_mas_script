require('dotenv').config();

const {
    IAMClient,
    CreateUserCommand,
    CreateAccessKeyCommand,
    UpdateAccessKeyCommand,
    CreateServiceSpecificCredentialCommand,
    UpdateServiceSpecificCredentialCommand,
    CreateLoginProfileCommand,
    GetUserCommand
} = require("@aws-sdk/client-iam");

// Initialize IAM client
const iamClient = new IAMClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createUserWithInactiveCredentials() {
    try {
        const userName = `inactive-creds-user-${Date.now()}`;
        const initialPassword = 'TemporaryPass123!@#';

        // Create user
        console.log('Creating IAM user...');
        const createUserResponse = await iamClient.send(new CreateUserCommand({
            UserName: userName,
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'CredentialStatus',
                    Value: 'Inactive'
                }
            ]
        }));

        // Create and then deactivate access key
        console.log('Creating and deactivating access key...');
        const accessKeyResponse = await iamClient.send(new CreateAccessKeyCommand({
            UserName: userName
        }));

        // Deactivate the access key
        await iamClient.send(new UpdateAccessKeyCommand({
            UserName: userName,
            AccessKeyId: accessKeyResponse.AccessKey.AccessKeyId,
            Status: 'Inactive'
        }));

        // Create and deactivate service-specific credentials (for CodeCommit)
        console.log('Creating and deactivating service credentials...');
        const serviceCredResponse = await iamClient.send(new CreateServiceSpecificCredentialCommand({
            UserName: userName,
            ServiceName: 'codecommit.amazonaws.com'
        }));

        // Deactivate service-specific credentials
        await iamClient.send(new UpdateServiceSpecificCredentialCommand({
            UserName: userName,
            ServiceSpecificCredentialId: serviceCredResponse.ServiceSpecificCredential.ServiceSpecificCredentialId,
            Status: 'Inactive'
        }));

        // Create login profile (will be inactive due to password policy)
        console.log('Creating console access profile...');
        await iamClient.send(new CreateLoginProfileCommand({
            UserName: userName,
            Password: initialPassword,
            PasswordResetRequired: true
        }));

        // Verify user creation
        const getUserResponse = await iamClient.send(new GetUserCommand({
            UserName: userName
        }));

        console.log('Created user with inactive credentials:', {
            UserName: userName,
            UserArn: createUserResponse.User.Arn,
            UserId: createUserResponse.User.UserId,
            CreationDate: createUserResponse.User.CreateDate
        });

        return {
            userArn: createUserResponse.User.Arn,
            userName: userName,
            userId: createUserResponse.User.UserId,
            accessKeyId: accessKeyResponse.AccessKey.AccessKeyId,
            serviceCredentialId: serviceCredResponse.ServiceSpecificCredential.ServiceSpecificCredentialId
        };
    } catch (error) {
        console.error('Error creating user with inactive credentials:', error.message);
        throw error;
    }
}

// Execute user creation
createUserWithInactiveCredentials()
    .then(result => {
        console.log('\nSuccessfully created user with inactive credentials:', {
            UserArn: result.userArn,
            UserName: result.userName,
            UserId: result.userId
        });
        console.log('\nCredential Status:', {
            accessKey: {
                id: result.accessKeyId,
                status: 'Inactive'
            },
            serviceCredential: {
                id: result.serviceCredentialId,
                status: 'Inactive',
                service: 'codecommit.amazonaws.com'
            },
            consoleAccess: {
                status: 'Password reset required',
                active: false
            }
        });
        console.log('\nSecurity Note:', {
            message: 'All credentials are in inactive state',
            accessStatus: 'No active credentials available',
            reactivationRequired: true
        });
    })
    .catch(error => {
        console.error('Failed to create user:', error.message);
        process.exit(1);
    });
