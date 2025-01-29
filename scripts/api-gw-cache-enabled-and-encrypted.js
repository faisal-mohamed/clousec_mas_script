const { 
  APIGatewayClient, 
  CreateRestApiCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand,
  CreateStageCommand,
  GetResourcesCommand,
  TagResourceCommand
} = require("@aws-sdk/client-api-gateway");

require('dotenv').config();

function generateUniqueName(baseName) {
  const timestamp = new Date().getTime();
  return `${baseName}-${timestamp}`;
}

function getAWSCredentials() {
  const required = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'];
  const missing = required.filter(env => !process.env[env]);
  
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const credentials = {
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  };

  if (process.env.AWS_SESSION_TOKEN) {
    credentials.credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
  }

  return credentials;
}

async function tagResource(apiGatewayClient, resourceArn) {
  try {
    await apiGatewayClient.send(
      new TagResourceCommand({
        resourceArn: resourceArn,
        tags: {
          'simulation-mas': 'true'
        }
      })
    );
    console.log(`Tagged resource: ${resourceArn}`);
  } catch (error) {
    console.error(`Error tagging resource ${resourceArn}:`, error);
  }
}

async function createApiGateway() {
  const awsCredentials = getAWSCredentials();
  const apiGatewayClient = new APIGatewayClient(awsCredentials);

  try {
    // Create REST API
    console.log("Creating REST API...");
    const createApiResponse = await apiGatewayClient.send(
      new CreateRestApiCommand({
        name: generateUniqueName('simulation-mas-api'),
        description: 'API Gateway for simulation-mas',
        tags: {
          'simulation-mas': 'true'  // Tag during creation
        }
      })
    );

    const apiId = createApiResponse.id;
    const region = process.env.AWS_REGION;
    const accountId = createApiResponse.tags?.accountId || 'your-account-id';
    
    console.log(`API Gateway created with ID: ${apiId}`);

    // Get the root resource ID
    const resourcesResponse = await apiGatewayClient.send(
      new GetResourcesCommand({
        restApiId: apiId
      })
    );
    
    const rootResourceId = resourcesResponse.items[0].id;

    // Create a resource
    console.log("Creating API resource...");
    const createResourceResponse = await apiGatewayClient.send(
      new CreateResourceCommand({
        restApiId: apiId,
        parentId: rootResourceId,
        pathPart: 'test'
      })
    );

    const resourceId = createResourceResponse.id;

    // Create GET method
    console.log("Creating GET method...");
    await apiGatewayClient.send(
      new PutMethodCommand({
        restApiId: apiId,
        resourceId: resourceId,
        httpMethod: 'GET',
        authorizationType: 'NONE'
      })
    );

    // Create mock integration
    console.log("Creating mock integration...");
    await apiGatewayClient.send(
      new PutIntegrationCommand({
        restApiId: apiId,
        resourceId: resourceId,
        httpMethod: 'GET',
        type: 'MOCK',
        requestTemplates: {
          'application/json': '{"statusCode": 200}'
        }
      })
    );

    // Create deployment
    console.log("Creating deployment...");
    const deploymentResponse = await apiGatewayClient.send(
      new CreateDeploymentCommand({
        restApiId: apiId,
        description: 'Initial deployment'
      })
    );

    // Create stage with tags
    console.log("Creating stage...");
    await apiGatewayClient.send(
      new CreateStageCommand({
        restApiId: apiId,
        stageName: 'dev',
        deploymentId: deploymentResponse.id,
        tags: {
          'simulation-mas': 'true'  // Tag during creation
        },
        cacheClusterEnabled: false,
        methodSettings: {
          '*/*': {
            cachingEnabled: false
          }
        }
      })
    );

    // Tag all resources that support tagging
    const baseArn = `arn:aws:apigateway:${region}::/restapis/${apiId}`;
    
    // Tag the main API
    await tagResource(apiGatewayClient, baseArn);
    
    // Tag the stage
    const stageArn = `${baseArn}/stages/dev`;
    await tagResource(apiGatewayClient, stageArn);

    // Print the API endpoint URL
    const apiEndpoint = `https://${apiId}.execute-api.${region}.amazonaws.com/dev`;
    
    console.log("\nAPI Gateway created successfully!");
    console.log("API Details:");
    console.log(`- API ID: ${apiId}`);
    console.log(`- Stage: dev`);
    console.log(`- Endpoint URL: ${apiEndpoint}`);
    console.log(`- Test endpoint: ${apiEndpoint}/test`);
    console.log("\nTags applied:");
    console.log("- Key: simulation-mas");
    console.log("- Value: true");

    return {
      apiId,
      endpoint: apiEndpoint
    };

  } catch (error) {
    console.error("Error creating API Gateway:", error);
    throw error;
  }
}

async function main() {
  try {
    console.log("Starting API Gateway creation...");
    await createApiGateway();
    console.log("Setup completed successfully");
  } catch (error) {
    console.error("Failed to create API Gateway:", error);
    process.exit(1);
  }
}

// Only run if this is the main module
if (require.main === module) {
  main();
}

module.exports = {
  createApiGateway
};
