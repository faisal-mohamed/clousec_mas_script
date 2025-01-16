const {
    DynamoDBClient,
    CreateTableCommand,
    DeleteTableCommand,
    DescribeTableCommand,
    UpdateTableCommand,
    ListTablesCommand
} = require("@aws-sdk/client-dynamodb");

const {
    ApplicationAutoScalingClient,
    RegisterScalableTargetCommand,
    PutScalingPolicyCommand,
    DeleteScalingPolicyCommand,
    DeregisterScalableTargetCommand,
    DescribeScalableTargetsCommand
} = require("@aws-sdk/client-application-auto-scaling");

// Configure credentials
const credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
    region: process.env.AWS_REGION || 'ap-southeast-1'
};

// Initialize clients
const dynamodbClient = new DynamoDBClient(credentials);
const autoScalingClient = new ApplicationAutoScalingClient(credentials);

// Configuration
const config = {
    tableName: `test-autoscaling-${Date.now()}`,
    createdResources: false
};

// Utility function to wait
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function createNonCompliantTable() {
    try {
        console.log('Creating non-compliant DynamoDB table...');

        const createTableCommand = new CreateTableCommand({
            TableName: config.tableName,
            AttributeDefinitions: [
                {
                    AttributeName: "id",
                    AttributeType: "S"
                }
            ],
            KeySchema: [
                {
                    AttributeName: "id",
                    KeyType: "HASH"
                }
            ],
            // Non-compliant: Fixed provisioned capacity without auto scaling
            BillingMode: "PROVISIONED",
            ProvisionedThroughput: {
                ReadCapacityUnits: 5,
                WriteCapacityUnits: 5
            }
        });

        await dynamodbClient.send(createTableCommand);
        config.createdResources = true;
        console.log('Created DynamoDB table without auto scaling');

        // Wait for table to be active
        console.log('Waiting for table to be active...');
        let tableActive = false;
        while (!tableActive) {
            const describeCommand = new DescribeTableCommand({
                TableName: config.tableName
            });
            const response = await dynamodbClient.send(describeCommand);
            if (response.Table.TableStatus === 'ACTIVE') {
                tableActive = true;
            } else {
                await wait(5000);
            }
        }
        console.log('Table is now active');

    } catch (error) {
        console.error('Error creating DynamoDB table:', error);
        throw error;
    }
}

async function enableAutoScaling() {
    try {
        console.log('\nEnabling auto scaling...');

        // Register scalable target for read capacity
        const registerReadTargetCommand = new RegisterScalableTargetCommand({
            ServiceNamespace: "dynamodb",
            ResourceId: `table/${config.tableName}`,
            ScalableDimension: "dynamodb:table:ReadCapacityUnits",
            MinCapacity: 5,
            MaxCapacity: 15,
            RoleARN: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/aws-service-role/dynamodb.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_DynamoDBTable`
        });

        await autoScalingClient.send(registerReadTargetCommand);
        console.log('Registered read capacity scaling target');

        // Register scalable target for write capacity
        const registerWriteTargetCommand = new RegisterScalableTargetCommand({
            ServiceNamespace: "dynamodb",
            ResourceId: `table/${config.tableName}`,
            ScalableDimension: "dynamodb:table:WriteCapacityUnits",
            MinCapacity: 5,
            MaxCapacity: 15,
            RoleARN: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/aws-service-role/dynamodb.application-autoscaling.amazonaws.com/AWSServiceRoleForApplicationAutoScaling_DynamoDBTable`
        });

        await autoScalingClient.send(registerWriteTargetCommand);
        console.log('Registered write capacity scaling target');

        // Create scaling policy for read capacity
        const putReadPolicyCommand = new PutScalingPolicyCommand({
            ServiceNamespace: "dynamodb",
            ResourceId: `table/${config.tableName}`,
            ScalableDimension: "dynamodb:table:ReadCapacityUnits",
            PolicyName: `${config.tableName}-read-policy`,
            PolicyType: "TargetTrackingScaling",
            TargetTrackingScalingPolicyConfiguration: {
                TargetValue: 70.0,
                PredefinedMetricSpecification: {
                    PredefinedMetricType: "DynamoDBReadCapacityUtilization"
                }
            }
        });

        await autoScalingClient.send(putReadPolicyCommand);
        console.log('Created read capacity scaling policy');

        // Create scaling policy for write capacity
        const putWritePolicyCommand = new PutScalingPolicyCommand({
            ServiceNamespace: "dynamodb",
            ResourceId: `table/${config.tableName}`,
            ScalableDimension: "dynamodb:table:WriteCapacityUnits",
            PolicyName: `${config.tableName}-write-policy`,
            PolicyType: "TargetTrackingScaling",
            TargetTrackingScalingPolicyConfiguration: {
                TargetValue: 70.0,
                PredefinedMetricSpecification: {
                    PredefinedMetricType: "DynamoDBWriteCapacityUtilization"
                }
            }
        });

        await autoScalingClient.send(putWritePolicyCommand);
        console.log('Created write capacity scaling policy');

    } catch (error) {
        console.error('Error enabling auto scaling:', error);
    }
}

async function verifyConfiguration() {
    try {
        console.log('\nVerifying DynamoDB table configuration...');

        // Check table configuration
        const describeTableCommand = new DescribeTableCommand({
            TableName: config.tableName
        });
        
        const tableResponse = await dynamodbClient.send(describeTableCommand);
        console.log('\nTable Configuration:');
        console.log(JSON.stringify(tableResponse.Table, null, 2));

        // Check auto scaling configuration
        const describeScalingCommand = new DescribeScalableTargetsCommand({
            ServiceNamespace: "dynamodb",
            ResourceIds: [`table/${config.tableName}`]
        });

        const scalingResponse = await autoScalingClient.send(describeScalingCommand);
        console.log('\nAuto Scaling Configuration:');
        console.log(JSON.stringify(scalingResponse.ScalableTargets, null, 2));

        // Check compliance
        const hasAutoScaling = scalingResponse.ScalableTargets && 
                             scalingResponse.ScalableTargets.length > 0;

        console.log('\nCompliance Check:');
        console.log(`Auto Scaling Enabled: ${hasAutoScaling} (non-compliant if false)`);

    } catch (error) {
        console.error('Error verifying configuration:', error);
    }
}

async function cleanup() {
    try {
        if (config.createdResources) {
            console.log('\nStarting cleanup process...');

            try {
                // Check if auto scaling targets exist first
                const describeScalingCommand = new DescribeScalableTargetsCommand({
                    ServiceNamespace: "dynamodb",
                    ResourceIds: [`table/${config.tableName}`]
                });

                const scalingResponse = await autoScalingClient.send(describeScalingCommand);
                
                if (scalingResponse.ScalableTargets && scalingResponse.ScalableTargets.length > 0) {
                    // Remove auto scaling policies if they exist
                    try {
                        const deleteReadPolicyCommand = new DeleteScalingPolicyCommand({
                            ServiceNamespace: "dynamodb",
                            ResourceId: `table/${config.tableName}`,
                            ScalableDimension: "dynamodb:table:ReadCapacityUnits",
                            PolicyName: `${config.tableName}-read-policy`
                        });

                        await autoScalingClient.send(deleteReadPolicyCommand);
                        console.log('Removed read capacity scaling policy');
                    } catch (error) {
                        if (error.name !== 'ObjectNotFoundException') {
                            throw error;
                        }
                    }

                    try {
                        const deleteWritePolicyCommand = new DeleteScalingPolicyCommand({
                            ServiceNamespace: "dynamodb",
                            ResourceId: `table/${config.tableName}`,
                            ScalableDimension: "dynamodb:table:WriteCapacityUnits",
                            PolicyName: `${config.tableName}-write-policy`
                        });

                        await autoScalingClient.send(deleteWritePolicyCommand);
                        console.log('Removed write capacity scaling policy');
                    } catch (error) {
                        if (error.name !== 'ObjectNotFoundException') {
                            throw error;
                        }
                    }

                    // Deregister scalable targets
                    try {
                        const deregisterReadTarget = new DeregisterScalableTargetCommand({
                            ServiceNamespace: "dynamodb",
                            ResourceId: `table/${config.tableName}`,
                            ScalableDimension: "dynamodb:table:ReadCapacityUnits"
                        });

                        await autoScalingClient.send(deregisterReadTarget);
                        console.log('Deregistered read capacity scaling target');
                    } catch (error) {
                        if (error.name !== 'ObjectNotFoundException') {
                            throw error;
                        }
                    }

                    try {
                        const deregisterWriteTarget = new DeregisterScalableTargetCommand({
                            ServiceNamespace: "dynamodb",
                            ResourceId: `table/${config.tableName}`,
                            ScalableDimension: "dynamodb:table:WriteCapacityUnits"
                        });

                        await autoScalingClient.send(deregisterWriteTarget);
                        console.log('Deregistered write capacity scaling target');
                    } catch (error) {
                        if (error.name !== 'ObjectNotFoundException') {
                            throw error;
                        }
                    }
                }
            } catch (error) {
                if (error.name !== 'ObjectNotFoundException') {
                    console.error('Error cleaning up auto scaling:', error);
                }
            }

            // Delete table
            try {
                const deleteTableCommand = new DeleteTableCommand({
                    TableName: config.tableName
                });
                
                await dynamodbClient.send(deleteTableCommand);
                console.log('Deleted DynamoDB table');
            } catch (error) {
                console.error('Error deleting table:', error);
            }
        }
    } catch (error) {
        console.error('Error during cleanup:', error);
        throw error;
    }
}


async function main() {
    try {
        console.log('Starting DynamoDB auto scaling non-compliance simulation...');
        
        await createNonCompliantTable();
        await verifyConfiguration();

        // Optional: Make compliant by enabling auto scaling
        // Uncomment the next lines to enable auto scaling
        // await enableAutoScaling();
        // await verifyConfiguration();

        console.log('\nWaiting for 5 seconds...');
        await wait(5000);

        await cleanup();
        
        console.log('\nScript execution completed successfully');

    } catch (error) {
        console.error('Error in main execution:', error);
        try {
            await cleanup();
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
    }
}

// Execute the script
main();
