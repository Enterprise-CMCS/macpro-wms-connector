## ADDED Requirements

### Requirement: Connector health is observable

The system SHALL expose or integrate with connector health so that operators can determine whether the Debezium Oracle connector and Kafka Connect workers are running and healthy. Health SHALL be checkable via Kafka Connect REST API or equivalent, and SHALL be integrated with monitoring (e.g., CloudWatch or alerting) so that failures can be detected.

#### Scenario: Connect worker and connector status available

- **GIVEN** a stage with Connect and the WMS Oracle connector deployed
- **WHEN** an operator or monitoring system checks status
- **THEN** connector state (RUNNING, FAILED, PAUSED, etc.) SHALL be obtainable via Connect REST API (or equivalent)
- **AND** worker health SHALL be observable (e.g., worker liveness or Connect cluster status)

#### Scenario: Unhealthy connector is detectable for alerting

- **GIVEN** the connector is configured for a stage
- **WHEN** the connector fails (e.g., Oracle unreachable, LogMiner error)
- **THEN** the failure SHALL be visible through the same status/monitoring path
- **AND** the system SHALL support integration with alerting (e.g., CloudWatch alarms, SNS) so that failures trigger notifications

### Requirement: Replication lag is visible

The system SHALL make replication lag (or equivalent progress metrics) visible so that operators can detect delay between Oracle changes and Kafka. Lag MAY be exposed via Debezium/Connect metrics (e.g., JMX or Prometheus) or via custom checks; the design SHALL allow lag to be monitored and alarmed if it exceeds a threshold.

#### Scenario: Lag or offset progress is observable

- **GIVEN** the connector is streaming changes from Oracle to Kafka
- **WHEN** an operator or monitoring system checks replication progress
- **THEN** lag or offset metrics SHALL be available (e.g., via Connect REST API, JMX, or CloudWatch)
- **AND** the source of metrics SHALL be documented so alarms can be configured

#### Scenario: High lag can trigger alert

- **GIVEN** a threshold for acceptable replication lag is defined (e.g., per environment)
- **WHEN** lag exceeds that threshold
- **THEN** the monitoring integration SHALL support raising an alert (e.g., CloudWatch alarm, SNS)
- **AND** per-environment sizing (dev vs val vs prod) MAY affect acceptable lag thresholds or resource allocation

### Requirement: Per-environment deployment verification

The system SHALL support verification that the connector is deployed and functioning correctly per environment (main, val, production). Verification MAY include: connector status RUNNING, topics receiving events, and (optionally) a smoke test or health check as part of deployment.

#### Scenario: Post-deploy verification for a stage

- **GIVEN** a CDK deployment has completed for a stage
- **WHEN** verification runs (e.g., in pipeline or runbook)
- **THEN** connector status SHALL be checked (e.g., via Connect REST API)
- **AND** verification SHALL be repeatable for main, val, and production (and ephemeral) so that each environment can be confirmed working
