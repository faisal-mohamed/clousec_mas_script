require('dotenv').config();

const {
    IAMClient,
    ListUsersCommand,
    ListMFADevicesCommand,
    GetLoginProfileCommand
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

// Check MFA status for all users
async function checkUserMFAStatus() {
    try {
        console.log('Checking IAM user MFA status...');
        
        const usersWithoutMFA = [];
        const usersWithMFA = [];
        const usersWithoutConsoleAccess = [];
        let users = [];

        // Get all users
        const listUsersCommand = new ListUsersCommand({});
        const response = await iamClient.send(listUsersCommand);
        users = response.Users;

        // Check each user's MFA status
        for (const user of users) {
            const hasConsoleAccess = await checkConsoleAccess(user.UserName);
            
            if (!hasConsoleAccess) {
                usersWithoutConsoleAccess.push(user.UserName);
                continue;
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
        console.log('\nUsers without MFA:');
        if (usersWithoutMFA.length === 0) {
            console.log('- None found (Compliant)');
        } else {
            usersWithoutMFA.forEach(username => {
                console.log(`- ${username}`);
            });
        }

        console.log('\nUsers with MFA:');
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

        console.log('\nUsers without console access (MFA not required):');
        if (usersWithoutConsoleAccess.length === 0) {
            console.log('- None found');
        } else {
            usersWithoutConsoleAccess.forEach(username => {
                console.log(`- ${username}`);
            });
        }

        return {
            compliant: usersWithoutMFA.length === 0,
            usersWithoutMFA,
            usersWithMFA,
            usersWithoutConsoleAccess
        };
    } catch (error) {
        console.error('Error checking user MFA status:', error.message);
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
        return response.MFADevices;
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
        throw error;
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
    console.log('\nSecurity implications of users without MFA:');
    console.log('- Increased risk of unauthorized account access');
    console.log('- Vulnerable to password-based attacks');
    console.log('- No second layer of authentication verification');
    console.log('- Higher risk of credential compromise');
    
    console.log('\nRecommendations:');
    if (!results.compliant) {
        console.log('- Enable MFA for all users with console access');
        console.log('- Enforce MFA through IAM policies');
        console.log('- Consider using hardware MFA tokens for privileged users');
        console.log('- Implement MFA device tracking and inventory');
        console.log('- Regular review of MFA compliance');
    } else {
        console.log('- Continue monitoring MFA compliance');
        console.log('- Regularly audit MFA device inventory');
        console.log('- Consider upgrading to hardware MFA tokens');
        console.log('- Document MFA procedures and requirements');
    }
    
    console.log('\nBest practices:');
    console.log('- Enable MFA for all users with console access');
    console.log('- Use hardware MFA tokens for privileged accounts');
    console.log('- Regular MFA device audits');
    console.log('- Document MFA procedures');
    console.log('- Implement MFA enforcement policies');
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

        // Check user MFA status
        const results = await checkUserMFAStatus();

        // Print security recommendations
        printSecurityRecommendations(results);
        
        if (!results.compliant) {
            console.log('\nNon-compliant Status:');
            console.log(`Found ${results.usersWithoutMFA.length} users without MFA.`);
            console.log('Action required: Enable MFA for all users with console access.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\nExecution failed:', error.message);
        process.exit(1);
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
    checkUserMFAStatus,
    getUserMFADevices,
    validateEnvironment
};
