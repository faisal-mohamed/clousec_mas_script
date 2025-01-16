require('dotenv').config();

const {
    IAMClient,
    GetAccountSummaryCommand,
    ListAccessKeysCommand
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

// Check for root access keys
async function checkRootAccessKeys() {
    try {
        console.log('Checking for root account access keys...');
        
        // Get account summary
        const summaryCommand = new GetAccountSummaryCommand({});
        const summaryResponse = await iamClient.send(summaryCommand);
        
        // Check if root account has access keys
        const rootAccessKeysExist = summaryResponse.SummaryMap.AccountAccessKeysPresent > 0;
        
        if (rootAccessKeysExist) {
            console.log('\nNon-compliant: Root account has active access keys');
            return true;
        } else {
            console.log('\nCompliant: No root account access keys found');
            return false;
        }
    } catch (error) {
        console.error('Error checking root access keys:', error.message);
        throw error;
    }
}

// Get account details
async function getAccountDetails() {
    try {
        const command = new GetAccountSummaryCommand({});
        const response = await iamClient.send(command);
        
        console.log('\nAccount Summary:');
        console.log('- Users:', response.SummaryMap.Users);
        console.log('- Groups:', response.SummaryMap.Groups);
        console.log('- Roles:', response.SummaryMap.Roles);
        console.log('- Policies:', response.SummaryMap.Policies);
        console.log('- Root Access Keys Present:', response.SummaryMap.AccountAccessKeysPresent);
        
        return response.SummaryMap;
    } catch (error) {
        console.error('Error getting account details:', error.message);
        throw error;
    }
}

// Print security recommendations
function printSecurityRecommendations(hasRootKeys) {
    console.log('\nSecurity implications of root access keys:');
    console.log('- Root account has unrestricted access to all AWS services and resources');
    console.log('- Root access keys provide programmatic access with full administrative privileges');
    console.log('- If compromised, attacker gains complete control over the AWS account');
    console.log('- Difficult to track and audit root account usage');
    
    console.log('\nRecommendations:');
    if (hasRootKeys) {
        console.log('- Immediately delete any existing root account access keys');
        console.log('- Create IAM users with appropriate permissions for programmatic access');
        console.log('- Enable MFA for the root account');
        console.log('- Store root account credentials securely');
        console.log('- Use root account only for specific account and service management tasks');
    } else {
        console.log('- Continue to avoid creating root account access keys');
        console.log('- Maintain use of IAM users for programmatic access');
        console.log('- Regularly review and rotate IAM user access keys');
        console.log('- Implement proper key rotation policies');
    }
    
    console.log('\nBest practices:');
    console.log('- Use IAM roles for applications running on AWS services');
    console.log('- Implement least privilege access');
    console.log('- Enable AWS CloudTrail for API activity logging');
    console.log('- Regularly monitor and review IAM credentials reports');
    console.log('- Use AWS Organizations for multi-account management');
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

        // Check for root access keys
        const hasRootKeys = await checkRootAccessKeys();
        
        // Get account details
        await getAccountDetails();

        // Print security recommendations
        printSecurityRecommendations(hasRootKeys);
        
        if (hasRootKeys) {
            console.log('\nCritical Security Risk:');
            console.log('Root account access keys detected. Immediate action required.');
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
    checkRootAccessKeys,
    getAccountDetails,
    validateEnvironment
};
