const {
    WAFV2Client,
    CreateWebACLCommand,
    DeleteWebACLCommand,
    GetWebACLCommand,
    ListWebACLsCommand
} = require("@aws-sdk/client-wafv2");

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

        return new WAFV2Client(config);
    } catch (error) {
        console.error('Error initializing AWS client:', error);
        throw error;
    }
};

// Create non-compliant WAFv2 Web ACL (without logging)
const createNonCompliantWebACL = async () => {
    const client = getClient();
    const webACLName = `non-compliant-waf-${Date.now()}`;

    try {
        // Create Web ACL without logging configuration
        const params = {
            Name: webACLName,
            Scope: 'REGIONAL',
            DefaultAction: {
                Allow: {}
            },
            Description: 'Non-compliant Web ACL without logging enabled',
            Rules: [
                {
                    Name: 'BasicRule',
                    Priority: 0,
                    Statement: {
                        RateBasedStatement: {
                            Limit: 2000,
                            AggregateKeyType: 'IP'
                        }
                    },
                    Action: {
                        Block: {}
                    },
                    VisibilityConfig: {
                        SampledRequestsEnabled: true,
                        CloudWatchMetricsEnabled: true,
                        MetricName: 'BasicRuleMetric'
                    }
                }
            ],
            VisibilityConfig: {
                SampledRequestsEnabled: true,
                CloudWatchMetricsEnabled: true,
                MetricName: 'NonCompliantWebACLMetric'
            },
            Tags: [
                {
                    Key: 'Environment',
                    Value: 'Test'
                },
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                }
            ]
        };

        console.log('Creating WAFv2 Web ACL...');
        const response = await client.send(new CreateWebACLCommand(params));
        console.log('WAFv2 Web ACL created successfully');

        return {
            name: webACLName,
            id: response.Summary.Id,
            arn: response.Summary.ARN
        };
    } catch (error) {
        console.error('Error creating WAFv2 Web ACL:', error);
        throw error;
    }
};

// Wait for Web ACL to be available
const waitForWebACL = async (id, scope = 'REGIONAL') => {
    const client = getClient();

    while (true) {
        try {
            await client.send(
                new GetWebACLCommand({
                    Id: id,
                    Name: id,
                    Scope: scope
                })
            );
            break;
        } catch (error) {
            if (error.name === 'WAFNonexistentItemException') {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                continue;
            }
            throw error;
        }
    }
};

// Delete WAFv2 Web ACL
const deleteWebACL = async (id, name, scope = 'REGIONAL') => {
    const client = getClient();

    try {
        console.log('Getting Web ACL lock token...');
        const webACL = await client.send(
            new GetWebACLCommand({
                Id: id,
                Name: name,
                Scope: scope
            })
        );

        console.log('Deleting Web ACL...');
        await client.send(
            new DeleteWebACLCommand({
                Id: id,
                Name: name,
                Scope: scope,
                LockToken: webACL.LockToken
            })
        );

        console.log('Web ACL deleted successfully');
    } catch (error) {
        if (!error.name.includes('WAFNonexistentItemException')) {
            console.error('Error deleting Web ACL:', error);
            throw error;
        }
    }
};

// Main function
const main = async () => {
    let webACLInfo = null;

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

        // Create non-compliant Web ACL
        webACLInfo = await createNonCompliantWebACL();

        // Wait for Web ACL to be fully created
        console.log('Waiting for Web ACL to be available...');
        await waitForWebACL(webACLInfo.id);

        // Wait to observe the non-compliant state
        console.log('\nWaiting 60 seconds to observe non-compliant state...');
        console.log('Web ACL created without logging enabled.');
        console.log('To make it compliant, you would need to:');
        console.log('1. Create a Kinesis Firehose delivery stream with prefix "aws-waf-logs-"');
        console.log('2. Configure the Web ACL to send logs to the Firehose');
        await new Promise(resolve => setTimeout(resolve, 60000));

    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
    }
};

// Run the program
if (require.main === module) {
    main();
}