---
name: Oracle CDC to Kafka
overview: Implement Change Data Capture (CDC) to stream Oracle database changes to Kafka using Debezium via Kafka Connect, enabling real-time event streaming from the WMS Oracle database to downstream consumers.
todos:
  - id: oracle-prep
    content: "Configure Oracle: enable supplemental logging, create CDC user with required privileges"
    status: pending
  - id: kafka-connect
    content: Set up Kafka Connect cluster with Debezium Oracle connector plugin
    status: pending
  - id: connector-config
    content: Create and deploy Debezium connector configuration for target tables
    status: pending
  - id: test-cdc
    content: Test CDC pipeline with sample INSERT/UPDATE/DELETE operations
    status: pending
  - id: monitoring
    content: Set up monitoring for connector health and replication lag
    status: pending
isProject: false
---

# Oracle CDC to Kafka Integration Plan

## Current State Summary

- **Database**: Oracle 11g+ with three schemas (`WMS`, `MMDL`, `SHAREDDATA`)
- **Application Server**: IBM WebSphere with existing JMS messaging
- **Target Tables**: `PLAN_BASE_WVR_TBL` (waiver master), `PLAN_WVR_RVSN_TBL` (waiver revisions/lifecycle)
- **Target Schemas**: Both `MMDL` and `WMS` (for safety/completeness)
- **Connection**: JNDI DataSource `jdbc/WMSdataSource`

## Recommended Approach: Debezium Oracle Connector

**Debezium** is the most widely-adopted open-source CDC solution for Oracle-to-Kafka streaming. It captures row-level changes from Oracle redo logs and publishes them as events to Kafka topics.

### Architecture

```
Oracle DB (WMS/MMDL schemas)
    │
    ▼ (LogMiner reads redo logs)
Debezium Oracle Connector
    │
    ▼ (Kafka Connect)
Kafka Cluster
    │
    ▼ (Topics per table)
Downstream Consumers
```

### Prerequisites

1. **Oracle Configuration**:
  - Enable ARCHIVELOG mode (required for LogMiner)
  - Enable supplemental logging at database/table level
  - Create a dedicated CDC user with appropriate privileges
2. **Kafka Connect**:
  - Kafka Connect cluster (distributed mode recommended)
  - Debezium Oracle connector plugin installed
  - Schema Registry (recommended for Avro serialization)
3. **Network**:
  - Kafka Connect workers must reach Oracle DB (port 1521)
  - Kafka Connect workers must reach Kafka brokers

### DBA coordination

This document is the reference for **DBA coordination** when enabling Oracle CDC for the WMS connector. Required Oracle prerequisites:

- **ARCHIVELOG mode** — Required for LogMiner; must be enabled on the database.
- **Supplemental logging** — At database level (minimal) and at table level (full) for all four target tables in both MMDL and WMS schemas (see Step 1 below).
- **Dedicated CDC user** — A user with LOGMINING (or equivalent), SELECT on the four target tables, and any other privileges required by the Debezium Oracle connector (e.g., SELECT_CATALOG_ROLE, FLASHBACK ANY TABLE, SELECT ANY TRANSACTION). No application or connector code in this repo configures Oracle; all setup is done by DBA per environment.

Environments: **main** (dev), **val**, and **production**. Oracle setup and CDC user creation should be coordinated per environment (main, val, production) as part of the deployment process for new environments.

### DBA coordination checklist

- [ ] **main (dev):** ARCHIVELOG enabled; supplemental logging at DB and table level; CDC user created with required grants; credentials stored in Secrets Manager (see Secrets Manager section).
- [ ] **val:** Same as main; coordinate with DBA for val Oracle instance.
- [ ] **production:** Same as main/val; coordinate with DBA for production Oracle instance; ensure production CDC user and connectivity are approved.

---

## Implementation Steps

### Step 1: Oracle Database Preparation

Run these commands as a DBA user:

```sql
-- Enable supplemental logging (minimal required)
ALTER DATABASE ADD SUPPLEMENTAL LOG DATA;

-- For specific tables, add full supplemental logging (both schemas)
-- MMDL schema
ALTER TABLE MMDL.PLAN_BASE_WVR_TBL ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
ALTER TABLE MMDL.PLAN_WVR_RVSN_TBL ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
-- WMS schema
ALTER TABLE WMS.PLAN_BASE_WVR_TBL ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;
ALTER TABLE WMS.PLAN_WVR_RVSN_TBL ADD SUPPLEMENTAL LOG DATA (ALL) COLUMNS;

-- Create CDC user
CREATE USER cdc_user IDENTIFIED BY <password>;
GRANT CREATE SESSION TO cdc_user;
GRANT SELECT ON V_$DATABASE TO cdc_user;
GRANT FLASHBACK ANY TABLE TO cdc_user;
GRANT SELECT ANY TABLE TO cdc_user;
GRANT SELECT_CATALOG_ROLE TO cdc_user;
GRANT EXECUTE_CATALOG_ROLE TO cdc_user;
GRANT SELECT ANY TRANSACTION TO cdc_user;
GRANT LOGMINING TO cdc_user;  -- Oracle 12c+

-- Grant access to target tables (both schemas)
GRANT SELECT ON MMDL.PLAN_BASE_WVR_TBL TO cdc_user;
GRANT SELECT ON MMDL.PLAN_WVR_RVSN_TBL TO cdc_user;
GRANT SELECT ON WMS.PLAN_BASE_WVR_TBL TO cdc_user;
GRANT SELECT ON WMS.PLAN_WVR_RVSN_TBL TO cdc_user;
```

### Step 2: Kafka Connect Configuration

Create a connector configuration file `oracle-cdc-connector.json`:

```json
{
  "name": "wms-oracle-cdc",
  "config": {
    "connector.class": "io.debezium.connector.oracle.OracleConnector",
    "tasks.max": "1",
    "database.hostname": "<oracle-host>",
    "database.port": "1521",
    "database.user": "cdc_user",
    "database.password": "<password>",
    "database.dbname": "<service-name>",
    "database.server.name": "wms",
    "schema.include.list": "MMDL,WMS",
    "table.include.list": "MMDL.PLAN_BASE_WVR_TBL,MMDL.PLAN_WVR_RVSN_TBL,WMS.PLAN_BASE_WVR_TBL,WMS.PLAN_WVR_RVSN_TBL",
    "database.history.kafka.bootstrap.servers": "<kafka-brokers>",
    "database.history.kafka.topic": "wms.schema-changes",
    "include.schema.changes": "true",
    "snapshot.mode": "initial"
  }
}
```

### Step 3: Deploy Connector

```bash
# Deploy via Kafka Connect REST API
curl -X POST http://kafka-connect:8083/connectors \
  -H "Content-Type: application/json" \
  -d @oracle-cdc-connector.json
```

### Step 4: Topic Naming Convention

Debezium creates topics following this pattern:

- `wms.MMDL.PLAN_BASE_WVR_TBL` — Waiver master records (MMDL schema)
- `wms.MMDL.PLAN_WVR_RVSN_TBL` — Waiver revisions/lifecycle (MMDL schema)
- `wms.WMS.PLAN_BASE_WVR_TBL` — Waiver master records (WMS schema)
- `wms.WMS.PLAN_WVR_RVSN_TBL` — Waiver revisions/lifecycle (WMS schema)

### Topic namespacing and lifecycle

- **main, val, production:** No topic namespace prefix. Data topics are e.g. `wms.MMDL.PLAN_BASE_WVR_TBL`. These topics **must be created** (via bigmac, CDK, or Connect/Debezium auto-create) and **must never be deleted** by this connector or its pipelines.
- **Ephemeral stages:** Use a topic namespace so topics are prefixed (e.g. `{stage}.wms.MMDL.PLAN_BASE_WVR_TBL`). Only namespaced ephemeral topics may be deleted when the ephemeral stack is destroyed; never delete non-namespaced (main/val/prod) topics.

### Ephemeral stage (Git branch name) and validation

- **Ephemeral stage** is the Git branch name used when deploying or synthesizing for a branch environment. Only **main**, **val**, and **production** are named stages with no topic prefix; any other stage is ephemeral and gets a topic namespace equal to the validated stage value.
- **Stage is required** when deploying or synthesizing for an ephemeral environment. Pass stage via CDK context, e.g. `cdk synth -c stage=feature-xyz` or `cdk deploy -c stage=feature-xyz`. If stage is missing for a non–main/val/production deploy, or if the stage value is invalid, synth/deploy fails with a clear error.
- **Validation rules** (align with Kafka topic naming and CDK/ECS naming): stage must match `[a-zA-Z0-9._-]`, length 1–64. Slash, space, and other characters are **rejected** (no normalization). Use branch names that satisfy this pattern (e.g. `feature-xyz`, `fix-123`) so that topic names and ECS resource names remain valid.

Connector config template with schema include, table list, and snapshot/schema history: see `connector-config/wms-oracle-cdc.json` in this repo. Populate `database.*` and bootstrap servers from the **dbInfo** and **brokerString** secrets at runtime. For ephemeral, use the **TOPIC_NAMESPACE** environment variable (set by the stack) to prefix data and Connect internal topics.

---

## Alternative Approaches


| Approach                  | Pros                                      | Cons                        | Best For                           |
| ------------------------- | ----------------------------------------- | --------------------------- | ---------------------------------- |
| **Debezium**              | Open-source, low latency, schema tracking | Requires LogMiner setup     | Most use cases                     |
| **Oracle GoldenGate**     | Enterprise support, Oracle-backed         | Expensive licensing         | Large enterprises with existing GG |
| **AWS DMS**               | Managed service, easy setup               | AWS-only, higher latency    | AWS-native architectures           |
| **JDBC Source Connector** | Simple, no Oracle changes                 | Polling-based, not true CDC | Low-frequency changes              |


---

## Key Files to Modify (if adding Kafka producer to Java app)

If you also want the application to produce events directly (alongside CDC):

- `[WMS/src/dao/DataRequest.java](WMS/src/dao/DataRequest.java)` - Add Kafka producer after successful DB operations
- `[WMSMDBEJB/ejbModule/jmsgateway/DBMessageHandlerBean.java](WMSMDBEJB/ejbModule/jmsgateway/DBMessageHandlerBean.java)` - Potential hook point for publishing events

---

## Secrets Manager (AWS)

The connector resolves secrets using a **stage-first, then default** pattern. Look up `mmdl/{stage}/<secret-name>` first; if missing, use `mmdl/default/<secret-name>`.

| Secret name   | Paths                                                                 | Purpose |
|---------------|-----------------------------------------------------------------------|---------|
| **brokerString** | `mmdl/{stage}/brokerString` → `mmdl/default/brokerString`               | MSK bootstrap broker string for Kafka Connect. Default is available for main, val, production; stage-specific overrides when a different cluster is used. |
| **dbInfo**    | `mmdl/{stage}/dbInfo` → `mmdl/default/dbInfo`                            | Oracle connection details. JSON object with fields required by the Debezium Oracle connector (e.g., host/IP, port, db/service name, user, password, schema). Create or verify these secrets per environment when CDC credentials are available. |

Example **dbInfo** JSON shape (align with Debezium Oracle connector and Appian DbConfig where applicable):

```json
{
  "ip": "<oracle-host>",
  "port": "1521",
  "db": "<service-name>",
  "user": "cdc_user",
  "password": "<secret>",
  "schema": "<default-schema-if-needed>"
}
```

---

## Security Considerations

- Store CDC credentials in a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)
- Use SSL/TLS for Kafka Connect to Oracle and Kafka connections
- Implement Kafka ACLs to restrict topic access
- Consider data masking for sensitive fields (PII) using Kafka Connect SMTs

---

## Monitoring

- **Connector health:** Expose or integrate connector status via Kafka Connect REST API (e.g. `GET /connectors/wms-oracle-cdc/status`). Connector state RUNNING/FAILED should be visible for alerting.
- **Replication lag:** Add replication lag visibility (e.g. JMX or CloudWatch). Support alerting when lag exceeds a threshold (per-environment thresholds optional).
- **Per-environment verification:** After deploy for main, val, production, or ephemeral: verify connector status RUNNING and optionally that topics are receiving events.

## Ephemeral lifecycle

- **Deploy with stack, teardown with stack.** Ephemeral environments are created when the CDK stack for that stage is deployed and cleaned up when the stack is destroyed. No separate manual cleanup is required for the Connect service or connector config.
- **Pipeline:** When the branch is deleted or the ephemeral environment is retired, run `cdk destroy` for that stage so connector and Connect resources are removed automatically.
- **Topic cleanup (optional):** Namespaced ephemeral topics may be deleted as part of stack destroy. Deletion logic must **never** target non-namespaced (main/val/prod) topics.

