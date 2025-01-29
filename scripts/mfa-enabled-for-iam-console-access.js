const { IAMClient, CreateUserCommand, TagUserCommand } = require("@aws-sdk/client-iam");

require('dotenv').config();

async function createIAMUser(username) {
    // Initialize IAM client with credentials from environment variables
    const client = new IAMClient({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });

    try {
        // Create the IAM user
        const createUserResponse = await client.send(
            new CreateUserCommand({
                UserName: username,
                Tags: [
                    {
                        Key: "simulation-mas",
                        Value: "true"
                    }
                ]
            })
        );

        console.log("Successfully created IAM user:", createUserResponse.User);
        return createUserResponse.User;

    } catch (error) {
        console.error("Error creating IAM user:", error);
        throw error;
    }
}

// Execute the function
const username = "test-user-" + Date.now(); // Adding timestamp to make username unique
createIAMUser(username)
    .then(user => console.log("Created user:", user))
    .catch(error => console.error("Failed to create user:", error));
