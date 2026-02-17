# macpro-wms-connector

WMS Oracle CDC to Kafka connector: streams change data from the WMS Oracle database to Kafka via **Debezium** and Kafka Connect, running on AWS ECS Fargate. This project uses **Yarn** (Classic 1.x) for install and scripts; npm is not supported.

## What this does

The connector captures changes from Oracle (redo/LogMiner) using the Debezium Oracle connector and publishes them to Kafka. Target tables include `PLAN_BASE_WVR_TBL` and `PLAN_WVR_RVSN_TBL` in MMDL and WMS schemas. Infrastructure is defined with AWS CDK (TypeScript). Credentials and broker configuration come from AWS Secrets Manager (see [Configuration](#configuration)).

## Prerequisites

- **Node.js** 18 or later
- **Yarn** (Classic 1.x) — use Yarn for all install and script commands; npm is not supported
- **AWS CLI** and **CDK** (if you plan to deploy): bootstrapped CDK environment and credentials for the target account/region

## Commands

| Command | Description |
|--------|-------------|
| `yarn install` | Install dependencies |
| `yarn build` | Compile TypeScript |
| `yarn synth` | Synthesize CDK stack (generates CloudFormation); creates `cdk.context.json` locally if missing |
| `yarn cdk` | Run CDK CLI (e.g. `yarn cdk deploy`, `yarn cdk diff`) |

## First run

1. Clone the repo and `cd` into it.
2. Run `yarn install`.
3. Run `yarn build` to compile.
4. Run `yarn synth` to synthesize the stack (CDK will create or update `cdk.context.json` locally; this file is gitignored and not committed).

For deploy, configure AWS credentials and run `yarn cdk deploy` with the desired stage (e.g. `-c stage=main`). See [docs/wms-config-details.md](docs/wms-config-details.md) for stages and validation.

## Configuration

Oracle CDC setup, Debezium config, stages (main/val/production and ephemeral), topic namespacing, and secrets (brokerString, dbInfo) are described in **[docs/wms-config-details.md](docs/wms-config-details.md)**.

## Alerting and health monitoring

The deployment now includes a dedicated alerts stack and connector health checks:

- `wms-alerts-{stage}`:
  - SNS topic: `Alerts-wms-alerts-{stage}`
  - Email subscriptions loaded from Secrets Manager
- `wms-connector-{stage}`:
  - 10-minute scheduled health Lambda (`connect-health`)
  - ECS failure EventBridge rules routed to SNS
  - CloudWatch alarms for connector health metrics and log error patterns
  - Auto-restart budget tracked in DynamoDB: max 3 restart attempts per rolling 60 minutes

Health checks include:

- Kafka Connect API reachability (`GET /`)
- Connector and task state (`GET /connectors/wms-oracle-cdc/status`)
- ECS service desired vs running count
- TCP reachability to Oracle DB host:port from VPC

## Alert email secret format

Per-stage secret:

- `mmdl/{stage}/alertEmails`

Fallback secret:

- `mmdl/default/alertEmails`

Required JSON shape:

```json
{
  "emails": [
    "user1@example.com",
    "user2@example.com"
  ]
}
```

For `main`, create/update:

```bash
aws secretsmanager create-secret \
  --profile default --region us-east-1 \
  --name mmdl/main/alertEmails \
  --secret-string '{"emails":["benjamin.paige@cms.hhs.gov"]}'
```

If it already exists:

```bash
aws secretsmanager put-secret-value \
  --profile default --region us-east-1 \
  --secret-id mmdl/main/alertEmails \
  --secret-string '{"emails":["benjamin.paige@cms.hhs.gov"]}'
```

## Deployment order

1. Deploy `wms-alerts-{stage}` (created automatically from app entrypoint).
2. Deploy `wms-connector-{stage}` (receives `alertsTopicArn` from alerts stack).
3. Confirm SNS email subscription links for all recipients.

Example:

```bash
npx cdk deploy wms-alerts-main wms-connector-main -c stage=main --require-approval never
```

## Ops runbook (quick checks)

1. Check stack status:
   - `aws cloudformation describe-stacks --profile default --region us-east-1 --stack-name wms-connector-main`
2. Check ECS steady state:
   - `aws ecs describe-services --profile default --region us-east-1 --cluster wms-connector-main --services wms-connector-main`
3. Check health Lambda logs:
   - `aws logs tail --profile default --region us-east-1 /aws/lambda/wms-connector-main-ConnectHealth --since 30m --format short`
4. Check connector logs:
   - `aws logs tail --profile default --region us-east-1 /aws/fargate/wms-connector-main-kafka-connect --since 30m --format short`
5. Validate SNS subscriptions:
   - `aws sns list-subscriptions-by-topic --profile default --region us-east-1 --topic-arn <alerts-topic-arn>`
