// const {
//     SecurityHubClient,
//     EnableSecurityHubCommand,
//     DisableSecurityHubCommand,
//     GetEnabledStandardsCommand,
//     EnableStandardsCommand,
//     DisableStandardsCommand,
//     DescribeHubCommand,
//     GetFindingsCommand,
//     BatchEnableStandardsCommand,
//     BatchDisableStandardsCommand
// } = require("@aws-sdk/client-securityhub");

// const {
//     OrganizationsClient,
//     ListAccountsCommand
// } = require("@aws-sdk/client-organizations");

// // Configure credentials
// const credentials = {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     sessionToken: process.env.AWS_SESSION_TOKEN,
//     region: process.env.AWS_REGION || 'ap-southeast-1'
// };

// // Initialize clients
// const securityHubClient = new SecurityHubClient(credentials);
// const organizationsClient = new OrganizationsClient(credentials);

// // Configuration
// const config = {
//     isEnabled: false,
//     enabledStandards: [],
//     hubArn: '',
//     standardsToEnable: [
//         'arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0',
//         'arn:aws:securityhub::/aws/securityhub/standards/aws-foundational-security-best-practices/v/1.0.0'
//     ]
// };

// // Utility function to wait
// const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// async function checkSecurityHubStatus() {
//     try {
//         console.log('Checking Security Hub status...');

//         try {
//             const describeHubCommand = new DescribeHubCommand({});
//             const hubResponse = await securityHubClient.send(describeHubCommand);
//             config.isEnabled = true;
//             config.hubArn = hubResponse.HubArn;
//             console.log('Security Hub is enabled');
            
//             // Check enabled standards
//             const getStandardsCommand = new GetEnabledStandardsCommand({});
//             const standardsResponse = await securityHubClient.send(getStandardsCommand);
//             config.enabledStandards = standardsResponse.StandardsSubscriptions || [];
            
//             console.log('\nEnabled Standards:');
//             for (const standard of config.enabledStandards) {
//                 console.log(`- ${standard.StandardsArn}`);
//             }

//         } catch (error) {
//             if (error.name === 'InvalidAccessException') {
//                 console.log('Security Hub is not enabled (non-compliant)');
//                 config.isEnabled = false;
//             } else {
//                 throw error;
//             }
//         }

//     } catch (error) {
//         console.error('Error checking Security Hub status:', error);
//     }
// }

// async function checkOrganizationStatus() {
//     try {
//         console.log('\nChecking Organization status...');

//         try {
//             const listAccountsCommand = new ListAccountsCommand({});
//             const accountsResponse = await organizationsClient.send(listAccountsCommand);
            
//             console.log('Organization Accounts:');
//             for (const account of accountsResponse.Accounts) {
//                 console.log(`Account ID: ${account.Id}, Name: ${account.Name}, Status: ${account.Status}`);
//             }
//         } catch (error) {
//             if (error.name === 'AWSOrganizationsNotInUseException') {
//                 console.log('AWS Organizations is not in use');
//             } else {
//                 console.error('Error listing organization accounts:', error);
//             }
//         }

//     } catch (error) {
//         console.error('Error checking organization status:', error);
//     }
// }

// async function disableSecurityHub() {
//     try {
//         if (config.isEnabled) {
//             console.log('\nDisabling Security Hub...');

//             // First disable all enabled standards
//             if (config.enabledStandards.length > 0) {
//                 const disableStandardsCommand = new BatchDisableStandardsCommand({
//                     StandardsSubscriptionArns: config.enabledStandards.map(s => s.StandardsSubscriptionArn)
//                 });
//                 await securityHubClient.send(disableStandardsCommand);
//                 console.log('Disabled all standards');

//                 // Wait for standards to be disabled
//                 await wait(10000);
//             }

//             // Then disable Security Hub
//             const disableCommand = new DisableSecurityHubCommand({});
//             await securityHubClient.send(disableCommand);
//             console.log('Disabled Security Hub');
//             config.isEnabled = false;
//         }
//     } catch (error) {
//         console.error('Error disabling Security Hub:', error);
//     }
// }

// async function enableSecurityHub() {
//     try {
//         if (!config.isEnabled) {
//             console.log('\nEnabling Security Hub...');

//             // Enable Security Hub with CIS standard
//             const enableCommand = new EnableSecurityHubCommand({
//                 EnableDefaultStandards: true,
//                 Tags: {
//                     Environment: 'Test'
//                 }
//             });

//             await securityHubClient.send(enableCommand);
//             config.isEnabled = true;
//             console.log('Enabled Security Hub with default standards');

//             // Wait for Security Hub to be fully enabled
//             await wait(10000);

//             // Enable additional standards if needed
//             const enableStandardsCommand = new BatchEnableStandardsCommand({
//                 StandardsSubscriptionRequests: config.standardsToEnable.map(standardArn => ({
//                     StandardsArn: standardArn
//                 }))
//             });

//             await securityHubClient.send(enableStandardsCommand);
//             console.log('Enabled additional security standards');
//         }
//     } catch (error) {
//         console.error('Error enabling Security Hub:', error);
//     }
// }

// async function main() {
//     try {
//         console.log('Starting Security Hub compliance check...');
        
//         await checkSecurityHubStatus();
//         await checkOrganizationStatus();

//         // Create non-compliant state by disabling Security Hub
//         await disableSecurityHub();
//         await checkSecurityHubStatus();

//         // Optional: Make compliant by enabling Security Hub
//         // Uncomment the next lines to enable Security Hub
//         // await enableSecurityHub();
//         // await checkSecurityHubStatus();

//         console.log('\nScript execution completed successfully');

//     } catch (error) {
//         console.error('Error in main execution:', error);
//     }
// }

// // Execute the script
// main();

const {
    SecurityHubClient,
    DisableSecurityHubCommand,
    EnableSecurityHubCommand,
    GetEnabledStandardsCommand,
    DescribeHubCommand
} = require("@aws-sdk/client-securityhub");

require('dotenv').config();

// Initialize AWS client
const getClient = () => {
    try {
        const credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        };

        const config = {
            credentials: credentials,
            region: process.env.AWS_REGION || 'ap-southeast-1'
        };

        return new SecurityHubClient(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Check if Security Hub is enabled
const isSecurityHubEnabled = async () => {
    const client = getClient();

    try {
        await client.send(new DescribeHubCommand({}));
        return true;
    } catch (error) {
        if (error.name === 'InvalidAccessException') {
            return false;
        }
        throw error;
    }
};

// Get enabled security standards
const getEnabledStandards = async () => {
    const client = getClient();

    try {
        const response = await client.send(new GetEnabledStandardsCommand({}));
        return response.StandardsSubscriptions || [];
    } catch (error) {
        console.error('Error getting enabled standards:', error);
        throw error;
    }
};

// Disable Security Hub
const disableSecurityHub = async () => {
    const client = getClient();

    try {
        console.log('Disabling Security Hub...');
        await client.send(new DisableSecurityHubCommand({}));
        console.log('Security Hub disabled successfully');
    } catch (error) {
        if (!error.name.includes('ResourceNotFoundException')) {
            console.error('Error disabling Security Hub:', error);
            throw error;
        }
    }
};

// Enable Security Hub
const enableSecurityHub = async () => {
    const client = getClient();

    try {
        console.log('Enabling Security Hub...');
        await client.send(new EnableSecurityHubCommand({
            EnableDefaultStandards: true,
            Tags: {
                Environment: 'Test'
            }
        }));
        console.log('Security Hub enabled successfully');
    } catch (error) {
        console.error('Error enabling Security Hub:', error);
        throw error;
    }
};

// Main function
const main = async () => {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        // Check initial state
        console.log('Checking initial Security Hub state...');
        const initiallyEnabled = await isSecurityHubEnabled();
        
        if (initiallyEnabled) {
            console.log('Security Hub is currently enabled');
            
            // Get current security standards
            const standards = await getEnabledStandards();
            console.log('Currently enabled security standards:');
            standards.forEach(standard => {
                console.log(`- ${standard.StandardsArn}`);
            });

            // Store initial state for restoration
            const initialState = {
                enabled: true,
                standards: standards
            };

            // Disable Security Hub
            await disableSecurityHub();

            // Wait to observe non-compliant state
            console.log('\nWaiting 60 seconds to observe non-compliant state...');
            console.log('Security Hub is now disabled. This represents a non-compliant state.');
            console.log('In a production environment, Security Hub should be:');
            console.log('1. Enabled in all applicable regions');
            console.log('2. Integrated with AWS Organizations (if applicable)');
            console.log('3. Configured with appropriate security standards');
            await new Promise(resolve => setTimeout(resolve, 60000));

            // Restore Security Hub to original state
            console.log('\nRestoring Security Hub to original state...');
            await enableSecurityHub();
            console.log('Security Hub has been re-enabled');

        } else {
            console.log('Security Hub is currently disabled (non-compliant state)');
            
            // Wait to observe non-compliant state
            console.log('\nWaiting 60 seconds to observe non-compliant state...');
            console.log('Security Hub should be enabled for:');
            console.log('1. Centralized security findings');
            console.log('2. Automated security checks');
            console.log('3. Compliance monitoring');
            await new Promise(resolve => setTimeout(resolve, 60000));

            // Optional: Enable Security Hub
            const enableNow = process.env.ENABLE_SECURITY_HUB === 'true';
            if (enableNow) {
                console.log('\nEnabling Security Hub...');
                await enableSecurityHub();
                console.log('Security Hub has been enabled');
            } else {
                console.log('\nLeaving Security Hub disabled as ENABLE_SECURITY_HUB is not set to true');
            }
        }

    } catch (error) {
        console.error('Fatal error:', error);
        throw error;
    }
};

// Run the program
if (require.main === module) {
    main().catch(error => {
        console.error('Unhandled error:', error);
        process.exit(1);
    });
}
