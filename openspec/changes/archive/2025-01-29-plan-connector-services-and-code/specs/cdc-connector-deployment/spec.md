## ADDED Requirements

### Requirement: Kafka Connect runs on ECS Fargate

The system SHALL run Kafka Connect workers on AWS ECS Fargate, deployed via CDK (TypeScript), following patterns from macpro-appian-connector. Each stage SHALL have its own Connect deployment identified by service prefix `wms-connector-{stage}`.

#### Scenario: Deploy Connect for a stage

- **GIVEN** a stage (main (dev), val, production, or ephemeral branch name)
- **WHEN** the CDK stack for that stage is deployed
- **THEN** ECS Fargate runs one or more Kafka Connect workers for that stage
- **AND** workers are configured with bootstrap servers from the resolved broker string secret

#### Scenario: Per-environment resource sizing

- **GIVEN** stage is main (dev), val, production, or ephemeral
- **WHEN** the Connect deployment is created
- **THEN** CPU and memory SHALL be set per stage via environment-config (using the same pattern and, as a starting point, the resource configurations from macpro-appian-connector)
- **AND** resources SHALL be sufficient for the initial startup phase (which can be resource-intensive; startup SHALL NOT fail due to undersizing)
- **AND** production SHALL be well-sized so it never runs out of resources
- **AND** val has the least traffic but SHALL still have enough resources to start correctly; dev may receive more use than val or production

### Requirement: Debezium Oracle connector is configured for WMS/MMDL tables

The system SHALL deploy and configure the Debezium Oracle connector to capture changes from Oracle schemas WMS and MMDL for tables `PLAN_BASE_WVR_TBL` and `PLAN_WVR_RVSN_TBL`. Connector config SHALL use credentials from the resolved `dbInfo` secret and SHALL set `tasks.max` to 1 for the Oracle connector.

#### Scenario: Connector uses correct tables and schemas

- **GIVEN** the connector is running for a stage
- **WHEN** the connector starts or performs snapshot
- **THEN** it SHALL include `MMDL.PLAN_BASE_WVR_TBL`, `MMDL.PLAN_WVR_RVSN_TBL`, `WMS.PLAN_BASE_WVR_TBL`, `WMS.PLAN_WVR_RVSN_TBL` in the table include list
- **AND** schema include list SHALL include `MMDL,WMS`

#### Scenario: Oracle credentials from Secrets Manager

- **GIVEN** stage is set and Secrets Manager has `wms/{stage}/dbInfo` or `wms/default/dbInfo`
- **WHEN** the connector is configured
- **THEN** Oracle connection parameters (host, port, user, password, etc.) SHALL be read from the resolved secret JSON
- **AND** credentials SHALL NOT be stored in code or config files

### Requirement: Initial snapshot and schema history

The system SHALL run the Debezium Oracle connector with initial snapshot enabled so that existing table data is captured once before streaming changes. Schema history SHALL be stored in a Kafka topic (e.g., `wms.schema-changes` or stage-scoped equivalent) so the connector can recover after restart.

#### Scenario: Initial snapshot runs on first start

- **GIVEN** the connector is started for the first time for a stage
- **WHEN** snapshot mode is `initial`
- **THEN** the connector SHALL perform a full snapshot of the included tables
- **AND** snapshot events SHALL be written to the corresponding Kafka topics

#### Scenario: Schema history topic exists for recovery

- **GIVEN** the connector has run and written schema history to Kafka
- **WHEN** the connector restarts
- **THEN** it SHALL read schema history from the configured history topic
- **AND** it SHALL resume streaming without re-snapshotting unless configured otherwise

### Requirement: Error handling for LogMiner and Oracle failures

The system SHALL handle Oracle and LogMiner failures so that transient errors do not permanently stop the connector. Connector and Connect worker configuration SHALL support retry and SHALL expose or log failures for monitoring.

#### Scenario: LogMiner temporarily unavailable

- **GIVEN** the connector is streaming and Oracle LogMiner becomes temporarily unavailable
- **WHEN** the connector encounters the failure
- **THEN** it SHALL retry according to configured retry policy
- **AND** failures SHALL be visible to monitoring (metrics or logs) for alerting

#### Scenario: Oracle connection lost

- **GIVEN** the connector is connected to Oracle
- **WHEN** the connection is lost (network or DB restart)
- **THEN** the connector SHALL attempt to reconnect using configured retry behavior
- **AND** reconnection SHALL use credentials from the resolved `dbInfo` secret
