## ADDED Requirements

### Requirement: Cursor directory is ignored

The repository SHALL list `.cursor/` in `.gitignore` so that Cursor IDE and tooling files are not committed.

#### Scenario: .cursor is not tracked

- **GIVEN** the repository has a `.gitignore` file
- **WHEN** a developer has a `.cursor/` directory locally
- **THEN** files under `.cursor/` SHALL NOT be tracked or committed
- **AND** `.gitignore` SHALL contain an entry that ignores `.cursor/` (e.g. `.cursor/` or `.cursor`)

### Requirement: CDK context file is ignored

The repository SHALL list `cdk.context.json` in `.gitignore` so that CDK-generated context (which may contain account or region-specific data) is not committed.

#### Scenario: cdk.context.json is not tracked

- **GIVEN** the repository has a `.gitignore` file
- **WHEN** CDK has generated or updated `cdk.context.json` locally
- **THEN** `cdk.context.json` SHALL NOT be tracked or committed
- **AND** `.gitignore` SHALL contain an entry that ignores `cdk.context.json`

### Requirement: Other uncommittable paths are ignored

The repository SHALL include in `.gitignore` any other paths that must not be committed (e.g. IDE/tooling dirs, local env files) so that the first push and future commits do not include them.

#### Scenario: Standard uncommittable paths are ignored

- **GIVEN** the repository uses Node, Yarn, CDK, and may use local env files
- **WHEN** `.gitignore` is reviewed
- **THEN** it SHALL ignore at least: `node_modules/`, build output (e.g. `lib/`, `cdk.out/`), `package-lock.json`, `.env` and `.env.*`, and any existing entries for `.cursor/` and `cdk.context.json`
- **AND** `yarn.lock` SHALL NOT be ignored (it SHALL be committed)
