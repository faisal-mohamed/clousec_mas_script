const { 
    EC2Client, 
    DescribeFlowLogsCommand, 
    DeleteFlowLogsCommand 
} = require('@aws-sdk/client-ec2');
require('dotenv').config();

// Initialize EC2 client
const ec2Client = new EC2Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    }
});

// Function to get flow logs for a VPC
async function getVpcFlowLogs(vpcId) {
    try {
        const response = await ec2Client.send(new DescribeFlowLogsCommand({
            Filter: [{
                Name: 'resource-id',
                Values: [vpcId]
            }]
        }));

        return response.FlowLogs;
    } catch (error) {
        console.error('Error getting flow logs:', error);
        throw error;
    }
}

// Function to delete flow logs
async function deleteFlowLogs(flowLogIds) {
    try {
        const response = await ec2Client.send(new DeleteFlowLogsCommand({
            FlowLogIds: flowLogIds
        }));

        return response;
    } catch (error) {
        console.error('Error deleting flow logs:', error);
        throw error;
    }
}

// Function to display flow log details
function displayFlowLogDetails(flowLogs) {
    console.log('\nFlow Log Details:');
    flowLogs.forEach((flowLog, index) => {
        console.log(`${index + 1}. Flow Log ID: ${flowLog.FlowLogId}`);
        console.log(`   Status: ${flowLog.FlowLogStatus}`);
        console.log(`   Log Group Name: ${flowLog.LogGroupName || 'N/A'}`);
        console.log(`   S3 Bucket Name: ${flowLog.LogDestination || 'N/A'}`);
        console.log('---');
    });
}

// Main function to disable flow logs
async function disableVpcFlowLogs(vpcId) {
    try {
        console.log(`Getting flow logs for VPC: ${vpcId}`);
        
        // Get existing flow logs
        const flowLogs = await getVpcFlowLogs(vpcId);

        if (flowLogs.length === 0) {
            console.log('No flow logs found for this VPC.');
            return;
        }

        // Display current flow logs
        console.log('Found existing flow logs:');
        displayFlowLogDetails(flowLogs);

        // Get flow log IDs
        const flowLogIds = flowLogs.map(flowLog => flowLog.FlowLogId);

        // Delete flow logs
        console.log('\nDeleting flow logs...');
        await deleteFlowLogs(flowLogIds);

        console.log('Successfully deleted the following flow logs:', flowLogIds.join(', '));

        // Verify deletion
        const remainingFlowLogs = await getVpcFlowLogs(vpcId);
        if (remainingFlowLogs.length === 0) {
            console.log('Verified: All flow logs have been deleted.');
        } else {
            console.warn('Warning: Some flow logs might still exist. Please check manually.');
        }

    } catch (error) {
        console.error('Error in disabling VPC flow logs:', error);
        throw error;
    }
}

// Validate environment variables
function validateEnvironmentVariables() {
    const requiredEnvVars = [
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'AWS_SESSION_TOKEN',
        'AWS_REGION',
        'VPC_ID'
    ];

    const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
    if (missingEnvVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
    }
}

// Main execution
async function main() {
    try {
        validateEnvironmentVariables();
        
        const vpcId = process.env.VPC_ID;
        console.log(`Starting flow logs deletion process for VPC: ${vpcId}`);
        
        await disableVpcFlowLogs(vpcId);
        
        console.log('Process completed successfully.');
    } catch (error) {
        console.error('Script execution failed:', error);
        process.exit(1);
    }
}

// Export functions for external use
module.exports = {
    getVpcFlowLogs,
    deleteFlowLogs,
    disableVpcFlowLogs
};

// Run the script if called directly
if (require.main === module) {
    main().catch(console.error);
}
