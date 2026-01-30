## ADDED Requirements

### Requirement: README describes the project

The repository README SHALL provide a clear overview of the project so that new contributors and operators understand what it does before running or modifying it.

#### Scenario: Project name and purpose are stated

- **GIVEN** a reader opens the README
- **WHEN** they read the top section
- **THEN** the README SHALL state the project name (e.g. macpro-wms-connector)
- **AND** SHALL state in one or two sentences that it is the WMS Oracle CDC to Kafka connector (Debezium on ECS) or equivalent

### Requirement: README lists prerequisites

The README SHALL list prerequisites required to install, build, and run (or deploy) the project so that contributors can prepare their environment.

#### Scenario: Prerequisites are documented

- **GIVEN** a reader wants to run or deploy the project
- **WHEN** they consult the README
- **THEN** the README SHALL list at least: Node (version or minimum, e.g. 18+), Yarn (Classic 1.x), and any deployment prerequisites (e.g. AWS CLI, CDK bootstrap) if applicable
- **AND** SHALL state that the project uses Yarn (not npm) for install and scripts

### Requirement: README lists main commands

The README SHALL list the main commands for install, build, and CDK (synth, deploy) so that contributors can run the project without searching the repo.

#### Scenario: Commands are documented

- **GIVEN** a reader has cloned and wants to install and run
- **WHEN** they consult the README
- **THEN** the README SHALL show at least: `yarn install`, `yarn build`, `yarn synth`, and how to run the CDK CLI (e.g. `yarn cdk` or `yarn cdk deploy`)
- **AND** each command SHALL be briefly explained (e.g. "compile TypeScript", "synthesize CDK stack")

### Requirement: README links to detailed docs

The README SHALL link to detailed documentation (e.g. Oracle CDC setup, Debezium config, ephemeral stages) so that operators can find environment and deployment details.

#### Scenario: Doc link is provided

- **GIVEN** the repository has a docs folder (e.g. `docs/wms-config-details.md`)
- **WHEN** a reader consults the README
- **THEN** the README SHALL include a link to that doc (or equivalent) for Oracle CDC, Debezium, stages, and secrets
- **AND** the link SHALL be usable (correct path or URL)

### Requirement: README includes first-run or contributing guidance

The README SHALL include a short first-run or contributing section (e.g. clone, install, build, synth) so that the first push is useful and new contributors know the minimal steps to get started.

#### Scenario: First-run steps are documented

- **GIVEN** a new contributor has cloned the repo
- **WHEN** they follow the README
- **THEN** they SHALL be able to find the minimal steps to install dependencies and run a local build/synth (e.g. clone, yarn install, yarn build, yarn synth)
- **AND** the README SHALL be concise (e.g. one page) with details in linked docs
