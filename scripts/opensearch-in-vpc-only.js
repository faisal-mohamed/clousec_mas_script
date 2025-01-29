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

async function createPublicOpenSearchDomain() {
    try {
        const timestamp = Date.now().toString().slice(-4);
        const domainName = `os-public-${timestamp}`;

        console.log('Creating public OpenSearch domain...');
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
            AccessPolicies: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            AWS: '*'
                        },
                        Action: [
                            'es:ESHttp*'
                        ],
                        Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
                    }
                ]
            }),
            EncryptionAtRestOptions: {
                Enabled: true
            },
            NodeToNodeEncryptionOptions: {
                Enabled: true
            },
            DomainEndpointOptions: {
                EnforceHTTPS: true,
                TLSSecurityPolicy: 'Policy-Min-TLS-1-2-2019-07'
            },
            AdvancedSecurityOptions: {
                Enabled: true,
                InternalUserDatabaseEnabled: true,
                MasterUserOptions: {
                    MasterUserName: 'admin',
                    MasterUserPassword: 'Admin@123456789'
                }
            },
            Tags: [
                {
                    Key: 'simulation-mas',
                    Value: 'true'
                },
                {
                    Key: 'Name',
                    Value: domainName
                }
            ]
        };

        const createResponse = await openSearchClient.send(
            new CreateDomainCommand(createDomainParams)
        );

        console.log('\nDomain Creation Initiated:', {
            DomainName: domainName,
            DomainArn: createResponse.DomainStatus.ARN,
            IsPublicDomain: true
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
createPublicOpenSearchDomain()
    .then(domainStatus => {
        console.log('\nOpenSearch Domain Details:', {
            DomainName: domainStatus.DomainName,
            DomainArn: domainStatus.ARN,
            Endpoint: domainStatus.Endpoints,
            EngineVersion: domainStatus.EngineVersion,
            InstanceType: domainStatus.ClusterConfig.InstanceType,
            InstanceCount: domainStatus.ClusterConfig.InstanceCount,
            StorageSize: `${domainStatus.EBSOptions.VolumeSize}GB`,
            IsPublicDomain: true
        });

        console.log('\nSecurity Configuration:', {
            PublicAccess: 'Enabled',
            EncryptionAtRest: 'Enabled',
            NodeToNodeEncryption: 'Enabled',
            EnforceHTTPS: 'Enabled',
            TLSPolicy: 'Policy-Min-TLS-1-2-2019-07',
            AdvancedSecurity: 'Enabled'
        });

        console.log('\nAccess Information:', {
            endpoint: domainStatus.Endpoints,
            username: 'admin',
            password: 'Admin@123456789',
            note: 'Please change the master user password after first login'
        });

        console.log('\nSecurity Warning:', {
            warning: 'This domain is publicly accessible',
            recommendations: [
                'Update the access policy to restrict to specific IP ranges',
                'Change the default master user password immediately',
                'Monitor access logs regularly',
                'Consider using VPC for production environments'
            ]
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
