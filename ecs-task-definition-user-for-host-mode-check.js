const {
    ECSClient,
    RegisterTaskDefinitionCommand,
    DeregisterTaskDefinitionCommand,
    ListTaskDefinitionsCommand
} = require("@aws-sdk/client-ecs");

require('dotenv').config();
// Load environment variables
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN;
const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;


console.log(AWS_SECRET_ACCESS_KEY)


// Initialize ECS client
const ecsClient = new ECSClient({
    region: AWS_REGION,
    credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
        sessionToken: AWS_SESSION_TOKEN
    }
});

// Track created resources
const createdResources = [];

// Validate environment variables
function validateEnvironment() {
    const requiredEnvVars = [
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_REGION',
        'AWS_ACCESS_KEY_ID'
    ];

    const missing = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
}

// Create non-compliant task definition
async function createNonCompliantTaskDefinition() {
    const taskDefFamily = `non-compliant-task-def-${Date.now()}`;
    
    try {
        const params = {
            family: taskDefFamily,
            networkMode: 'host', // Non-compliant: Using host network mode
            requiresCompatibilities: ['EC2'],
            cpu: '256',
            memory: '512',
            containerDefinitions: [
                {
                    name: 'non-compliant-container',
                    image: 'nginx:latest',
                    cpu: 256,
                    memory: 256,
                    essential: true,
                    user: 'root', // Non-compliant: Running as root
                    privileged: false, // Non-compliant: Not privileged with host mode
                    portMappings: [
                        {
                            containerPort: 80,
                            hostPort: 80,
                            protocol: 'tcp'
                        }
                    ]
                }
            ]
        };

        const command = new RegisterTaskDefinitionCommand(params);
        const response = await ecsClient.send(command);
        
        const taskDefArn = response.taskDefinition.taskDefinitionArn;
        createdResources.push({ type: 'TASK_DEFINITION', arn: taskDefArn });
        
        console.log(`Created non-compliant task definition: ${taskDefArn}`);
        return taskDefArn;

    } catch (error) {
        console.error('Failed to create task definition:', error.message);
        throw error;
    }
}

// Cleanup resources
async function cleanup() {
    console.log('\nStarting cleanup...');

    for (const resource of createdResources) {
        try {
            if (resource.type === 'TASK_DEFINITION') {
                const arnParts = resource.arn.split('/');
                const taskDef = arnParts[arnParts.length - 1];
                
                const command = new DeregisterTaskDefinitionCommand({
                    taskDefinition: taskDef
                });
                
                await ecsClient.send(command);
                console.log(`Deregistered task definition: ${taskDef}`);
            }
        } catch (error) {
            console.error(`Error during cleanup of ${resource.type}:`, error.message);
        }
    }
}

// List active task definitions
async function listTaskDefinitions() {
    try {
        const command = new ListTaskDefinitionsCommand({
            status: 'ACTIVE',
            maxResults: 10
        });
        
        const response = await ecsClient.send(command);
        console.log('\nActive task definitions:');
        response.taskDefinitionArns.forEach(arn => console.log(arn));
    } catch (error) {
        console.error('Error listing task definitions:', error.message);
    }
}

// Main execution
async function main() {
    try {
        // Validate environment variables
        validateEnvironment();
        console.log('Environment validation passed');

        // Create non-compliant task definition
        console.log('\nCreating non-compliant ECS task definition...');
        await createNonCompliantTaskDefinition();

        // List current task definitions
        await listTaskDefinitions();

        console.log('\nNon-compliance details:');
        console.log('- Using host network mode');
        console.log('- Container running as root user');
        console.log('- Container not running in privileged mode');

    } catch (error) {
        console.error('\nExecution failed:', error.message);
    } finally {
        // Perform cleanup
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
    createNonCompliantTaskDefinition,
    cleanup,
    validateEnvironment
};
