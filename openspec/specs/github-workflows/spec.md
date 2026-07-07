### Requirement: Deploy workflow deploys WMS connector stack
The deploy workflow SHALL deploy the `wms-connector-{stage}` CDK stack when code is pushed to main, val, or production branches.

#### Scenario: Deploy on push to main
- **WHEN** code is pushed to the `main` branch
- **THEN** the workflow deploys `wms-connector-main` stack to AWS

#### Scenario: Deploy on push to val
- **WHEN** code is pushed to the `val` branch
- **THEN** the workflow deploys `wms-connector-val` stack to AWS

#### Scenario: Deploy on push to production
- **WHEN** code is pushed to the `production` branch
- **THEN** the workflow deploys `wms-connector-production` stack to AWS

### Requirement: Deploy workflow runs CDK from project root
The deploy workflow SHALL execute CDK commands from the project root directory, not a subdirectory.

#### Scenario: CDK build and deploy at root
- **WHEN** the deploy job executes
- **THEN** `yarn build` and `cdk deploy` commands run from the project root (no `working-directory` or `cd` needed)

### Requirement: Destroy workflow removes WMS connector stack
The destroy workflow SHALL destroy the `wms-connector-{stage}` CDK stack when a branch is deleted or manually triggered.

#### Scenario: Destroy on branch deletion
- **WHEN** an ephemeral branch is deleted
- **THEN** the workflow destroys `wms-connector-{branch-name}` stack

#### Scenario: Destroy protected branches blocked
- **WHEN** destroy is triggered for main, val, or production
- **THEN** the workflow skips destruction (protected branches condition)

#### Scenario: Manual destroy via workflow_dispatch
- **WHEN** destroy workflow is manually triggered with environment name
- **THEN** the workflow destroys `wms-connector-{environment}` stack (unless protected)

### Requirement: Setup action configures Node.js from .nvmrc
The setup action SHALL read Node.js version from `.nvmrc` file at project root.

#### Scenario: Node version from .nvmrc
- **WHEN** the setup action runs
- **THEN** it configures Node.js using the version specified in `.nvmrc`

### Requirement: Project has .nvmrc specifying Node 24
The project SHALL have a `.nvmrc` file containing the Node.js version `24`.

#### Scenario: .nvmrc exists with Node 24
- **WHEN** CI or local development environment checks Node version
- **THEN** `.nvmrc` file exists at project root containing `24`

### Requirement: PR automation creates release PRs
The auto-create-pr workflows SHALL create release PRs when code flows through environments.

#### Scenario: Create PR from main to val
- **WHEN** code is pushed to `main` branch
- **THEN** a PR is automatically created targeting `val` branch

#### Scenario: Create PR from val to production
- **WHEN** code is pushed to `val` branch
- **THEN** a PR is automatically created targeting `production` branch

### Requirement: Pre-commit workflow runs on pull requests
The pre-commit workflow SHALL run pre-commit checks on all pull requests.

#### Scenario: Pre-commit on PR
- **WHEN** a pull request is opened or updated
- **THEN** pre-commit hooks run against all files

### Requirement: Dependency review runs on pull requests
The dependency-review workflow SHALL scan for vulnerable dependencies on pull requests.

#### Scenario: Dependency scan on PR
- **WHEN** a pull request is opened or updated
- **THEN** dependency-review action scans manifest files for known vulnerabilities
