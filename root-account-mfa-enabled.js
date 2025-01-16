require('dotenv').config();

const {
    IAMClient,
    GetAccountSummaryCommand,
    CreateVirtualMFADeviceCommand,
    DeleteVirtualMFADeviceCommand,
    ListVirtualMFADevicesCommand,
    GetAccountPasswordPolicyCommand
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

// Create non-compliant scenario (demonstration with virtual MFA)
async function createNonCompliantScenario() {
    try {
        // Create virtual MFA device
        console.log('Creating virtual MFA device for demonstration...');
        const virtualMFAName = `demo-virtual-mfa-${Date.now()}`;
        const createMFACommand = new CreateVirtualMFADeviceCommand({
            VirtualMFADeviceName: virtualMFAName
        });
        
        const mfaResponse = await iamClient.send(createMFACommand);
        createdResources.push({ 
            type: 'VIRTUAL_MFA', 
            serialNumber: mfaResponse.VirtualMFADevice.SerialNumber 
        });
        console.log(`Created virtual MFA device: ${virtualMFAName}`);

        // Note: We can't actually disable root account MFA programmatically
        // This is just for demonstration purposes
        console.log('\nNote: Root account MFA can only be managed through the AWS Management Console');
        console.log('This script can only check the current status and demonstrate concepts');

        return virtualMFAName;
    } catch (error) {
        console.error('Error creating non-compliant scenario:', error.message);
        throw error;
    }
}

// Check root account MFA status
async function checkRootAccountMFA() {
    try {
        console.log('\nChecking root account MFA status...');

        // Get account summary
        const summaryCommand = new GetAccountSummaryCommand({});
        const summaryResponse = await iamClient.send(summaryCommand);
        
        const accountMFAEnabled = summaryResponse.SummaryMap.AccountMFAEnabled === 1;
        
        if (!accountMFAEnabled) {
            console.log('\nNon-compliant: Root account MFA is not enabled');
            return {
                compliant: false,
                reason: 'MFA not enabled'
            };
        }

        // Check for virtual MFA devices
        const virtualMFACommand = new ListVirtualMFADevicesCommand({
            AssignmentStatus: 'Assigned'
        });
        const virtualMFAResponse = await iamClient.send(virtualMFACommand);
        
        // Check if root account has MFA devices
        const rootMFADevices = virtualMFAResponse.VirtualMFADevices.filter(device => 
            device.SerialNumber.includes(':root-account-mfa-device')
        );

        console.log('\nRoot account MFA status:');
        console.log('- MFA Enabled:', accountMFAEnabled ? 'Yes' : 'No');
        console.log('- Virtual MFA Devices:', rootMFADevices.length);

        return {
            compliant: accountMFAEnabled,
            virtualMFACount: rootMFADevices.length,
            devices: rootMFADevices
        };

    } catch (error) {
        console.error('Error checking root account MFA:', error.message);
        throw error;
    }
}

// Get account password policy
async function getAccountPasswordPolicy() {
    try {
        const command = new GetAccountPasswordPolicyCommand({});
        const response = await iamClient.send(command);
        return response.PasswordPolicy;
    } catch (error) {
        if (error.name === 'NoSuchEntityException') {
            return null;
        }
        throw error;
    }
}

// Print security recommendations
function printSecurityRecommendations(results) {
    console.log('\nSecurity implications of disabled root MFA:');
    console.log('- Critical vulnerability to unauthorized access');
    console.log('- Single factor authentication only');
    console.log('- Increased risk of account compromise');
    console.log('- Non-compliance with security best practices');
    
    console.log('\nRecommendations:');
    if (!results.compliant) {
        console.log('- Enable MFA for root account immediately');
        console.log('- Consider hardware MFA device for maximum security');
        console.log('- Store MFA device securely');
        console.log('- Document MFA recovery procedures');
        console.log('- Regular testing of MFA authentication');
    } else {
        console.log('- Maintain secure storage of MFA device');
        console.log('- Regular testing of MFA procedures');
        console.log('- Consider hardware MFA if using virtual');
        console.log('- Document recovery procedures');
        console.log('- Periodic review of root account security');
    }
    
    console.log('\nBest practices:');
    console.log('- Always enable MFA for root account');
    console.log('- Use hardware MFA when possible');
    console.log('- Secure storage of MFA devices');
    console.log('- Regular security audits');
    console.log('- Limited use of root account');
}

// Print account security status
async function printAccountSecurityStatus() {
    try {
        console.log('\nAccount Security Status:');
        
        // Get account summary
        const summaryCommand = new GetAccountSummaryCommand({});
        const summaryResponse = await iamClient.send(summaryCommand);
        
        console.log('\nAccount Summary:');
        console.log('- MFA Enabled:', summaryResponse.SummaryMap.AccountMFAEnabled === 1 ? 'Yes' : 'No');
        console.log('- Total Users:', summaryResponse.SummaryMap.Users);
        console.log('- Total Groups:', summaryResponse.SummaryMap.Groups);
        console.log('- Total Roles:', summaryResponse.SummaryMap.Roles);
        console.log('- Total Policies:', summaryResponse.SummaryMap.Policies);

        // Get password policy
        const passwordPolicy = await getAccountPasswordPolicy();
        
        console.log('\nPassword Policy:');
        if (passwordPolicy) {
            console.log('- Minimum Length:', passwordPolicy.MinimumPasswordLength);
            console.log('- Require Symbols:', passwordPolicy.RequireSymbols);
            console.log('- Require Numbers:', passwordPolicy.RequireNumbers);
            console.log('- Require Uppercase:', passwordPolicy.RequireUppercaseCharacters);
            console.log('- Require Lowercase:', passwordPolicy.RequireLowercaseCharacters);
            console.log('- Password Reuse Prevention:', passwordPolicy.PasswordReusePrevention || 'Not enabled');
            console.log('- Max Password Age:', passwordPolicy.MaxPasswordAge || 'Not set');
        } else {
            console.log('No custom password policy configured');
        }

    } catch (error) {
        console.error('Error getting account security status:', error.message);
    }
}

// Cleanup resources
async function cleanup() {
    console.log('\nStarting cleanup...');

    // Delete virtual MFA devices
    for (const resource of createdResources) {
        if (resource.type === 'VIRTUAL_MFA') {
            try {
                console.log(`Deleting virtual MFA device: ${resource.serialNumber}`);
                const deleteMFACommand = new DeleteVirtualMFADeviceCommand({
                    SerialNumber: resource.serialNumber
                });
                await iamClient.send(deleteMFACommand);
                console.log('Virtual MFA device deleted successfully');
            } catch (error) {
                console.error(`Error deleting virtual MFA device: ${error.message}`);
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

        // Create non-compliant scenario
        console.log('\nCreating non-compliant scenario...');
        const virtualMFAName = await createNonCompliantScenario();
        
        // Check root account MFA status
        const results = await checkRootAccountMFA();

        // Print account security status
        await printAccountSecurityStatus();

        // Print security recommendations
        printSecurityRecommendations(results);
        
        if (!results.compliant) {
            console.log('\nNon-compliant Status:');
            console.log(`Reason: ${results.reason}`);
            console.log('Action required: Enable MFA for root account');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\nExecution failed:', error.message);
        process.exit(1);
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
    createNonCompliantScenario,
    checkRootAccountMFA,
    cleanup,
    validateEnvironment
};
