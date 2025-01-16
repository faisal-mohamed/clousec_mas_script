const {
    GuardDutyClient,
    GetDetectorCommand,
    CreateDetectorCommand,
    DeleteDetectorCommand,
    ListDetectorsCommand,
    UpdateDetectorCommand,
    ListOrganizationAdminAccountsCommand
} = require("@aws-sdk/client-guardduty");

const {
    OrganizationsClient,
    ListAccountsCommand
} = require("@aws-sdk/client-organizations");

// Configure credentials
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || 'ap-southeast-1'
};

// Initialize clients
const guarddutyClient = new GuardDutyClient(credentials);
const organizationsClient = new OrganizationsClient(credentials);

// Configuration
const config = {
    detectorId: null,
    isEnabled: false,
    isCentralized: false
};

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkGuardDutyStatus() {
    try {
        console.log('Checking GuardDuty status...');

        // List existing detectors
        const listDetectorsCommand = new ListDetectorsCommand({});
        const detectorsResponse = await guarddutyClient.send(listDetectorsCommand);

        if (detectorsResponse.DetectorIds && detectorsResponse.DetectorIds.length > 0) {
            config.detectorId = detectorsResponse.DetectorIds[0];
            
            // Get detector details
            const getDetectorCommand = new GetDetectorCommand({
                DetectorId: config.detectorId
            });
            
            const detectorResponse = await guarddutyClient.send(getDetectorCommand);
            config.isEnabled = detectorResponse.Status === 'ENABLED';

            console.log(`Existing detector found: ${config.detectorId}`);
            console.log(`GuardDuty Status: ${config.isEnabled ? 'ENABLED' : 'DISABLED'}`);
        } else {
            console.log('No GuardDuty detector found (non-compliant)');
        }

    } catch (error) {
        console.error('Error checking GuardDuty status:', error);
    }
}

async function checkCentralization() {
    try {
        console.log('\nChecking GuardDuty centralization...');

        // Check for delegated admin account
        const listAdminCommand = new ListOrganizationAdminAccountsCommand({});
        const adminResponse = await guarddutyClient.send(listAdminCommand);

        if (adminResponse.AdminAccounts && adminResponse.AdminAccounts.length > 0) {
            const adminAccount = adminResponse.AdminAccounts[0];
            config.isCentralized = true;
            console.log(`GuardDuty is centralized with admin account: ${adminAccount.AdminAccountId}`);
            console.log(`Admin Account Status: ${adminAccount.Status}`);
        } else {
            console.log('GuardDuty is not centralized (non-compliant)');
        }

        // List organization accounts (if available)
        try {
            const listAccountsCommand = new ListAccountsCommand({});
            const accountsResponse = await organizationsClient.send(listAccountsCommand);
            
            console.log('\nOrganization Accounts:');
            for (const account of accountsResponse.Accounts) {
                console.log(`Account ID: ${account.Id}, Status: ${account.Status}`);
            }
        } catch (error) {
            if (error.name === 'AWSOrganizationsNotInUseException') {
                console.log('AWS Organizations is not in use');
            } else {
                console.error('Error listing organization accounts:', error);
            }
        }

    } catch (error) {
        console.error('Error checking centralization:', error);
    }
}

async function createNonCompliantDetector() {
    try {
        if (!config.detectorId) {
            console.log('\nCreating non-compliant GuardDuty detector...');

            // Create detector in disabled state
            const createDetectorCommand = new CreateDetectorCommand({
                Enable: false, // Non-compliant: GuardDuty disabled
                DataSources: {
                    S3Logs: {
                        Enable: false // Non-compliant: S3 protection disabled
                    },
                    Kubernetes: {
                        AuditLogs: {
                            Enable: false // Non-compliant: Kubernetes protection disabled
                        }
                    },
                    MalwareProtection: {
                        ScanEc2InstanceWithFindings: {
                            Enable: false // Non-compliant: Malware protection disabled
                        }
                    }
                }
            });

            const response = await guarddutyClient.send(createDetectorCommand);
            config.detectorId = response.DetectorId;
            console.log(`Created disabled GuardDuty detector: ${config.detectorId}`);
        }
    } catch (error) {
        console.error('Error creating GuardDuty detector:', error);
    }
}

async function makeCompliant() {
    try {
        if (config.detectorId) {
            console.log('\nUpdating GuardDuty configuration to be compliant...');

            const updateDetectorCommand = new UpdateDetectorCommand({
                DetectorId: config.detectorId,
                Enable: true,
                DataSources: {
                    S3Logs: {
                        Enable: true
                    },
                    Kubernetes: {
                        AuditLogs: {
                            Enable: true
                        }
                    },
                    MalwareProtection: {
                        ScanEc2InstanceWithFindings: {
                            Enable: true
                        }
                    }
                }
            });

            await guarddutyClient.send(updateDetectorCommand);
            console.log('Updated GuardDuty detector to be compliant');
        } else {
            console.log('No detector found to update');
        }
    } catch (error) {
        console.error('Error updating GuardDuty configuration:', error);
    }
}

async function cleanup() {
    try {
        if (config.detectorId) {
            console.log('\nStarting cleanup process...');

            const deleteDetectorCommand = new DeleteDetectorCommand({
                DetectorId: config.detectorId
            });

            await guarddutyClient.send(deleteDetectorCommand);
            console.log('Deleted GuardDuty detector');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
}

async function main() {
    try {
        console.log('Starting GuardDuty configuration non-compliance simulation...');
        
        await checkGuardDutyStatus();
        await checkCentralization();
        await createNonCompliantDetector();
        
        // Verify configuration after creation
        await checkGuardDutyStatus();

        // Optional: Make GuardDuty compliant
        // Uncomment the next line to enable GuardDuty and its features
        // await makeCompliant();
        // await checkGuardDutyStatus();

        console.log('\nWaiting for 5 seconds...');
        await wait(5000);

        await cleanup();
        
        console.log('\nScript execution completed successfully');

    } catch (error) {
        console.error('Error in main execution:', error);
        try {
            await cleanup();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

// Execute the script
main();
