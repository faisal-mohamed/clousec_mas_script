const {
    OpenSearchClient,
    CreateDomainCommand,
    DescribeDomainCommand
} = require("@aws-sdk/client-opensearch");
const {
    EC2Client,
    CreateSecurityGroupCommand,
    AuthorizeSecurityGroupIngressCommand,
    DescribeSubnetsCommand,
    DescribeVpcsCommand
} = require("@aws-sdk/client-ec2");
const {
    IAMClient,
    CreateServiceLinkedRoleCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const openSearchClient = new OpenSearchClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

const ec2Client = new EC2Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

const iamClient = new IAMClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

async function createServiceLinkedRole() {
    try {
        const command = new CreateServiceLinkedRoleCommand({
            AWSServiceName: "opensearchservice.amazonaws.com",
            Description: "Service-linked role for OpenSearch Service"
        });

        await iamClient.send(command);
        console.log("Created service-linked role for OpenSearch Service");
    } catch (error) {
        // If the role already exists, we can safely continue
        if (error.Error?.Code === 'InvalidInput' && 
            error.Error?.Message?.includes('has been taken')) {
            console.log("Service-linked role already exists, continuing...");
            return;
        }
        throw error;
    }
}

async function getVpcInfo() {
    try {
        const response = await ec2Client.send(new DescribeVpcsCommand({
            VpcIds: [process.env.VPC_ID]
        }));

        if (!response.Vpcs || response.Vpcs.length === 0) {
            throw new Error(`VPC ${process.env.VPC_ID} not found`);
        }

        console.log('VPC found:', response.Vpcs[0].VpcId);
        return response.Vpcs[0];
    } catch (error) {
        console.error('Error getting VPC info:', error);
        throw error;
    }
}

async function getSubnetsFromVpc() {
    try {
        const response = await ec2Client.send(new DescribeSubnetsCommand({
            Filters: [
                {
                    Name: 'vpc-id',
                    Values: [process.env.VPC_ID]
                }
            ]
        }));

        if (response.Subnets.length === 0) {
            throw new Error('No subnets found in the specified VPC');
        }

        // Get subnets from different AZs if available
        const uniqueAZSubnets = [];
        const seenAZs = new Set();

        for (const subnet of response.Subnets) {
            if (!seenAZs.has(subnet.AvailabilityZone)) {
                uniqueAZSubnets.push(subnet.SubnetId);
                seenAZs.add(subnet.AvailabilityZone);
                if (uniqueAZSubnets.length >= 2) break;
            }
        }

        console.log('Found subnets:', uniqueAZSubnets);
        return uniqueAZSubnets;
    } catch (error) {
        console.error('Error getting subnets:', error);
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
                Tags: [
                    {
                        Key: 'simulation-mas',
                        Value: 'true'
                    },
                    {
                        Key: 'Name',
                        Value: 'opensearch-security-group'
                    }
                ]
            }]
        }));

        const sgId = createSgResponse.GroupId;

        // Add inbound rule for HTTPS
        await ec2Client.send(new AuthorizeSecurityGroupIngressCommand({
            GroupId: sgId,
            IpProtocol: 'tcp',
            FromPort: 443,
            ToPort: 443,
            CidrIp: '0.0.0.0/0'  // Note: In production, restrict this to specific IP ranges
        }));

        console.log('Created security group:', sgId);
        return sgId;
    } catch (error) {
        console.error('Error creating security group:', error);
        throw error;
    }
}

async function createUnencryptedDomain() {
    try {
        // Create service-linked role first (or verify it exists)
        await createServiceLinkedRole();

        const timestamp = Math.floor(Date.now() / 1000).toString().slice(-8);
        const domainName = `test-domain-${timestamp}`.toLowerCase();
        
        // Get VPC info and subnets
        await getVpcInfo();
        const subnetIds = await getSubnetsFromVpc();
        const securityGroupId = await createSecurityGroup();

        const params = {
            DomainName: domainName,
            EngineVersion: 'OpenSearch_2.5',
            ClusterConfig: {
                InstanceType: 't3.small.search',
                InstanceCount: 1,
                DedicatedMasterEnabled: false,
                ZoneAwarenessEnabled: false,
                WarmEnabled: false
            },
            EBSOptions: {
                EBSEnabled: true,
                VolumeType: 'gp3',
                VolumeSize: 10
            },
            VPCOptions: {
                SubnetIds: [subnetIds[0]], // Using first subnet for single-AZ deployment
                SecurityGroupIds: [securityGroupId]
            },
            NodeToNodeEncryptionOptions: {
                Enabled: true
            },
            EncryptionAtRestOptions: {
                Enabled: false
            },
            AccessPolicies: JSON.stringify({
                Version: '2012-10-17',
                Statement: [
                    {
                        Effect: 'Allow',
                        Principal: {
                            AWS: '*'
                        },
                        Action: 'es:*',
                        Resource: `arn:aws:es:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:domain/${domainName}/*`
                    }
                ]
            }),
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
                    Key: 'CreatedBy',
                    Value: 'automation'
                }
            ]
        };

        const command = new CreateDomainCommand(params);
        const response = await openSearchClient.send(command);

        console.log('Domain creation initiated:', {
            DomainName: response.DomainStatus.DomainName,
            DomainId: response.DomainStatus.DomainId,
            EngineVersion: response.DomainStatus.EngineVersion,
            InstanceType: response.DomainStatus.ClusterConfig.InstanceType,
            EncryptionAtRest: 'Disabled',
            VPCId: process.env.VPC_ID,
            SubnetId: subnetIds[0],
            SecurityGroupId: securityGroupId
        });

        await waitForDomainActive(domainName);

        return domainName;

    } catch (error) {
        console.error('Error creating domain:', error);
        throw error;
    }
}

async function waitForDomainActive(domainName) {
    console.log('Waiting for domain to be active...');
    
    while (true) {
        try {
            const response = await openSearchClient.send(
                new DescribeDomainCommand({
                    DomainName: domainName
                })
            );

            const processingStatus = response.DomainStatus.Processing;
            const endpoint = response.DomainStatus.Endpoints?.vpc;

            console.log(`Domain Status: Processing=${processingStatus}`);
            
            if (!processingStatus && endpoint) {
                console.log('Domain is active');
                console.log('VPC Endpoint:', endpoint);
                break;
            }

            await new Promise(resolve => setTimeout(resolve, 30000));
            
        } catch (error) {
            console.error('Error checking domain status:', error);
            throw error;
        }
    }
}

async function main() {
    try {
        // Validate required environment variables
        const requiredEnvVars = [
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'AWS_SESSION_TOKEN',
            'AWS_REGION',
            'VPC_ID',
            'AWS_ACCOUNT_ID'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
        }

        await createUnencryptedDomain();

    } catch (error) {
        console.error('Execution failed:', error);
        process.exit(1);
    }
}

// Execute if running directly
if (require.main === module) {
    main();
}

module.exports = {
    createUnencryptedDomain
};
