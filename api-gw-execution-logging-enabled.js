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
} = require("@aws-sdk/client-api-gateway");

require('dotenv').config();

// Create AWS client
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

// Create API with basic endpoint
const createBasicApi = async (apiGatewayClient) => {
    try {
        // Create API
        const createApiResponse = await apiGatewayClient.send(
            new CreateRestApiCommand({
                name: `non-compliant-api-${Date.now()}`,
                description: 'Non-compliant API without execution logging'
            })
        );

        const apiId = createApiResponse.id;

        // Get root resource id
        const resources = await apiGatewayClient.send(
            new GetResourcesCommand({
                restApiId: apiId
            })
        );
        const rootResourceId = resources.items[0].id;

        // Create resource
        const createResourceResponse = await apiGatewayClient.send(
            new CreateResourceCommand({
                restApiId: apiId,
                parentId: rootResourceId,
                pathPart: 'test'
            })
        );

        // Create method
        await apiGatewayClient.send(
            new PutMethodCommand({
                restApiId: apiId,
                resourceId: createResourceResponse.id,
                httpMethod: 'GET',
                authorizationType: 'NONE'
            })
        );

        // Create mock integration
        await apiGatewayClient.send(
            new PutIntegrationCommand({
                restApiId: apiId,
                resourceId: createResourceResponse.id,
                httpMethod: 'GET',
                type: 'MOCK',
                requestTemplates: {
                    'application/json': '{"statusCode": 200}'
                }
            })
        );

        // Create deployment
        const deployment = await apiGatewayClient.send(
            new CreateDeploymentCommand({
                restApiId: apiId,
                description: 'Non-compliant deployment'
            })
        );

        // Create stage without logging
        await apiGatewayClient.send(
            new CreateStageCommand({
                restApiId: apiId,
                stageName: 'test',
                deploymentId: deployment.id,
                // Deliberately not setting logging configuration to make it non-compliant
            })
        );

        return apiId;
    } catch (error) {
        console.error('Error creating API:', error);
        throw error;
    }
};

// Cleanup resources
const cleanup = async (apiGatewayClient, apiId) => {
    try {
        if (apiId) {
            console.log('\nCleaning up resources...');
            await apiGatewayClient.send(
                new DeleteRestApiCommand({
                    restApiId: apiId
                })
            );
            console.log('API Gateway deleted');
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
};

// Create non-compliant state
const createNonCompliantState = async () => {
    const apiGatewayClient = createAwsClient(APIGatewayClient);
    let apiId;

    try {
        console.log('Creating non-compliant API Gateway without execution logging...');

        apiId = await createBasicApi(apiGatewayClient);

        console.log('\nNon-compliant state created:');
        console.log(`API ID: ${apiId}`);
        console.log('Stage: test');
        console.log('Status: Non-compliant - Execution logging not enabled');

        // Wait for AWS Config to evaluate
        console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
        await new Promise(resolve => setTimeout(resolve, 120000));

    } catch (error) {
        console.error('Error creating non-compliant API Gateway:', error);
        throw error;
    } finally {
        await cleanup(apiGatewayClient, apiId);
    }
};

// Main function
const main = async () => {
    try {
        await createNonCompliantState();
    } catch (error) {
        console.error('Script execution failed:', error);
    }
};

// Run the script
if (require.main === module) {
    main();
}

module.exports = {
    createNonCompliantState
};
