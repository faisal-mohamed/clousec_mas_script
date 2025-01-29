const {
    OpenSearchClient,
    CreateDomainCommand,
    DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");
const {
    EC2Client,
    DescribeSubnetsCommand,
    DescribeSecurityGroupsCommand,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand
} = require("@aws-sdk/client-ec2");
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

async function createSecurityGroup() {
    try {
        // Create security group
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

        // Add inbound rules
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

// ... (previous imports and client initialization remain the same)

async function createOpenSearchDomain() {
    try {
        if (!process.env.VPC_ID) {
            throw new Error('VPC_ID environment variable is not set');
        }

        const subnetIds = await getPrivateSubnets();
        if (subnetIds.length === 0) {
            throw new Error('No private subnets found in the specified VPC');
        }

        const securityGroupId = await createSecurityGroup();
        // Generate a shorter domain name (using timestamp last 4 digits)
        const timestamp = Date.now().toString().slice(-4);
        const domainName = `os-domain-${timestamp}`; // This ensures name is under 28 characters

        console.log('Creating OpenSearch domain...');
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
            VPCId: process.env.VPC_ID,
            SecurityGroupId: securityGroupId,
            SubnetIds: subnetIds.slice(0, 2)
        });

        await waitForDomainCreation(domainName);
        return createResponse.DomainStatus;
    } catch (error) {
        console.error('Error creating OpenSearch domain:', error.message);
        throw error;
    }
}

// ... (rest of the code remains the same)


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
createOpenSearchDomain()
    .then(domainStatus => {
        console.log('\nOpenSearch Domain Details:', {
            DomainName: domainStatus.DomainName,
            DomainArn: domainStatus.ARN,
            Endpoint: domainStatus.Endpoints,
            EngineVersion: domainStatus.EngineVersion,
            InstanceType: domainStatus.ClusterConfig.InstanceType,
            InstanceCount: domainStatus.ClusterConfig.InstanceCount,
            StorageSize: `${domainStatus.EBSOptions.VolumeSize}GB`,
            VPCEnabled: true
        });

        console.log('\nSecurity Configuration:', {
            EncryptionAtRest: 'Enabled',
            NodeToNodeEncryption: 'Enabled',
            EnforceHTTPS: 'Enabled',
            TLSPolicy: 'Policy-Min-TLS-1-2-2019-07',
            AdvancedSecurity: 'Enabled'
        });

        console.log('\nAccess Information:', {
            endpoint: domainStatus.Endpoints,
            username: 'admin',
            password: 'Admin@123456789', // Remember to change in production
            note: 'Please change the master user password after first login'
        });
    })
    .catch(error => {
        console.error('Deployment failed:', error.message);
        process.exit(1);
    });
