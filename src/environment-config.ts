import { SecretsManager } from 'aws-sdk';

/**
 * Secret path patterns for AWS Secrets Manager.
 * Fallback pattern: mmdl/{stage}/... -> mmdl/default/...
 */
export const SecretPaths = {
  vpc: (stage: string) => `mmdl/${stage}/vpc`,
  vpcDefault: 'mmdl/default/vpc',
  iamPath: (stage: string) => `mmdl/${stage}/iam/path`,
  iamPathDefault: 'mmdl/default/iam/path',
  iamPermissionsBoundary: (stage: string) => `mmdl/${stage}/iam/permissionsBoundary`,
  iamPermissionsBoundaryDefault: 'mmdl/default/iam/permissionsBoundary',
  brokerString: (stage: string) => `mmdl/${stage}/brokerString`,
  brokerStringDefault: 'mmdl/default/brokerString',
  dbInfo: (stage: string) => `mmdl/${stage}/dbInfo`,
  dbInfoDefault: 'mmdl/default/dbInfo',
} as const;

/**
 * VPC configuration structure from Secrets Manager.
 * Same shape as appian-connector for consistency.
 */
export interface VpcConfig {
  id: string;
  dataSubnets: string[];
  privateSubnets: string[];
  publicSubnets: string[];
}

/**
 * Database configuration structure from Secrets Manager (Oracle).
 * Align with Debezium Oracle connector and docs/wms-config-details.md dbInfo shape.
 */
export interface DbInfo {
  ip: string;
  port: string;
  db: string;
  user: string;
  password: string;
  schema: string;
}

/**
 * Named stages that have no topic namespace (main, val, production).
 * Any other stage is treated as ephemeral and gets topicNamespace = validated stage.
 */
export const NAMED_STAGES = ['main', 'val', 'production'] as const;
export type NamedStage = (typeof NAMED_STAGES)[number];

/**
 * Allowed stage pattern for Kafka topic names and CDK/ECS resource names.
 * Kafka allows alphanumeric, period, hyphen, underscore; CDK/ECS use similar constraints.
 * We reject invalid input (no normalization) and fail fast with a clear error.
 *
 * Allowed: [a-zA-Z0-9._-], length 1–64.
 * Rejected: slash, space, or any character not in the allowed set.
 */
const STAGE_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

/**
 * Validates stage for use in topic names and CDK/ECS names.
 * Aligns with Kafka topic naming and CDK/ECS naming (alphanumeric, hyphen, period, underscore).
 * Rejects slash, space, and other disallowed characters (no normalization).
 *
 * @param stage - Stage string (e.g. Git branch name for ephemeral).
 * @returns The same stage string if valid.
 * @throws Error with clear message if stage is invalid.
 */
export function validateStage(stage: string): string {
  if (typeof stage !== 'string' || stage.length === 0) {
    throw new Error(
      'Stage is required for ephemeral deploy. Supply stage via CDK context (e.g. -c stage=feature-xyz).'
    );
  }
  if (!STAGE_PATTERN.test(stage)) {
    throw new Error(
      `Invalid stage "${stage}". Stage must match [a-zA-Z0-9._-], length 1–64 (no slash, space, or other characters). ` +
        'Use a valid Git branch name or set -c stage=your-stage.'
    );
  }
  return stage;
}

/**
 * Environment-specific configuration for ECS Fargate resources.
 * Values use Appian connector configs as starting point (master -> main).
 */
export interface EnvironmentConfig {
  stage: string;
  /** Topic namespace for ephemeral stages; empty for main, val, production. */
  topicNamespace: string;
  taskCpu: string;
  taskMemory: string;
  connectContainerCpu: number;
  connectContainerMemory: number;
  /** Optional; include if using Oracle Instant Client sidecar (adapt for WMS). */
  instantClientContainerMemory?: number;
}

/**
 * Full environment configuration including secrets.
 * Secrets are resolved at synth-time from AWS Secrets Manager.
 */
export interface FullEnvironmentConfig extends EnvironmentConfig {
  vpc: VpcConfig;
  brokerString: string;
  dbInfo: DbInfo;
  iamPath: string;
  iamPermissionsBoundary: string;
}

/**
 * Environment configurations for ECS resources (non-secret values).
 * Appian resource configs as starting point; master mapped to main.
 * Sizing is startup-focused; production well-sized so it never runs out.
 */
export const environmentConfigs: Record<NamedStage, EnvironmentConfig> = {
  main: {
    stage: 'main',
    topicNamespace: '',
    taskCpu: '1024',
    taskMemory: '2048',
    connectContainerCpu: 512,
    connectContainerMemory: 1024,
    instantClientContainerMemory: 512,
  },
  val: {
    stage: 'val',
    topicNamespace: '',
    taskCpu: '1024',
    taskMemory: '3072',
    connectContainerCpu: 512,
    connectContainerMemory: 2560,
    instantClientContainerMemory: 512,
  },
  production: {
    stage: 'production',
    topicNamespace: '',
    taskCpu: '2048',
    taskMemory: '6144',
    connectContainerCpu: 2048,
    connectContainerMemory: 4096,
    instantClientContainerMemory: 2048,
  },
};

/**
 * Get environment configuration for a given stage.
 * Named stages (main, val, production): return existing config with topicNamespace ''.
 * Ephemeral (any other stage): validate stage, then return config with sizing fallback to main
 * and topicNamespace = validated stage.
 */
export function getEnvironmentConfig(stage: string): EnvironmentConfig {
  const named = environmentConfigs[stage as NamedStage];
  if (named) {
    return named;
  }
  const validated = validateStage(stage);
  const base = environmentConfigs.main;
  return {
    ...base,
    stage: validated,
    topicNamespace: validated,
  };
}

async function getSecretValue(secretId: string): Promise<string> {
  const client = new SecretsManager({ region: process.env.AWS_REGION || 'us-east-1' });
  const response = await client.getSecretValue({ SecretId: secretId }).promise();
  if (response.SecretString) {
    return response.SecretString;
  }
  throw new Error(`Secret ${secretId} not found or is binary`);
}

/**
 * Try to get a secret with fallback to default.
 */
export async function getSecretWithFallback(
  primarySecretId: string,
  fallbackSecretId: string
): Promise<string> {
  try {
    return await getSecretValue(primarySecretId);
  } catch {
    return await getSecretValue(fallbackSecretId);
  }
}

/**
 * Load secrets for an environment.
 * Uses fallback pattern: mmdl/{stage}/... -> mmdl/default/...
 */
export async function loadEnvironmentSecrets(stage: string): Promise<{
  vpc: VpcConfig;
  brokerString: string;
  dbInfo: DbInfo;
  iamPath: string;
  iamPermissionsBoundary: string;
}> {
  const [vpcJson, brokerString, dbInfoJson, iamPath, iamPermissionsBoundary] = await Promise.all([
    getSecretWithFallback(SecretPaths.vpc(stage), SecretPaths.vpcDefault),
    getSecretWithFallback(SecretPaths.brokerString(stage), SecretPaths.brokerStringDefault),
    getSecretWithFallback(SecretPaths.dbInfo(stage), SecretPaths.dbInfoDefault),
    getSecretWithFallback(SecretPaths.iamPath(stage), SecretPaths.iamPathDefault),
    getSecretWithFallback(
      SecretPaths.iamPermissionsBoundary(stage),
      SecretPaths.iamPermissionsBoundaryDefault
    ),
  ]);
  return {
    vpc: JSON.parse(vpcJson) as VpcConfig,
    brokerString,
    dbInfo: JSON.parse(dbInfoJson) as DbInfo,
    iamPath,
    iamPermissionsBoundary,
  };
}

/**
 * Get full environment configuration including secrets.
 */
export async function getFullEnvironmentConfig(stage: string): Promise<FullEnvironmentConfig> {
  const baseConfig = getEnvironmentConfig(stage);
  const secrets = await loadEnvironmentSecrets(stage);
  return {
    ...baseConfig,
    ...secrets,
  };
}
