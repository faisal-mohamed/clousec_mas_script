require('dotenv').config();

const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    DeleteRoleCommand,
    DeleteRolePolicyCommand,
    GetRolePolicyCommand,
    ListRolePoliciesCommand
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

// Create non-compliant role with inline policy
async function createNonCompliantRole() {
    try {
        const roleName = `non-compliant-role-${Date.now()}`;
        const policyName = 'blocked-kms-actions-policy';

        // Trust policy for the role
        const assumeRolePolicyDocument = {
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Principal: {
                    Service: "ec2.amazonaws.com"
                },
                Action: "sts:AssumeRole"
            }]
        };

        // Create role
        console.log('Creating IAM role...');
        const createRoleCommand = new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
            Description: "Role with non-compliant KMS inline policy"
        });

        const roleResponse = await iamClient.send(createRoleCommand);
        createdResources.push({ 
            type: 'IAM_ROLE', 
            name: roleName,
            policies: [policyName]
        });

        // Non-compliant inline policy document
        const inlinePolicyDocument = {
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: [
                    "kms:Decrypt",
                    "kms:ReEncrypt*",
                    "kms:CreateGrant",
                    "kms:RetireGrant"
                ],
                Resource: "*"
            }]
        };

        // Add inline policy to role
        console.log('Attaching non-compliant inline policy...');
        const putPolicyCommand = new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName,
            PolicyDocument: JSON.stringify(inlinePolicyDocument)
        });

        await iamClient.send(putPolicyCommand);
        console.log(`Created role with inline policy: ${roleName}`);
        
        return { roleName, policyName };
    } catch (error) {
        console.error('Error creating role with inline policy:', error.message);
        throw error;
    }
}

// List role policies
async function listRolePolicies(roleName) {
    try {
        const command = new ListRolePoliciesCommand({
            RoleName: roleName
        });
        
        const response = await iamClient.send(command);
        console.log('\nInline policies for role:', roleName);
        response.PolicyNames.forEach(policyName => {
            console.log(`- ${policyName}`);
        });
        
        // Get and display policy details
        for (const policyName of response.PolicyNames) {
            const getPolicyCommand = new GetRolePolicyCommand({
                RoleName: roleName,
                PolicyName: policyName
            });
            
            const policyResponse = await iamClient.send(getPolicyCommand);
            console.log(`\nPolicy document for ${policyName}:`);
            console.log(JSON.parse(decodeURIComponent(policyResponse.PolicyDocument)));
        }
    } catch (error) {
        console.error('Error listing role policies:', error.message);
    }
}

// Wait for role to be available
async function waitForRole(roleName) {
    console.log(`Waiting for role ${roleName} to be available...`);
    
    while (true) {
        try {
            const command = new GetRolePolicyCommand({
                RoleName: roleName,
                PolicyName: 'blocked-kms-actions-policy'
            });
            
            await iamClient.send(command);
            console.log('Role and policy are now available');
            return true;
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
            if (resource.type === 'IAM_ROLE') {
                // Delete inline policies first
                for (const policyName of resource.policies) {
                    console.log(`Deleting inline policy ${policyName} from role ${resource.name}`);
                    
                    const deletePolicyCommand = new DeleteRolePolicyCommand({
                        RoleName: resource.name,
                        PolicyName: policyName
                    });
                    
                    await iamClient.send(deletePolicyCommand);
                }

                // Then delete the role
                console.log(`Deleting IAM role: ${resource.name}`);
                
                const deleteRoleCommand = new DeleteRoleCommand({
                    RoleName: resource.name
                });
                
                await iamClient.send(deleteRoleCommand);
                console.log(`Successfully deleted IAM role: ${resource.name}`);
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

        // Create non-compliant role with inline policy
        const { roleName } = await createNonCompliantRole();
        
        // Wait for role to be available
        await waitForRole(roleName);
        
        // List role policies
        await listRolePolicies(roleName);

        console.log('\nNon-compliance details:');
        console.log('- Inline policy allows blocked KMS actions:');
        console.log('  * kms:Decrypt');
        console.log('  * kms:ReEncrypt*');
        console.log('  * kms:CreateGrant');
        console.log('  * kms:RetireGrant');
        console.log('- Policy allows these actions on all KMS keys (Resource: *)');
        console.log('- Using inline policies is not recommended for maintainability');
        
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
    createNonCompliantRole,
    cleanup,
    validateEnvironment
};
