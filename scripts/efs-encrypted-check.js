const {
    EFSClient,
    CreateFileSystemCommand,
    DescribeFileSystemsCommand
} = require("@aws-sdk/client-efs");
require('dotenv').config();

// Initialize EFS client
const efsClient = new EFSClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

async function createUnencryptedFileSystem() {
    try {
        const params = {
            PerformanceMode: 'generalPurpose',
            ThroughputMode: 'bursting',
            Encrypted: false,  // Creating unencrypted file system
            Tags: [
                {
                    Key: 'Name',
                    Value: `unencrypted-efs-${Date.now()}`
                }
            ]
        };

        const command = new CreateFileSystemCommand(params);
        const response = await efsClient.send(command);

        console.log('File System created:', {
            FileSystemId: response.FileSystemId,
            LifeCycleState: response.LifeCycleState,
            PerformanceMode: response.PerformanceMode,
            ThroughputMode: response.ThroughputMode
        });

        // Wait for file system to become available
        await waitForFileSystemAvailable(response.FileSystemId);

        return response.FileSystemId;

    } catch (error) {
        console.error('Error creating file system:', error);
        throw error;
    }
}

async function waitForFileSystemAvailable(fileSystemId) {
    console.log('Waiting for file system to become available...');
    
    while (true) {
        try {
            const command = new DescribeFileSystemsCommand({
                FileSystemId: fileSystemId
            });
            
            const response = await efsClient.send(command);
            const fileSystem = response.FileSystems[0];
            
            if (fileSystem.LifeCycleState === 'available') {
                console.log('File system is now available');
                break;
            }
            
            console.log(`Current state: ${fileSystem.LifeCycleState}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            
        } catch (error) {
            console.error('Error checking file system status:', error);
            throw error;
        }
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

        // Create the unencrypted file system
        await createUnencryptedFileSystem();

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
    createUnencryptedFileSystem
};
