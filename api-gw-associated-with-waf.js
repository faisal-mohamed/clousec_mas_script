const { 
    APIGatewayClient, 
    CreateRestApiCommand,
    CreateResourceCommand,
    PutMethodCommand,
    PutIntegrationCommand,
    CreateDeploymentCommand,
    CreateStageCommand,
    DeleteRestApiCommand,
    GetResourcesCommand
} = require('@aws-sdk/client-api-gateway');

const { 
    WAFV2Client, 
    CreateWebACLCommand,
    DeleteWebACLCommand,
    AssociateWebACLCommand,
    DisassociateWebACLCommand,
    ListResourcesForWebACLCommand,
    GetWebACLCommand
} = require('@aws-sdk/client-wafv2');

require('dotenv').config();

// Initialize clients
const apiGatewayClient = new APIGatewayClient({ region: process.env.AWS_REGION });
const wafClient = new WAFV2Client({ region: process.env.AWS_REGION });

// Function to create a basic API Gateway
async function createBasicApiGateway() {
    try {
        // Create API
        const createApiResponse = await apiGatewayClient.send(new CreateRestApiCommand({
            name: `non-compliant-api-${Date.now()}`,
            description: 'API for WAF compliance testing'
        }));
        
        const apiId = createApiResponse.id;
        console.log(`Created API Gateway with ID: ${apiId}`);

        // Get the root resource ID
        const resources = await apiGatewayClient.send(new GetResourcesCommand({
            restApiId: apiId
        }));
        const rootResourceId = resources.items[0].id;

        // Create a test resource
        const resourceResponse = await apiGatewayClient.send(new CreateResourceCommand({
            restApiId: apiId,
            parentId: rootResourceId,
            pathPart: 'test'
        }));

        // Create a GET method
        await apiGatewayClient.send(new PutMethodCommand({
            restApiId: apiId,
            resourceId: resourceResponse.id,
            httpMethod: 'GET',
            authorizationType: 'NONE'
        }));

        // Create mock integration
        await apiGatewayClient.send(new PutIntegrationCommand({
            restApiId: apiId,
            resourceId: resourceResponse.id,
            httpMethod: 'GET',
            type: 'MOCK',
            requestTemplates: {
                'application/json': '{"statusCode": 200}'
            }
        }));

        // Create deployment
        const deploymentResponse = await apiGatewayClient.send(new CreateDeploymentCommand({
            restApiId: apiId
        }));

        // Create stage
        await apiGatewayClient.send(new CreateStageCommand({
            restApiId: apiId,
            stageName: 'test',
            deploymentId: deploymentResponse.id
        }));

        return apiId;
    } catch (error) {
        console.error('Error creating API Gateway:', error);
        throw error;
    }
}

// Function to create a WAF Web ACL
async function createWebAcl() {
    try {
        const webAclName = `test-webacl-${Date.now()}`;
        const response = await wafClient.send(new CreateWebACLCommand({
            Name: webAclName,
            Scope: 'REGIONAL',
            DefaultAction: { Allow: {} },
            Description: 'Test Web ACL for API Gateway',
            Rules: [],
            VisibilityConfig: {
                SampledRequestsEnabled: true,
                CloudWatchMetricsEnabled: true,
                MetricName: `${webAclName}-metric`
            }
        }));
        
        console.log('Created Web ACL:', response.Summary.Name);
        return {
            arn: response.Summary.ARN,
            id: response.Summary.Id,
            name: response.Summary.Name
        };
    } catch (error) {
        console.error('Error creating Web ACL:', error);
        throw error;
    }
}

// Function to associate WAF with API Gateway
async function associateWafWithApi(webAclArn, apiArn) {
    try {
        await wafClient.send(new AssociateWebACLCommand({
            WebACLArn: webAclArn,
            ResourceArn: apiArn
        }));
        console.log('Associated WAF with API Gateway');
    } catch (error) {
        console.error('Error associating WAF:', error);
        throw error;
    }
}

// Function to cleanup resources
async function cleanupResources(apiId, webAclArn) {
    try {
        // Delete API Gateway
        if (apiId) {
            await apiGatewayClient.send(new DeleteRestApiCommand({
                restApiId: apiId
            }));
            console.log('Deleted API Gateway');
        }

        // Delete Web ACL
        if (webAclArn) {
            try {
                // First disassociate from any resources
                const resources = await wafClient.send(new ListResourcesForWebACLCommand({
                    WebACLArn: webAclArn
                }));

                for (const resourceArn of resources.ResourceArns) {
                    await wafClient.send(new DisassociateWebACLCommand({
                        ResourceArn: resourceArn
                    }));
                }

                // Extract WebACL ID and Name from ARN
                // ARN format: arn:aws:wafv2:region:account:regional/webacl/name/id
                const arnParts = webAclArn.split('/');
                const webAclName = arnParts[arnParts.length - 2];
                const webAclId = arnParts[arnParts.length - 1];

                // Get Web ACL details to obtain LockToken
                const webAclDetails = await wafClient.send(new GetWebACLCommand({
                    Name: webAclName,
                    Id: webAclId,
                    Scope: 'REGIONAL'
                }));

                // Delete Web ACL with LockToken
                await wafClient.send(new DeleteWebACLCommand({
                    Name: webAclName,
                    Id: webAclId,
                    Scope: 'REGIONAL',
                    LockToken: webAclDetails.LockToken
                }));
                console.log('Deleted Web ACL');
            } catch (error) {
                if (error.__type === 'WAFNonexistentItemException') {
                    console.log('Web ACL already deleted or does not exist');
                } else {
                    console.error('Error deleting WAF Web ACL:', error);
                }
            }
        }
    } catch (error) {
        console.error('Error in cleanup:', error);
    }
}

async function simulateNonCompliance() {
    let apiId = null;
    let webAcl = null;

    try {
        console.log('Starting non-compliance simulation...');

        // Create API Gateway without WAF (non-compliant state)
        apiId = await createBasicApiGateway();
        console.log('Created non-compliant API Gateway (no WAF association)');

        // Wait to simulate testing period
        console.log('Waiting 10 seconds to simulate testing period...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Optional: Create and associate WAF to demonstrate compliance
        console.log('Creating WAF Web ACL...');
        webAcl = await createWebAcl();

        const apiArn = `arn:aws:apigateway:${process.env.AWS_REGION}::/restapis/${apiId}/stages/test`;
        await associateWafWithApi(webAcl.arn, apiArn);

    } catch (error) {
        console.error('Error in simulation:', error);
    } finally {
        // Cleanup all resources
        console.log('Cleaning up resources...');
        await cleanupResources(apiId, webAcl?.arn);
        console.log('Cleanup completed');
    }
}

// Run the simulation
simulateNonCompliance().catch(console.error);
