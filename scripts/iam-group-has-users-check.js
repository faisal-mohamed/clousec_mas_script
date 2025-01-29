const {
    IAMClient,
    CreateGroupCommand,
    GetGroupCommand
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

async function createEmptyGroup() {
    try {
        const groupName = `empty-group-${Date.now()}`;

        // Create group
        const createParams = {
            GroupName: groupName,
            Path: '/test/'
        };

        console.log('Creating empty IAM group...');
        const createResponse = await iamClient.send(new CreateGroupCommand(createParams));
        
        // Verify group is empty
        const getGroupResponse = await iamClient.send(new GetGroupCommand({ GroupName: groupName }));
        
        console.log('Created IAM group:', {
            GroupName: createResponse.Group.GroupName,
            GroupId: createResponse.Group.GroupId,
            Arn: createResponse.Group.Arn,
            Path: createResponse.Group.Path,
            UserCount: getGroupResponse.Users ? getGroupResponse.Users.length : 0
        });

        return createResponse.Group.Arn;
    } catch (error) {
        console.error('Error creating IAM group:', error.message);
        throw error;
    }
}

// Execute group creation
createEmptyGroup()
    .then(groupArn => {
        console.log('Successfully created empty IAM group. ARN:', groupArn);
    })
    .catch(error => {
        console.error('Failed to create group:', error.message);
        process.exit(1);
    });
