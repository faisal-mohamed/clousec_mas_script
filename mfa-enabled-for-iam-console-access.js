require('dotenv').config();

const {
    IAMClient,
    CreateUserCommand,
    DeleteUserCommand,
    CreateLoginProfileCommand,
    DeleteLoginProfileCommand,
    ListMFADevicesCommand,
    ListUsersCommand,
    GetLoginProfileCommand,
    GetUserCommand
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

// Create user without MFA
async function createUserWithoutMFA() {
    try {
        const username = `no-mfa-user-${Date.now()}`;
        
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

        // Create console password without MFA
        console.log('Creating console access without MFA...');
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
        console.error('Error creating user without MFA:', error.message);
        throw error;
    }
}

// Check MFA status for all users
async function checkMFAStatus() {
    try {
        console.log('\nChecking MFA status for all users...');
        
        const usersWithoutMFA = [];
        const usersWithMFA = [];
        let users = [];

        // Get all users
        const listUsersCommand = new ListUsersCommand({});
        const response = await iamClient.send(listUsersCommand);
        users = response.Users || [];

        // Check each user's MFA and console access status
        for (const user of users) {
            const hasConsoleAccess = await checkConsoleAccess(user.UserName);
            if (!hasConsoleAccess) {
                continue; // Skip users without console access
            }

            const mfaDevices = await getUserMFADevices(user.UserName);
            
            if (mfaDevices.length === 0) {
                usersWithoutMFA.push(user.UserName);
            } else {
                usersWithMFA.push({
                    username: user.UserName,
                    devices: mfaDevices.map(device => ({
                        serial: device.SerialNumber,
                        type: getMFADeviceType(device.SerialNumber)
                    }))
                });
            }
        }

        // Print results
        console.log('\nUsers with console access but no MFA:');
        if (usersWithoutMFA.length === 0) {
            console.log('- None found (Compliant)');
        } else {
            usersWithoutMFA.forEach(username => {
                console.log(`- ${username}`);
            });
        }

        console.log('\nUsers with MFA enabled:');
        if (usersWithMFA.length === 0) {
            console.log('- None found');
        } else {
            usersWithMFA.forEach(user => {
                console.log(`- ${user.username}:`);
                user.devices.forEach(device => {
                    console.log(`  * ${device.type} (${device.serial})`);
                });
            });
        }

        return {
            compliant: usersWithoutMFA.length === 0,
            usersWithoutMFA,
            usersWithMFA
        };
    } catch (error) {
        console.error('Error checking MFA status:', error.message);
        throw error;
    }
}

// Get MFA devices for a specific user
async function getUserMFADevices(username) {
    try {
        const command = new ListMFADevicesCommand({
            UserName: username
        });
        
        const response = await iamClient.send(command);
        return response.MFADevices || [];
    } catch (error) {
        console.error(`Error getting MFA devices for user ${username}:`, error.message);
        return [];
    }
}

// Check if user has console access
async function checkConsoleAccess(username) {
    try {
        const command = new GetLoginProfileCommand({
            UserName: username
        });
        
        await iamClient.send(command);
        return true;
    } catch (error) {
        if (error.name === 'NoSuchEntityException') {
            return false;
        }
        console.error(`Error checking console access for ${username}:`, error.message);
        return false;
    }
}

// Determine MFA device type from serial number
function getMFADeviceType(serialNumber) {
    if (serialNumber.includes(':mfa')) {
        return 'Virtual MFA';
    } else if (serialNumber.includes(':sms-mfa')) {
        return 'SMS MFA';
    } else {
        return 'Hardware MFA';
    }
}

// Print security recommendations
function printSecurityRecommendations(results) {
    console.log('\nSecurity implications of missing MFA:');
    console.log('- Increased risk of unauthorized access');
    console.log('- Vulnerability to password-based attacks');
    console.log('- No second layer of authentication');
    console.log('- Non-compliance with security best practices');
    
    console.log('\nRecommendations:');
    if (!results.compliant) {
        console.log('- Enable MFA for all users with console access');
        console.log('- Implement MFA enforcement through IAM policies');
        console.log('- Consider hardware MFA tokens for privileged users');
        console.log('- Regular MFA compliance audits');
        console.log('- User training on MFA importance');
    } else {
        console.log('- Continue monitoring MFA compliance');
        console.log('- Regular review of MFA device inventory');
        console.log('- Periodic testing of MFA procedures');
        console.log('- Update MFA policies as needed');
    }
    
    console.log('\nBest practices:');
    console.log('- Require MFA for all console access');
    console.log('- Use hardware MFA for privileged accounts');
    console.log('- Regular MFA device audits');
    console.log('- Document MFA procedures');
    console.log('- Implement break-glass procedures');
}

// Cleanup resources with proper sequencing
async function cleanup() {
    console.log('\nStarting cleanup...');

    // First, remove login profiles
    for (const resource of createdResources) {
        if (resource.type === 'LOGIN_PROFILE') {
            try {
                console.log(`Deleting login profile for: ${resource.username}`);
                const deleteLoginCommand = new DeleteLoginProfileCommand({
                    UserName: resource.username
                });
                await iamClient.send(deleteLoginCommand);
                console.log(`Successfully deleted login profile for: ${resource.username}`);
            } catch (error) {
                console.error(`Error deleting login profile: ${error.message}`);
            }
            await delay(1000);
        }
    }

    // Then, remove users
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

        // Create user without MFA
        const username = await createUserWithoutMFA();
        
        // Check MFA status
        const results = await checkMFAStatus();

        // Print security recommendations
        printSecurityRecommendations(results);
        
        if (!results.compliant) {
            console.log('\nNon-compliant Status:');
            console.log(`Found ${results.usersWithoutMFA.length} users without MFA.`);
            console.log('Action required: Enable MFA for all users with console access.');
        }
        
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
    createUserWithoutMFA,
    cleanup,
    validateEnvironment,
    checkMFAStatus
};
