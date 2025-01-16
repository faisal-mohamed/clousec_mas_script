const { 
    OpenSearchClient,
    CreateDomainCommand,
    DeleteDomainCommand,
    DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");

require('dotenv').config();

const createAwsClient = (ClientClass) => {
    return new ClientClass({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            sessionToken: process.env.AWS_SESSION_TOKEN
        }
    });
};

class ElasticsearchNodeEncryptionSimulator {
    constructor() {
        this.resources = {};
        this.opensearchClient = createAwsClient(OpenSearchClient);
        this.domainName = 'non-compliant-domain-' + Math.random().toString(36).substring(7);
    }

    async createNonCompliantState() {
        try {
            console.log('Creating non-compliant Elasticsearch domain without node-to-node encryption...');

            // Create domain without node-to-node encryption
            const createDomainResponse = await this.opensearchClient.send(
                new CreateDomainCommand({
                    DomainName: this.domainName,
                    EngineVersion: 'OpenSearch_1.0',
                    ClusterConfig: {
                        InstanceType: 't3.small.search',
                        InstanceCount: 1,
                        DedicatedMasterEnabled: false
                    },
                    EBSOptions: {
                        EBSEnabled: true,
                        VolumeType: 'gp3',
                        VolumeSize: 10
                    },
                    NodeToNodeEncryptionOptions: {
                        Enabled: false  // This makes it non-compliant
                    },
                    EncryptionAtRestOptions: {
                        Enabled: true  // Enable encryption at rest (required)
                    },
                    AccessPolicies: JSON.stringify({
                        Version: '2012-10-17',
                        Statement: [
                            {
                                Effect: 'Deny',
                                Principal: {
                                    AWS: '*'
                                },
                                Action: 'es:*',
                                Resource: '*'
                            }
                        ]
                    })
                })
            );

            this.resources.domainName = this.domainName;

            console.log('\nWaiting for domain to be created (this may take 10-15 minutes)...');
            await this.waitForDomainCreation();

            console.log('\nNon-compliant state created:');
            console.log(`Domain Name: ${this.resources.domainName}`);
            console.log('Node-to-Node Encryption: Disabled');

            // Wait for AWS Config to evaluate
            console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
            await new Promise(resolve => setTimeout(resolve, 120000));

        } catch (error) {
            console.error('Error creating non-compliant Elasticsearch domain:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async waitForDomainCreation() {
        let isCreated = false;
        let attempts = 0;
        const maxAttempts = 90; // 15 minutes maximum wait time

        while (!isCreated && attempts < maxAttempts) {
            try {
                const response = await this.opensearchClient.send(
                    new DescribeDomainCommand({
                        DomainName: this.resources.domainName
                    })
                );

                if (response.DomainStatus.Processing === false) {
                    isCreated = true;
                    console.log('Domain creation completed!');
                } else {
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds between checks
                }
            } catch (error) {
                console.error('Error checking domain status:', error);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        if (!isCreated) {
            throw new Error('Domain creation timed out');
        }
    }

    async cleanup() {
        try {
            if (this.resources.domainName) {
                console.log('\nCleaning up resources...');
                await this.opensearchClient.send(
                    new DeleteDomainCommand({
                        DomainName: this.resources.domainName
                    })
                );
                console.log('Elasticsearch domain deletion initiated');
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

async function main() {
    const simulator = new ElasticsearchNodeEncryptionSimulator();
    await simulator.createNonCompliantState();
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createNonCompliantState: main
};
