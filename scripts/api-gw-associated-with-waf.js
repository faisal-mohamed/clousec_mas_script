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
    UpdateStageCommand
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
            'simulation-mas': 'true',
            'NoWAF': 'true'
          }
        })
      );
      console.log(`Tagged resource: ${resourceArn}`);
    } catch (error) {
      console.error(`Error tagging resource ${resourceArn}:`, error);
    }
  }
  
  async function createApiGatewayWithoutWAF() {
    const awsCredentials = getAWSCredentials();
    const apiGatewayClient = new APIGatewayClient(awsCredentials);
    const region = process.env.AWS_REGION;
  
    try {
      // 1. Create REST API
      console.log("Creating REST API without WAF...");
      const createApiResponse = await apiGatewayClient.send(
        new CreateRestApiCommand({
          name: generateUniqueName('simulation-mas-no-waf-api'),
          description: 'API Gateway without WAF association',
          endpointConfiguration: {
            types: ['REGIONAL']
          },
          tags: {
            'simulation-mas': 'true',
            'NoWAF': 'true'
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
  
      // 3. Create test resource
      console.log("Creating API resource...");
      const createResourceResponse = await apiGatewayClient.send(
        new CreateResourceCommand({
          restApiId: apiId,
          parentId: rootResourceId,
          pathPart: 'test'
        })
      );
  
      const resourceId = createResourceResponse.id;
  
      // 4. Create GET method
      console.log("Creating GET method...");
      await apiGatewayClient.send(
        new PutMethodCommand({
          restApiId: apiId,
          resourceId: resourceId,
          httpMethod: 'GET',
          authorizationType: 'NONE'
        })
      );
  
      // 5. Create mock integration
      console.log("Creating mock integration...");
      await apiGatewayClient.send(
        new PutIntegrationCommand({
          restApiId: apiId,
          resourceId: resourceId,
          httpMethod: 'GET',
          type: 'MOCK',
          requestTemplates: {
            'application/json': '{"statusCode": 200}'
          },
          integrationResponses: {
            200: {
              statusCode: '200',
              responseTemplates: {
                'application/json': '{"message": "API Gateway without WAF"}'
              }
            }
          }
        })
      );
  
      // 6. Create deployment
      console.log("Creating deployment...");
      const deploymentResponse = await apiGatewayClient.send(
        new CreateDeploymentCommand({
          restApiId: apiId,
          description: 'Initial deployment'
        })
      );
  
      // 7. Create stage
      console.log("Creating stage...");
      const stageName = 'dev';
      await apiGatewayClient.send(
        new CreateStageCommand({
          restApiId: apiId,
          stageName: stageName,
          deploymentId: deploymentResponse.id,
          tags: {
            'simulation-mas': 'true',
            'NoWAF': 'true'
          }
        })
      );
  
      // 8. Update stage settings
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
            }
          ]
        })
      );
  
      // 9. Tag resources
      const apiArn = `arn:aws:apigateway:${region}::/restapis/${apiId}`;
      const stageArn = `${apiArn}/stages/${stageName}`;
      
      await tagResource(apiGatewayClient, apiArn);
      await tagResource(apiGatewayClient, stageArn);
  
      // Generate endpoint
      const apiEndpoint = `https://${apiId}.execute-api.${region}.amazonaws.com/${stageName}`;
  
      console.log("\nAPI Gateway created successfully without WAF!");
      console.log("\nAPI Details:");
      console.log(`- API ID: ${apiId}`);
      console.log(`- API ARN: ${apiArn}`);
      console.log(`- Stage Name: ${stageName}`);
      console.log(`- Stage ARN: ${stageArn}`);
      console.log(`- Endpoint URL: ${apiEndpoint}`);
      console.log(`- Test endpoint: ${apiEndpoint}/test`);
      
      console.log("\nConfiguration:");
      console.log("- WAF Association: None");
      console.log("- Endpoint Type: REGIONAL");
      console.log("- Authentication: None");
      
      console.log("\nTags applied:");
      console.log("- simulation-mas: true");
      console.log("- NoWAF: true");
  
      console.log("\nNOTE: This API Gateway is not protected by WAF. Consider security implications.");
  
      return {
        apiId,
        apiArn,
        stageName,
        stageArn,
        endpoint: apiEndpoint
      };
  
    } catch (error) {
      console.error("Error creating API Gateway:", error);
      throw error;
    }
  }
  
  async function main() {
    try {
      console.log("Starting API Gateway creation without WAF...");
      await createApiGatewayWithoutWAF();
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
    createApiGatewayWithoutWAF
  };
  