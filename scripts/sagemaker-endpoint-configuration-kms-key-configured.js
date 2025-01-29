const {
  SageMakerClient,
  CreateModelCommand,
  CreateEndpointConfigCommand,
  CreateEndpointCommand,
  DescribeEndpointCommand
} = require("@aws-sdk/client-sagemaker");

const {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand
} = require("@aws-sdk/client-iam");

require('dotenv').config();

// Initialize clients
const sagemakerClient = new SageMakerClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION
});

const iamClient = new IAMClient({
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN
  },
  region: process.env.AWS_REGION
});

async function createSageMakerRole() {
  try {
    const roleName = `sagemaker-role-${Date.now()}`;

    // Create IAM role
    const createRoleResponse = await iamClient.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: {
              Service: 'sagemaker.amazonaws.com'
            },
            Action: 'sts:AssumeRole'
          }]
        }),
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    const roleArn = createRoleResponse.Role.Arn;

    // Attach required policies
    const policies = [
      'arn:aws:iam::aws:policy/AmazonSageMakerFullAccess',
      'arn:aws:iam::aws:policy/AmazonS3FullAccess'
    ];

    for (const policyArn of policies) {
      await iamClient.send(
        new AttachRolePolicyCommand({
          RoleName: roleName,
          PolicyArn: policyArn
        })
      );
    }

    // Wait for role to be available
    await waitForRole(roleName);

    console.log(`Created SageMaker role: ${roleArn}`);
    return roleArn;
  } catch (error) {
    console.error('Error creating SageMaker role:', error);
    throw error;
  }
}

async function waitForRole(roleName) {
  console.log('Waiting for role to be available...');
  await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds for role propagation

  try {
    await iamClient.send(
      new GetRoleCommand({
        RoleName: roleName
      })
    );
  } catch (error) {
    console.error('Error waiting for role:', error);
    throw error;
  }
}

async function createModel(roleArn) {
  try {
    const modelName = `test-model-${Date.now()}`;
    
    const createModelResponse = await sagemakerClient.send(
      new CreateModelCommand({
        ModelName: modelName,
        ExecutionRoleArn: roleArn,
        PrimaryContainer: {
          Image: `763104351884.dkr.ecr.${process.env.AWS_REGION}.amazonaws.com/pytorch-inference:1.12.1-cpu-py38`,
          Mode: 'SingleModel',
          Environment: {
            SAGEMAKER_PROGRAM: 'inference.py',
            SAGEMAKER_SUBMIT_DIRECTORY: '/opt/ml/model/code',
            SAGEMAKER_CONTAINER_LOG_LEVEL: '20',
            SAGEMAKER_REGION: process.env.AWS_REGION
          }
        },
        EnableNetworkIsolation: false,
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    console.log(`Created model: ${modelName}`);
    return modelName;
  } catch (error) {
    console.error('Error creating model:', error);
    throw error;
  }
}

async function createEndpointConfig(modelName) {
  try {
    const configName = `test-config-${Date.now()}`;
    
    const createConfigResponse = await sagemakerClient.send(
      new CreateEndpointConfigCommand({
        EndpointConfigName: configName,
        ProductionVariants: [
          {
            VariantName: 'AllTraffic',
            ModelName: modelName,
            InstanceType: 'ml.t2.medium',
            InitialInstanceCount: 1,
            InitialVariantWeight: 1.0
          }
        ],
        // Explicitly not configuring KMS key
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    console.log(`Created endpoint configuration: ${configName}`);
    return configName;
  } catch (error) {
    console.error('Error creating endpoint configuration:', error);
    throw error;
  }
}

async function createEndpoint(configName) {
  try {
    const endpointName = `test-endpoint-${Date.now()}`;
    
    const createEndpointResponse = await sagemakerClient.send(
      new CreateEndpointCommand({
        EndpointName: endpointName,
        EndpointConfigName: configName,
        Tags: [{
          Key: 'simulation-mas',
          Value: 'true'
        }]
      })
    );

    console.log(`Created endpoint: ${endpointName}`);
    console.log('Waiting for endpoint to be in service...');

    await waitForEndpointInService(endpointName);

    return endpointName;
  } catch (error) {
    console.error('Error creating endpoint:', error);
    throw error;
  }
}

async function waitForEndpointInService(endpointName) {
  while (true) {
    try {
      const response = await sagemakerClient.send(
        new DescribeEndpointCommand({
          EndpointName: endpointName
        })
      );

      const status = response.EndpointStatus;
      console.log(`Current endpoint status: ${status}`);
      
      if (status === 'InService') {
        console.log('Endpoint is now in service!');
        break;
      } else if (status === 'Failed') {
        throw new Error('Endpoint creation failed');
      }

      await new Promise(resolve => setTimeout(resolve, 30000)); // Check every 30 seconds
    } catch (error) {
      console.error('Error checking endpoint status:', error);
      throw error;
    }
  }
}

async function main() {
  try {
    console.log('Creating SageMaker endpoint without KMS key configuration...');

    // Create IAM role
    console.log('\nStep 1: Creating IAM role...');
    const roleArn = await createSageMakerRole();

    // Create model
    console.log('\nStep 2: Creating model...');
    const modelName = await createModel(roleArn);

    // Create endpoint configuration
    console.log('\nStep 3: Creating endpoint configuration...');
    const configName = await createEndpointConfig(modelName);

    // Create endpoint
    console.log('\nStep 4: Creating endpoint...');
    const endpointName = await createEndpoint(configName);

    console.log('\nEndpoint creation completed successfully!');
    console.log('------------------------');
    console.log(`IAM Role ARN: ${roleArn}`);
    console.log(`Model Name: ${modelName}`);
    console.log(`Endpoint Config: ${configName}`);
    console.log(`Endpoint Name: ${endpointName}`);
    console.log('KMS Key: Not configured');
    console.log('------------------------');

  } catch (error) {
    console.error('Error in main execution:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createSageMakerRole,
  createModel,
  createEndpointConfig,
  createEndpoint
};
