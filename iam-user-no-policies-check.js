require('dotenv').config();

const {
    IAMClient,
    CreateUserCommand,
    DeleteUserCommand,
    PutUserPolicyCommand,
    AttachUserPolicyCommand,
    DetachUserPolicyCommand,
    DeleteUserPolicyCommand,
    ListUserPoliciesCommand,
    ListAttachedUserPoliciesCommand
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

// Create non-compliant user with direct policies
async function createNonCompliantUser() {
    try {
        const username = `non-compliant-user-${Date.now()}`;
        
        // Create user
        console.log('Creating IAM user...');
        const createUserCommand = new CreateUserCommand({
            UserName: username
        });
        
        await iamClient.send(createUserCommand);
        createdResources.push({ type: 'USER', name: username });
        console.log(`Created user: ${username}`);

        // Attach managed policy
        console.log('Attaching managed policy...');
        const managedPolicyArn = 'arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess';
        const attachPolicyCommand = new AttachUserPolicyCommand({
            UserName: username,
            PolicyArn: managedPolicyArn
        });
        
        await iamClient.send(attachPolicyCommand);
        console.log(`Attached managed policy: ${managedPolicyArn}`);

        // Add inline policy
        console.log('Adding inline policy...');
        const inlinePolicyName = 'NonCompliantInlinePolicy';
        const inlinePolicyDocument = {
            Version: '2012-10-17',
            Statement: [{
                Effect: 'Allow',
                Action: [
                    'dynamodb:List*',
                    'dynamodb:Describe*'
                ],
                Resource: '*'
            }]
        };

        const putPolicyCommand = new PutUserPolicyCommand({
            UserName: username,
            PolicyName: inlinePolicyName,
            PolicyDocument: JSON.stringify(inlinePolicyDocument)
        });
        
        await iamClient.send(putPolicyCommand);
        console.log(`Added inline policy: ${inlinePolicyName}`);

        return username;
    } catch (error) {
        console.error('Error creating non-compliant user:', error.message);
        throw error;
    }
}

// Check user policies
async function checkUserPolicies(username) {
    try {
        console.log(`\nChecking policies for user: ${username}`);
        
        // Check inline policies
        const inlinePoliciesCommand = new ListUserPoliciesCommand({
            UserName: username
        });
        const inlinePoliciesResponse = await iamClient.send(inlinePoliciesCommand);
        
        // Check managed policies
        const managedPoliciesCommand = new ListAttachedUserPoliciesCommand({
            UserName: username
        });
        const managedPoliciesResponse = await iamClient.send(managedPoliciesCommand);

        console.log('\nAttached Policies:');
        console.log('Inline Policies:', inlinePoliciesResponse.PolicyNames);
        console.log('Managed Policies:', managedPoliciesResponse.AttachedPolicies.map(p => p.PolicyName));

        return {
            inlinePolicies: inlinePoliciesResponse.PolicyNames,
            managedPolicies: managedPoliciesResponse.AttachedPolicies
        };
    } catch (error) {
        console.error('Error checking user policies:', error.message);
        throw error;
    }
}

// Cleanup resources
async function cleanup() {
    console.log('\nStarting cleanup...');

    for (const resource of createdResources) {
        try {
            if (resource.type === 'USER') {
                // Detach managed policies
                const managedPoliciesCommand = new ListAttachedUserPoliciesCommand({
                    UserName: resource.name
                });
                const managedPoliciesResponse = await iamClient.send(managedPoliciesCommand);
                
                for (const policy of managedPoliciesResponse.AttachedPolicies) {
                    console.log(`Detaching managed policy: ${policy.PolicyArn}`);
                    const detachCommand = new DetachUserPolicyCommand({
                        UserName: resource.name,
                        PolicyArn: policy.PolicyArn
                    });
                    await iamClient.send(detachCommand);
                }

                // Delete inline policies
                const inlinePoliciesCommand = new ListUserPoliciesCommand({
                    UserName: resource.name
                });
                const inlinePoliciesResponse = await iamClient.send(inlinePoliciesCommand);
                
                for (const policyName of inlinePoliciesResponse.PolicyNames) {
                    console.log(`Deleting inline policy: ${policyName}`);
                    const deleteCommand = new DeleteUserPolicyCommand({
                        UserName: resource.name,
                        PolicyName: policyName
                    });
                    await iamClient.send(deleteCommand);
                }

                // Delete user
                console.log(`Deleting user: ${resource.name}`);
                const deleteUserCommand = new DeleteUserCommand({
                    UserName: resource.name
                });
                await iamClient.send(deleteUserCommand);
                console.log(`Successfully deleted user: ${resource.name}`);
            }
        } catch (error) {
            console.error(`Error cleaning up ${resource.type}:`, error.message);
        }
    }
}

// Print security recommendations
function printSecurityRecommendations() {
    console.log('\nSecurity implications of direct policy attachment:');
    console.log('- Increased complexity in permission management');
    console.log('- Higher risk of inconsistent permissions');
    console.log('- Difficult to maintain and audit');
    console.log('- Violates principle of least privilege');
    
    console.log('\nRecommendations:');
    console.log('- Move permissions to IAM groups');
    console.log('- Remove directly attached policies from users');
    console.log('- Create standardized group-based access patterns');
    console.log('- Implement regular policy audits');
    console.log('- Document permission requirements');
    
    console.log('\nBest practices:');
    console.log('- Use IAM groups for permission management');
    console.log('- Implement least privilege access');
    console.log('- Regular policy reviews');
    console.log('- Standardize access patterns');
    console.log('- Document permission assignments');
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

        // Create non-compliant user
        const username = await createNonCompliantUser();
        
        // Check user policies
        const policies = await checkUserPolicies(username);

        // Print security recommendations
        printSecurityRecommendations();

        console.log('\nNon-compliant state created:');
        console.log(`User "${username}" has direct policy attachments:`);
        console.log(`- ${policies.inlinePolicies.length} inline policies`);
        console.log(`- ${policies.managedPolicies.length} managed policies`);
        
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
    createNonCompliantUser,
    cleanup,
    validateEnvironment,
    checkUserPolicies
};
