require('dotenv').config();

const {
    IAMClient,
    GetAccountPasswordPolicyCommand,
    UpdateAccountPasswordPolicyCommand,
    DeleteAccountPasswordPolicyCommand
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

// Create non-compliant password policy
async function createNonCompliantPasswordPolicy() {
    try {
        console.log('Creating non-compliant password policy...');
        
        const command = new UpdateAccountPasswordPolicyCommand({
            MinimumPasswordLength: 6, // Non-compliant: Too short (should be >= 14)
            RequireSymbols: false,    // Non-compliant: Should require symbols
            RequireNumbers: false,    // Non-compliant: Should require numbers
            RequireUppercaseCharacters: false, // Non-compliant: Should require uppercase
            RequireLowercaseCharacters: false, // Non-compliant: Should require lowercase
            AllowUsersToChangePassword: true,
            MaxPasswordAge: 180,      // Non-compliant: Too long (should be <= 90 days)
            PasswordReusePrevention: 1, // Non-compliant: Too few (should be >= 24)
            HardExpiry: false        // Non-compliant: Should be true
        });

        await iamClient.send(command);
        console.log('Created non-compliant password policy');
        
    } catch (error) {
        console.error('Error creating password policy:', error.message);
        throw error;
    }
}

// Get current password policy
async function getPasswordPolicy() {
    try {
        const command = new GetAccountPasswordPolicyCommand({});
        const response = await iamClient.send(command);
        
        console.log('\nCurrent Password Policy:');
        console.log('- Minimum Length:', response.PasswordPolicy.MinimumPasswordLength);
        console.log('- Require Symbols:', response.PasswordPolicy.RequireSymbols);
        console.log('- Require Numbers:', response.PasswordPolicy.RequireNumbers);
        console.log('- Require Uppercase:', response.PasswordPolicy.RequireUppercaseCharacters);
        console.log('- Require Lowercase:', response.PasswordPolicy.RequireLowercaseCharacters);
        console.log('- Allow Users to Change:', response.PasswordPolicy.AllowUsersToChangePassword);
        console.log('- Max Password Age:', response.PasswordPolicy.MaxPasswordAge);
        console.log('- Password Reuse Prevention:', response.PasswordPolicy.PasswordReusePrevention);
        console.log('- Hard Expiry:', response.PasswordPolicy.HardExpiry);
        
        return response.PasswordPolicy;
    } catch (error) {
        if (error.name === 'NoSuchEntityException') {
            console.log('No password policy is currently set');
            return null;
        }
        console.error('Error getting password policy:', error.message);
        throw error;
    }
}

// Check policy compliance
function checkPolicyCompliance(policy) {
    const issues = [];
    
    if (!policy) {
        issues.push('No password policy is set');
        return issues;
    }

    if (policy.MinimumPasswordLength < 14) {
        issues.push('Minimum password length should be at least 14 characters');
    }
    
    if (!policy.RequireSymbols) {
        issues.push('Password policy should require symbols');
    }
    
    if (!policy.RequireNumbers) {
        issues.push('Password policy should require numbers');
    }
    
    if (!policy.RequireUppercaseCharacters) {
        issues.push('Password policy should require uppercase characters');
    }
    
    if (!policy.RequireLowercaseCharacters) {
        issues.push('Password policy should require lowercase characters');
    }
    
    if (policy.MaxPasswordAge > 90) {
        issues.push('Maximum password age should be 90 days or less');
    }
    
    if (!policy.PasswordReusePrevention || policy.PasswordReusePrevention < 24) {
        issues.push('Password reuse prevention should remember at least 24 passwords');
    }
    
    if (!policy.HardExpiry) {
        issues.push('Hard expiry should be enabled');
    }

    return issues;
}

// Cleanup resources
async function cleanup() {
    console.log('\nStarting cleanup...');

    try {
        console.log('Deleting password policy...');
        const command = new DeleteAccountPasswordPolicyCommand({});
        await iamClient.send(command);
        console.log('Successfully deleted password policy');
    } catch (error) {
        console.error('Error during cleanup:', error.message);
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

        // Store current policy for restoration
        console.log('\nChecking current password policy...');
        const originalPolicy = await getPasswordPolicy();

        // Create non-compliant policy
        await createNonCompliantPasswordPolicy();
        
        // Get and check new policy
        const newPolicy = await getPasswordPolicy();
        const complianceIssues = checkPolicyCompliance(newPolicy);

        console.log('\nNon-compliance details:');
        complianceIssues.forEach(issue => {
            console.log(`- ${issue}`);
        });
        
        console.log('\nRecommended settings:');
        console.log('- Minimum password length: 14 characters');
        console.log('- Require symbols: Yes');
        console.log('- Require numbers: Yes');
        console.log('- Require uppercase characters: Yes');
        console.log('- Require lowercase characters: Yes');
        console.log('- Maximum password age: 90 days');
        console.log('- Password reuse prevention: 24 passwords');
        console.log('- Hard expiry: Yes');
        
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
    createNonCompliantPasswordPolicy,
    cleanup,
    validateEnvironment,
    checkPolicyCompliance
};
