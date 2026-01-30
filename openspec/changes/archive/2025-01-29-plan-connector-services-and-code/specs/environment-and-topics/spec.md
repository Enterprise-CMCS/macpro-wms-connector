## ADDED Requirements

### Requirement: Stage-based configuration via environment-config

The system SHALL use an environment-config pattern that mirrors macpro-appian-connector (e.g., SecretPaths with `wms/` prefix, getEnvironmentConfig(stage), getSecretWithFallback, loadEnvironmentSecrets, getFullEnvironmentConfig). Config SHALL map stage (**main** (dev environment, current branch), **val**, **production**, or ephemeral branch name) to: service prefix `wms-connector-{stage}`, broker string secret path, dbInfo secret path, resource sizing (taskCpu, taskMemory, connectContainerCpu, connectContainerMemory, etc.), and topic namespace (if any). There SHALL be no “master” stage or branch; main is the dev environment. Stage SHALL be determined from deployment context (e.g., branch name or pipeline variable).

#### Scenario: Main/val/production use stable naming

- **GIVEN** stage is main (dev), val, or production
- **WHEN** configuration is resolved
- **THEN** service prefix SHALL be `wms-connector-{stage}` (e.g., `wms-connector-main`)
- **AND** topic namespace SHALL be empty (no prefix on topic names)

#### Scenario: Ephemeral stage uses namespaced topics

- **GIVEN** stage is an ephemeral branch name (e.g., feature-xyz)
- **WHEN** configuration is resolved
- **THEN** service prefix SHALL be `wms-connector-{stage}`
- **AND** topic namespace SHALL be set so that data and internal topics are prefixed (e.g., `{stage}.wms.MMDL.*`, `mgmt.connect.wms-connector-{stage}.*`)

### Requirement: Secrets resolved with stage-first fallback to default

The system SHALL resolve Secrets Manager secrets using the same pattern as macpro-appian-connector: try `wms/{stage}/<secret-name>` first; if that secret does not exist, use `wms/default/<secret-name>`. This SHALL apply to the broker string and to Oracle dbInfo.

#### Scenario: Broker string resolution

- **GIVEN** stage is set (e.g., val)
- **WHEN** the system needs the MSK broker string
- **THEN** it SHALL look up `wms/{stage}/brokerString` first
- **AND** if that secret does not exist, it SHALL use `wms/default/brokerString`
- **AND** the resolved broker string SHALL be used for Kafka Connect bootstrap servers

#### Scenario: Oracle dbInfo resolution

- **GIVEN** stage is set
- **WHEN** the system needs Oracle connection credentials
- **THEN** it SHALL look up `wms/{stage}/dbInfo` first
- **AND** if that secret does not exist, it SHALL use `wms/default/dbInfo`
- **AND** the resolved secret SHALL be a JSON object with fields required for Oracle access (e.g., ip, port, db, user, password, schema—aligned with Appian DbConfig where applicable)

### Requirement: Non-namespaced topics are created and never deleted

Topics that are not namespaced (used for main, val, and production) SHALL be created so they exist for the connector. The system and its pipelines SHALL NOT delete non-namespaced topics. Creation MAY be done via bigmac, CDK, or Connect/Debezium auto-create; deletion logic SHALL never target these topics.

#### Scenario: Dev/val/prod topics exist before connector runs

- **GIVEN** stage is main (dev), val, or production
- **WHEN** the connector is deployed and started
- **THEN** the target topics (e.g., `wms.MMDL.PLAN_BASE_WVR_TBL`, `wms.MMDL.PLAN_WVR_RVSN_TBL`, and WMS schema equivalents) SHALL exist or be created by the deployment process
- **AND** no automation in this repo SHALL delete these topics

#### Scenario: Deletion logic excludes non-namespaced topics

- **GIVEN** any cleanup or teardown procedure runs
- **WHEN** topic deletion is performed
- **THEN** only namespaced (ephemeral) topics MAY be deleted
- **AND** non-namespaced topics SHALL never be deleted by this connector or its pipelines

### Requirement: Ephemeral lifecycle—deploy with stack, teardown with stack

Ephemeral environments SHALL be created when the CDK stack for that stage is deployed and SHALL be cleaned up when the stack is destroyed. No separate manual cleanup SHALL be required for connector or Connect resources; stack destroy SHALL remove them. Namespaced ephemeral topics MAY be deleted as part of stack destroy.

#### Scenario: Ephemeral stack destroy removes connector resources

- **GIVEN** an ephemeral stage (e.g., feature-xyz) has been deployed
- **WHEN** `cdk destroy` (or equivalent) is run for that stage
- **THEN** the Connect service and connector config for that stage SHALL be removed
- **AND** namespaced topics for that stage MAY be deleted as part of cleanup
- **AND** non-namespaced topics SHALL NOT be deleted

#### Scenario: Pipeline destroys ephemeral on branch delete

- **GIVEN** an ephemeral environment was created from a branch pipeline
- **WHEN** the branch is deleted or the ephemeral environment is retired
- **THEN** the pipeline SHALL run stack destroy for that stage
- **AND** cleanup SHALL be automatic (no manual teardown required for connector/Connect resources)
