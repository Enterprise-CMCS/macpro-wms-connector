## MODIFIED Requirements

### Requirement: Stage name is validated for topic and service naming

The system SHALL validate the stage name before using it in Kafka topic names or CDK/ECS service names. Validation SHALL align with Kafka topic naming rules and CDK/ECS resource naming constraints. Invalid stage values SHALL be rejected (or normalized only if documented and safe); the system SHALL fail at synth or deploy with a clear error message when validation fails.

**The stage parameter MUST be explicitly provided; no default value is allowed.**

#### Scenario: Valid stage passes validation

- **GIVEN** stage is a string that satisfies the allowed pattern (e.g. alphanumeric, hyphen, period, underscore; no slash, space, or other disallowed characters per Kafka and CDK rules)
- **WHEN** validateStage(stage) is called (or stage is used for namespacing)
- **THEN** validation SHALL succeed and the stage value (or normalized form) SHALL be used for topicNamespace and service names
- **AND** no error SHALL be raised

#### Scenario: Invalid stage fails validation

- **GIVEN** stage contains characters that are invalid for Kafka topic names or CDK/ECS names (e.g. slash, space, or characters not in the allowed set)
- **WHEN** validateStage(stage) is called or stage is used for namespacing at synth/deploy
- **THEN** validation SHALL fail
- **AND** the system SHALL raise an error with a clear message indicating that the stage is invalid and what pattern is allowed (or that stage must be supplied for ephemeral)

#### Scenario: Validation applied when stage is used for namespacing

- **GIVEN** stage is supplied (e.g. via CDK context or pipeline) for an ephemeral deploy or synth
- **WHEN** getEnvironmentConfig(stage) is called and stage is not main, val, or production
- **THEN** the stage SHALL be validated before being used as topicNamespace or in service names
- **AND** if validation fails, synth or deploy SHALL fail fast with a clear error rather than producing invalid topic or resource names later

#### Scenario: Missing stage fails immediately

- **WHEN** CDK synth or deploy is run without `-c stage=<value>`
- **THEN** the system SHALL fail immediately with a clear error message
- **AND** the error SHALL indicate that stage must be explicitly provided (e.g., "Stage is required. Use -c stage=main|val|production|<branch-name>")

## ADDED Requirements

### Requirement: No default stage value

The CDK app SHALL NOT define a default stage value. Stage MUST be explicitly provided via CDK context (`-c stage=<value>`) for every synth and deploy operation.

#### Scenario: cdk.json has no default stage

- **WHEN** `cdk.json` is read
- **THEN** the context SHALL NOT contain a `stage` key with a default value

#### Scenario: Code has no fallback stage

- **WHEN** stage is read from CDK context
- **THEN** the code SHALL NOT provide a fallback value (no `|| 'main'` or similar)
- **AND** missing stage SHALL trigger an explicit error
