const { ResourceGroupsTaggingAPIClient, GetResourcesCommand } = require("@aws-sdk/client-resource-groups-tagging-api");
const { ACMClient, DeleteCertificateCommand } = require("@aws-sdk/client-acm");
const { ElasticLoadBalancingV2Client, DeleteLoadBalancerCommand, DeleteTargetGroupCommand } = require("@aws-sdk/client-elastic-load-balancing-v2");
const { ApiGatewayV2Client, DeleteApiCommand } = require("@aws-sdk/client-apigatewayv2");
const { AutoScalingClient, DeleteAutoScalingGroupCommand } = require("@aws-sdk/client-auto-scaling");
const { ElasticBeanstalkClient, TerminateEnvironmentCommand } = require("@aws-sdk/client-elastic-beanstalk");
const { CloudTrailClient, DeleteTrailCommand } = require("@aws-sdk/client-cloudtrail");
const { CodeBuildClient, DeleteProjectCommand } = require("@aws-sdk/client-codebuild");
const { DatabaseMigrationServiceClient, DeleteReplicationInstanceCommand } = require("@aws-sdk/client-database-migration-service");
const { DynamoDBClient, DeleteTableCommand } = require("@aws-sdk/client-dynamodb");
const { EC2Client, TerminateInstancesCommand, DeleteVolumeCommand, DeleteSecurityGroupCommand } = require("@aws-sdk/client-ec2");
const { ECSClient, DeleteClusterCommand } = require("@aws-sdk/client-ecs");
const { EFSClient, DeleteFileSystemCommand } = require("@aws-sdk/client-efs");
const { EMRClient, TerminateJobFlowsCommand } = require("@aws-sdk/client-emr");
const { IAMClient, DeleteRoleCommand } = require("@aws-sdk/client-iam");
const { KMSClient, ScheduleKeyDeletionCommand } = require("@aws-sdk/client-kms");
const { LambdaClient, DeleteFunctionCommand } = require("@aws-sdk/client-lambda");
const { OpenSearchClient, DeleteDomainCommand } = require("@aws-sdk/client-opensearch");
const { RDSClient, DeleteDBInstanceCommand } = require("@aws-sdk/client-rds");
const { RedshiftClient, DeleteClusterCommand: DeleteRedshiftClusterCommand } = require("@aws-sdk/client-redshift");
const { S3Client, DeleteBucketCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { SageMakerClient, DeleteEndpointCommand } = require("@aws-sdk/client-sagemaker");
const { SecretsManagerClient, DeleteSecretCommand } = require("@aws-sdk/client-secrets-manager");
const { SNSClient, DeleteTopicCommand } = require("@aws-sdk/client-sns");
const { SSMClient, DeleteParameterCommand } = require("@aws-sdk/client-ssm");
const { WAFV2Client, DeleteWebACLCommand } = require("@aws-sdk/client-wafv2");

require('dotenv').config();

// AWS Configuration
const config = {
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN
    },
    region: process.env.AWS_REGION
};

// Initialize clients
const clients = {
    taggingAPI: new ResourceGroupsTaggingAPIClient(config),
    acm: new ACMClient(config),
    elbv2: new ElasticLoadBalancingV2Client(config),
    apigateway: new ApiGatewayV2Client(config),
    autoscaling: new AutoScalingClient(config),
    elasticbeanstalk: new ElasticBeanstalkClient(config),
    cloudtrail: new CloudTrailClient(config),
    codebuild: new CodeBuildClient(config),
    dms: new DatabaseMigrationServiceClient(config),
    dynamodb: new DynamoDBClient(config),
    ec2: new EC2Client(config),
    ecs: new ECSClient(config),
    efs: new EFSClient(config),
    emr: new EMRClient(config),
    iam: new IAMClient(config),
    kms: new KMSClient(config),
    lambda: new LambdaClient(config),
    opensearch: new OpenSearchClient(config),
    rds: new RDSClient(config),
    redshift: new RedshiftClient(config),
    s3: new S3Client(config),
    sagemaker: new SageMakerClient(config),
    secretsmanager: new SecretsManagerClient(config),
    sns: new SNSClient(config),
    ssm: new SSMClient(config),
    wafv2: new WAFV2Client(config)
};

// Utility function for delays
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function deleteEC2SecurityGroup(groupId) {
    try {
        await clients.ec2.send(new DeleteSecurityGroupCommand({
            GroupId: groupId
        }));
        console.log(`Deleted EC2 Security Group: ${groupId}`);
    } catch (error) {
        console.error(`Error deleting EC2 Security Group: ${error}`);
        throw error;
    }
}

async function deleteACMCertificate(certificateArn) {
    try {
        await clients.acm.send(new DeleteCertificateCommand({
            CertificateArn: certificateArn
        }));
        console.log(`Deleted ACM certificate: ${certificateArn}`);
    } catch (error) {
        console.error(`Error deleting ACM certificate: ${error}`);
        throw error;
    }
}

async function deleteLoadBalancer(lbArn) {
    try {
        await clients.elbv2.send(new DeleteLoadBalancerCommand({
            LoadBalancerArn: lbArn
        }));
        console.log(`Deleted load balancer: ${lbArn}`);
    } catch (error) {
        console.error(`Error deleting load balancer: ${error}`);
        throw error;
    }
}

async function deleteAPIGateway(apiId) {
    try {
        await clients.apigateway.send(new DeleteApiCommand({
            ApiId: apiId
        }));
        console.log(`Deleted API Gateway: ${apiId}`);
    } catch (error) {
        console.error(`Error deleting API Gateway: ${error}`);
        throw error;
    }
}

async function deleteAutoScalingGroup(asgName) {
    try {
        await clients.autoscaling.send(new DeleteAutoScalingGroupCommand({
            AutoScalingGroupName: asgName,
            ForceDelete: true
        }));
        console.log(`Deleted Auto Scaling Group: ${asgName}`);
    } catch (error) {
        console.error(`Error deleting Auto Scaling Group: ${error}`);
        throw error;
    }
}

async function deleteElasticBeanstalk(environmentId) {
    try {
        await clients.elasticbeanstalk.send(new TerminateEnvironmentCommand({
            EnvironmentId: environmentId,
            ForceTerminate: true
        }));
        console.log(`Terminated Elastic Beanstalk environment: ${environmentId}`);
    } catch (error) {
        console.error(`Error terminating Elastic Beanstalk environment: ${error}`);
        throw error;
    }
}

async function deleteCloudTrail(trailName) {
    try {
        await clients.cloudtrail.send(new DeleteTrailCommand({
            Name: trailName
        }));
        console.log(`Deleted CloudTrail: ${trailName}`);
    } catch (error) {
        console.error(`Error deleting CloudTrail: ${error}`);
        throw error;
    }
}

async function deleteCodeBuild(projectName) {
    try {
        await clients.codebuild.send(new DeleteProjectCommand({
            name: projectName
        }));
        console.log(`Deleted CodeBuild project: ${projectName}`);
    } catch (error) {
        console.error(`Error deleting CodeBuild project: ${error}`);
        throw error;
    }
}

async function deleteDMSReplicationInstance(replicationInstanceArn) {
    try {
        await clients.dms.send(new DeleteReplicationInstanceCommand({
            ReplicationInstanceArn: replicationInstanceArn
        }));
        console.log(`Deleted DMS replication instance: ${replicationInstanceArn}`);
    } catch (error) {
        console.error(`Error deleting DMS replication instance: ${error}`);
        throw error;
    }
}

async function deleteDynamoDBTable(tableName) {
    try {
        await clients.dynamodb.send(new DeleteTableCommand({
            TableName: tableName
        }));
        console.log(`Deleted DynamoDB table: ${tableName}`);
    } catch (error) {
        console.error(`Error deleting DynamoDB table: ${error}`);
        throw error;
    }
}

async function deleteEBSVolume(volumeId) {
    try {
        await clients.ec2.send(new DeleteVolumeCommand({
            VolumeId: volumeId
        }));
        console.log(`Deleted EBS volume: ${volumeId}`);
    } catch (error) {
        console.error(`Error deleting EBS volume: ${error}`);
        throw error;
    }
}

async function deleteEC2Instance(instanceId) {
    try {
        await clients.ec2.send(new TerminateInstancesCommand({
            InstanceIds: [instanceId]
        }));
        console.log(`Terminated EC2 instance: ${instanceId}`);
    } catch (error) {
        console.error(`Error terminating EC2 instance: ${error}`);
        throw error;
    }
}

async function deleteECSCluster(clusterArn) {
    try {
        await clients.ecs.send(new DeleteClusterCommand({
            cluster: clusterArn
        }));
        console.log(`Deleted ECS cluster: ${clusterArn}`);
    } catch (error) {
        console.error(`Error deleting ECS cluster: ${error}`);
        throw error;
    }
}

async function deleteEFS(fileSystemId) {
    try {
        await clients.efs.send(new DeleteFileSystemCommand({
            FileSystemId: fileSystemId
        }));
        console.log(`Deleted EFS filesystem: ${fileSystemId}`);
    } catch (error) {
        console.error(`Error deleting EFS filesystem: ${error}`);
        throw error;
    }
}

async function deleteEMRCluster(clusterId) {
    try {
        await clients.emr.send(new TerminateJobFlowsCommand({
            JobFlowIds: [clusterId]
        }));
        console.log(`Terminated EMR cluster: ${clusterId}`);
    } catch (error) {
        console.error(`Error terminating EMR cluster: ${error}`);
        throw error;
    }
}

async function deleteIAMRole(roleName) {
    try {
        await clients.iam.send(new DeleteRoleCommand({
            RoleName: roleName
        }));
        console.log(`Deleted IAM role: ${roleName}`);
    } catch (error) {
        console.error(`Error deleting IAM role: ${error}`);
        throw error;
    }
}

async function deleteKMSKey(keyId) {
    try {
        await clients.kms.send(new ScheduleKeyDeletionCommand({
            KeyId: keyId,
            PendingWindowInDays: 7
        }));
        console.log(`Scheduled KMS key deletion: ${keyId}`);
    } catch (error) {
        console.error(`Error scheduling KMS key deletion: ${error}`);
        throw error;
    }
}

async function deleteLambdaFunction(functionName) {
    try {
        await clients.lambda.send(new DeleteFunctionCommand({
            FunctionName: functionName
        }));
        console.log(`Deleted Lambda function: ${functionName}`);
    } catch (error) {
        console.error(`Error deleting Lambda function: ${error}`);
        throw error;
    }
}

async function deleteOpenSearchDomain(domainName) {
    try {
        await clients.opensearch.send(new DeleteDomainCommand({
            DomainName: domainName
        }));
        console.log(`Deleted OpenSearch domain: ${domainName}`);
    } catch (error) {
        console.error(`Error deleting OpenSearch domain: ${error}`);
        throw error;
    }
}

async function deleteRedshiftCluster(clusterIdentifier) {
    try {
        await clients.redshift.send(new DeleteRedshiftClusterCommand({
            ClusterIdentifier: clusterIdentifier,
            SkipFinalClusterSnapshot: true
        }));
        console.log(`Deleted Redshift cluster: ${clusterIdentifier}`);
    } catch (error) {
        console.error(`Error deleting Redshift cluster: ${error}`);
        throw error;
    }
}

async function deleteS3Bucket(bucketName) {
    try {
        // Empty the bucket first
        let isTruncated = true;
        while (isTruncated) {
            const listResponse = await clients.s3.send(
                new ListObjectsV2Command({ Bucket: bucketName })
            );

            if (listResponse.Contents?.length > 0) {
                await clients.s3.send(new DeleteObjectsCommand({
                    Bucket: bucketName,
                    Delete: {
                        Objects: listResponse.Contents.map(({ Key }) => ({ Key }))
                    }
                }));
            }

            isTruncated = listResponse.IsTruncated;
        }

        // Delete the empty bucket
        await clients.s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
        console.log(`Deleted S3 bucket: ${bucketName}`);
    } catch (error) {
        console.error(`Error deleting S3 bucket: ${error}`);
        throw error;
    }
}

async function deleteSageMakerEndpoint(endpointName) {
    try {
        await clients.sagemaker.send(new DeleteEndpointCommand({
            EndpointName: endpointName
        }));
        console.log(`Deleted SageMaker endpoint: ${endpointName}`);
    } catch (error) {
        console.error(`Error deleting SageMaker endpoint: ${error}`);
        throw error;
    }
}

async function deleteSecret(secretId) {
    try {
        await clients.secretsmanager.send(new DeleteSecretCommand({
            SecretId: secretId,
            ForceDeleteWithoutRecovery: true
        }));
        console.log(`Deleted secret: ${secretId}`);
    } catch (error) {
        console.error(`Error deleting secret: ${error}`);
        throw error;
    }
}

async function deleteSNSTopic(topicArn) {
    try {
        await clients.sns.send(new DeleteTopicCommand({
            TopicArn: topicArn
        }));
        console.log(`Deleted SNS topic: ${topicArn}`);
    } catch (error) {
        console.error(`Error deleting SNS topic: ${error}`);
        throw error;
    }
}

async function deleteSSMParameter(parameterName) {
    try {
        await clients.ssm.send(new DeleteParameterCommand({
            Name: parameterName
        }));
        console.log(`Deleted SSM parameter: ${parameterName}`);
    } catch (error) {
        console.error(`Error deleting SSM parameter: ${error}`);
        throw error;
    }
}

async function deleteWAFv2WebACL(webAclId, scope) {
    try {
        await clients.wafv2.send(new DeleteWebACLCommand({
            Id: webAclId,
            Name: webAclId,
            Scope: scope || 'REGIONAL'
        }));
        console.log(`Deleted WAFv2 Web ACL: ${webAclId}`);
    } catch (error) {
        console.error(`Error deleting WAFv2 Web ACL: ${error}`);
        throw error;
    }
}

async function deleteRDSInstance(dbInstanceIdentifier) {
    try {
        // Extract just the instance identifier from the full ARN path if needed
        const instanceId = dbInstanceIdentifier.split(':').pop().split('/').pop();
        await clients.rds.send(new DeleteDBInstanceCommand({
            DBInstanceIdentifier: instanceId,
            SkipFinalSnapshot: true,
            DeleteAutomatedBackups: true
        }));
        console.log(`Deleted RDS instance: ${instanceId}`);
    } catch (error) {
        console.error(`Error deleting RDS instance: ${error}`);
        throw error;
    }
}

async function deleteResource(arn) {
    const [, , service, , ...rest] = arn.split(':');
    const resourceId = rest.join(':').split('/').pop();

    try {
        switch (service) {
            case 'ec2':
                if (arn.includes('security-group')) {
                    await deleteEC2SecurityGroup(resourceId);
                } else if (arn.includes('volume')) {
                    await deleteEBSVolume(resourceId);
                } else {
                    await deleteEC2Instance(resourceId);
                }
                break;
            case 'rds':
                if (arn.includes(':snapshot:')) {
                    console.log(`Skipping RDS snapshot deletion: ${arn}`);
                } else {
                    await deleteRDSInstance(arn);
                }
                break;
            case 'acm':
                await deleteACMCertificate(arn);
                break;
            case 'elasticloadbalancing':
                await deleteLoadBalancer(arn);
                break;
            case 'apigateway':
                await deleteAPIGateway(resourceId);
                break;
            case 'autoscaling':
                await deleteAutoScalingGroup(resourceId);
                break;
            case 'elasticbeanstalk':
                await deleteElasticBeanstalk(resourceId);
                break;
            case 'cloudtrail':
                await deleteCloudTrail(resourceId);
                break;
            case 'codebuild':
                await deleteCodeBuild(resourceId);
                break;
            case 'dms':
                await deleteDMSReplicationInstance(arn);
                break;
            case 'dynamodb':
                await deleteDynamoDBTable(resourceId);
                break;
            case 'ecs':
                await deleteECSCluster(resourceId);
                break;
            case 'elasticfilesystem':
                await deleteEFS(resourceId);
                break;
            case 'elasticmapreduce':
                await deleteEMRCluster(resourceId);
                break;
            case 'iam':
                await deleteIAMRole(resourceId);
                break;
            case 'kms':
                await deleteKMSKey(resourceId);
                break;
            case 'lambda':
                await deleteLambdaFunction(resourceId);
                break;
            case 'opensearch':
                await deleteOpenSearchDomain(resourceId);
                break;
            case 'redshift':
                await deleteRedshiftCluster(resourceId);
                break;
            case 's3':
                await deleteS3Bucket(resourceId);
                break;
            case 'sagemaker':
                await deleteSageMakerEndpoint(resourceId);
                break;
            case 'secretsmanager':
                await deleteSecret(resourceId);
                break;
            case 'sns':
                await deleteSNSTopic(arn);
                break;
            case 'ssm':
                await deleteSSMParameter(resourceId);
                break;
            case 'wafv2':
                await deleteWAFv2WebACL(resourceId);
                break;
            default:
                console.log(`Unsupported resource type: ${service}`);
        }
    } catch (error) {
        console.error(`Failed to delete resource ${arn}:`, error);
    }
}

async function getAllTaggedResources(tagKey) {
    try {
        const response = await clients.taggingAPI.send(new GetResourcesCommand({
            TagFilters: [{ Key: tagKey }]
        }));
        return response.ResourceTagMappingList || [];
    } catch (error) {
        console.error('Error fetching tagged resources:', error);
        throw error;
    }
}

async function deleteTaggedResources(tagKey) {
    try {
        console.log(`Fetching resources with tag key: ${tagKey}`);
        const resources = await getAllTaggedResources(tagKey);

        if (resources.length === 0) {
            console.log('No resources found with specified tag');
            return;
        }

        console.log(`Found ${resources.length} resources to delete`);

        for (const resource of resources) {
            console.log(`Processing resource: ${resource.ResourceARN}`);
            await deleteResource(resource.ResourceARN);
            await delay(1000); // Delay between deletions
        }

        console.log('Resource deletion process completed');
    } catch (error) {
        console.error('Error in deletion process:', error);
    }
}

// Main execution
async function main() {
    const tagKey = 'simulation-mas';

    try {
        await deleteTaggedResources(tagKey);
    } catch (error) {
        console.error('Error in main execution:', error);
        process.exit(1);
    }
}

// Run the script
if (require.main === module) {
    main();
}