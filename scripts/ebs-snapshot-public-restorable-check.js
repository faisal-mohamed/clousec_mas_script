const {
    EC2Client,
    CreateVolumeCommand,
    CreateSnapshotCommand,
    DescribeVolumesCommand,
    DescribeSnapshotsCommand,
    ModifySnapshotAttributeCommand,
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
            }

            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error('Error checking volume status:', error);
            throw error;
        }
    }
}

async function waitForSnapshotCompletion(snapshotId) {
    console.log(`Waiting for snapshot ${snapshotId} to complete...`);
    
    while (true) {
        try {
            const response = await ec2Client.send(new DescribeSnapshotsCommand({
                SnapshotIds: [snapshotId]
            }));

            const snapshot = response.Snapshots[0];
            const state = snapshot.State;
            const progress = snapshot.Progress;
            
            console.log(`Current state: ${state}, Progress: ${progress}`);

            if (state === 'completed') {
                return snapshot;
            } else if (state === 'error') {
                throw new Error('Snapshot creation failed');
            }

            await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (error) {
            console.error('Error checking snapshot status:', error);
            throw error;
        }
    }
}

async function makeSnapshotPublic(snapshotId) {
    try {
        await ec2Client.send(new ModifySnapshotAttributeCommand({
            SnapshotId: snapshotId,
            Attribute: 'createVolumePermission',
            OperationType: 'add',
            GroupNames: ['all']
        }));
        
        console.log(`Made snapshot ${snapshotId} publicly restorable`);
    } catch (error) {
        console.error('Error making snapshot public:', error);
        throw error;
    }
}

async function createVolumeAndPublicSnapshot() {
    try {
        const timestamp = Date.now();
        const region = process.env.AWS_REGION || 'us-east-1';
        const az = `${region}a`;

        // Create unencrypted volume
        const volumeParams = {
            AvailabilityZone: az,
            Size: 1,
            VolumeType: 'gp3',
            Encrypted: false, // Explicitly set to unencrypted
            TagSpecifications: [
                {
                    ResourceType: 'volume',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `unencrypted-volume-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        }
                    ]
                }
            ]
        };

        console.log('Creating unencrypted EBS volume...');
        const volumeResponse = await ec2Client.send(new CreateVolumeCommand(volumeParams));
        const volumeId = volumeResponse.VolumeId;
        
        console.log(`Volume creation initiated: ${volumeId}`);

        // Wait for volume to be available
        const volume = await waitForVolumeStatus(volumeId, 'available');

        // Create snapshot from unencrypted volume
        const snapshotParams = {
            VolumeId: volumeId,
            Description: `Public-Snapshot-${timestamp}`,
            TagSpecifications: [
                {
                    ResourceType: 'snapshot',
                    Tags: [
                        {
                            Key: 'Name',
                            Value: `public-snapshot-${timestamp}`
                        },
                        {
                            Key: 'simulation-mas',
                            Value: 'true'
                        },
                        {
                            Key: 'public-access',
                            Value: 'enabled'
                        }
                    ]
                }
            ]
        };

        console.log('Creating EBS snapshot...');
        const snapshotResponse = await ec2Client.send(new CreateSnapshotCommand(snapshotParams));
        const snapshotId = snapshotResponse.SnapshotId;
        
        console.log(`Snapshot creation initiated: ${snapshotId}`);

        // Wait for snapshot to complete
        const snapshot = await waitForSnapshotCompletion(snapshotId);

        // Make snapshot public
        await makeSnapshotPublic(snapshotId);

        // Add warning tags
        await ec2Client.send(new CreateTagsCommand({
            Resources: [volumeId, snapshotId],
            Tags: [
                {
                    Key: 'Warning',
                    Value: 'Public-Unencrypted'
                },
                {
                    Key: 'SecurityRisk',
                    Value: 'Critical'
                }
            ]
        }));

        return {
            volumeId: volume.VolumeId,
            volumeSize: volume.Size,
            volumeState: volume.State,
            volumeEncrypted: volume.Encrypted,
            snapshotId: snapshot.SnapshotId,
            snapshotState: snapshot.State,
            snapshotEncrypted: snapshot.Encrypted,
            startTime: snapshot.StartTime
        };

    } catch (error) {
        console.error('Error in operation:', error);
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

        const result = await createVolumeAndPublicSnapshot();
        
        console.log('\nOperation completed successfully:');
        console.log('\nVolume Details:');
        console.log(`Volume ID: ${result.volumeId}`);
        console.log(`Size: ${result.volumeSize} GiB`);
        console.log(`State: ${result.volumeState}`);
        console.log(`Encrypted: ${result.volumeEncrypted}`);

        console.log('\nSnapshot Details:');
        console.log(`Snapshot ID: ${result.snapshotId}`);
        console.log(`State: ${result.snapshotState}`);
        console.log(`Encrypted: ${result.snapshotEncrypted}`);
        console.log(`Start Time: ${result.startTime}`);

        console.log('\nWarning:');
        console.log('This configuration has multiple security risks:');
        console.log('1. Volume is unencrypted');
        console.log('2. Snapshot is publicly accessible');
        console.log('3. Data is exposed without encryption');
        console.log('4. Violates security best practices');
        console.log('5. Requires immediate remediation');

    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

main();
