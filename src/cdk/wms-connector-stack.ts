import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { getEnvironmentConfig, NAMED_STAGES, validateStage } from '../environment-config';

export interface WmsConnectorStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * CDK stack for WMS Kafka Connect on ECS Fargate.
 * Service prefix: wms-connector-{stage}.
 * brokerString and dbInfo are resolved at runtime by the container using STAGE and
 * getSecretWithFallback(mmdl/{stage}/..., mmdl/default/...); task role can read mmdl/*.
 */
export class WmsConnectorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WmsConnectorStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isEphemeral = !NAMED_STAGES.includes(stage as 'main' | 'val' | 'production');
    if (isEphemeral) {
      validateStage(stage);
    }
    const envConfig = getEnvironmentConfig(stage);

    const vpcId = this.node.tryGetContext('vpcId') as string | undefined;
    const vpc = vpcId
      ? ec2.Vpc.fromLookup(this, 'Vpc', { vpcId })
      : new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    const cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `wms-connector-${stage}`,
    });

    const taskSg = new ec2.SecurityGroup(this, 'TaskSg', {
      vpc,
      description: `Security group for wms-connector-${stage} Connect tasks`,
      allowAllOutbound: false,
    });
    taskSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(1521), 'Oracle');
    taskSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9092), 'Kafka plain');
    taskSg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(9094), 'Kafka TLS');

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
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

    const taskDef = new ecs.FargateTaskDefinition(this, 'TaskDef', {
      memoryLimitMiB: parseInt(envConfig.taskMemory, 10),
      cpu: parseInt(envConfig.taskCpu, 10),
      taskRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const container = taskDef.addContainer('connect', {
      image: ecs.ContainerImage.fromRegistry('debezium/connect:2.5'),
      memoryLimitMiB: envConfig.connectContainerMemory,
      cpu: envConfig.connectContainerCpu,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: `wms-connector-${stage}`,
      }),
      environment: {
        STAGE: stage,
        TOPIC_NAMESPACE: envConfig.topicNamespace,
      },
    });
    container.addPortMappings({ containerPort: 8083, protocol: ecs.Protocol.TCP });

    new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      serviceName: `wms-connector-${stage}`,
      securityGroups: [taskSg],
      assignPublicIp: false,
      desiredCount: 1,
    });
  }
}
