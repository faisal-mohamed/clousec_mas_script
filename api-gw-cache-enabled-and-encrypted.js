require('dotenv').config();
const {
  APIGatewayClient,
  CreateRestApiCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand,
  CreateStageCommand,
  DeleteRestApiCommand,
  GetStagesCommand,
  GetResourcesCommand
} = require("@aws-sdk/client-api-gateway");

// Initialize API Gateway client
const apiGatewayClient = new APIGatewayClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create non-compliant API (cache enabled but not encrypted)
async function createNonCompliantApi() {
  const apiName = `test-api-non-compliant-${Date.now()}`;
  
  try {
    // Create REST API
    const createApiResponse = await apiGatewayClient.send(
      new CreateRestApiCommand({
        name: apiName,
        description: 'Test API with non-compliant cache configuration'
      })
    );

    const apiId = createApiResponse.id;
    createdResources.push({
      type: 'API',
      id: apiId,
      name: apiName
    });

    console.log(`Created API: ${apiName} (${apiId})`);

    // Get root resource ID
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

    // Create GET method
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
    const createDeploymentResponse = await apiGatewayClient.send(
      new CreateDeploymentCommand({
        restApiId: apiId,
        description: 'Test deployment'
      })
    );

    // Create stage with cache enabled but not encrypted (non-compliant)
    await apiGatewayClient.send(
      new CreateStageCommand({
        restApiId: apiId,
        stageName: 'test',
        deploymentId: createDeploymentResponse.id,
        cacheClusterEnabled: true,
        cacheClusterSize: '0.5', // Smallest cache size
        methodSettings: {
          '*/*': {
            cachingEnabled: true,
            cacheDataEncrypted: false // This makes it non-compliant
          }
        }
      })
    );

    console.log('Created non-compliant stage with unencrypted cache');
    return apiId;
  } catch (error) {
    console.error('Error creating non-compliant API:', error);
    throw error;
  }
}

// Check API cache configuration
async function checkApiCacheConfiguration(apiId) {
  try {
    const stagesResponse = await apiGatewayClient.send(
      new GetStagesCommand({
        restApiId: apiId
      })
    );

    console.log(`\nAnalyzing API: ${apiId}`);
    
    for (const stage of stagesResponse.item) {
      console.log(`\nStage: ${stage.stageName}`);
      console.log(`Cache Cluster Enabled: ${stage.cacheClusterEnabled}`);
      console.log(`Cache Cluster Size: ${stage.cacheClusterSize}`);
      console.log(`Cache Cluster Status: ${stage.cacheClusterStatus}`);

      // Check method settings
      if (stage.methodSettings) {
        for (const [path, settings] of Object.entries(stage.methodSettings)) {
          console.log(`\nMethod Settings for ${path}:`);
          console.log(`Caching Enabled: ${settings.cachingEnabled}`);
          console.log(`Cache Encrypted: ${settings.cacheDataEncrypted}`);
          
          // Determine compliance
          const isCompliant = !settings.cachingEnabled || 
                            (settings.cachingEnabled && settings.cacheDataEncrypted);
          
          console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
        }
      }
    }
  } catch (error) {
    console.error('Error checking API cache configuration:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'API':
          await apiGatewayClient.send(
            new DeleteRestApiCommand({
              restApiId: resource.id
            })
          );
          console.log(`Deleted API: ${resource.name} (${resource.id})`);
          break;
      }
    } catch (error) {
      console.error(`Error cleaning up ${resource.type}:`, error);
    }
  }
}

// Main execution
async function main() {
  try {
    console.log('Starting API Gateway cache check...');
    
    // Create non-compliant API
    console.log('\nCreating non-compliant API...');
    const apiId = await createNonCompliantApi();
    
    // Wait for cache cluster to be available
    console.log('Waiting for cache cluster to be available...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Check configuration
    await checkApiCacheConfiguration(apiId);
    
    // Wait before cleanup
    await new Promise(resolve => setTimeout(resolve, 5000));
    
  } catch (error) {
    console.error('Error in main execution:', error);
  } finally {
    await cleanup();
  }
}

// Execute if running directly
if (require.main === module) {
  main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}
