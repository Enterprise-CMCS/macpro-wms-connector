const assert = require('node:assert/strict');
const test = require('node:test');
const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');
const { WmsConnectorStack } = require('../lib/cdk/wms-connector-stack');

const FALCON_ENTRY_POINT = [
  '/tmp/CrowdStrike/rootfs/lib64/ld-linux-x86-64.so.2',
  '--library-path',
  '/tmp/CrowdStrike/rootfs/lib64',
  '/tmp/CrowdStrike/rootfs/bin/bash',
  '/tmp/CrowdStrike/rootfs/entrypoint-ecs.sh',
];

const FALCON_INIT_ENTRY_POINT = [
  '/bin/bash',
  '-c',
  'chmod u+rwx /tmp/CrowdStrike && mkdir -p /tmp/CrowdStrike/rootfs/lib  && cp -r /bin /etc /lib64 /usr /entrypoint-ecs.sh /tmp/CrowdStrike/rootfs && chmod -R a=rX /tmp/CrowdStrike',
];

function environmentValue(container, name) {
  const entry = (container.Environment || []).find((item) => item.Name === name);
  assert.ok(entry, `missing environment variable ${name}`);
  return entry.Value;
}

test('renders the x86_64 Falcon sensor on the Connect task definition', () => {
  const app = new cdk.App();
  const stage = 'val';
  const stack = new WmsConnectorStack(app, 'wms-connector-val', {
    env: { account: '123456789012', region: 'us-east-1' },
    alertsTopicArn: 'arn:aws:sns:us-east-1:123456789012:wms-alerts-val',
    fullConfig: {
      stage,
      topicNamespace: '',
      taskCpu: '1024',
      taskMemory: '3072',
      connectContainerCpu: 512,
      connectContainerMemory: 2560,
      vpc: {
        id: 'vpc-1234567890abcdef0',
        dataSubnets: ['subnet-data-a', 'subnet-data-b', 'subnet-data-c'],
        privateSubnets: ['subnet-private-a', 'subnet-private-b', 'subnet-private-c'],
        publicSubnets: ['subnet-public-a', 'subnet-public-b', 'subnet-public-c'],
      },
      brokerString: 'broker.example.internal:9094',
      dbInfo: {
        ip: '10.0.0.10',
        port: '1521',
        db: 'WMS',
        user: 'cdc_user',
        password: 'secret',
        schema: 'WMS',
      },
      iamPath: '/delegatedadmin/developer/',
      iamPermissionsBoundary: 'arn:aws:iam::123456789012:policy/delegatedadmin/developer/boundary',
      alertEmails: [],
      falcon: {
        cid: 'cid-placeholder',
        provisioningToken: 'token-placeholder',
        image: 'example.invalid/falcon-container:test',
      },
    },
  });

  const template = Template.fromStack(stack);
  template.hasResourceProperties('AWS::ECS::Cluster', {
    ClusterSettings: [{ Name: 'containerInsights', Value: 'enabled' }],
  });
  const tasks = template.findResources('AWS::ECS::TaskDefinition');
  assert.equal(Object.keys(tasks).length, 1);
  const task = Object.values(tasks)[0].Properties;

  assert.deepEqual(task.RuntimePlatform, {
    CpuArchitecture: 'X86_64',
    OperatingSystemFamily: 'LINUX',
  });
  assert.deepEqual(task.Volumes, [{ Name: 'crowdstrike-falcon-volume' }]);

  const containers = task.ContainerDefinitions;
  assert.deepEqual(
    containers.map((container) => container.Name).sort(),
    ['connect', 'crowdstrike-falcon-init-container']
  );

  const init = containers.find((container) => container.Name === 'crowdstrike-falcon-init-container');
  assert.equal(init.Essential, false);
  assert.equal(init.User, '0:0');
  assert.equal(init.ReadonlyRootFilesystem, true);
  assert.equal(init.Image, 'example.invalid/falcon-container:test');
  assert.deepEqual(init.EntryPoint, FALCON_INIT_ENTRY_POINT);
  assert.equal(init.Command, undefined);
  assert.equal(init.Environment, undefined);
  assert.equal(init.DependsOn, undefined);
  assert.equal(init.LinuxParameters, undefined);
  assert.deepEqual(init.MountPoints, [
    {
      ContainerPath: '/tmp/CrowdStrike',
      ReadOnly: false,
      SourceVolume: 'crowdstrike-falcon-volume',
    },
  ]);

  const connect = containers.find((container) => container.Name === 'connect');
  assert.equal(connect.Image, 'confluentinc/cp-kafka-connect:6.0.9');
  assert.deepEqual(connect.EntryPoint, FALCON_ENTRY_POINT);
  assert.equal(connect.Command[0], 'bash');
  assert.equal(connect.Command[1], '-c');
  assert.match(connect.Command[2], /exec \/etc\/confluent\/docker\/run/);
  assert.equal(
    environmentValue(connect, 'FALCONCTL_OPTS'),
    '--provisioning-token=token-placeholder --tags=wms-connector,val,wms-connector-val --cid=cid-placeholder'
  );
  assert.deepEqual(connect.DependsOn, [
    {
      Condition: 'COMPLETE',
      ContainerName: 'crowdstrike-falcon-init-container',
    },
  ]);
  assert.deepEqual(connect.MountPoints, [
    {
      ContainerPath: '/tmp/CrowdStrike',
      ReadOnly: true,
      SourceVolume: 'crowdstrike-falcon-volume',
    },
  ]);
  assert.deepEqual(connect.LinuxParameters, {
    Capabilities: { Add: ['SYS_PTRACE'] },
  });
});
