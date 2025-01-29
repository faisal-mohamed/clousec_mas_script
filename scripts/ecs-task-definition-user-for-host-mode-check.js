const {
    ECSClient,
    RegisterTaskDefinitionCommand
} = require("@aws-sdk/client-ecs");
require('dotenv').config();

// Initialize ECS client
const ecsClient = new ECSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

async function createTaskDefinition() {
    try {
        const params = {
            family: `host-network-task-${Date.now()}`,
            networkMode: 'host',
            requiresCompatibilities: ['EC2'],
            cpu: '256',
            memory: '512',
            containerDefinitions: [
                {
                    name: 'host-network-container',
                    image: 'nginx:latest',
                    cpu: 256,
                    memory: 512,
                    essential: true,
                    portMappings: [
                        {
                            containerPort: 80,
                            hostPort: 80,
                            protocol: 'tcp'
                        }
                    ],
                    environment: [
                        {
                            name: 'ENVIRONMENT',
                            value: 'production'
                        }
                    ],
                    healthCheck: {
                        command: [ "CMD-SHELL", "curl -f http://localhost/ || exit 1" ],
                        interval: 30,
                        timeout: 5,
                        retries: 3
                    }
                }
            ]
        };

        const command = new RegisterTaskDefinitionCommand(params);
        const response = await ecsClient.send(command);
        console.log('Task Definition created:', response.taskDefinition.taskDefinitionArn);
        return response.taskDefinition.taskDefinitionArn;

    } catch (error) {
        console.error('Error creating task definition:', error);
        throw error;
    }
}

async function main() {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_REGION'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Create the task definition
        await createTaskDefinition();

    } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
    }
}

// Execute if running directly
if (require.main === module) {
    main();
}

module.exports = {
    createTaskDefinition
};
