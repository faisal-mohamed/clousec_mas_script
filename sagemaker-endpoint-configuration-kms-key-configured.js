require('dotenv').config();
const {
  SageMakerClient,
  CreateModelCommand,
  CreateEndpointConfigCommand,
  CreateEndpointCommand,
  DeleteModelCommand,
  DeleteEndpointConfigCommand,
  DeleteEndpointCommand,
  DescribeEndpointCommand,
  ListEndpointConfigsCommand
} = require("@aws-sdk/client-sagemaker");

// Initialize SageMaker client
const sagemakerClient = new SageMakerClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION || 'ap-southeast-1'
});

// Track created resources
const createdResources = [];

// Create SageMaker model
async function createModel() {
  try {
    const modelName = `test-model-${Date.now()}`;
    
    await sagemakerClient.send(
      new CreateModelCommand({
        ModelName: modelName,
        ExecutionRoleArn: process.env.SAGEMAKER_ROLE_ARN,
        PrimaryContainer: {
          Image: `${process.env.AWS_ACCOUNT_ID}.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/sagemaker-scikit-learn:latest`,
          Mode: 'SingleModel',
          ModelDataUrl: `s3://${process.env.MODEL_BUCKET}/model.tar.gz`
        }
      })
    );

    createdResources.push({
      type: 'MODEL',
      name: modelName
    });

    console.log(`Created model: ${modelName}`);
    return modelName;
  } catch (error) {
    console.error('Error creating model:', error);
    throw error;
  }
}

// Create non-compliant endpoint configuration (without KMS key)
async function createNonCompliantEndpointConfig(modelName) {
  try {
    const configName = `test-config-${Date.now()}`;
    
    await sagemakerClient.send(
      new CreateEndpointConfigCommand({
        EndpointConfigName: configName,
        ProductionVariants: [
          {
            VariantName: 'AllTraffic',
            ModelName: modelName,
            InstanceType: 'ml.t2.medium',
            InitialInstanceCount: 1
          }
        ]
        // Not specifying KmsKeyId makes this non-compliant
      })
    );

    createdResources.push({
      type: 'ENDPOINT_CONFIG',
      name: configName
    });

    console.log(`Created non-compliant endpoint configuration: ${configName}`);
    return configName;
  } catch (error) {
    console.error('Error creating endpoint configuration:', error);
    throw error;
  }
}

// Create endpoint
async function createEndpoint(configName) {
  try {
    const endpointName = `test-endpoint-${Date.now()}`;
    
    await sagemakerClient.send(
      new CreateEndpointCommand({
        EndpointName: endpointName,
        EndpointConfigName: configName
      })
    );

    createdResources.push({
      type: 'ENDPOINT',
      name: endpointName
    });

    console.log(`Created endpoint: ${endpointName}`);

    // Wait for endpoint to be in service
    await waitForEndpointInService(endpointName);

    return endpointName;
  } catch (error) {
    console.error('Error creating endpoint:', error);
    throw error;
  }
}

// Wait for endpoint to be in service
async function waitForEndpointInService(endpointName) {
  console.log('Waiting for endpoint to be in service...');
  
  while (true) {
    try {
      const response = await sagemakerClient.send(
        new DescribeEndpointCommand({
          EndpointName: endpointName
        })
      );

      const status = response.EndpointStatus;
      console.log(`Endpoint status: ${status}`);
      
      if (status === 'InService') {
        break;
      } else if (status === 'Failed') {
        throw new Error('Endpoint creation failed');
      }
    } catch (error) {
      console.error('Error checking endpoint status:', error);
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds between checks
  }
}

// Check endpoint configuration KMS key
async function checkEndpointConfigKMS(configName) {
  try {
    const response = await sagemakerClient.send(
      new ListEndpointConfigsCommand({
        NameContains: configName
      })
    );

    console.log('\nAnalyzing Endpoint Configuration:', configName);
    
    const config = response.EndpointConfigs.find(c => c.EndpointConfigName === configName);
    if (config) {
      console.log('Configuration Details:');
      console.log(`Creation Time: ${config.CreationTime}`);
      console.log(`KMS Key ID: ${config.KmsKeyId || 'Not configured'}`);

      // Determine compliance
      const isCompliant = config.KmsKeyId != null;
      console.log(`\nCompliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
      return isCompliant;
    } else {
      console.log('Configuration not found');
      return false;
    }
  } catch (error) {
    console.error('Error checking endpoint configuration:', error);
    throw error;
  }
}

// List and check all endpoint configurations
async function listConfigsAndCheckKMS() {
  try {
    const response = await sagemakerClient.send(
      new ListEndpointConfigsCommand({})
    );

    console.log('\nChecking all endpoint configurations in region:');
    for (const config of response.EndpointConfigs) {
      console.log(`\nConfiguration Name: ${config.EndpointConfigName}`);
      console.log(`Creation Time: ${config.CreationTime}`);
      console.log(`KMS Key ID: ${config.KmsKeyId || 'Not configured'}`);
      const isCompliant = config.KmsKeyId != null;
      console.log(`Compliance Status: ${isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT'}`);
    }
  } catch (error) {
    console.error('Error listing configurations:', error);
  }
}

// Cleanup resources
async function cleanup() {
  console.log('\nCleaning up resources...');

  for (const resource of createdResources.reverse()) {
    try {
      switch (resource.type) {
        case 'ENDPOINT':
          await sagemakerClient.send(
            new DeleteEndpointCommand({
              EndpointName: resource.name
            })
          );
          console.log(`Initiated deletion of endpoint: ${resource.name}`);
          break;

        case 'ENDPOINT_CONFIG':
          await sagemakerClient.send(
            new DeleteEndpointConfigCommand({
              EndpointConfigName: resource.name
            })
          );
          console.log(`Deleted endpoint configuration: ${resource.name}`);
          break;

        case 'MODEL':
          await sagemakerClient.send(
            new DeleteModelCommand({
              ModelName: resource.name
            })
          );
          console.log(`Deleted model: ${resource.name}`);
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
    console.log('Starting SageMaker endpoint configuration KMS check...');
    
    // Create model
    console.log('\nCreating SageMaker model...');
    const modelName = await createModel();
    
    // Create non-compliant endpoint configuration
    console.log('\nCreating non-compliant endpoint configuration...');
    const configName = await createNonCompliantEndpointConfig(modelName);
    
    // Create endpoint
    console.log('\nCreating endpoint...');
    const endpointName = await createEndpoint(configName);
    
    // Check configuration
    await checkEndpointConfigKMS(configName);
    
    // List all configurations and check their KMS settings
    await listConfigsAndCheckKMS();
    
    // Wait before cleanup
    console.log('\nWaiting before cleanup...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
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
