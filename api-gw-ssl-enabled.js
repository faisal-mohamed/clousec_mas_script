require('dotenv').config();

const { 
    ApiGatewayV2Client,
    CreateApiCommand,
    CreateStageCommand,
    DeleteApiCommand
} = require("@aws-sdk/client-apigatewayv2");

// Add the createAwsClient function
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

class APIGatewaySSLSimulator {
    constructor() {
        this.resources = {};
        this.apiGatewayClient = createAwsClient(ApiGatewayV2Client);
    }

    async createNonCompliantState() {
        try {
            console.log('Creating non-compliant API Gateway without SSL certificate...');

            // Create HTTP API (non-compliant as it won't have SSL certificate)
            const createApiResponse = await this.apiGatewayClient.send(
                new CreateApiCommand({
                    Name: 'non-compliant-api',
                    ProtocolType: 'HTTP',
                    Description: 'API without SSL certificate for testing'
                })
            );

            this.resources.apiId = createApiResponse.ApiId;

            // Create a stage without SSL certificate
            await this.apiGatewayClient.send(
                new CreateStageCommand({
                    ApiId: this.resources.apiId,
                    StageName: 'test',
                    AutoDeploy: true
                })
            );

            console.log('\nNon-compliant state created:');
            console.log(`API ID: ${this.resources.apiId}`);
            console.log('Stage: test');
            console.log('SSL Certificate: Not configured');

            // Wait for AWS Config to evaluate
            console.log('\nWaiting for 2 minutes to allow AWS Config to evaluate...');
            await new Promise(resolve => setTimeout(resolve, 120000));

        } catch (error) {
            console.error('Error creating non-compliant API Gateway:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        try {
            if (this.resources.apiId) {
                console.log('\nCleaning up resources...');
                await this.apiGatewayClient.send(
                    new DeleteApiCommand({
                        ApiId: this.resources.apiId
                    })
                );
                console.log('API Gateway deleted');
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

async function main() {
    const simulator = new APIGatewaySSLSimulator();
    await simulator.createNonCompliantState();
}

// Run the script
if (require.main === module) {
    main().catch(console.error);
}

module.exports = {
    createNonCompliantState: main
};
