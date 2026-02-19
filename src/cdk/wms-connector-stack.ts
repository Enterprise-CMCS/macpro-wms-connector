import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cloudwatchActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as events from 'aws-cdk-lib/aws-events';
import * as eventsTargets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { FullEnvironmentConfig, NAMED_STAGES, validateStage } from '../environment-config';

export interface WmsConnectorStackProps extends cdk.StackProps {
  /** Full environment configuration including secrets from AWS Secrets Manager. */
  fullConfig: FullEnvironmentConfig;
  /** SNS topic ARN used for connector alerts and alarms. */
  alertsTopicArn: string;
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
      // Prefer data subnets for DB connectivity (on-prem/TGW paths are often scoped to those ranges).
      privateSubnetIds: vpcConfig.dataSubnets.length > 0 ? vpcConfig.dataSubnets : vpcConfig.privateSubnets,
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
    taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
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
    const alertsTopic = sns.Topic.fromTopicArn(this, 'AlertsTopic', props.alertsTopicArn);
    const alarmAction = new cloudwatchActions.SnsAction(alertsTopic);

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
      image: ecs.ContainerImage.fromRegistry('confluentinc/cp-kafka-connect:6.0.9'),
      user: '0',
      memoryLimitMiB: fullConfig.connectContainerMemory,
      cpu: fullConfig.connectContainerCpu,
      logging: ecs.LogDrivers.awsLogs({
        logGroup: connectLogGroup,
        streamPrefix: `wms-connector-${stage}`,
      }),
      command: [
        'bash',
        '-c',
        [
          'set -euo pipefail',
          // Discover the task ENI IP and ensure Connect advertises it in distributed mode.
          'ENI_IP=$(curl -s "$ECS_CONTAINER_METADATA_URI_V4" | sed -e \'s/.*IPv4Addresses":\\["\\(.*\\)"\\],"AttachmentIndex.*/\\1/\')',
          'echo "$ENI_IP localhost" > /etc/hosts',
          'export CONNECT_REST_HOST_NAME="$ENI_IP"',
          'export CONNECT_REST_ADVERTISED_HOST_NAME="$ENI_IP"',
          // Install JDBC connector + Oracle driver before starting Connect.
          'TMP=/tmp/confluent-hub-client',
          'mkdir -p "$TMP"',
          'curl -sSL -o /tmp/confluent-hub-client-latest.tar.gz http://client.hub.confluent.io/confluent-hub-client-latest.tar.gz',
          'tar -xzf /tmp/confluent-hub-client-latest.tar.gz -C "$TMP"',
          '"$TMP/bin/confluent-hub" install confluentinc/kafka-connect-jdbc:10.5.1 --no-prompt',
          'curl -sSL -o /usr/share/confluent-hub-components/confluentinc-kafka-connect-jdbc/lib/ojdbc10.jar https://download.oracle.com/otn-pub/otn_software/jdbc/1916/ojdbc10.jar',
          'exec /etc/confluent/docker/run',
        ].join('; '),
      ],
      environment: {
        CONNECT_INTERNAL_VALUE_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_GROUP_ID: connectGroupId,
        CONNECT_OFFSET_STORAGE_TOPIC: `${connectGroupId}.offsets`,
        CONNECT_CONSUMER_BOOTSTRAP_SERVERS: fullConfig.brokerString,
        CONNECT_PRODUCER_OFFSET_FLUSH_TIMEOUT_MS: '30000',
        CONNECT_CONFIG_STORAGE_TOPIC: `${connectGroupId}.config`,
        CONNECT_INTERNAL_KEY_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_PRODUCER_BOOTSTRAP_SERVERS: fullConfig.brokerString,
        CONNECT_STATUS_STORAGE_TOPIC: `${connectGroupId}.status`,
        CONNECT_PRODUCER_SECURITY_PROTOCOL: 'SSL',
        CONNECT_VALUE_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_KEY_CONVERTER: 'org.apache.kafka.connect.json.JsonConverter',
        CONNECT_STATUS_STORAGE_PARTITIONS: '1',
        CONNECT_CONSUMER_SECURITY_PROTOCOL: 'SSL',
        CONNECT_BOOTSTRAP_SERVERS: fullConfig.brokerString,
        CONNECT_OFFSET_STORAGE_PARTITIONS: '5',
        CONNECT_SECURITY_PROTOCOL: 'SSL',
        STAGE: stage,
        TOPIC_NAMESPACE: fullConfig.topicNamespace,
      },
    });
    container.addPortMappings({ containerPort: 8083, protocol: ecs.Protocol.TCP });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: taskDef,
      serviceName: `wms-connector-${stage}`,
      securityGroups: [taskSg],
      vpcSubnets: { subnets: vpc.privateSubnets },
      assignPublicIp: false,
      desiredCount: 1,
      enableExecuteCommand: true,
    });

    const restartBudgetTable = new dynamodb.Table(this, 'RestartBudgetTable', {
      tableName: `wms-connector-${stage}-restart-budget`,
      partitionKey: {
        name: 'connectorId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecovery: true,
      removalPolicy: isEphemeral ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    const connectAlbSg = new ec2.SecurityGroup(this, 'ConnectAlbSg', {
      vpc,
      description: `Security group for wms-connector-${stage} Connect ALB`,
      allowAllOutbound: true,
    });

    const connectAlb = new elbv2.ApplicationLoadBalancer(this, 'ConnectAlb', {
      vpc,
      internetFacing: false,
      securityGroup: connectAlbSg,
      vpcSubnets: { subnets: vpc.privateSubnets },
    });

    const connectListener = connectAlb.addListener('ConnectListener', {
      port: 8083,
      protocol: elbv2.ApplicationProtocol.HTTP,
      open: false,
    });

    connectListener.addTargets('ConnectTargets', {
      port: 8083,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      healthCheck: {
        path: '/',
        healthyHttpCodes: '200-399',
      },
    });

    taskSg.connections.allowFrom(connectAlbSg, ec2.Port.tcp(8083), 'Allow ALB to reach Connect');

    const connectorLambdaSg = new ec2.SecurityGroup(this, 'ConnectorLambdaSg', {
      vpc,
      description: `Security group for wms-connector-${stage} Connect registrar`,
      allowAllOutbound: true,
    });
    connectAlbSg.connections.allowFrom(
      connectorLambdaSg,
      ec2.Port.tcp(8083),
      'Allow Lambda to call Connect ALB'
    );

    const healthLambdaSg = new ec2.SecurityGroup(this, 'HealthLambdaSg', {
      vpc,
      description: `Security group for wms-connector-${stage} health checks`,
      allowAllOutbound: true,
    });
    connectAlbSg.connections.allowFrom(
      healthLambdaSg,
      ec2.Port.tcp(8083),
      'Allow health Lambda to call Connect ALB'
    );

    const connectorHandler = new lambdaNodejs.NodejsFunction(this, 'ConnectRegistrar', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: 'lambda/connect-register.ts',
      handler: 'handler',
      bundling: {
        externalModules: ['aws-sdk'],
      },
      timeout: cdk.Duration.minutes(2),
      vpc,
      vpcSubnets: { subnets: vpc.privateSubnets },
      securityGroups: [connectorLambdaSg],
      environment: {
        CONNECT_URL: `http://${connectAlb.loadBalancerDnsName}:8083`,
        STAGE: stage,
        TOPIC_NAMESPACE: fullConfig.topicNamespace || '',
        CONNECTOR_NAME: 'wms-oracle-cdc',
        CONNECTOR_TYPE: 'jdbc',
      },
    });
    connectorHandler.addToRolePolicy(
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

    const healthHandler = new lambdaNodejs.NodejsFunction(this, 'ConnectHealth', {
      runtime: lambda.Runtime.NODEJS_24_X,
      entry: 'lambda/connect-health.ts',
      handler: 'handler',
      bundling: {
        externalModules: ['aws-sdk'],
      },
      timeout: cdk.Duration.minutes(2),
      vpc,
      vpcSubnets: { subnets: vpc.privateSubnets },
      securityGroups: [healthLambdaSg],
      environment: {
        CONNECT_URL: `http://${connectAlb.loadBalancerDnsName}:8083`,
        CONNECTOR_NAME: 'wms-oracle-cdc',
        STAGE: stage,
        CLUSTER_NAME: cluster.clusterName,
        SERVICE_NAME: service.serviceName,
        RESTART_TABLE_NAME: restartBudgetTable.tableName,
        METRIC_NAMESPACE: `${servicePrefix}/Health`,
      },
    });
    healthHandler.addToRolePolicy(
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
    healthHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecs:DescribeServices'],
        resources: ['*'],
      })
    );
    healthHandler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      })
    );
    restartBudgetTable.grantReadWriteData(healthHandler);

    const healthSchedule = new events.Rule(this, 'ConnectHealthScheduleRule', {
      description: `Run health checks every 10 minutes for wms-connector-${stage}.`,
      schedule: events.Schedule.rate(cdk.Duration.minutes(10)),
    });
    healthSchedule.addTarget(new eventsTargets.LambdaFunction(healthHandler));

    const provider = new cr.Provider(this, 'ConnectRegistrarProvider', {
      onEventHandler: connectorHandler,
    });

    const connectorResource = new cdk.CustomResource(this, 'WmsOracleConnector', {
      serviceToken: provider.serviceToken,
      properties: {
        ConnectorName: 'wms-oracle-cdc',
        Stage: stage,
        TopicNamespace: fullConfig.topicNamespace || '',
      },
    });
    connectorResource.node.addDependency(service);
    connectorResource.node.addDependency(connectListener);
    healthHandler.node.addDependency(service);
    healthHandler.node.addDependency(connectListener);

    const healthMetricNamespace = `${servicePrefix}/Health`;
    const healthMetricAlarmNames = [
      'HealthCheckFailed',
      'ConnectorStateFailed',
      'ConnectorTaskFailed',
      'DbTcpUnreachable',
      'AutoRestartBudgetExceeded',
    ];

    for (const metricName of healthMetricAlarmNames) {
      const alarm = new cloudwatch.Alarm(this, `${metricName}Alarm`, {
        alarmName: `${servicePrefix}-${metricName}`,
        alarmDescription: `${metricName} alarm for ${servicePrefix}.`,
        metric: new cloudwatch.Metric({
          namespace: healthMetricNamespace,
          metricName,
          statistic: 'Sum',
          period: cdk.Duration.minutes(10),
        }),
        threshold: 1,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(alarmAction);
    }

    const healthLambdaErrorAlarm = new cloudwatch.Alarm(this, 'ConnectHealthLambdaErrorAlarm', {
      alarmName: `${servicePrefix}-ConnectHealthLambdaErrors`,
      alarmDescription: `Lambda errors for ${servicePrefix} connect health checks.`,
      metric: healthHandler.metricErrors({
        statistic: 'Sum',
        period: cdk.Duration.minutes(10),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    healthLambdaErrorAlarm.addAlarmAction(alarmAction);

    const connectorLogMetricNamespace = `${servicePrefix}/ConnectorLogs`;
    new logs.CfnMetricFilter(this, 'OracleErrorMetricFilter', {
      logGroupName: connectLogGroup.logGroupName,
      filterPattern: '?"ORA"',
      metricTransformations: [
        {
          metricNamespace: connectorLogMetricNamespace,
          metricName: 'OracleErrorCount',
          metricValue: '1',
          defaultValue: 0,
        },
      ],
    });
    const unknownTopicLogFilter = new logs.MetricFilter(this, 'UnknownTopicMetricFilter', {
      logGroup: connectLogGroup,
      metricNamespace: connectorLogMetricNamespace,
      metricName: 'UnknownTopicOrPartitionCount',
      filterPattern: logs.FilterPattern.literal('UNKNOWN_TOPIC_OR_PARTITION'),
      metricValue: '1',
      defaultValue: 0,
    });
    const connectExceptionLogFilter = new logs.MetricFilter(this, 'ConnectExceptionMetricFilter', {
      logGroup: connectLogGroup,
      metricNamespace: connectorLogMetricNamespace,
      metricName: 'ConnectExceptionCount',
      filterPattern: logs.FilterPattern.anyTerm('ConnectException', 'SQLException'),
      metricValue: '1',
      defaultValue: 0,
    });

    const oraAlarm = new cloudwatch.Alarm(this, 'OracleErrorAlarm', {
      alarmName: `${servicePrefix}-OracleErrors`,
      alarmDescription: `Oracle error log events detected for ${servicePrefix}.`,
      metric: new cloudwatch.Metric({
        namespace: connectorLogMetricNamespace,
        metricName: 'OracleErrorCount',
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    oraAlarm.addAlarmAction(alarmAction);

    const unknownTopicAlarm = new cloudwatch.Alarm(this, 'UnknownTopicAlarm', {
      alarmName: `${servicePrefix}-UnknownTopicOrPartition`,
      alarmDescription: `Unknown-topic errors detected for ${servicePrefix}.`,
      metric: unknownTopicLogFilter.metric({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    unknownTopicAlarm.addAlarmAction(alarmAction);

    const connectExceptionAlarm = new cloudwatch.Alarm(this, 'ConnectExceptionAlarm', {
      alarmName: `${servicePrefix}-ConnectExceptions`,
      alarmDescription: `Kafka Connect exceptions detected for ${servicePrefix}.`,
      metric: connectExceptionLogFilter.metric({
        statistic: 'Sum',
        period: cdk.Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    connectExceptionAlarm.addAlarmAction(alarmAction);

    const ecsTaskFailureRule = new events.Rule(this, 'EcsTaskFailureRule', {
      description: `Detect stopped ECS tasks for ${servicePrefix}.`,
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Task State Change'],
        detail: {
          clusterArn: [cluster.clusterArn],
          group: [`service:${service.serviceName}`],
          lastStatus: ['STOPPED'],
        },
      },
    });
    ecsTaskFailureRule.addTarget(
      new eventsTargets.SnsTopic(alertsTopic, {
        message: events.RuleTargetInput.fromText(
          `ECS task stopped for ${servicePrefix}. Check ECS service and connector logs.`
        ),
      })
    );

    const ecsServiceErrorRule = new events.Rule(this, 'EcsServiceErrorRule', {
      description: `Detect ECS service errors for ${servicePrefix}.`,
      eventPattern: {
        source: ['aws.ecs'],
        detailType: ['ECS Service Action'],
        detail: {
          clusterArn: [cluster.clusterArn],
          service: [service.serviceName],
          eventType: ['ERROR'],
        },
      },
    });
    ecsServiceErrorRule.addTarget(
      new eventsTargets.SnsTopic(alertsTopic, {
        message: events.RuleTargetInput.fromText(
          `ECS service error event for ${servicePrefix}. Check ECS events and connector health.`
        ),
      })
    );
  }
}
