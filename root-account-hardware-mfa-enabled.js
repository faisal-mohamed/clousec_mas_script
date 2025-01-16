require('dotenv').config();

const {
    IAMClient,
    CreateVirtualMFADeviceCommand,
    DeleteVirtualMFADeviceCommand,
    GetAccountSummaryCommand,
    ListVirtualMFADevicesCommand,
    GetAccountPasswordPolicyCommand,
    CreateUserCommand,
    DeleteUserCommand,
    AttachUserPolicyCommand,
    DetachUserPolicyCommand,
    CreatePolicyCommand,
    DeletePolicyCommand
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

// Create non-compliant scenario (demonstration user with virtual MFA)
async function createNonCompliantScenario() {
    try {
        const username = `demo-virtual-mfa-user-${Date.now()}`;
        
        // Create user
        console.log('Creating demonstration user...');
        const createUserCommand = new CreateUserCommand({
            UserName: username
        });
        
        await iamClient.send(createUserCommand);
        createdResources.push({ type: 'USER', name: username });
        console.log(`Created user: ${username}`);

        // Create virtual MFA device
        console.log('Creating virtual MFA device...');
        const virtualMFAName = `virtual-mfa-${Date.now()}`;
        const createMFACommand = new CreateVirtualMFADeviceCommand({
            VirtualMFADeviceName: virtualMFAName
        });
        
        const mfaResponse = await iamClient.send(createMFACommand);
        createdResources.push({ 
            type: 'VIRTUAL_MFA', 
            serialNumber: mfaResponse.VirtualMFADevice.SerialNumber 
        });
        console.log(`Created virtual MFA device: ${virtualMFAName}`);

        // Create demonstration policy
        const policyDocument = {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Action: [
                    'iam:ListVirtualMFADevices',
                    'iam:GetAccountSummary'
                ],
                Resource: '*'
            }]
        };

        const createPolicyCommand = new CreatePolicyCommand({
            PolicyName: `demo-policy-${Date.now()}`,
            PolicyDocument: JSON.stringify(policyDocument)
        });

        const policyResponse = await iamClient.send(createPolicyCommand);
        createdResources.push({ 
            type: 'POLICY', 
            arn: policyResponse.Policy.Arn 
        });
        console.log(`Created policy: ${policyResponse.Policy.PolicyName}`);

        // Attach policy to user
        const attachPolicyCommand = new AttachUserPolicyCommand({
            UserName: username,
            PolicyArn: policyResponse.Policy.Arn
        });

        await iamClient.send(attachPolicyCommand);
        console.log('Attached policy to user');

        return username;
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
        
        // Check if root account is using virtual MFA
        const rootVirtualMFA = virtualMFAResponse.VirtualMFADevices.find(device => 
            device.SerialNumber.includes(':root-account-mfa-device')
        );

        if (rootVirtualMFA) {
            console.log('\nNon-compliant: Root account is using virtual MFA instead of hardware MFA');
            return {
                compliant: false,
                reason: 'Virtual MFA in use'
            };
        }

        console.log('\nCompliant: Root account appears to be using hardware MFA');
        return {
            compliant: true
        };

    } catch (error) {
        console.error('Error checking root account MFA:', error.message);
        throw error;
    }
}

// Cleanup resources with proper sequencing
async function cleanup() {
    console.log('\nStarting cleanup...');

    // First, detach policies from users
    for (const resource of createdResources) {
        if (resource.type === 'POLICY') {
            try {
                // Find associated user
                const user = createdResources.find(r => r.type === 'USER');
                if (user) {
                    console.log(`Detaching policy ${resource.arn} from user ${user.name}`);
                    const detachCommand = new DetachUserPolicyCommand({
                        UserName: user.name,
                        PolicyArn: resource.arn
                    });
                    await iamClient.send(detachCommand);
                    console.log('Policy detached successfully');
                }
            } catch (error) {
                console.error(`Error detaching policy: ${error.message}`);
            }
            await delay(1000);
        }
    }

    // Then, delete policies
    for (const resource of createdResources) {
        if (resource.type === 'POLICY') {
            try {
                console.log(`Deleting policy: ${resource.arn}`);
                const deletePolicyCommand = new DeletePolicyCommand({
                    PolicyArn: resource.arn
                });
                await iamClient.send(deletePolicyCommand);
                console.log('Policy deleted successfully');
            } catch (error) {
                console.error(`Error deleting policy: ${error.message}`);
            }
            await delay(1000);
        }
    }

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

    // Finally, delete users
    for (const resource of createdResources) {
        if (resource.type === 'USER') {
            try {
                console.log(`Deleting user: ${resource.name}`);
                const deleteUserCommand = new DeleteUserCommand({
                    UserName: resource.name
                });
                await iamClient.send(deleteUserCommand);
                console.log('User deleted successfully');
            } catch (error) {
                console.error(`Error deleting user: ${error.message}`);
            }
            await delay(1000);
        }
    }
}

// Print security recommendations
function printSecurityRecommendations(results) {
    // ... (rest of the printSecurityRecommendations function remains the same)
}

// Print account security status
async function printAccountSecurityStatus() {
    // ... (rest of the printAccountSecurityStatus function remains the same)
}

// Validate environment variables
function validateEnvironment() {
    // ... (rest of the validateEnvironment function remains the same)
}

// Main execution
async function main() {
    try {
        // Validate environment
        validateEnvironment();
        console.log('Environment validation passed');

        // Create non-compliant scenario
        console.log('\nCreating non-compliant scenario...');
        const username = await createNonCompliantScenario();
        
        // Check root account MFA status
        const results = await checkRootAccountMFA();

        // Print account security status
        await printAccountSecurityStatus();

        // Print security recommendations
        printSecurityRecommendations(results);
        
        if (!results.compliant) {
            console.log('\nNon-compliant Status:');
            console.log(`Reason: ${results.reason}`);
            console.log('Action required: Configure hardware MFA for root account');
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
    createNonCompliantScenario,
    checkRootAccountMFA,
    cleanup,
    validateEnvironment
};
