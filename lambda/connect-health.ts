import * as http from 'http';
import * as net from 'net';
import { URL } from 'url';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DescribeServicesCommand, ECSClient } from '@aws-sdk/client-ecs';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});
const cw = new CloudWatchClient({});
const ddb = new DynamoDBClient({});
const ecs = new ECSClient({});

const RESTART_WINDOW_MS = 60 * 60 * 1000;
const MAX_RESTART_ATTEMPTS = 3;
const CONNECT_REQUEST_TIMEOUT_MS = 5000;
const DB_TCP_TIMEOUT_MS = 3000;

type DbInfo = {
  ip?: string;
  host?: string;
  port?: number | string;
};

type RequestResult = { statusCode?: number; body: string };

type ConnectorStatusResponse = {
  name: string;
  connector?: { state?: string };
  tasks?: Array<{ id?: number; state?: string; trace?: string }>;
};

type RestartBudget = {
  windowStartEpochMs: number;
  attemptCount: number;
};

type HealthMetrics = {
  ConnectApiUnreachable: 0 | 1;
  ConnectorStateFailed: 0 | 1;
  ConnectorTaskFailed: 0 | 1;
  EcsServiceUnhealthy: 0 | 1;
  DbTcpUnreachable: 0 | 1;
  HealthCheckFailed: 0 | 1;
  AutoRestartAttempted: number;
  AutoRestartBudgetExceeded: 0 | 1;
};

async function getSecretValue(secretId: string): Promise<string> {
  const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (resp.SecretString) {
    return resp.SecretString;
  }
  if (resp.SecretBinary) {
    return Buffer.from(resp.SecretBinary as Uint8Array).toString('utf-8');
  }
  throw new Error(`Secret ${secretId} not found or empty`);
}

async function getSecretWithFallback(primary: string, fallback: string): Promise<string> {
  try {
    return await getSecretValue(primary);
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === 'ResourceNotFoundException') {
      return await getSecretValue(fallback);
    }
    throw err;
  }
}

function request(connectUrl: string, path: string, method: string, body?: unknown): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const base = new URL(connectUrl);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: base.hostname,
        port: base.port,
        path,
        method,
        timeout: CONNECT_REQUEST_TIMEOUT_MS,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function isSuccessfulOrAccepted(statusCode?: number): boolean {
  if (!statusCode) {
    return false;
  }
  if (statusCode >= 200 && statusCode < 300) {
    return true;
  }
  // 409 can occur while Connect is already restarting the connector/task.
  return statusCode === 409;
}

async function checkTcpConnectivity(host: string, port: number, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    const onError = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(timeoutMs);
    socket.once('error', onError);
    socket.once('timeout', () => onError(new Error('TCP timeout')));
    socket.connect(port, host, () => {
      socket.end();
      resolve();
    });
  });
}

async function getRestartBudget(tableName: string, connectorId: string): Promise<RestartBudget> {
  const now = Date.now();
  const resp = await ddb.send(
    new GetItemCommand({
      TableName: tableName,
      Key: {
        connectorId: { S: connectorId },
      },
      ConsistentRead: true,
    })
  );

  if (!resp.Item) {
    return {
      windowStartEpochMs: now,
      attemptCount: 0,
    };
  }

  const windowStart = Number(resp.Item.windowStartEpochMs?.N ?? now);
  const attempts = Number(resp.Item.attemptCount?.N ?? 0);

  if (!Number.isFinite(windowStart) || !Number.isFinite(attempts) || now - windowStart >= RESTART_WINDOW_MS) {
    return {
      windowStartEpochMs: now,
      attemptCount: 0,
    };
  }

  return {
    windowStartEpochMs: windowStart,
    attemptCount: attempts,
  };
}

async function saveRestartBudget(
  tableName: string,
  connectorId: string,
  budget: RestartBudget
): Promise<void> {
  const now = Date.now();
  await ddb.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        connectorId: { S: connectorId },
        windowStartEpochMs: { N: String(budget.windowStartEpochMs) },
        attemptCount: { N: String(budget.attemptCount) },
        updatedAt: { N: String(now) },
      },
    })
  );
}

async function attemptConnectorRestart(connectUrl: string, connectorName: string): Promise<boolean> {
  const encodedName = encodeURIComponent(connectorName);
  const restartRes = await request(
    connectUrl,
    `/connectors/${encodedName}/restart?includeTasks=true&onlyFailed=true`,
    'POST'
  );
  if (isSuccessfulOrAccepted(restartRes.statusCode)) {
    return true;
  }

  const fallbackRes = await request(connectUrl, `/connectors/${encodedName}/tasks/0/restart`, 'POST');
  return isSuccessfulOrAccepted(fallbackRes.statusCode);
}

async function publishMetrics(namespace: string, metrics: HealthMetrics): Promise<void> {
  const metricData = Object.entries(metrics).map(([MetricName, Value]) => ({
    MetricName,
    Value,
    Unit: 'Count',
  }));

  await cw.send(
    new PutMetricDataCommand({
      Namespace: namespace,
      MetricData: metricData,
    })
  );
}

export const handler = async (): Promise<void> => {
  const connectUrl = process.env.CONNECT_URL;
  const connectorName = process.env.CONNECTOR_NAME || 'wms-oracle-cdc';
  const stage = process.env.STAGE;
  const clusterName = process.env.CLUSTER_NAME;
  const serviceName = process.env.SERVICE_NAME;
  const restartTableName = process.env.RESTART_TABLE_NAME;
  const metricNamespace = process.env.METRIC_NAMESPACE || 'wms-connector/Health';

  if (!connectUrl || !stage || !clusterName || !serviceName || !restartTableName) {
    throw new Error(
      'CONNECT_URL, STAGE, CLUSTER_NAME, SERVICE_NAME, and RESTART_TABLE_NAME environment variables are required.'
    );
  }

  const metrics: HealthMetrics = {
    ConnectApiUnreachable: 0,
    ConnectorStateFailed: 0,
    ConnectorTaskFailed: 0,
    EcsServiceUnhealthy: 0,
    DbTcpUnreachable: 0,
    HealthCheckFailed: 0,
    AutoRestartAttempted: 0,
    AutoRestartBudgetExceeded: 0,
  };

  try {
    // Kafka Connect REST health
    try {
      const rootRes = await request(connectUrl, '/', 'GET');
      if (!rootRes.statusCode || rootRes.statusCode >= 500) {
        metrics.ConnectApiUnreachable = 1;
      }
    } catch (err) {
      console.error('Connect root health check failed', err);
      metrics.ConnectApiUnreachable = 1;
    }

    // Connector + task status
    if (metrics.ConnectApiUnreachable === 0) {
      try {
        const statusRes = await request(
          connectUrl,
          `/connectors/${encodeURIComponent(connectorName)}/status`,
          'GET'
        );
        if (!statusRes.statusCode || statusRes.statusCode >= 500) {
          metrics.ConnectApiUnreachable = 1;
        } else if (statusRes.statusCode === 404) {
          metrics.ConnectorStateFailed = 1;
          metrics.ConnectorTaskFailed = 1;
        } else {
          const payload = JSON.parse(statusRes.body) as ConnectorStatusResponse;
          const connectorState = payload.connector?.state || 'UNKNOWN';
          const tasks = payload.tasks || [];
          if (connectorState !== 'RUNNING') {
            metrics.ConnectorStateFailed = 1;
          }
          if (tasks.length === 0 || tasks.some((task) => task.state !== 'RUNNING')) {
            metrics.ConnectorTaskFailed = 1;
          }
        }
      } catch (err) {
        console.error('Connector status check failed', err);
        metrics.ConnectApiUnreachable = 1;
      }
    }

    // ECS service desired/running state
    try {
      const ecsResp = await ecs.send(
        new DescribeServicesCommand({
          cluster: clusterName,
          services: [serviceName],
        })
      );
      const service = ecsResp.services?.[0];
      if (!service) {
        metrics.EcsServiceUnhealthy = 1;
      } else {
        const desired = service.desiredCount ?? 0;
        const running = service.runningCount ?? 0;
        if (service.status !== 'ACTIVE' || desired === 0 || running !== desired) {
          metrics.EcsServiceUnhealthy = 1;
        }
      }
    } catch (err) {
      console.error('ECS service health check failed', err);
      metrics.EcsServiceUnhealthy = 1;
    }

    // DB TCP reachability
    try {
      const dbInfoJson = await getSecretWithFallback(`mmdl/${stage}/dbInfo`, 'mmdl/default/dbInfo');
      const dbInfo = JSON.parse(dbInfoJson) as DbInfo;
      const host = dbInfo.ip || dbInfo.host;
      const port = Number(dbInfo.port);

      if (!host || !Number.isFinite(port) || port <= 0) {
        throw new Error('dbInfo secret is missing valid host/port.');
      }

      await checkTcpConnectivity(host, port, DB_TCP_TIMEOUT_MS);
    } catch (err) {
      console.error('DB TCP health check failed', err);
      metrics.DbTcpUnreachable = 1;
    }

    const restartNeeded =
      metrics.ConnectApiUnreachable === 1 ||
      metrics.ConnectorStateFailed === 1 ||
      metrics.ConnectorTaskFailed === 1 ||
      metrics.EcsServiceUnhealthy === 1;

    if (restartNeeded) {
      const connectorId = `${stage}:${connectorName}`;
      const budget = await getRestartBudget(restartTableName, connectorId);

      if (budget.attemptCount >= MAX_RESTART_ATTEMPTS) {
        metrics.AutoRestartBudgetExceeded = 1;
      } else {
        metrics.AutoRestartAttempted = 1;
        try {
          const restartSuccess = await attemptConnectorRestart(connectUrl, connectorName);
          console.log('Connector restart attempt result', {
            connectorName,
            restartSuccess,
            attemptsInWindow: budget.attemptCount + 1,
          });
        } catch (err) {
          console.error('Connector restart call failed', err);
        }

        await saveRestartBudget(restartTableName, connectorId, {
          windowStartEpochMs: budget.windowStartEpochMs,
          attemptCount: budget.attemptCount + 1,
        });
      }
    }

    metrics.HealthCheckFailed =
      metrics.ConnectApiUnreachable === 1 ||
      metrics.ConnectorStateFailed === 1 ||
      metrics.ConnectorTaskFailed === 1 ||
      metrics.EcsServiceUnhealthy === 1 ||
      metrics.DbTcpUnreachable === 1
        ? 1
        : 0;

    await publishMetrics(metricNamespace, metrics);
    console.log('Health metrics published', metrics);
  } catch (err) {
    console.error('Unexpected health-check failure', err);
    metrics.HealthCheckFailed = 1;
    metrics.ConnectApiUnreachable = 1;
    await publishMetrics(metricNamespace, metrics);
    throw err;
  }
};
