## 1. Oracle CDC prerequisites

- [x] 1.1 Document Oracle prerequisites (ARCHIVELOG, supplemental logging, CDC user and grants) in docs (e.g., docs/wms-config-details.md) for DBA coordination
- [x] 1.2 Coordinate with DBA for Oracle setup per environment (main, val, production)
- [x] 1.3 Create or verify dbInfo secrets in Secrets Manager (wms/{stage}/dbInfo or wms/default/dbInfo) per environment when credentials are available

## 2. Infrastructure and environment config

- [x] 2.1 Add environment-config module: SecretPaths with wms/ prefix (brokerString, dbInfo), getEnvironmentConfig(stage) with fallback to main, getSecretWithFallback, loadEnvironmentSecrets, getFullEnvironmentConfig
- [x] 2.2 Add environmentConfigs for main, val, production (taskCpu, taskMemory, connectContainerCpu, connectContainerMemory; use Appian resource configs as starting point, mapping master to main)
- [x] 2.3 Create CDK stack for Kafka Connect on ECS Fargate (service prefix wms-connector-{stage})
- [x] 2.4 Configure security groups: egress to Oracle (1521) and MSK; ingress as needed for Connect REST API
- [x] 2.5 Wire brokerString and dbInfo resolution from Secrets Manager at deploy or runtime into Connect worker and connector config

## 3. Connector configuration

- [x] 3.1 Create Debezium Oracle connector config: schema include MMDL,WMS; table include list (four tables); tasks.max=1; snapshot.mode=initial; schema history Kafka topic
- [x] 3.2 Ensure non-namespaced topics for main, val, production are created (via bigmac, CDK, or Connect/Debezium auto-create); never delete these topics
- [x] 3.3 Configure topic namespacing: no prefix for main/val/production; topic namespace for ephemeral stages only
- [x] 3.4 Deploy or register connector (e.g., via Connect REST API or CDK) for each stage

## 4. Monitoring and verification

- [x] 4.1 Expose or integrate connector health (Connect REST API, connector status RUNNING/FAILED)
- [x] 4.2 Add replication lag visibility (metrics, e.g., JMX or CloudWatch) and optional alerting for high lag
- [x] 4.3 Add per-environment deployment verification (main, val, production, and ephemeral): connector status and optionally topics receiving events

## 5. Ephemeral branch cleanup

- [x] 5.1 Document ephemeral lifecycle: deploy with stack, teardown with stack; pipeline runs destroy when branch is deleted or ephemeral environment retired
- [x] 5.2 Ensure stack destroy removes Connect service and connector config for ephemeral stages (no manual cleanup required)
- [x] 5.3 Optional: add namespaced ephemeral topic deletion on stack destroy; ensure deletion logic never targets non-namespaced (main/val/prod) topics
