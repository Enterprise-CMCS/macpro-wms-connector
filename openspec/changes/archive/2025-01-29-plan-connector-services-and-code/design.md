## Context

This repo will implement a CDC pipeline from the WMS Oracle database to the BigMAC MSK Kafka cluster. MSK lives in the same AWS account as this connector and is reachable using the correct broker string (resolved from Secrets Manager per stage). There is no application code yet; we are planning the services and code. Capture is CDC-only via Debezium (Oracle redo/LogMiner)—no changes to the WMS Java application. Reference implementations are **macpro-appian-connector** (CDK, ECS, environment config) and **bigmac** (MSK, topics). Oracle and Debezium details are in `docs/wms-config-details.md`.

## Goals / Non-Goals

**Goals:**

- Run Kafka Connect (with Debezium Oracle connector) on ECS Fargate, using CDK (TypeScript) and patterns from macpro-appian-connector.
- Support main (dev), val, and production plus ephemeral branches with stage-based naming, topic namespacing, and secrets fallback.
- Secure connectivity: security groups for Oracle (1521) and Kafka; credentials from Secrets Manager with fallback path `wms/{stage}/...` → `wms/default/...`.
- Design for connector health monitoring and replication-lag visibility; plan ephemeral-branch topic/config cleanup.

**Non-Goals:**

- Modifying the WMS Java app or adding Kafka producers in-app.
- Running Oracle, GoldenGate, or DMS in this repo; we consume an existing Oracle DB.
- Implementing downstream consumers or schema registry in this repo (only connector → MSK).

## Decisions

### 1. Infrastructure: CDK + ECS Fargate for Kafka Connect

- **Choice:** Use AWS CDK (TypeScript) to define ECS Fargate services that run Kafka Connect workers, following macpro-appian-connector patterns.
- **Rationale:** Aligns with existing BigMAC/macpro ecosystem; Fargate avoids managing EC2; Connect runs as a distributed cluster (multiple workers) or single-worker per stage depending on sizing.
- **Alternative:** Managed Connect (e.g., MSK Connect). Rejected for this plan to keep control and consistency with appian-connector; can be revisited later.

### 2. Stage-based configuration: mimic Appian connector pattern

- **Choice:** Use an environment-config pattern that mirrors **macpro-appian-connector** for reliability and consistency across connectors. Use the `wms/` prefix instead of `appian/` but follow the same structure: **SecretPaths** (e.g., `wms/{stage}/brokerString`, `wms/default/brokerString`; `wms/{stage}/dbInfo`, `wms/default/dbInfo`), **EnvironmentConfig** (taskCpu, taskMemory, connectContainerCpu, connectContainerMemory, and any container-specific fields needed for WMS), **getEnvironmentConfig(stage)** with fallback to a default stage (main), **getSecretWithFallback(primary, default)**, **loadEnvironmentSecrets(stage)**, and **getFullEnvironmentConfig(stage)** combining static config with secrets from Secrets Manager.
- **Rationale:** Aligns with existing connector; reduces cognitive load and operational drift; Appian pattern is proven. Use Appian’s resource configurations (main, val, production) as a **starting point** for WMS connector ECS sizing—map Appian’s “master” to “main” for WMS; adapt as needed (e.g., omit or add container types like Instant Client if applicable).
- **Alternative:** Separate or ad-hoc config; rejected in favor of pattern consistency.

### 3. Secrets: stage-first with fallback to `wms/default/...`

- **Choice:** Resolve all connector-related secrets using the same pattern as Appian: look up `wms/{stage}/<secret-name>` first; if the secret does not exist, use `wms/default/<secret-name>`. This applies to the MSK broker string and to Oracle (WMS) database credentials.
- **Rationale:** Ephemeral branches can share default values when stage-specific secrets are not created; production and other stages can override with their own secrets when needed.

**Broker string**

- MSK is in the same account as this connector and is accessible with the correct broker string.
- Secret name: **brokerString**. Resolve in order: (1) `wms/{stage}/brokerString`, (2) `wms/default/brokerString`. The default secret is available in all three named stages (main, val, production), so stages can share one cluster unless a stage-specific secret is created.
- **Implementation:** Use SecretPaths and getSecretWithFallback (as in Appian); inject the resolved broker string into the Connect worker config.

**Oracle (WMS) database credentials**

- Secret name: **dbInfo** (to align with Appian connector). Paths: **`wms/{stage}/dbInfo`** first, then **`wms/default/dbInfo`**. Structure: a JSON object with whatever fields are needed to access the Oracle database (e.g., ip/host, port, db/service name, user, password, schema—exact keys to match what the Debezium Oracle connector expects; Appian uses `DbConfig`: ip, port, db, user, password, schema).
- **Implementation:** CDK or startup logic references the secret by path; the connector reads the JSON at runtime. No credentials in code or config files; all from Secrets Manager.

### 4. Security groups: Oracle (1521) and Kafka (MSK)

- **Choice:** ECS task security group allows egress to: (1) Oracle DB on port 1521 (VPC or peered), (2) MSK bootstrap servers (typically 9092 or 9094 for TLS). Ingress only from load balancer or internal if needed for Connect REST API.
- **Rationale:** Least privilege; connector only needs Oracle and Kafka; no public ingress unless Connect REST is exposed.
- **Detail:** Follow appian-connector and bigmac patterns for VPC, subnets, and MSK access (IAM or SASL/SSL as per bigmac).

### 5. Topic namespacing: no prefix for main/val/prod, prefix for ephemeral

- **Choice:** For main, val, production: `database.server.name` and topic names have no extra prefix (e.g., `wms.MMDL.PLAN_BASE_WVR_TBL`). For ephemeral branches: set Debezium/Kafka Connect topic namespace (or equivalent) so topics are prefixed (e.g., `{stage}.wms.MMDL...`) and internal topics use `mgmt.connect.wms-connector-{stage}.*`.
- **Rationale:** Stable names in shared environments; isolation for feature branches without affecting main/val/prod.
- **Implementation:** Driven by environment-config (topic prefix / namespace config per stage).

**Topic lifecycle: create vs delete**

- **Non-namespaced topics (main, val, production):** These topics must be **created** (so they exist for the connector) and must **never be deleted** by this connector or its pipelines. Ensure creation via stack/topic management (e.g., bigmac or CDK) or by relying on Connect/Debezium auto-create; any automation in this repo must never delete non-namespaced topics.
- **Namespaced topics (ephemeral only):** Only these may be deleted. When an ephemeral stack is destroyed, cleanup may include deleting the namespaced topics for that stage so they do not remain in MSK. Non-namespaced topics are out of scope for any delete logic.
- **Additional consideration:** Implementation must clearly distinguish “namespaced ephemeral” vs “non-namespaced main/val/prod” so that deletion logic is only ever applied to namespaced ephemeral topics. Creation of main/val/prod topics may require coordination with bigmac or explicit topic creation in the stack.

### 6. Ephemeral branch cleanup: automatic on stack destroy

- **Choice:** Ephemeral environments are automatically cleaned up when the stack is destroyed. Running `cdk destroy` (or equivalent) for an ephemeral stage removes the Connect service, connector config, and any stack-managed resources. Optionally, namespaced ephemeral topics may be deleted as part of this cleanup; non-namespaced topics are never deleted (see Decision 5).
- **Rationale:** Ephemeral stacks are created per branch; destroying the stack should leave no connector or Connect resources behind. Only namespaced ephemeral topics are eligible for deletion; main/val/prod topics are permanent.
- **Detail:** Document in environment-and-topics spec that ephemeral lifecycle is “deploy with stack, teardown with stack”; pipeline should run destroy when the branch is deleted or the ephemeral environment is retired. Any topic deletion on destroy must target only namespaced ephemeral topics.

### 7. Resource sizing: startup-focused; production never runs out

- **Choice:** Per-stage CPU and memory SHALL be defined in environment-config (following Appian’s `EnvironmentConfig`: taskCpu, taskMemory, connectContainerCpu, connectContainerMemory, etc.). Use **Appian’s resource configurations (main, val, production) as a starting point** for WMS—there is no “master” stage; **main** is the dev environment (current branch/stage). Sizing SHALL be sufficient for the **initial startup phase**, which can be resource-intensive (snapshot, schema discovery); runtime usage may be lower. **Production** SHALL be well-sized so it never runs out of resources. **Val** will have the least traffic but still needs enough resources to start correctly. **Main** (dev) may receive more use than val or production in practice; size accordingly.
- **Rationale:** Startup failures are costly; ensuring enough resources for startup avoids flaky deployments. Production must not run out under load; val is lowest traffic; main (dev) usage patterns may differ. Aligning with Appian resource configs gives a proven baseline (map Appian “master” to “main” for WMS).
- **Implementation:** Same pattern as Appian: `environmentConfigs: Record<string, EnvironmentConfig>` keyed by stage **main**, val, production (no master); `getEnvironmentConfig(stage)` with fallback to **main**; adapt values for WMS if needed (e.g., add/remove container types like Instant Client).

### 8. Connector configuration (Debezium Oracle)

- **Choice:** One connector per stage; `tasks.max` = 1 for Oracle connector; initial snapshot; schema history stored in a Kafka topic (e.g., `wms.schema-changes` or stage-scoped equivalent). Table list: WMS and MMDL `PLAN_BASE_WVR_TBL`, `PLAN_WVR_RVSN_TBL`.
- **Rationale:** Single task per Oracle source is standard; snapshot ensures initial state; schema history topic required by Debezium for recovery.
- **Alternatives:** Multiple tasks for same Oracle DB—rejected for simplicity; schema registry in this repo—out of scope (consumer-facing).

## Risks / Trade-offs

| Risk | Mitigation |
|------|-------------|
| Oracle LogMiner or redo issues cause connector failure | Connector retry and dead-letter/alerting; monitoring spec defines health checks and lag alerts; DBA coordination for ARCHIVELOG and supplemental logging. |
| MSK or network unreachable | Same monitoring/alerting; run connector in same VPC as MSK (broker string from Secrets Manager); document dependency on bigmac/MSK. |
| Ephemeral resources left behind | Stack destroy removes connector and Connect resources automatically; only namespaced ephemeral topics may be deleted on destroy; non-namespaced topics are never deleted. |
| Secrets rotation | Use Secrets Manager; connector restarts on credential refresh (or document restart procedure). |
| Per-environment resource sizing | environment-config defines CPU/memory per stage (using Appian resource configs as starting point); sizing SHALL be sufficient for initial startup (resource-intensive) and production SHALL be well-sized so it never runs out; val has least traffic; dev may receive more use than val or production. |

## Migration Plan

1. **Main (dev):** Deploy CDK stack for main; create connector config; verify snapshot and streaming to MSK; validate topic names and schema history.
2. **Val / Production:** Repeat with val and production configs (different Oracle endpoints, secrets paths, sizing); no namespace prefix.
3. **Ephemeral:** Deploy from branch pipeline with stage name; use topic namespace; test; on branch delete, destroy the stack so ephemeral resources (connector, Connect) are automatically cleaned up.
4. **Rollback:** Scale connector task count to 0 or revert connector config via Connect REST API; optionally revert CDK stack. No DB rollback (read-only CDC).

## Open Questions

- Exact keys in the `dbInfo` JSON secret (e.g., ip/host, port, db/serviceName, user, password, schema) to match what the Debezium Oracle connector expects—to be finalized when credentials are available; Appian’s DbConfig (ip, port, db, user, password, schema) is a reference.
- Oracle host/service name and network path (VPC peering, Direct Connect, etc.) per stage—to be filled when credentials and connectivity are known.
- How main/val/prod topics are created (e.g., via bigmac, CDK, or Connect auto-create) so they exist before the connector runs; ensure that path never triggers deletion of those topics.
