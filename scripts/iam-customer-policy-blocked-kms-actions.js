const {
    IAMClient,
    CreatePolicyCommand
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

async function createKMSPolicy() {
    try {
        const policyName = `kms-allowed-actions-${Date.now()}`;
        
        // Policy document that allows KMS actions
        const policyDocument = {
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

        const params = {
            PolicyName: policyName,
            Description: "Policy allowing KMS actions for testing",
            PolicyDocument: JSON.stringify(policyDocument),
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                }
            ]
        };

        console.log('Creating IAM policy...');
        const response = await iamClient.send(new CreatePolicyCommand(params));
        
        console.log('Created IAM policy:', {
            PolicyName: policyName,
            PolicyArn: response.Policy.Arn,
            PolicyId: response.Policy.PolicyId
        });

        return response.Policy.Arn;
    } catch (error) {
        console.error('Error creating IAM policy:', error.message);
        throw error;
    }
}

// Execute policy creation
createKMSPolicy()
    .then(policyArn => {
        console.log('Successfully created KMS policy. ARN:', policyArn);
    })
    .catch(error => {
        console.error('Failed to create policy:', error.message);
        process.exit(1);
    });
