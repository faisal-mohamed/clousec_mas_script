const {
    EC2Client,
    CreateVolumeCommand,
    DescribeAvailabilityZonesCommand
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


// Get first availability zone in the region
async function getAvailabilityZone() {
    try {
        const response = await ec2Client.send(
            new DescribeAvailabilityZonesCommand({
                Filters: [
                    {
                        Name: 'state',
                        Values: ['available']
                    }
                ]
            })
        );

        if (!response.AvailabilityZones || response.AvailabilityZones.length === 0) {
            throw new Error('No availability zones found');
        }

        return response.AvailabilityZones[0].ZoneName;
    } catch (error) {
        console.error('Error getting availability zone:', error);
        throw error;
    }
}

// Create unencrypted volume
async function createUnencryptedVolume() {
    try {
        // Get availability zone
        const availabilityZone = await getAvailabilityZone();
        console.log('Using availability zone:', availabilityZone);

        // Create volume command
        const createVolumeResponse = await ec2Client.send(
            new CreateVolumeCommand({
                AvailabilityZone: availabilityZone,
                Size: 1, // 1 GB volume
                VolumeType: 'gp3',
                Encrypted: false, // Explicitly set to unencrypted
                TagSpecifications: [
                    {
                        ResourceType: 'volume',
                        Tags: [
                            {
                                Key: 'Name',
                                Value: `test-unencrypted-volume-${Date.now()}`
                            },
                            {
                                Key: 'simulation-mas',
                                Value: 'true'
                            }
                        ]
                    }
                ]
            })
        );

        console.log('Created unencrypted volume:', {
            VolumeId: createVolumeResponse.VolumeId,
            Size: createVolumeResponse.Size,
            AvailabilityZone: createVolumeResponse.AvailabilityZone,
            State: createVolumeResponse.State,
            VolumeType: createVolumeResponse.VolumeType,
            Encrypted: createVolumeResponse.Encrypted
        });

        return createVolumeResponse.VolumeId;
    } catch (error) {
        console.error('Error creating unencrypted volume:', error);
        throw error;
    }
}

// Execute volume creation
createUnencryptedVolume()
    .then(volumeId => {
        console.log('Successfully created unencrypted volume. ID:', volumeId);
    })
    .catch(error => {
        console.error('Failed to create volume:', error.message);
        process.exit(1);
    });
