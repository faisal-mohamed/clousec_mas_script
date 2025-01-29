const { 
    APIGatewayClient, 
    CreateRestApiCommand,
    CreateResourceCommand,
    PutMethodCommand,
    PutIntegrationCommand,
    CreateDeploymentCommand,
    CreateStageCommand,
    GetResourcesCommand,
    TagResourceCommand,
    UpdateStageCommand,
    PutMethodResponseCommand,
    PutIntegrationResponseCommand
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
  
  async function createInsecureApiGateway() {
    const awsCredentials = getAWSCredentials();
    const apiGatewayClient = new APIGatewayClient(awsCredentials);
    const region = process.env.AWS_REGION;
  
    try {
      // 1. Create REST API
      console.log("Creating REST API...");
      const createApiResponse = await apiGatewayClient.send(
        new CreateRestApiCommand({
          name: generateUniqueName('simulation-mas-insecure-api'),
          description: 'Insecure API Gateway (HTTP only)',
          endpointConfiguration: {
            types: ['REGIONAL']
          },
          tags: {
            'simulation-mas': 'true'
          }
        })
      );
  
      const apiId = createApiResponse.id;
      console.log(`API Gateway created with ID: ${apiId}`);
  
      // 2. Get the root resource ID
      const resourcesResponse = await apiGatewayClient.send(
        new GetResourcesCommand({
          restApiId: apiId
        })
      );
      
      const rootResourceId = resourcesResponse.items[0].id;
  
      // 3. Create test resources
      console.log("Creating API resources...");
      const createResourceResponse = await apiGatewayClient.send(
        new CreateResourceCommand({
          restApiId: apiId,
          parentId: rootResourceId,
          pathPart: 'test'
        })
      );
  
      const resourceId = createResourceResponse.id;
  
      // 4. Create GET method without authentication
      console.log("Creating GET method without authentication...");
      await apiGatewayClient.send(
        new PutMethodCommand({
          restApiId: apiId,
          resourceId: resourceId,
          httpMethod: 'GET',
          authorizationType: 'NONE',
          apiKeyRequired: false
        })
      );
  
      // 5. Add method response
      await apiGatewayClient.send(
        new PutMethodResponseCommand({
          restApiId: apiId,
          resourceId: resourceId,
          httpMethod: 'GET',
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': true
          }
        })
      );
  
      // 6. Create mock integration
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
  
      // 7. Add integration response
      await apiGatewayClient.send(
        new PutIntegrationResponseCommand({
          restApiId: apiId,
          resourceId: resourceId,
          httpMethod: 'GET',
          statusCode: '200',
          responseParameters: {
            'method.response.header.Access-Control-Allow-Origin': "'*'"
          },
          responseTemplates: {
            'application/json': '{"message": "This is an insecure API response"}'
          }
        })
      );
  
      // 8. Create deployment
      console.log("Creating deployment...");
      const deploymentResponse = await apiGatewayClient.send(
        new CreateDeploymentCommand({
          restApiId: apiId,
          description: 'Initial deployment'
        })
      );
  
      // 9. Create stage
      console.log("Creating stage...");
      const stageName = 'dev';
      await apiGatewayClient.send(
        new CreateStageCommand({
          restApiId: apiId,
          stageName: stageName,
          deploymentId: deploymentResponse.id,
          tags: {
            'simulation-mas': 'true'
          }
        })
      );
  
      // 10. Update stage settings
      console.log("Updating stage settings...");
      await apiGatewayClient.send(
        new UpdateStageCommand({
          restApiId: apiId,
          stageName: stageName,
          patchOperations: [
            {
              op: 'replace',
              path: '/*/*/metrics/enabled',
              value: 'false'
            },
            {
              op: 'replace',
              path: '/*/*/logging/loglevel',
              value: 'OFF'
            }
          ]
        })
      );
  
      // Tag resources
      const apiArn = `arn:aws:apigateway:${region}::/restapis/${apiId}`;
      const stageArn = `${apiArn}/stages/${stageName}`;
      
      await tagResource(apiGatewayClient, apiArn);
      await tagResource(apiGatewayClient, stageArn);
  
      // Generate endpoints
      const httpEndpoint = `http://${apiId}.execute-api.${region}.amazonaws.com/${stageName}`;
  
      console.log("\nInsecure API Gateway created successfully!");
      console.log("\nAPI Details:");
      console.log(`- API ID: ${apiId}`);
      console.log(`- API ARN: ${apiArn}`);
      console.log(`- Stage Name: ${stageName}`);
      console.log(`- HTTP Endpoint: ${httpEndpoint}`);
      console.log(`- Test endpoint: ${httpEndpoint}/test`);
      
      console.log("\nSecurity Configuration (Insecure):");
      console.log("- Protocol: HTTP (insecure)");
      console.log("- Authentication: None");
      console.log("- API Key Required: No");
      console.log("- CORS: Enabled (* all origins)");
      
      console.log("\nTags applied:");
      console.log("- Key: simulation-mas");
      console.log("- Value: true");
  
      console.log("\nWARNING: This API Gateway is intentionally insecure and should not be used in production!");
  
      return {
        apiId,
        apiArn,
        stageName,
        endpoint: httpEndpoint
      };
  
    } catch (error) {
      console.error("Error creating insecure API Gateway:", error);
      throw error;
    }
  }
  
  async function main() {
    try {
      console.log("Starting insecure API Gateway creation...");
      await createInsecureApiGateway();
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
    createInsecureApiGateway
  };
  