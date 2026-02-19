# macpro-wms-connector

[![Deploy (main)](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions/workflows/deploy.yml)
[![Pre-commit](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions/workflows/pre-commit.yml/badge.svg?branch=main)](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions/workflows/pre-commit.yml)
[![Dependency Review](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions/workflows/dependency-review.yml/badge.svg?branch=main)](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions/workflows/dependency-review.yml)
[![Health: CloudWatch + SNS](https://img.shields.io/badge/health-CloudWatch%20%2B%20SNS-brightgreen)](https://aws.amazon.com/cloudwatch/)
[![Coverage: Planned](https://img.shields.io/badge/coverage-planned-lightgrey)](https://github.com/Enterprise-CMCS/macpro-wms-connector/actions)

`macpro-wms-connector` deploys and operates the WMS Oracle to Kafka connector on AWS. It runs Kafka Connect on ECS Fargate, reads Oracle tables through a JDBC source connector, and publishes table-change records to BigMAC Kafka topics.

## What This Connector Does

- Ingests WMS data from Oracle tables into Kafka for downstream consumers.
- Runs as managed AWS infrastructure (CDK, ECS Fargate, Lambda, CloudWatch, SNS, EventBridge).
- Uses stage-aware deployment (`main`, `val`, `production`, plus ephemeral branch stages).

## How It Fits In The Connector Ecosystem

This connector is one pipeline in the broader connector platform, alongside **SEATool** connectors and **macpro-appian-connector**. Together, these connectors move source-system data into Kafka/BigMAC so it can be consumed by other platform applications.

## Current Features And Recent Improvements

- Stage-aware stack names and deployments: `wms-alerts-<stage>` and `wms-connector-<stage>`.
- Stage validation for safe topic/resource naming.
- Ephemeral topic namespacing for non-named stages.
- Secrets fallback model: `mmdl/{stage}/...` to `mmdl/default/...`.
- Dedicated alerting stack with SNS email subscriptions from Secrets Manager.
- 10-minute health checks with CloudWatch metrics and alarms.
- Restart-budget protection via DynamoDB (max 3 restart attempts per rolling 60 minutes).
- EventBridge alerting for ECS task stop and ECS service error events.
- GitHub workflow automation for deploy/destroy and release PR flow (`main` to `val`, `val` to `production`).

## Local Setup And Run (Developer Machine)

### Prerequisites

- Node.js 24 (see `.nvmrc`)
- Yarn Classic (1.x)
- AWS CLI v2
- AWS CDK v2
- AWS credentials with permissions for Secrets Manager, CloudFormation, ECS, Lambda, CloudWatch, EventBridge, SNS, IAM, and VPC lookups

### Install, Build, And Synthesize

```bash
yarn install
yarn build
yarn synth -c stage=<stage>
```

Examples:

```bash
yarn synth -c stage=main
yarn synth -c stage=feature-xyz
```

### Local "Run" Semantics

This repository is infrastructure and deployment code. Local usage is primarily:

- dependency install
- TypeScript compile
- CDK synth/diff/deploy

It does not run a local Kafka Connect runtime by default.

### Required Secrets (Synth/Deploy Time)

The CDK app loads environment secrets at synth/deploy time using stage-first fallback:

- `mmdl/{stage}/vpc` to `mmdl/default/vpc`
- `mmdl/{stage}/iam/path` to `mmdl/default/iam/path`
- `mmdl/{stage}/iam/permissionsBoundary` to `mmdl/default/iam/permissionsBoundary`
- `mmdl/{stage}/brokerString` to `mmdl/default/brokerString`
- `mmdl/{stage}/dbInfo` to `mmdl/default/dbInfo`
- `mmdl/{stage}/alertEmails` to `mmdl/default/alertEmails`

## Deploy From Your Machine

### 1) Bootstrap CDK (Qualifier `one`)

```bash
npx cdk bootstrap --qualifier one aws://<account-id>/us-east-1
```

### 2) Deploy Alerts And Connector Stacks

```bash
npx cdk deploy wms-alerts-<stage> wms-connector-<stage> -c stage=<stage> --require-approval never
```

Example:

```bash
npx cdk deploy wms-alerts-main wms-connector-main -c stage=main --require-approval never
```

### 3) Destroy Ephemeral Connector Stack

```bash
npx cdk destroy wms-connector-<ephemeral-stage> --force
```

Example:

```bash
npx cdk destroy wms-connector-feature-xyz --force
```

### Stage Requirement And Validation Summary

- `stage` is required on synth/deploy (`-c stage=<value>`).
- Named stages: `main`, `val`, `production`.
- Any other stage value is treated as ephemeral and used as topic namespace.
- Stage pattern must match `[a-zA-Z0-9._-]{1,64}`.
- Invalid or missing stage fails fast with a clear error.

## Connector Details (Current Runtime: JDBC)

### Connector Kind

Active connector class:

- `io.confluent.connect.jdbc.JdbcSourceConnector`

Runtime connector name:

- `wms-oracle-cdc`

### Runtime Configuration Highlights

| Setting | Value |
| --- | --- |
| `connector.class` | `io.confluent.connect.jdbc.JdbcSourceConnector` |
| `tasks.max` | `1` |
| `mode` | `timestamp` |
| `timestamp.column.name` | `SYS_ADD_TS` |
| `poll.interval.ms` | `2000` |
| `table.whitelist` | `WMS.PLAN_BASE_WVR_TBL,WMS.PLAN_WVR_RVSN_TBL` |
| `topic.prefix` (named stages) | `aws.wms.cdc.` |
| `topic.prefix` (ephemeral) | `<stage>.aws.wms.cdc.` |

### Topics Produced And Where They Come From

| Source Oracle table | Named-stage topic | Ephemeral-stage topic |
| --- | --- | --- |
| `WMS.PLAN_BASE_WVR_TBL` | `aws.wms.cdc.WMS.PLAN_BASE_WVR_TBL` | `<stage>.aws.wms.cdc.WMS.PLAN_BASE_WVR_TBL` |
| `WMS.PLAN_WVR_RVSN_TBL` | `aws.wms.cdc.WMS.PLAN_WVR_RVSN_TBL` | `<stage>.aws.wms.cdc.WMS.PLAN_WVR_RVSN_TBL` |

Kafka Connect internal topics are also stage-aware:

- Named stages: `mgmt.connect.wms-connector-<stage>.{config,offsets,status}`
- Ephemeral stages: `<stage>.mgmt.connect.wms-connector-<stage>.{config,offsets,status}`

### Where Connector Behavior Is Configured

- `lambda/connect-register.ts`
- `src/cdk/wms-connector-stack.ts`

## Expected Kafka Message Envelope (Public-Safe)

This connector uses Kafka Connect JSON converters. Value messages follow the envelope form:

- `schema`: Connect type/optionality metadata
- `payload`: row data values

Public README guidance is intentionally limited to envelope shape. Detailed field-level schemas and production-like values are not published here.

Envelope example:

```json
{
  "schema": {
    "type": "struct",
    "name": "<topic>.Value",
    "optional": false,
    "fields": [
      { "field": "<column_name>", "type": "<connect_type>", "optional": true },
      { "field": "<timestamp_column>", "type": "int64", "optional": true }
    ]
  },
  "payload": {
    "<column_name>": "<value>",
    "<timestamp_column>": 1739385600000
  }
}
```

Notes:

- Payload fields are sourced from Oracle table columns.
- Exact type mapping and optionality are derived by JDBC/Kafka Connect from source metadata.
- Consumers should not assume optional fields are always populated.
- If you need a full field-level contract for downstream integration, coordinate through approved internal data-contract channels.

## Alerting And Monitoring

### How The Alerting Service Works

1. A scheduled health Lambda runs every 10 minutes.
2. It checks:
   - Kafka Connect API reachability (`GET /`)
   - Connector/task status (`GET /connectors/wms-oracle-cdc/status`)
   - ECS service desired vs running count
   - Oracle DB TCP reachability using `dbInfo` host/port
3. It publishes CloudWatch metrics under:
   - `wms-connector-<stage>/Health`
   - `wms-connector-<stage>/ConnectorLogs`
4. CloudWatch alarms and EventBridge ECS failure rules publish notifications to SNS.
5. SNS sends email alerts to recipients from the `alertEmails` secret.

### Add Or Update Alert Email Recipients

Secret lookup order:

- `mmdl/{stage}/alertEmails`
- fallback: `mmdl/default/alertEmails`

Expected secret JSON format:

```json
{
  "emails": ["user1@example.com", "user2@example.com"]
}
```

Create the stage-specific secret (first time):

```bash
aws secretsmanager create-secret \
  --region us-east-1 \
  --name mmdl/main/alertEmails \
  --secret-string '{"emails":["user1@example.com","user2@example.com"]}'
```

Update an existing secret:

```bash
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id mmdl/main/alertEmails \
  --secret-string '{"emails":["user1@example.com","user2@example.com"]}'
```

After deploy, each recipient must confirm the SNS subscription email.

### Where To View Alerts In AWS Console

- SNS topic: `Alerts-wms-alerts-<stage>`
- CloudWatch alarms: filter by name prefix `wms-connector-<stage>-`
- CloudWatch metrics namespaces:
  - `wms-connector-<stage>/Health`
  - `wms-connector-<stage>/ConnectorLogs`
- EventBridge rules: ECS task stop and ECS service error rules in stack `wms-connector-<stage>`
- Connector log group: `/aws/fargate/wms-connector-<stage>-kafka-connect`

## Testing And Quality Gates

Current automated quality checks:

- Pre-commit hooks workflow on pull requests (`.github/workflows/pre-commit.yml`)
- Dependency review workflow on pull requests (`.github/workflows/dependency-review.yml`)

Current gap:

- No automated unit/integration coverage reporting pipeline is configured yet.
- The coverage badge is intentionally a placeholder (`coverage: planned`).

## Where To Find More Information

| Path | What it contains |
| --- | --- |
| `docs/wms-config-details.md` | Broader CDC planning, Oracle prerequisites, and environment notes (includes historical Debezium design context). |
| `connector-config/wms-oracle-cdc.json` | Connector configuration template/reference artifact. |
| `lambda/connect-register.ts` | Runtime connector registration logic and JDBC connector config generation. |
| `lambda/connect-health.ts` | Health-check, auto-restart budget, and CloudWatch metric publishing logic. |
| `src/environment-config.ts` | Stage validation, stage sizing, and secrets fallback loading. |
| `src/cdk/wms-connector-stack.ts` | ECS service, Lambda, alarm, EventBridge, and connector deployment resources. |
| `src/cdk/wms-alerts-stack.ts` | SNS topic and email subscription setup for alerts. |
| `.github/workflows/deploy.yml` | Deploy workflow for `main`, `val`, `production`. |
| `.github/workflows/pre-commit.yml` | Pull request pre-commit checks. |
| `.github/workflows/dependency-review.yml` | Pull request dependency vulnerability review. |

## Badge References

- [GitHub Docs: Adding a workflow status badge](https://docs.github.com/actions/monitoring-and-troubleshooting-workflows/monitoring-workflows/adding-a-workflow-status-badge)
- [GitHub Docs: Workflow syntax](https://docs.github.com/actions/reference/workflows-and-actions/workflow-syntax)
- [Shields.io badge docs](https://shields.io/badges)
- [Codecov status badges](https://docs.codecov.com/docs/status-badges)
