require('dotenv').config();

const {
    IAMClient,
    CreatePolicyCommand,
    DeletePolicyCommand,
    GetPolicyCommand,
    ListPoliciesCommand
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

// Create non-compliant IAM policy with full access to services
async function createNonCompliantPolicy() {
    try {
        const policyName = `non-compliant-full-access-policy-${Date.now()}`;
        
        // Non-compliant policy document with full access to multiple services
        const policyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "NonCompliantS3FullAccess",
                    Effect: "Allow",
                    Action: "s3:*",  // Non-compliant: Full access to S3
                    Resource: "*"
                },
                {
                    Sid: "NonCompliantDynamoDBFullAccess",
                    Effect: "Allow",
                    Action: "dynamodb:*", // Non-compliant: Full access to DynamoDB
                    Resource: "*"
                },
                {
                    Sid: "NonCompliantEC2FullAccess",
                    Effect: "Allow",
                    Action: "ec2:*", // Non-compliant: Full access to EC2
                    Resource: "*"
                }
            ]
        };

        const params = {
            PolicyName: policyName,
            Description: "Non-compliant policy with full access to multiple services",
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

// Check policy compliance
function checkPolicyCompliance(policyDocument) {
    const issues = [];
    const fullAccessPatterns = [':*'];
    
    if (!policyDocument) {
        issues.push('No policy document provided');
        return issues;
    }

    policyDocument.Statement.forEach((statement, index) => {
        if (statement.Effect === 'Allow') {
            const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
            
            actions.forEach(action => {
                // Check for full access patterns
                if (fullAccessPatterns.some(pattern => action.endsWith(pattern))) {
                    const service = action.split(':')[0];
                    issues.push(`Statement ${index}: Contains full access to ${service} service ("${action}")`);
                }
            });

            // Check for wildcard resources
            if (Array.isArray(statement.Resource)) {
                if (statement.Resource.includes('*')) {
                    issues.push(`Statement ${index}: Contains wildcard resource "*"`);
                }
            } else if (statement.Resource === '*') {
                issues.push(`Statement ${index}: Contains wildcard resource "*"`);
            }
        }
    });

    return issues;
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

        // Check compliance of the policy document
        const policyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Action: ["s3:*", "dynamodb:*", "ec2:*"],
                    Resource: "*"
                }
            ]
        };
        
        const complianceIssues = checkPolicyCompliance(policyDocument);

        console.log('\nNon-compliance details:');
        complianceIssues.forEach(issue => {
            console.log(`- ${issue}`);
        });
        
        console.log('\nSecurity implications:');
        console.log('- Policy grants full access to multiple services');
        console.log('- Violates principle of least privilege');
        console.log('- Increases risk of unauthorized access');
        console.log('- Makes access control and auditing difficult');
        
        console.log('\nRecommendations:');
        console.log('- Specify only required actions instead of using wildcards');
        console.log('- Limit access to specific resources');
        console.log('- Use condition statements to restrict access');
        console.log('- Implement separate policies for different services');
        console.log('- Regular review and audit of permissions');
        
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
    validateEnvironment,
    checkPolicyCompliance
};
