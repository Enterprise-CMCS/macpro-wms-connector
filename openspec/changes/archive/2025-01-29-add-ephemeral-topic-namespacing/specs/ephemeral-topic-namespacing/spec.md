## ADDED Requirements

### Requirement: Topic namespace in environment config for ephemeral stages

The system SHALL expose a topic namespace (or prefix) in environment config so that ephemeral stages receive a non-empty namespace for data topics and Connect internal topics, and main, val, and production receive no prefix. Ephemeral stage SHALL be derived from the Git branch name when deploying or synthesizing; the stage SHALL be supplied where needed (e.g. CDK context or pipeline variable).

#### Scenario: Named stages have no topic namespace

- **GIVEN** stage is main, val, or production
- **WHEN** environment config is resolved via getEnvironmentConfig(stage)
- **THEN** topicNamespace (or equivalent) SHALL be empty string or absent
- **AND** data topics and Connect internal topics SHALL NOT be prefixed with a stage namespace

#### Scenario: Ephemeral stage has topic namespace

- **GIVEN** stage is an ephemeral value (not main, val, or production), e.g. a Git branch name
- **WHEN** environment config is resolved via getEnvironmentConfig(stage)
- **THEN** topicNamespace SHALL be set to the validated stage value
- **AND** data topics SHALL be prefixed (e.g. `{stage}.wms.MMDL.PLAN_BASE_WVR_TBL`) and Connect internal topics SHALL follow the pattern (e.g. `mgmt.connect.wms-connector-{stage}.*`)

#### Scenario: Ephemeral deploy requires stage

- **GIVEN** a deployment or synth is for an ephemeral environment (stage not main/val/production)
- **WHEN** stage is not supplied (e.g. CDK context missing)
- **THEN** the system SHALL require stage to be supplied (e.g. -c stage=feature-xyz) or SHALL fail with a clear error that stage is required for ephemeral

### Requirement: Ephemeral distinguished from named stages

The system SHALL treat only main, val, and production as named stages with no topic namespace. Any other stage string SHALL be treated as ephemeral and SHALL receive a topic namespace derived from the validated stage value.

#### Scenario: Unknown stage is ephemeral

- **GIVEN** stage is a string not equal to main, val, or production
- **WHEN** getEnvironmentConfig(stage) is called
- **THEN** the returned config SHALL include a non-empty topicNamespace (after validation of stage)
- **AND** resource sizing MAY fall back to main (or another named stage) while topicNamespace SHALL be the validated ephemeral stage value
