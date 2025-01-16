require('dotenv').config();

const {
    IAMClient,
    CreatePolicyCommand,
    DeletePolicyCommand,
    ListPoliciesCommand,
    GetPolicyCommand
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

// Create non-compliant IAM policy
async function createNonCompliantPolicy() {
    try {
        const policyName = `non-compliant-kms-policy-${Date.now()}`;
        
        // Non-compliant policy document that allows blocked KMS actions
        const policyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "AllowBlockedKMSActions",
                    Effect: "Allow",
                    Action: [
                        "kms:Decrypt",
                        "kms:ReEncrypt*",
                        "kms:CreateGrant",
                        "kms:RetireGrant"
                    ],
                    Resource: "*"
                }
            ]
        };

        const params = {
            PolicyName: policyName,
            Description: "Non-compliant policy allowing blocked KMS actions",
            PolicyDocument: JSON.stringify(policyDocument)
        };

        console.log('Creating non-compliant IAM policy...');
        const command = new CreatePolicyCommand(params);
        const response = await iamClient.send(command);
        
        const policyArn = response.Policy.Arn;
        createdResources.push({ type: 'IAM_POLICY', arn: policyArn });
        
        console.log(`Created IAM policy: ${policyArn}`);
        return policyArn;
    } catch (error) {
        console.error('Error creating IAM policy:', error.message);
        throw error;
    }
}

// List policies
async function listPolicies() {
    try {
        const command = new ListPoliciesCommand({
            Scope: 'Local',
            OnlyAttached: false,
            MaxItems: 10
        });
        
        const response = await iamClient.send(command);
        console.log('\nCustomer managed policies:');
        response.Policies.forEach(policy => {
            console.log(`- ${policy.PolicyName}: ${policy.Arn}`);
        });
    } catch (error) {
        console.error('Error listing policies:', error.message);
    }
}

// Wait for policy to be available
async function waitForPolicy(policyArn) {
    console.log(`Waiting for policy ${policyArn} to be available...`);
    
    while (true) {
        try {
            const command = new GetPolicyCommand({
                PolicyArn: policyArn
            });
            
            const response = await iamClient.send(command);
            if (response.Policy) {
                console.log('Policy is now available');
                return true;
            }
        } catch (error) {
            if (error.name === 'NoSuchEntityException') {
                // Wait for 5 seconds before checking again
                await new Promise(resolve => setTimeout(resolve, 5000));
                continue;
            }
            throw error;
        }
    }
}

// Cleanup resources
async function cleanup() {
    console.log('\nStarting cleanup...');

    for (const resource of createdResources) {
        try {
            if (resource.type === 'IAM_POLICY') {
                console.log(`Deleting IAM policy: ${resource.arn}`);
                
                const command = new DeletePolicyCommand({
                    PolicyArn: resource.arn
                });
                
                await iamClient.send(command);
                console.log(`Successfully deleted IAM policy: ${resource.arn}`);
            }
        } catch (error) {
            console.error(`Error cleaning up ${resource.type}:`, error.message);
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

        // Create non-compliant policy
        const policyArn = await createNonCompliantPolicy();
        
        // Wait for policy to be available
        await waitForPolicy(policyArn);
        
        // List current policies
        await listPolicies();

        console.log('\nNon-compliance details:');
        console.log('- Policy allows blocked KMS actions:');
        console.log('  * kms:Decrypt');
        console.log('  * kms:ReEncrypt*');
        console.log('  * kms:CreateGrant');
        console.log('  * kms:RetireGrant');
        console.log('- Policy allows these actions on all KMS keys (Resource: *)');
        console.log('- This violates the principle of least privilege');
        
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
    createNonCompliantPolicy,
    cleanup,
    validateEnvironment
};
