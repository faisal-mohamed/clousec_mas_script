require('dotenv').config();

const {
    IAMClient,
    ListUsersCommand,
    ListGroupsForUserCommand,
    GetUserCommand
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

// Check user group memberships
async function checkUserGroupMemberships() {
    try {
        console.log('Checking IAM user group memberships...');
        
        const usersWithoutGroups = [];
        const usersWithGroups = [];
        let users = [];

        // Get all users
        const listUsersCommand = new ListUsersCommand({});
        const response = await iamClient.send(listUsersCommand);
        users = response.Users;

        // Check each user's group membership
        for (const user of users) {
            const groups = await getUserGroups(user.UserName);
            
            if (groups.length === 0) {
                usersWithoutGroups.push(user.UserName);
            } else {
                usersWithGroups.push({
                    username: user.UserName,
                    groups: groups.map(g => g.GroupName)
                });
            }
        }

        // Print results
        console.log('\nUsers without group membership:');
        if (usersWithoutGroups.length === 0) {
            console.log('- None found (Compliant)');
        } else {
            usersWithoutGroups.forEach(username => {
                console.log(`- ${username}`);
            });
        }

        console.log('\nUsers with group membership:');
        if (usersWithGroups.length === 0) {
            console.log('- None found');
        } else {
            usersWithGroups.forEach(user => {
                console.log(`- ${user.username}: ${user.groups.join(', ')}`);
            });
        }

        return {
            compliant: usersWithoutGroups.length === 0,
            usersWithoutGroups,
            usersWithGroups
        };
    } catch (error) {
        console.error('Error checking user group memberships:', error.message);
        throw error;
    }
}

// Get groups for a specific user
async function getUserGroups(username) {
    try {
        const command = new ListGroupsForUserCommand({
            UserName: username
        });
        
        const response = await iamClient.send(command);
        return response.Groups;
    } catch (error) {
        console.error(`Error getting groups for user ${username}:`, error.message);
        return [];
    }
}

// Get user details
async function getUserDetails(username) {
    try {
        const command = new GetUserCommand({
            UserName: username
        });
        
        const response = await iamClient.send(command);
        return response.User;
    } catch (error) {
        console.error(`Error getting user details for ${username}:`, error.message);
        return null;
    }
}

// Print security recommendations
function printSecurityRecommendations(results) {
    console.log('\nSecurity implications of users without group membership:');
    console.log('- Difficult to manage permissions at scale');
    console.log('- Increased risk of permission sprawl');
    console.log('- Harder to maintain consistent access policies');
    console.log('- Complicates access review and audit processes');
    
    console.log('\nRecommendations:');
    if (!results.compliant) {
        console.log('- Create appropriate IAM groups based on job functions');
        console.log('- Assign users to relevant groups');
        console.log('- Remove direct policy attachments from users');
        console.log('- Implement group-based access management');
        console.log('- Regular review of group memberships');
    } else {
        console.log('- Continue maintaining group-based access management');
        console.log('- Regularly review group permissions');
        console.log('- Audit group memberships periodically');
        console.log('- Document group purposes and requirements');
    }
    
    console.log('\nBest practices:');
    console.log('- Use groups for permission management');
    console.log('- Implement least privilege access');
    console.log('- Regular access reviews');
    console.log('- Document group purposes');
    console.log('- Maintain consistent naming conventions');
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

        // Check user group memberships
        const results = await checkUserGroupMemberships();

        // Print security recommendations
        printSecurityRecommendations(results);
        
        if (!results.compliant) {
            console.log('\nNon-compliant Status:');
            console.log(`Found ${results.usersWithoutGroups.length} users without group membership.`);
            console.log('Action required: Assign users to appropriate groups.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\nExecution failed:', error.message);
        process.exit(1);
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
    checkUserGroupMemberships,
    getUserGroups,
    validateEnvironment
};
