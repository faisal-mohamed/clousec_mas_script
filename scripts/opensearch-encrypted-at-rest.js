const {
    OpenSearchClient,
    CreateDomainCommand,
    DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");
const {
    EC2Client,
    DescribeSubnetsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");
const {
    KMSClient,
    CreateKeyCommand,
    CreateAliasCommand,
    PutKeyPolicyCommand
} = require("@aws-sdk/client-kms");
require('dotenv').config();

// Initialize clients
const openSearchClient = new OpenSearchClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const ec2Client = new EC2Client({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

const kmsClient = new KMSClient({
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION || 'us-east-1'
});

async function createKMSKey() {
    try {
        console.log('Creating KMS key for encryption...');
        const createKeyResponse = await kmsClient.send(new CreateKeyCommand({
            Description: 'KMS key for OpenSearch encryption at rest',
            KeyUsage: 'ENCRYPT_DECRYPT',
            Origin: 'AWS_KMS',
            Tags: [{
                TagKey: 'simulation-mas',
                TagValue: 'true'
            }]
        }));

        const keyId = createKeyResponse.KeyMetadata.KeyId;
        const keyArn = createKeyResponse.KeyMetadata.Arn;

        // Create an alias for the key
        const aliasName = `alias/opensearch-${Date.now()}`;
        await kmsClient.send(new CreateAliasCommand({
            AliasName: aliasName,
            TargetKeyId: keyId
        }));

        // Update key policy to allow OpenSearch service to use the key
        const keyPolicy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "Enable IAM User Permissions",
                    Effect: "Allow",
                    Principal: {
                        AWS: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:root`
                    },
                    Action: "kms:*",
                    Resource: "*"
                },
                {
                    Sid: "Allow OpenSearch Service",
                    Effect: "Allow",
                    Principal: {
                        Service: "es.amazonaws.com"
                    },
                    Action: [
                        "kms:Decrypt",
                        "kms:GenerateDataKey"
                    ],
                    Resource: "*"
                }
            ]
        };

        await kmsClient.send(new PutKeyPolicyCommand({
            KeyId: keyId,
            PolicyName: 'default',
            Policy: JSON.stringify(keyPolicy)
        }));

        return keyArn;
    } catch (error) {
        console.error('Error creating KMS key:', error.message);
        throw error;
    }
}

async function createSecurityGroup() {
    try {
        const createSgResponse = await ec2Client.send(new CreateSecurityGroupCommand({
            GroupName: `opensearch-sg-${Date.now()}`,
            Description: 'Security group for OpenSearch domain',
            VpcId: process.env.VPC_ID,
            TagSpecifications: [{
                ResourceType: 'security-group',
                Tags: [{
                    Key: 'simulation-mas',
                    Value: 'true'
                }]
            }]
        }));

        const sgId = createSgResponse.GroupId;

        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgId,
            IpPermissions: [
                {
                    IpProtocol: 'tcp',
                    FromPort: 443,
                    ToPort: 443,
                    IpRanges: [{ CidrIp: '0.0.0.0/0' }]
                }
            ]
        }));

        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error.message);
        throw error;
    }
}

async function getPrivateSubnets() {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [process.env.VPC_ID]
                }
            ]
        }));

        return response.Subnets
            .filter(subnet => !subnet.MapPublicIpOnLaunch)
            .map(subnet => subnet.SubnetId);
    } catch (error) {
        console.error('Error fetching subnets:', error.message);
        throw error;
    }
}

async function createEncryptedOpenSearchDomain() {
    try {
        if (!process.env.VPC_ID) {
            throw new Error('VPC_ID environment variable is not set');
        }

        const subnetIds = await getPrivateSubnets();
        if (subnetIds.length === 0) {
            throw new Error('No private subnets found in the specified VPC');
        }

        const securityGroupId = await createSecurityGroup();
        const kmsKeyArn = await createKMSKey();
        const timestamp = Date.now().toString().slice(-4);
        const domainName = `os-enc-${timestamp}`;

        console.log('Creating encrypted OpenSearch domain...');
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
            VPCOptions: {
                SubnetIds: subnetIds.slice(0, 2),
                SecurityGroupIds: [securityGroupId]
            },
            EncryptionAtRestOptions: {
                Enabled: true,
                KmsKeyId: kmsKeyArn
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
            KMSKeyArn: kmsKeyArn,
            VPCId: process.env.VPC_ID,
            SecurityGroupId: securityGroupId,
            SubnetIds: subnetIds.slice(0, 2)
        });

        await waitForDomainCreation(domainName);
        return {
            domainStatus: createResponse.DomainStatus,
            kmsKeyArn
        };
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
createEncryptedOpenSearchDomain()
    .then(result => {
        console.log('\nOpenSearch Domain Details:', {
            DomainName: result.domainStatus.DomainName,
            DomainArn: result.domainStatus.ARN,
            Endpoint: result.domainStatus.Endpoints,
            EngineVersion: result.domainStatus.EngineVersion,
            InstanceType: result.domainStatus.ClusterConfig.InstanceType,
            InstanceCount: result.domainStatus.ClusterConfig.InstanceCount,
            StorageSize: `${result.domainStatus.EBSOptions.VolumeSize}GB`,
            KMSKeyArn: result.kmsKeyArn
        });

        console.log('\nEncryption Configuration:', {
            EncryptionAtRest: 'Enabled with KMS',
            KMSKeyArn: result.kmsKeyArn,
            NodeToNodeEncryption: 'Enabled',
            EnforceHTTPS: 'Enabled',
            TLSPolicy: 'Policy-Min-TLS-1-2-2019-07'
        });

        console.log('\nAccess Information:', {
            endpoint: result.domainStatus.Endpoints,
            username: 'admin',
            password: 'Admin@123456789',
            note: 'Please change the master user password after first login'
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
