## ADDED Requirements

### Requirement: No secrets in tracked files

The repository SHALL NOT contain literal secrets (passwords, API keys, tokens) in any tracked file. Credentials SHALL be resolved from a secrets manager or environment at runtime; config and docs MAY use placeholders (e.g. `<password>`, `<secret>`).

#### Scenario: No literal secrets in code or config

- **GIVEN** the set of tracked files (excluding ignored paths)
- **WHEN** those files are inspected for literal credentials (passwords, API keys, connection strings with secrets)
- **THEN** no file SHALL contain hardcoded secrets
- **AND** connector or app config SHALL reference placeholders or runtime resolution (e.g. from Secrets Manager) only

#### Scenario: Docs may use placeholders

- **GIVEN** documentation (e.g. README, docs in repo) describes credentials or secrets
- **WHEN** that documentation is reviewed
- **THEN** it MAY use placeholders such as `<password>`, `<secret>`, or "from Secrets Manager"
- **AND** it SHALL NOT contain real credentials

### Requirement: No account identifiers in tracked files

The repository SHALL NOT contain AWS account IDs or other account-specific identifiers in tracked files. CDK context that embeds account/region SHALL be ignored (e.g. via `.gitignore`) or removed from tracking so it is not committed.

#### Scenario: cdk.context.json not committed

- **GIVEN** `cdk.context.json` may contain keys or values that include account ID or region
- **WHEN** the repository is prepared for first commit
- **THEN** `cdk.context.json` SHALL be listed in `.gitignore` and SHALL NOT be committed
- **AND** if it was previously tracked, it SHALL be removed from the index (e.g. `git rm --cached cdk.context.json`) so future commits do not include it

#### Scenario: No account ID in source or config

- **GIVEN** the set of tracked source and config files (excluding ignored files)
- **WHEN** those files are searched for AWS account ID patterns (e.g. 12-digit numeric IDs)
- **THEN** no tracked file SHALL contain a hardcoded account identifier
- **AND** account/region SHALL be supplied via environment, CDK context at synth time, or similar, not committed in repo
