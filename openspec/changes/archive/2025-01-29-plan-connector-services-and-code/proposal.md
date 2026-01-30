## Why

We need to stream WMS Oracle database changes to the BigMAC Kafka cluster in real time so downstream consumers can react to waiver data without polling or modifying the existing Java application. This change plans the services and code for a CDC-only connector: all capture happens via Debezium reading Oracle redo logs; we do not add Kafka producers to the WMS app.

## What Changes

- **Infrastructure**: Plan AWS CDK (TypeScript) and ECS Fargate to run Kafka Connect with the Debezium Oracle connector, targeting BigMAC MSK.
- **Connector configuration**: Plan Debezium Oracle connector config for target tables (`PLAN_BASE_WVR_TBL`, `PLAN_WVR_RVSN_TBL`) in WMS and MMDL schemas, including initial snapshot and schema history.
- **Environment and topic strategy**: Plan main (dev), val, and production plus ephemeral-branch deployment with stage-based service naming, topic namespacing, and secrets fallback (`wms/{stage}/...` → `wms/default/...`).
- **Oracle prerequisites**: Document and coordinate Oracle setup (ARCHIVELOG, supplemental logging, dedicated CDC user with LogMiner privileges) with DBA.
- **Monitoring**: Plan connector health and replication-lag monitoring (e.g., Connect REST API, metrics, alerts).

## Capabilities

### New Capabilities

- `cdc-connector-deployment`: Kafka Connect cluster on ECS Fargate with Debezium Oracle connector; connector config for WMS/MMDL target tables; snapshot and schema-history behavior.
- `environment-and-topics`: Stage-based configuration (main, val, production and ephemeral branches); topic naming with and without namespace; secrets path and fallback; ephemeral-branch isolation and cleanup.
- `oracle-cdc-prerequisites`: Oracle prerequisites (ARCHIVELOG, supplemental logging, CDC user and grants); coordination and documentation for DBA; no code in this repo.
- `connector-monitoring`: Connector health, replication lag, and failure detection; integration with CloudWatch/alerting.

### Modified Capabilities

- _(None; no existing specs in this repo.)_

## Impact

- **New code**: This repo will gain CDK stacks (TypeScript), environment/config modules, and Debezium connector configuration; patterns will follow macpro-appian-connector and bigmac.
- **AWS**: ECS Fargate, networking (Oracle 1521, Kafka), Secrets Manager, KMS, CloudWatch; consumption of BigMAC MSK.
- **External coordination**: Oracle DBA for supplemental logging and CDC user; dependency on BigMAC MSK and topic/ACL setup.
- **Docs**: `docs/wms-config-details.md` remains the reference for Oracle CDC and Debezium config; this change adds a structured plan (specs, design, tasks) in openspec.
