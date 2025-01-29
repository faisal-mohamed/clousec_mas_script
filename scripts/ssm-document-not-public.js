const { SSMClient, CreateDocumentCommand, ModifyDocumentPermissionCommand } = require("@aws-sdk/client-ssm");
require('dotenv').config();

// Initialize SSM client
const ssmClient = new SSMClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

// Create unique document name
const documentName = `MySSMDocument-${Date.now()}`;

async function createAndShareDocument() {
    try {
        // Define document content
        const documentContent = {
            schemaVersion: "2.2",
            description: "Sample SSM document",
            parameters: {
                Message: {
                    type: "String",
                    description: "Message to display",
                    default: "Hello World"
                }
            },
            mainSteps: [
                {
                    action: "aws:runShellScript",
                    name: "displayMessage",
                    inputs: {
                        runCommand: ["echo \"{{Message}}\""]
                    }
                }
            ]
        };

        // Create the document
        console.log(`Creating SSM document: ${documentName}`);
        const createResponse = await ssmClient.send(new CreateDocumentCommand({
            Name: documentName,
            Content: JSON.stringify(documentContent),
            DocumentType: "Command",
            DocumentFormat: "JSON",
            Tags: [
                {
                    Key: "simulation-mas",
                    Value: "true"
                }
            ]
        }));

        console.log("Document created successfully:", createResponse);

        // Wait for a few seconds to ensure document is fully created
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Make document public
        console.log("Making document public...");
        const shareResponse = await ssmClient.send(new ModifyDocumentPermissionCommand({
            Name: documentName,
            PermissionType: 'Share',
            AccountIdsToAdd: ['All']
        }));

        console.log("Document shared successfully:", shareResponse);
        return documentName;

    } catch (error) {
        console.error("Error:", error);
        throw error;
    }
}

// Validate environment variables
function validateEnvironmentVariables() {
    const requiredEnvVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_REGION'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
}

// Main execution
async function main() {
    try {
        validateEnvironmentVariables();
        console.log(`Starting SSM document creation in region ${process.env.AWS_REGION}`);
        const createdDocumentName = await createAndShareDocument();
        console.log(`Process completed successfully. Document name: ${createdDocumentName}`);
    } catch (error) {
        console.error("Script execution failed:", error);
        process.exit(1);
    }
}

main();
