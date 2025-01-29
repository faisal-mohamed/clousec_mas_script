const {
    OpenSearchClient,
    CreateDomainCommand,
    DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");
require('dotenv').config();

// Initialize OpenSearch client
const openSearchClient = new OpenSearchClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createOpenSearchWithoutNodeEncryption() {
    try {
        const timestamp = Date.now().toString().slice(-4);
        const domainName = `os-no-n2n-${timestamp}`;

        // Create a restrictive access policy based on IAM principal
        const accessPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Effect: 'Allow',
                    Principal: {
                        AWS: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:root`
                    },
                    Action: 'es:*',
                    Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
                }
            ]
        };

        console.log('Creating OpenSearch domain without node-to-node encryption...');
        const createDomainParams = {
            DomainName: domainName,
            EngineVersion: 'OpenSearch_2.11',
            ClusterConfig: {
                InstanceType: 't3.small.search',
                InstanceCount: 2,
                DedicatedMasterEnabled: false,
                ZoneAwarenessEnabled: true,
                ZoneAwarenessConfig: {
                    AvailabilityZoneCount: 2
                }
            },
            EBSOptions: {
                EBSEnabled: true,
                VolumeType: 'gp3',
                VolumeSize: 10
            },
            AccessPolicies: JSON.stringify(accessPolicy),
            EncryptionAtRestOptions: {
                Enabled: false
            },
            NodeToNodeEncryptionOptions: {
                Enabled: false
            },
            DomainEndpointOptions: {
                EnforceHTTPS: false
            },
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'Name',
                    Value: domainName
                },
                {
                    Key: 'NodeToNodeEncryption',
                    Value: 'disabled'
                }
            ]
        };

        const createResponse = await openSearchClient.send(
            new CreateDomainCommand(createDomainParams)
        );

        console.log('\nDomain Creation Initiated:', {
            DomainName: domainName,
            DomainArn: createResponse.DomainStatus.ARN,
            NodeToNodeEncryption: 'Disabled'
        });

        await waitForDomainCreation(domainName);
        return createResponse.DomainStatus;
    } catch (error) {
        console.error('Error creating OpenSearch domain:', error.message);
        throw error;
    }
}

async function waitForDomainCreation(domainName) {
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const response = await openSearchClient.send(
                new DescribeDomainCommand({ DomainName: domainName })
            );

            const status = response.DomainStatus.Processing;
            console.log(`Domain status check ${attempts + 1}/${maxAttempts}: ${status ? 'Processing' : 'Active'}`);

            if (!status) {
                console.log('Domain creation completed successfully!');
                return response.DomainStatus;
            }
        } catch (error) {
            console.error('Error checking domain status:', error.message);
        }

        await new Promise(resolve => setTimeout(resolve, 30000));
        attempts++;
    }

    throw new Error('Domain creation timed out after 30 minutes');
}

// Execute the creation
createOpenSearchWithoutNodeEncryption()
    .then(domainStatus => {
        console.log('\nOpenSearch Domain Details:', {
            DomainName: domainStatus.DomainName,
            DomainArn: domainStatus.ARN,
            Endpoint: domainStatus.Endpoints,
            EngineVersion: domainStatus.EngineVersion,
            InstanceType: domainStatus.ClusterConfig.InstanceType,
            InstanceCount: domainStatus.ClusterConfig.InstanceCount,
            StorageSize: `${domainStatus.EBSOptions.VolumeSize}GB`
        });

        console.log('\nSecurity Configuration:', {
            NodeToNodeEncryption: 'Disabled',
            EncryptionAtRest: 'Disabled',
            EnforceHTTPS: 'Disabled',
            AdvancedSecurity: 'Disabled',
            AccessPolicy: 'IAM-based'
        });

        console.log('\nSecurity Warning:', {
            warning: 'This domain is configured with minimal security settings',
            risks: [
                'Data in transit between nodes is not encrypted',
                'No encryption at rest',
                'No HTTPS enforcement',
                'Access limited only by IAM'
            ],
            recommendations: [
                'Enable node-to-node encryption for production',
                'Enable encryption at rest',
                'Enable HTTPS enforcement',
                'Implement IP-based restrictions',
                'Use more granular IAM policies'
            ]
        });

        console.log('\nCluster Configuration:', {
            zoneAwareness: 'Enabled',
            numberOfNodes: domainStatus.ClusterConfig.InstanceCount,
            instanceType: domainStatus.ClusterConfig.InstanceType,
            dedicatedMaster: 'Disabled'
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
