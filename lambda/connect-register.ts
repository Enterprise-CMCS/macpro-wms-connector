import * as http from 'http';
import * as net from 'net';
import { URL } from 'url';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

const sm = new SecretsManagerClient({});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getSecretValue(secretId: string): Promise<string> {
  const resp = await sm.send(new GetSecretValueCommand({ SecretId: secretId }));
  if (resp.SecretString) {
    return resp.SecretString;
  }
  if (resp.SecretBinary) {
    return Buffer.from(resp.SecretBinary as Uint8Array).toString('utf-8');
  }
  throw new Error(`Secret ${secretId} not found or is binary`);
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

type RequestResult = { statusCode?: number; body: string };

function request(url: string, method: string, body?: unknown): Promise<RequestResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? JSON.stringify(body) : null;
    const options: http.RequestOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (payload) {
      options.headers = {
        ...options.headers,
        'Content-Length': Buffer.byteLength(payload),
      };
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitForConnect(connectUrl: string): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    try {
      const res = await request(`${connectUrl}/connectors`, 'GET');
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
        return;
      }
    } catch (_) {
      // ignore and retry
    }
    await sleep(6000);
  }
  throw new Error('Kafka Connect did not become ready in time');
}

async function checkTcpConnectivity(host: string, port: number, timeoutMs = 3000): Promise<void> {
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

type ValidationConfig = {
  definition?: { name?: string };
  value?: unknown;
  errors?: unknown;
};

type ValidationResponse = {
  name?: string;
  error_count?: number;
  configs?: ValidationConfig[];
  errors?: unknown;
  message?: unknown;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((v) => {
      if (typeof v === 'string') {
        return v;
      }
      try {
        return JSON.stringify(v);
      } catch {
        return String(v);
      }
    })
    .filter((v) => v.length > 0);
}

function extractConfigErrors(item: ValidationConfig): string[] {
  // Kafka Connect's validate response places errors under `value.errors` (ConfigValueInfo),
  // but some plugins (or older variants) may also emit `errors` directly.
  const directErrors = toStringArray((item as { errors?: unknown }).errors);
  if (directErrors.length > 0) {
    return directErrors;
  }

  const value = (item as { value?: unknown }).value;
  if (!value || typeof value !== 'object') {
    return [];
  }
  return toStringArray((value as { errors?: unknown }).errors);
}

function extractConfigValue(item: ValidationConfig): unknown {
  // Prefer `value.value` when `value` is a ConfigValueInfo object.
  const value = (item as { value?: unknown }).value;
  if (!value || typeof value !== 'object') {
    return value;
  }
  if ('value' in value) {
    return (value as { value?: unknown }).value;
  }
  return value;
}

async function validateConfig(
  connectUrl: string,
  connectorClass: string,
  connectorName: string,
  config: Record<string, string>
): Promise<void> {
  const endpoint = `${connectUrl}/connector-plugins/${encodeURIComponent(
    connectorClass
  )}/config/validate`;
  const validationPayload: Record<string, string> = {
    name: connectorName,
    ...config,
  };
  const res = await request(endpoint, 'PUT', validationPayload);
  if (!res.statusCode || res.statusCode >= 300) {
    throw new Error(`Config validation failed: ${res.statusCode} ${res.body}`);
  }

  let payload: ValidationResponse | null = null;
  try {
    payload = JSON.parse(res.body);
  } catch {
    return;
  }
  if (!payload || !payload.error_count) {
    return;
  }

  const errors: string[] = [];
  const errorFields: string[] = [];
  const missingValues: string[] = [];
  const topLevelErrors = toStringArray((payload as { errors?: unknown }).errors);
  const message = (payload as { message?: unknown }).message;
  const configsWithErrors: Array<{ name: string; errors: string[] }> = [];
  for (const item of payload.configs || []) {
    const configErrors = extractConfigErrors(item);
    if (configErrors.length === 0) {
      const value = extractConfigValue(item);
      if (item.definition?.name && value === null) {
        missingValues.push(item.definition.name);
      }
      continue;
    }
    const field = item.definition?.name || 'unknown';
    errorFields.push(field);
    configsWithErrors.push({
      name: field,
      errors: configErrors,
    });
    for (const err of configErrors) {
      errors.push(`${field}: ${err}`);
      if (errors.length >= 5) {
        break;
      }
    }
    if (errors.length >= 5) {
      break;
    }
  }

  console.log('Connector validation summary', {
    connector: connectorClass,
    errorCount: payload.error_count,
    errorFields: errorFields.slice(0, 10),
    missingValues: missingValues.slice(0, 10),
    configsWithErrors: configsWithErrors.slice(0, 10),
    topLevelErrors: topLevelErrors.slice(0, 10),
    message: typeof message === 'string' ? message : undefined,
  });

  const summary =
    errors.length > 0
      ? errors.join('; ')
      : topLevelErrors.length > 0
        ? topLevelErrors.slice(0, 5).join('; ')
        : typeof message === 'string' && message.length > 0
          ? message
      : `error_count=${payload.error_count}. See Lambda logs for field details.`;
  throw new Error(`Connector config validation failed: ${summary}`);
}

type DbInfo = {
  ip?: string;
  host?: string;
  port?: number | string;
  user?: string;
  password?: string;
  db?: string;
  dbname?: string;
  pdb?: string;
  pdbName?: string;
  pdb_name?: string;
  url?: string;
  jdbcUrl?: string;
  connectionUrl?: string;
};

function buildDebeziumConfig(
  dbInfo: DbInfo,
  brokerString: string,
  topicNamespace: string
): Record<string, string> {
  const topicPrefix = topicNamespace ? `${topicNamespace}.` : '';
  const serverName = topicNamespace ? `${topicNamespace}.wms` : 'wms';
  const dbName = dbInfo.db || dbInfo.dbname || '';
  const dbPort = dbInfo.port !== undefined ? String(dbInfo.port) : '';
  const dbHost = dbInfo.ip || dbInfo.host || '';
  const pdbName = dbInfo.pdb || dbInfo.pdbName || dbInfo.pdb_name;
  const databaseUrl = dbInfo.jdbcUrl || dbInfo.url || dbInfo.connectionUrl;

  const config: Record<string, string> = {
    'connector.class': 'io.debezium.connector.oracle.OracleConnector',
    'tasks.max': '1',
    'topic.prefix': serverName,
    'database.hostname': dbHost,
    'database.port': dbPort,
    'database.user': dbInfo.user || '',
    'database.password': dbInfo.password || '',
    'database.dbname': dbName,
    'database.server.name': serverName,
    'schema.include.list': 'WMS',
    'table.include.list': 'WMS.PLAN_BASE_WVR_TBL,WMS.PLAN_WVR_RVSN_TBL',
    'database.history.kafka.bootstrap.servers': brokerString,
    'database.history.kafka.topic': `${topicPrefix}wms.schema-changes`,
    'include.schema.changes': 'true',
    'snapshot.mode': 'initial',
  };

  if (pdbName) {
    config['database.pdb.name'] = pdbName;
  }

  if (databaseUrl) {
    config['database.url'] = databaseUrl;
  }

  return config;
}

function buildJdbcConfig(
  dbInfo: DbInfo,
  topicNamespace: string
): Record<string, string> {
  const topicPrefix = topicNamespace ? `${topicNamespace}.` : '';
  const jdbcPrefix = `${topicPrefix}aws.wms.cdc.`;
  const dbName = dbInfo.db || dbInfo.dbname || '';
  const dbPort = dbInfo.port !== undefined ? String(dbInfo.port) : '';
  const dbHost = dbInfo.ip || dbInfo.host || '';
  const explicitUrl = dbInfo.jdbcUrl || dbInfo.url || dbInfo.connectionUrl;
  const pdbName = dbInfo.pdb || dbInfo.pdbName || dbInfo.pdb_name;
  // Preserve legacy SID-style connectivity unless a PDB/service is explicitly provided.
  const connectionUrl = explicitUrl
    ? explicitUrl
    : pdbName
      ? `jdbc:oracle:thin:@//${dbHost}:${dbPort}/${pdbName}`
      : `jdbc:oracle:thin:@${dbHost}:${dbPort}:${dbName}`;

  return {
    'connector.class': 'io.confluent.connect.jdbc.JdbcSourceConnector',
    'tasks.max': '1',
    'connection.user': dbInfo.user || '',
    'connection.password': dbInfo.password || '',
    'connection.url': connectionUrl,
    'topic.prefix': jdbcPrefix,
    'poll.interval.ms': '2000',
    'batch.max.rows': '1000',
    'table.whitelist': 'WMS.PLAN_BASE_WVR_TBL,WMS.PLAN_WVR_RVSN_TBL',
    mode: 'timestamp',
    'timestamp.column.name': 'SYS_ADD_TS',
  };
}

export const handler = async (event: {
  RequestType?: string;
  ResourceProperties?: {
    ConnectorName?: string;
    Stage?: string;
    TopicNamespace?: string;
  };
}): Promise<{ PhysicalResourceId: string }> => {
  const connectorName = event.ResourceProperties?.ConnectorName || process.env.CONNECTOR_NAME;
  const stage = event.ResourceProperties?.Stage || process.env.STAGE;
  const topicNamespace =
    event.ResourceProperties?.TopicNamespace || process.env.TOPIC_NAMESPACE || '';
  const connectUrl = process.env.CONNECT_URL;

  if (!connectUrl) {
    throw new Error('CONNECT_URL environment variable is required');
  }
  if (!connectorName) {
    throw new Error('Connector name is required');
  }
  if (!stage) {
    throw new Error('Stage is required');
  }

  await waitForConnect(connectUrl);

  if (event.RequestType === 'Delete') {
    const del = await request(`${connectUrl}/connectors/${connectorName}`, 'DELETE');
    if (del.statusCode && del.statusCode !== 404 && del.statusCode >= 300) {
      throw new Error(`Failed to delete connector: ${del.statusCode} ${del.body}`);
    }
    return { PhysicalResourceId: connectorName };
  }

  const dbInfo = JSON.parse(
    await getSecretWithFallback(`mmdl/${stage}/dbInfo`, 'mmdl/default/dbInfo')
  ) as DbInfo;
  const brokerString = await getSecretWithFallback(
    `mmdl/${stage}/brokerString`,
    'mmdl/default/brokerString'
  );

  console.log('dbInfo keys detected', {
    keys: Object.keys(dbInfo || {}).sort(),
    hasDb: Boolean(dbInfo.db || dbInfo.dbname),
    hasHost: Boolean(dbInfo.ip || dbInfo.host),
    hasPort: Boolean(dbInfo.port),
    hasUser: Boolean(dbInfo.user),
    hasPdb: Boolean(dbInfo.pdb || dbInfo.pdbName || dbInfo.pdb_name),
    hasUrl: Boolean(dbInfo.jdbcUrl || dbInfo.url || dbInfo.connectionUrl),
  });

  if (!dbInfo.ip && !dbInfo.host) {
    throw new Error('dbInfo is missing ip/host; cannot reach Oracle.');
  }
  if (!dbInfo.port) {
    throw new Error('dbInfo is missing port; cannot reach Oracle.');
  }

  try {
    await checkTcpConnectivity(dbInfo.ip || dbInfo.host || '', Number(dbInfo.port), 3000);
    console.log('TCP connectivity check passed', {
      host: dbInfo.ip || dbInfo.host,
      port: dbInfo.port,
    });
  } catch (err) {
    const message = (err as Error).message || 'unknown error';
    throw new Error(`TCP connectivity check failed: ${message}`);
  }

  const connectorType = (process.env.CONNECTOR_TYPE || 'debezium').toLowerCase();
  const config =
    connectorType === 'jdbc'
      ? buildJdbcConfig(dbInfo, topicNamespace)
      : buildDebeziumConfig(dbInfo, brokerString, topicNamespace);

  console.log('Using connector type', { connectorType });

  await validateConfig(connectUrl, config['connector.class'], connectorName, config);

  const getRes = await request(`${connectUrl}/connectors/${connectorName}`, 'GET');
  if (getRes.statusCode === 200) {
    const putRes = await request(`${connectUrl}/connectors/${connectorName}/config`, 'PUT', config);
    if (putRes.statusCode && putRes.statusCode >= 300) {
      throw new Error(`Failed to update connector: ${putRes.statusCode} ${putRes.body}`);
    }
  } else if (getRes.statusCode === 404) {
    const postRes = await request(`${connectUrl}/connectors`, 'POST', {
      name: connectorName,
      config,
    });
    if (postRes.statusCode && postRes.statusCode >= 300) {
      throw new Error(`Failed to create connector: ${postRes.statusCode} ${postRes.body}`);
    }
  } else {
    throw new Error(`Unexpected GET response: ${getRes.statusCode} ${getRes.body}`);
  }

  return { PhysicalResourceId: connectorName };
};
