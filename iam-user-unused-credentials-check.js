require('dotenv').config();

const {
    IAMClient,
    CreateUserCommand,
    CreateAccessKeyCommand,
    DeleteUserCommand,
    DeleteAccessKeyCommand,
    GetAccessKeyLastUsedCommand,
    ListAccessKeysCommand,
    CreateLoginProfileCommand,
    DeleteLoginProfileCommand,
    GetLoginProfileCommand,
    GenerateCredentialReportCommand,
    GetCredentialReportCommand
} = require("@aws-sdk/client-iam");

// Initialize IAM client
const iamClient = new IAMClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

// Track created resources
const createdResources = [];

// Add delay function for better resource creation handling
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Create user with unused credentials
async function createUserWithUnusedCredentials() {
    try {
        const username = `unused-creds-user-${Date.now()}`;
        
        // Create user
        console.log('Creating IAM user...');
        const createUserCommand = new CreateUserCommand({
            UserName: username
        });
        
        await iamClient.send(createUserCommand);
        createdResources.push({ type: 'USER', name: username });
        console.log(`Created user: ${username}`);

        // Wait briefly for user creation to propagate
        await delay(2000);

        // Create access key
        console.log('Creating access key...');
        const createKeyCommand = new CreateAccessKeyCommand({
            UserName: username
        });
        
        const keyResponse = await iamClient.send(createKeyCommand);
        createdResources.push({ 
            type: 'ACCESS_KEY', 
            id: keyResponse.AccessKey.AccessKeyId,
            username: username 
        });
        console.log(`Created access key: ${keyResponse.AccessKey.AccessKeyId}`);

        // Wait briefly before creating login profile
        await delay(2000);

        // Create console password
        console.log('Creating console access...');
        const createLoginCommand = new CreateLoginProfileCommand({
            UserName: username,
            Password: 'ComplexPass123!@#',
            PasswordResetRequired: true
        });
        
        await iamClient.send(createLoginCommand);
        createdResources.push({ type: 'LOGIN_PROFILE', username: username });
        console.log('Created console access profile');

        // Wait for resources to be fully created
        await delay(5000);

        return username;
    } catch (error) {
        console.error('Error creating user with unused credentials:', error.message);
        throw error;
    }
}

// Check credential usage
async function checkCredentialUsage(username) {
    try {
        console.log(`\nChecking credential usage for user: ${username}`);
        
        // Get access keys
        const listKeysCommand = new ListAccessKeysCommand({
            UserName: username
        });
        const keysResponse = await iamClient.send(listKeysCommand);
        
        // Check if AccessKeys exists and is an array
        const accessKeys = keysResponse.AccessKeys || [];
        
        if (accessKeys.length === 0) {
            console.log('No access keys found for user');
        } else {
            // Check each access key's last usage
            for (const key of accessKeys) {
                const lastUsedCommand = new GetAccessKeyLastUsedCommand({
                    AccessKeyId: key.AccessKeyId
                });
                
                const lastUsedResponse = await iamClient.send(lastUsedCommand);
                console.log(`\nAccess Key: ${key.AccessKeyId}`);
                console.log('Last Used:', lastUsedResponse.AccessKeyLastUsed?.LastUsedDate || 'Never');
                if (lastUsedResponse.AccessKeyLastUsed?.ServiceName) {
                    console.log('Service:', lastUsedResponse.AccessKeyLastUsed.ServiceName);
                    console.log('Region:', lastUsedResponse.AccessKeyLastUsed.Region);
                }
            }
        }

        // Check console access
        try {
            const loginCommand = new GetLoginProfileCommand({
                UserName: username
            });
            await iamClient.send(loginCommand);
            console.log('\nConsole Access: Enabled (unused)');
        } catch (error) {
            if (error.name === 'NoSuchEntityException') {
                console.log('\nConsole Access: Not enabled');
            } else {
                console.log('\nError checking console access:', error.message);
            }
        }

        return accessKeys;
    } catch (error) {
        console.error('Error checking credential usage:', error.message);
        throw error;
    }
}

// Generate and get credential report
async function getCredentialReport() {
    try {
        // Generate report
        console.log('\nGenerating credential report...');
        const generateCommand = new GenerateCredentialReportCommand({});
        await iamClient.send(generateCommand);

        // Wait for report to be ready
        let reportReady = false;
        let attempts = 0;
        while (!reportReady && attempts < 10) {
            try {
                const getReportCommand = new GetCredentialReportCommand({});
                const report = await iamClient.send(getReportCommand);
                
                // Convert report from Buffer to string and parse CSV
                const reportContent = report.Content.toString('utf-8');
                const rows = reportContent.split('\n');
                const headers = rows[0].split(',');
                
                console.log('\nCredential Report Summary:');
                for (let i = 1; i < rows.length; i++) {
                    const values = rows[i].split(',');
                    const user = {};
                    headers.forEach((header, index) => {
                        user[header] = values[index];
                    });
                    
                    if (user.user === createdResources[0]?.name) {
                        console.log(`\nUser: ${user.user}`);
                        console.log(`Password Enabled: ${user.password_enabled}`);
                        console.log(`Password Last Used: ${user.password_last_used}`);
                        console.log(`Access Key 1 Active: ${user.access_key_1_active}`);
                        console.log(`Access Key 1 Last Used: ${user.access_key_1_last_used_date}`);
                        console.log(`Access Key 2 Active: ${user.access_key_2_active}`);
                        console.log(`Access Key 2 Last Used: ${user.access_key_2_last_used_date}`);
                    }
                }
                
                reportReady = true;
            } catch (error) {
                if (error.name === 'ReportInProgressException') {
                    await delay(2000);
                    attempts++;
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error getting credential report:', error.message);
    }
}

// Cleanup resources with proper sequencing
async function cleanup() {
    console.log('\nStarting cleanup...');

    // Helper to retry an async operation with exponential backoff
    async function retryWithBackoff(operation, attempts = 5, delayMs = 1000) {
        for (let i = 0; i < attempts; i++) {
            try {
                return await operation();
            } catch (error) {
                if (i === attempts - 1) {
                    throw error;
                }
                console.log(`Retrying in ${delayMs}ms...`);
                await delay(delayMs);
                delayMs *= 2; // Exponential backoff
            }
        }
    }

    // First, remove access keys
    for (const resource of createdResources) {
        if (resource.type === 'ACCESS_KEY') {
            try {
                console.log(`Deleting access key: ${resource.id}`);
                const deleteKeyCommand = new DeleteAccessKeyCommand({
                    UserName: resource.username,
                    AccessKeyId: resource.id
                });
                await iamClient.send(deleteKeyCommand);
                console.log(`Successfully deleted access key: ${resource.id}`);
            } catch (error) {
                console.error(`Error deleting access key: ${error.message}`);
            }
            await delay(1000);
        }
    }

    // Then, remove login profiles
    for (const resource of createdResources) {
        if (resource.type === 'LOGIN_PROFILE') {
            try {
                console.log(`Deleting login profile for: ${resource.username}`);
                const deleteLoginCommand = new DeleteLoginProfileCommand({
                    UserName: resource.username
                });
                await retryWithBackoff(() => iamClient.send(deleteLoginCommand));
                console.log(`Successfully deleted login profile for: ${resource.username}`);
            } catch (error) {
                console.error(`Error deleting login profile: ${error.message}`);
            }
            await delay(1000);
        }
    }

    // Finally, remove users
    for (const resource of createdResources) {
        if (resource.type === 'USER') {
            try {
                console.log(`Deleting user: ${resource.name}`);
                const deleteUserCommand = new DeleteUserCommand({
                    UserName: resource.name
                });
                await iamClient.send(deleteUserCommand);
                console.log(`Successfully deleted user: ${resource.name}`);
            } catch (error) {
                console.error(`Error deleting user: ${error.message}`);
            }
            await delay(1000);
        }
    }
}


// Print security recommendations
function printSecurityRecommendations() {
    console.log('\nSecurity implications of unused credentials:');
    console.log('- Increased attack surface');
    console.log('- Potential unauthorized access');
    console.log('- Violation of security best practices');
    console.log('- Complicates credential management');
    
    console.log('\nRecommendations:');
    console.log('- Regularly monitor credential usage');
    console.log('- Remove unused access keys');
    console.log('- Disable unused console access');
    console.log('- Implement credential rotation policies');
    console.log('- Use AWS Organizations for centralized control');
    
    console.log('\nBest practices:');
    console.log('- Review credentials every 90 days');
    console.log('- Remove unused credentials immediately');
    console.log('- Enable AWS CloudTrail for monitoring');
    console.log('- Use temporary credentials when possible');
    console.log('- Implement least privilege access');
}

// Validate environment variables
function validateEnvironment() {
    const required = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_REGION'
    ];

    const missing = required.filter(env => !process.env[env]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Main execution
async function main() {
    try {
        // Validate environment
        validateEnvironment();
        console.log('Environment validation passed');

        // Create user with unused credentials
        const username = await createUserWithUnusedCredentials();
        
        // Check credential usage
        await checkCredentialUsage(username);

        // Generate and get credential report
        await getCredentialReport();

        // Print security recommendations
        printSecurityRecommendations();
        
    } catch (error) {
        console.error('\nExecution failed:', error.message);
    } finally {
        // Cleanup resources
        await cleanup();
        console.log('\nCleanup completed');
    }
}

// Execute if running directly
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}

module.exports = {
    createUserWithUnusedCredentials,
    cleanup,
    validateEnvironment,
    checkCredentialUsage
};
