## ADDED Requirements

### Requirement: Stage name is validated for topic and service naming

The system SHALL validate the stage name before using it in Kafka topic names or CDK/ECS service names. Validation SHALL align with Kafka topic naming rules and CDK/ECS resource naming constraints. Invalid stage values SHALL be rejected (or normalized only if documented and safe); the system SHALL fail at synth or deploy with a clear error message when validation fails.

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

### Requirement: Validation rules are documented

The allowed stage pattern (regex or allow-list) and any normalization (e.g. slash to hyphen, lowercase) SHALL be documented in code or docs so that users know which branch names are valid and how invalid characters are handled (reject vs normalize).

#### Scenario: Allowed pattern is documented

- **GIVEN** a user or pipeline supplies a stage (e.g. Git branch name)
- **WHEN** the user consults documentation or code comments for stage validation
- **THEN** the allowed pattern (e.g. character set, length) SHALL be documented
- **AND** behavior for invalid input (reject or normalize) SHALL be documented
