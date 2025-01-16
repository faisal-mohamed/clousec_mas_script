require('dotenv').config();

const {
    IAMClient,
    CreateGroupCommand,
    DeleteGroupCommand,
    ListGroupsCommand,
    GetGroupCommand
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

// Create non-compliant empty IAM group
async function createEmptyGroup() {
    try {
        const groupName = `non-compliant-empty-group-${Date.now()}`;
        
        const params = {
            GroupName: groupName,
            Path: '/test/'
        };

        console.log('Creating empty IAM group...');
        const command = new CreateGroupCommand(params);
        const response = await iamClient.send(command);
        
        createdResources.push({ 
            type: 'IAM_GROUP', 
            name: groupName,
            arn: response.Group.Arn 
        });
        
        console.log(`Created IAM group: ${groupName}`);
        return groupName;
    } catch (error) {
        console.error('Error creating IAM group:', error.message);
        throw error;
    }
}

// Check group users
async function checkGroupUsers(groupName) {
    try {
        const command = new GetGroupCommand({
            GroupName: groupName
        });
        
        const response = await iamClient.send(command);
        const userCount = response.Users ? response.Users.length : 0;
        
        console.log(`\nGroup ${groupName} has ${userCount} users`);
        if (userCount === 0) {
            console.log('Non-compliant: Group has no users');
        }
        
        return userCount;
    } catch (error) {
        console.error('Error checking group users:', error.message);
        throw error;
    }
}

// List groups
async function listGroups() {
    try {
        const command = new ListGroupsCommand({
            PathPrefix: '/test/',
            MaxItems: 10
        });
        
        const response = await iamClient.send(command);
        console.log('\nIAM Groups:');
        response.Groups.forEach(group => {
            console.log(`- ${group.GroupName}: ${group.Arn}`);
        });
    } catch (error) {
        console.error('Error listing groups:', error.message);
    }
}

// Wait for group to be available
async function waitForGroup(groupName) {
    console.log(`Waiting for group ${groupName} to be available...`);
    
    while (true) {
        try {
            const command = new GetGroupCommand({
                GroupName: groupName
            });
            
            const response = await iamClient.send(command);
            if (response.Group) {
                console.log('Group is now available');
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
            if (resource.type === 'IAM_GROUP') {
                console.log(`Deleting IAM group: ${resource.name}`);
                
                const command = new DeleteGroupCommand({
                    GroupName: resource.name
                });
                
                await iamClient.send(command);
                console.log(`Successfully deleted IAM group: ${resource.name}`);
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

        // Create empty group
        const groupName = await createEmptyGroup();
        
        // Wait for group to be available
        await waitForGroup(groupName);
        
        // Check group users
        await checkGroupUsers(groupName);
        
        // List current groups
        await listGroups();

        console.log('\nNon-compliance details:');
        console.log('- IAM group created with no users');
        console.log('- Empty groups violate AWS CIS benchmark');
        console.log('- Recommendation: Add users to the group or delete unused groups');
        
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
    createEmptyGroup,
    cleanup,
    validateEnvironment
};
