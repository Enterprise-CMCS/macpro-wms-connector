## ADDED Requirements

### Requirement: Yarn Classic as sole package manager

The project SHALL use Yarn Classic (1.x) as the sole package manager for installs, script execution, and lockfile. npm SHALL NOT be the supported path for install or run.

#### Scenario: Install uses Yarn

- **GIVEN** a developer or CI needs to install dependencies
- **WHEN** they run the supported install command
- **THEN** the system SHALL use `yarn` or `yarn install`
- **AND** a `yarn.lock` file SHALL be present and committed

#### Scenario: Scripts use Yarn

- **GIVEN** package.json defines scripts (e.g. build, synth, cdk)
- **WHEN** those scripts are invoked
- **THEN** they SHALL use Yarn equivalents (e.g. `yarn run`, `yarn exec` or `yarn <script>`) rather than `npm run` or `npx`
- **AND** behavior SHALL be equivalent to the previous npm-based commands

#### Scenario: Lockfile is Yarn only

- **GIVEN** the repo has a lockfile for reproducible installs
- **WHEN** dependencies are installed
- **THEN** `yarn.lock` SHALL be the single lockfile
- **AND** `package-lock.json` SHALL NOT be used or committed; it MAY be listed in `.gitignore` to avoid accidental re-creation

### Requirement: Simple but smart npm guards in scripts

The project SHALL include a simple, smart guard in scripts so that accidental use of npm (e.g. `npm install`, `npm run`) fails fast with a clear message directing the user to Yarn, without breaking Yarn or normal CI.

#### Scenario: npm install is guarded

- **GIVEN** a user runs `npm install` (or equivalent npm lifecycle)
- **WHEN** the guard runs (e.g. via a lifecycle script that detects npm)
- **THEN** the script SHALL exit with a non-zero code and a clear message that the project uses Yarn (e.g. "Use Yarn: yarn install")
- **AND** the guard SHALL NOT run when the installer is Yarn (e.g. detect via `npm_config_user_agent` or equivalent so only npm triggers the guard)

#### Scenario: Guard does not break Yarn or CI

- **GIVEN** install or run is performed with Yarn
- **WHEN** lifecycle scripts execute
- **THEN** the guard SHALL NOT trigger
- **AND** install and script runs SHALL succeed as when no guard is present

### Requirement: Yarn usage is documented

The project SHALL document that Yarn is required and SHALL list the main commands (install, build, synth, cdk) using Yarn, so that contributors and CI know the supported workflow.

#### Scenario: README or docs describe Yarn workflow

- **GIVEN** a contributor or pipeline consults project documentation
- **WHEN** they look for how to install and run the project
- **THEN** the docs SHALL state that the project uses Yarn
- **AND** SHALL show the primary commands (e.g. `yarn install`, `yarn build`, `yarn synth`) using Yarn

#### Scenario: CI uses Yarn

- **GIVEN** CI runs install and/or build/synth
- **WHEN** the pipeline executes
- **THEN** CI SHALL use Yarn for install and run steps (e.g. `yarn install`, `yarn build`, `yarn synth`)
- **AND** SHALL NOT rely on npm for those steps
