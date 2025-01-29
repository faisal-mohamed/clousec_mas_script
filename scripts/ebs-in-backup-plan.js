const {
    EC2Client,
    CreateVolumeCommand,
    DescribeVolumesCommand,
    CreateTagsCommand
} = require("@aws-sdk/client-ec2");

require('dotenv').config();


// Initialize EC2 client
const ec2Client = new EC2Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function waitForVolumeStatus(volumeId, desiredState) {
    console.log(`Waiting for volume ${volumeId} to be ${desiredState}...`);
    
    while (true) {
        try {
            const response = await ec2Client.send(new DescribeVolumesCommand({
                VolumeIds: [volumeId]
            }));

            const volume = response.Volumes[0];
            const state = volume.State;
            console.log(`Current state: ${state}`);

            if (state === desiredState) {
                return volume;
            } else if (state === 'error') {
                throw new Error('Volume creation failed');
            }

            // Wait for 5 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error('Error checking volume status:', error);
            throw error;
        }
    }
}

async function createNonCompliantVolume() {
    try {
        // Get the first availability zone in the region
        const azSuffix = 'a';  // Using 'a' zone by default
        const region = process.env.AWS_REGION || 'us-east-1';
        const availabilityZone = `${region}${azSuffix}`;

        const timestamp = Date.now();
        
        // Create volume without backup configuration
        const createParams = {
            AvailabilityZone: availabilityZone,
            Size: 8, // Minimum size in GiB
            VolumeType: 'gp3',
            TagSpecifications: [{
                ResourceType: 'volume',
                Tags: [
                    {
                        Key: 'Name',
                        Value: `no-backup-volume-${timestamp}`
                    },
                    {
                        Key: 'simulation-mas',
                        Value: 'true'
                    },
                    {
                        Key: 'backup-status',
                        Value: 'disabled'
                    }
                ]
            }]
        };

        console.log('Creating EBS volume...');
        console.log(`Availability Zone: ${availabilityZone}`);
        
        const createResponse = await ec2Client.send(new CreateVolumeCommand(createParams));
        const volumeId = createResponse.VolumeId;
        
        console.log(`Volume creation initiated: ${volumeId}`);

        // Wait for volume to be available
        const volume = await waitForVolumeStatus(volumeId, 'available');

        console.log('\nVolume Details:');
        console.log(`Volume ID: ${volume.VolumeId}`);
        console.log(`State: ${volume.State}`);
        console.log(`Size: ${volume.Size} GiB`);
        console.log(`Volume Type: ${volume.VolumeType}`);
        console.log(`Availability Zone: ${volume.AvailabilityZone}`);
        console.log(`Created Time: ${volume.CreateTime}`);
        console.log(`Encrypted: ${volume.Encrypted}`);

        console.log('\nNon-compliant configuration:');
        console.log('- No AWS Backup plan configured');
        console.log('- No automated snapshot creation');
        console.log('- No backup retention policy');
        console.log('- No disaster recovery protection');
        console.log('- Manual snapshots required for backups');

        console.log('\nSecurity Implications:');
        console.log('1. No automated data protection');
        console.log('2. Risk of data loss');
        console.log('3. Manual intervention required for backups');
        console.log('4. No scheduled backup policy');
        console.log('5. May not meet compliance requirements');

        // Add additional warning tags
        await ec2Client.send(new CreateTagsCommand({
            Resources: [volumeId],
            Tags: [
                {
                    Key: 'Warning',
                    Value: 'No-Backup-Configured'
                },
                {
                    Key: 'RequiresBackup',
                    Value: 'true'
                }
            ]
        }));

        return {
            volumeId: volume.VolumeId,
            size: volume.Size,
            volumeType: volume.VolumeType,
            availabilityZone: volume.AvailabilityZone,
            state: volume.State,
            encrypted: volume.Encrypted
        };

    } catch (error) {
        console.error('Error creating EBS volume:', error);
        throw error;
    }
}

// Execute the script
async function main() {
    try {
        // Validate required environment variables
        if (!process.env.AWS_ACCESS_KEY_ID || 
            !process.env.AWS_SECRET_ACCESS_KEY || 
            !process.env.AWS_SESSION_TOKEN) {
            throw new Error('AWS credentials environment variables are required');
        }

        const result = await createNonCompliantVolume();
        
        console.log('\nVolume created successfully:');
        console.log(`Volume ID: ${result.volumeId}`);
        console.log(`Size: ${result.size} GiB`);
        console.log(`Type: ${result.volumeType}`);
        console.log(`Availability Zone: ${result.availabilityZone}`);
        console.log(`State: ${result.state}`);
        console.log(`Encrypted: ${result.encrypted}`);

        console.log('\nWarning:');
        console.log('This volume configuration:');
        console.log('1. Has no backup protection');
        console.log('2. Requires manual snapshot creation');
        console.log('3. Has no automated recovery options');
        console.log('4. May be at risk of data loss');
        console.log('5. Does not follow backup best practices');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
