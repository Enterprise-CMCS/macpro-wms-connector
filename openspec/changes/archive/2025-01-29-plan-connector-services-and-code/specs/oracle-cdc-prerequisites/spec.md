## ADDED Requirements

### Requirement: Oracle prerequisites are documented and coordinated with DBA

The system SHALL rely on Oracle database configuration that is performed outside this repo (by DBA or infrastructure team). This repo SHALL document the required Oracle prerequisites and SHALL NOT implement or run Oracle or LogMiner directly; the Debezium Oracle connector SHALL connect to an already-configured Oracle instance.

#### Scenario: Prerequisites documented for DBA

- **GIVEN** the connector is planned for a stage
- **WHEN** Oracle is not yet configured for CDC
- **THEN** documentation (e.g., `docs/wms-config-details.md`) SHALL describe: ARCHIVELOG mode, supplemental logging for target tables, and creation of a dedicated CDC user with required privileges (e.g., LOGMINING, SELECT on target tables, etc.)
- **AND** coordination with DBA SHALL be part of the deployment process for new environments

#### Scenario: No Oracle or LogMiner code in this repo

- **GIVEN** this repository
- **WHEN** implementation is complete
- **THEN** this repo SHALL NOT contain code that configures Oracle (e.g., no DDL or privilege grants executed by the connector)
- **AND** Oracle setup SHALL be done separately; the connector SHALL only connect using credentials from `dbInfo`

### Requirement: Supplemental logging and CDC user scope

Documentation SHALL state that supplemental logging MUST be enabled at database level (minimal) and at table level (full) for MMDL and WMS `PLAN_BASE_WVR_TBL` and `PLAN_WVR_RVSN_TBL`. The CDC user MUST have LOGMINING (or equivalent), SELECT on those tables, and any other privileges required by the Debezium Oracle connector (e.g., SELECT_CATALOG_ROLE, FLASHBACK ANY TABLE, as per Debezium docs).

#### Scenario: Table list matches documented prerequisites

- **GIVEN** the connector is configured for WMS/MMDL tables
- **WHEN** DBA enables supplemental logging
- **THEN** the documented table list SHALL match the connector table include list: both schemas, both tables (four tables total)
- **AND** the CDC user SHALL have SELECT on all four tables

#### Scenario: Credentials stored in dbInfo per environment

- **GIVEN** DBA has created a CDC user and provided credentials
- **WHEN** credentials are stored for a stage
- **THEN** they SHALL be stored in Secrets Manager at `wms/{stage}/dbInfo` or `wms/default/dbInfo` as a JSON object (same secret name as Appian connector for consistency)
- **AND** the connector SHALL read only from Secrets Manager (no credentials in repo or config files)
