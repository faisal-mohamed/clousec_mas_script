const {
    IAMClient,
    CreateRoleCommand,
    PutRolePolicyCommand,
    GetRolePolicyCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();


// Initialize IAM client
const iamClient = new IAMClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createRoleWithInlinePolicy() {
    try {
        const roleName = `test-role-kms-${Date.now()}`;
        const policyName = 'kms-allowed-inline-policy';

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
        const createRoleResponse = await iamClient.send(new CreateRoleCommand({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicyDocument),
            Description: "Role with KMS-allowing inline policy",
            Tags: [{
                Key: 'simulation-mas',
                Value: 'true'
            }]
        }));

        // Inline policy document allowing KMS actions
        const inlinePolicyDocument = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "AllowKMSActions",
                    Effect: "Allow",
                    Action: [
                        "kms:Encrypt",
                        "kms:Decrypt",
                        "kms:ReEncrypt*",
                        "kms:GenerateDataKey*",
                        "kms:DescribeKey",
                        "kms:CreateGrant",
                        "kms:ListGrants",
                        "kms:RevokeGrant",
                        "kms:RetireGrant"
                    ],
                    Resource: "*"
                },
                {
                    Sid: "AllowKMSListActions",
                    Effect: "Allow",
                    Action: [
                        "kms:ListKeys",
                        "kms:ListAliases"
                    ],
                    Resource: "*"
                }
            ]
        };

        // Attach inline policy to role
        console.log('Attaching inline policy...');
        await iamClient.send(new PutRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName,
            PolicyDocument: JSON.stringify(inlinePolicyDocument)
        }));

        // Verify inline policy
        const getPolicyResponse = await iamClient.send(new GetRolePolicyCommand({
            RoleName: roleName,
            PolicyName: policyName
        }));

        console.log('Created role with inline policy:', {
            RoleName: roleName,
            RoleArn: createRoleResponse.Role.Arn,
            PolicyName: policyName,
            HasInlinePolicy: !!getPolicyResponse.PolicyDocument
        });

        return {
            roleArn: createRoleResponse.Role.Arn,
            roleName: roleName,
            policyName: policyName
        };
    } catch (error) {
        console.error('Error creating role with inline policy:', error.message);
        throw error;
    }
}

// Execute role and policy creation
createRoleWithInlinePolicy()
    .then(result => {
        console.log('Successfully created role with KMS-allowing inline policy:', {
            RoleArn: result.roleArn,
            RoleName: result.roleName,
            PolicyName: result.policyName
        });
    })
    .catch(error => {
        console.error('Failed to create role and policy:', error.message);
        process.exit(1);
    });
