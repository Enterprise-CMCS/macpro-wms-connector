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
