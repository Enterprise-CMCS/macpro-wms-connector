import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { FullEnvironmentConfig, NAMED_STAGES, validateStage } from '../environment-config';

export interface WmsConnectorStackProps extends cdk.StackProps {
  /** Full environment configuration including secrets from AWS Secrets Manager. */
  fullConfig: FullEnvironmentConfig;
}

/**
 * CDK stack for WMS Kafka Connect on ECS Fargate.
 * Service prefix: wms-connector-{stage}.
 * VPC, IAM path, permissions boundary, and brokerString come from fullConfig (secrets) at synth time;
 * brokerString is passed as CONNECT_BOOTSTRAP_SERVERS. dbInfo is resolved at runtime by the CDC connector
 * config when registering the Debezium Oracle connector via the Connect REST API.
 */
export class WmsConnectorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WmsConnectorStackProps) {
    super(scope, id, props);

    const { fullConfig } = props;
    const { stage, vpc: vpcConfig, iamPath, iamPermissionsBoundary } = fullConfig;
    const isEphemeral = !NAMED_STAGES.includes(stage as 'main' | 'val' | 'production');
    if (isEphemeral) {
      validateStage(stage);
    }

    const availabilityZones = [0, 1, 2].map((i) => `${this.region}${String.fromCharCode(97 + i)}`);
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'Vpc', {
      vpcId: vpcConfig.id,
      availabilityZones,
      privateSubnetIds: vpcConfig.privateSubnets.length > 0 ? vpcConfig.privateSubnets : vpcConfig.dataSubnets,
    });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `wms-connector-${stage}`,
    });

    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', {
      vpc,
      description: `Security group for wms-connector-${stage} Connect tasks`,
      allowAllOutbound: true,
    });

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      path: iamPath,
      permissionsBoundary: iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        'TaskRoleBoundary',
        iamPermissionsBoundary
      ),
    });
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['secretsmanager:GetSecretValue'],
        resources: [
          cdk.Stack.of(this).formatArn({
            service: 'secretsmanager',
            resource: 'secret',
            resourceName: 'mmdl/*',
            arnFormat: cdk.ArnFormat.COLON_RESOURCE_NAME,
          }),
        ],
      })
    );

    const executionRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      path: iamPath,
      permissionsBoundary: iam.ManagedPolicy.fromManagedPolicyArn(
        this,
        'ExecutionRoleBoundary',
        iamPermissionsBoundary
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });

    const connectLogGroup = new logs.LogGroup(this, 'ConnectLogGroup', {
      logGroupName: `/aws/fargate/wms-connector-${stage}-kafka-connect`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const servicePrefix = `wms-connector-${stage}`;
    const topicPrefix = fullConfig.topicNamespace ? `${fullConfig.topicNamespace}.` : '';
    const connectGroupId = `${topicPrefix}mgmt.connect.${servicePrefix}`;

    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: parseInt(fullConfig.taskMemory, 10),
      cpu: parseInt(fullConfig.taskCpu, 10),
      taskRole,
      executionRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const container = taskDef.addContainer('connect', {
      image: ecs.ContainerImage.fromRegistry('debezium/connect:2.5'),
      memoryLimitMiB: fullConfig.connectContainerMemory,
      cpu: fullConfig.connectContainerCpu,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: connectLogGroup,
        streamPrefix: `wms-connector-${stage}`,
      }),
      environment: {
        BOOTSTRAP_SERVERS: fullConfig.brokerString,
        GROUP_ID: connectGroupId,
        CONFIG_STORAGE_TOPIC: `${connectGroupId}.config`,
        OFFSET_STORAGE_TOPIC: `${connectGroupId}.offsets`,
        STATUS_STORAGE_TOPIC: `${connectGroupId}.status`,
        KEY_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        VALUE_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        STAGE: stage,
        TOPIC_NAMESPACE: fullConfig.topicNamespace,
        CONNECT_BOOTSTRAP_SERVERS: fullConfig.brokerString,
        CONNECT_GROUP_ID: connectGroupId,
        CONNECT_CONFIG_STORAGE_TOPIC: `${connectGroupId}.config`,
        CONNECT_OFFSET_STORAGE_TOPIC: `${connectGroupId}.offsets`,
        CONNECT_STATUS_STORAGE_TOPIC: `${connectGroupId}.status`,
        CONNECT_OFFSET_STORAGE_PARTITIONS: '5',
        CONNECT_STATUS_STORAGE_PARTITIONS: '1',
        CONNECT_KEY_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_VALUE_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_INTERNAL_KEY_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_INTERNAL_VALUE_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_SECURITY_PROTOCOL: 'SSL',
        CONNECT_PRODUCER_BOOTSTRAP_SERVERS: fullConfig.brokerString,
        CONNECT_PRODUCER_SECURITY_PROTOCOL: 'SSL',
        CONNECT_CONSUMER_BOOTSTRAP_SERVERS: fullConfig.brokerString,
        CONNECT_CONSUMER_SECURITY_PROTOCOL: 'SSL',
        CONNECT_PRODUCER_OFFSET_FLUSH_TIMEOUT_MS: '30000',
      },
    });
    container.addPortMappings({ containerPort: 8083, protocol: ecs.Protocol.TCP });

    new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      serviceName: `wms-connector-${stage}`,
      securityGroups: [taskSg],
      vpcSubnets: { subnets: vpc.privateSubnets },
      assignPublicIp: false,
      desiredCount: 1,
    });
  }
}
