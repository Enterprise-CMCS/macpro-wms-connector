## ADDED Requirements

### Requirement: VPC configuration resolved from Secrets Manager

Environment configuration SHALL resolve VPC configuration (id and subnets) from AWS Secrets Manager at synth time. The system SHALL use the secret path `mmdl/{stage}/vpc` with fallback to `mmdl/default/vpc` when the stage-specific secret is not found. The VPC secret value SHALL be JSON containing at least `id`, `dataSubnets`, `privateSubnets`, and `publicSubnets`.

#### Scenario: Stage-specific VPC secret exists

- **GIVEN** a stage (e.g. main) is supplied via CDK context
- **WHEN** full environment config is loaded at synth time
- **THEN** the system SHALL attempt to fetch the secret at `mmdl/{stage}/vpc`
- **AND** if that secret exists, its value SHALL be parsed as JSON and used as the VPC config for the stack

#### Scenario: Fallback to default VPC secret

- **GIVEN** a stage is supplied and the secret `mmdl/{stage}/vpc` does not exist or fails to be retrieved
- **WHEN** full environment config is loaded at synth time
- **THEN** the system SHALL fetch the secret at `mmdl/default/vpc`
- **AND** the parsed JSON SHALL be used as the VPC config for the stack

#### Scenario: Missing VPC secret fails synth

- **GIVEN** neither `mmdl/{stage}/vpc` nor `mmdl/default/vpc` can be retrieved
- **WHEN** full environment config is loaded at synth time
- **THEN** the system SHALL fail with a clear error
- **AND** synth SHALL NOT proceed

### Requirement: IAM path and permissions boundary resolved from Secrets Manager

Environment configuration SHALL resolve IAM path and IAM permissions boundary from AWS Secrets Manager at synth time. The system SHALL use secret paths `mmdl/{stage}/iam/path` and `mmdl/{stage}/iam/permissionsBoundary` with fallbacks to `mmdl/default/iam/path` and `mmdl/default/iam/permissionsBoundary` respectively when stage-specific secrets are not found.

#### Scenario: IAM path and permissions boundary from stage-specific secrets

- **GIVEN** a stage is supplied and secrets `mmdl/{stage}/iam/path` and `mmdl/{stage}/iam/permissionsBoundary` exist
- **WHEN** full environment config is loaded at synth time
- **THEN** the system SHALL use those secret values as the IAM path and permissions boundary ARN for the stack

#### Scenario: IAM fallback to default secrets

- **GIVEN** a stage is supplied and one or both of `mmdl/{stage}/iam/path` or `mmdl/{stage}/iam/permissionsBoundary` are missing or fail
- **WHEN** full environment config is loaded at synth time
- **THEN** the system SHALL use `mmdl/default/iam/path` and `mmdl/default/iam/permissionsBoundary` as fallbacks
- **AND** the resolved values SHALL be included in the full config passed to the stack

### Requirement: Stack uses resolved VPC and does not create a new VPC

The CDK stack SHALL use the VPC configuration resolved from Secrets Manager. The stack SHALL NOT create a new VPC (e.g. SHALL NOT instantiate `new ec2.Vpc(...)`). The stack SHALL place the ECS Fargate service in subnets from the resolved VPC config (e.g. private subnets or data subnets as defined by the secret).

#### Scenario: Stack receives VPC from full config

- **GIVEN** full environment config including resolved VPC (id and subnets) is passed to the stack
- **WHEN** the stack is synthesized
- **THEN** the stack SHALL use the VPC id and subnet IDs from the config (e.g. via `Vpc.fromVpcAttributes` or equivalent)
- **AND** the stack SHALL NOT create any new VPC resource

#### Scenario: ECS service in configured subnets

- **GIVEN** full environment config includes VPC with privateSubnets (or dataSubnets)
- **WHEN** the Fargate service is defined
- **THEN** the service SHALL be placed in subnets from the resolved VPC config
- **AND** the service SHALL NOT use a default or newly created VPC

### Requirement: All IAM roles created by the stack have permissions boundary and path

The CDK stack SHALL set the resolved IAM permissions boundary and IAM path on every IAM role it creates (e.g. task role, execution role). The permissions boundary SHALL be the ARN value resolved from Secrets Manager. The path SHALL be the string value resolved from Secrets Manager.

#### Scenario: Task role has permissions boundary and path

- **GIVEN** full environment config includes `iamPermissionsBoundary` (ARN) and `iamPath`
- **WHEN** the stack creates the ECS task role
- **THEN** the role SHALL have `permissionsBoundary` set to the resolved permissions boundary ARN
- **AND** the role SHALL have `path` set to the resolved IAM path

#### Scenario: Execution role has permissions boundary and path

- **GIVEN** full environment config includes `iamPermissionsBoundary` and `iamPath`
- **WHEN** the stack creates any execution role (e.g. ECS task execution role)
- **THEN** that role SHALL have `permissionsBoundary` set to the resolved permissions boundary ARN
- **AND** that role SHALL have `path` set to the resolved IAM path

### Requirement: CDK app entrypoint loads full config at synth time

The CDK app entrypoint SHALL load full environment config (including VPC, IAM path, and IAM permissions boundary from Secrets Manager) before constructing the stack. The entrypoint SHALL pass the loaded full config to the stack constructor. Stage SHALL be obtained from CDK context (e.g. `-c stage=main`).

#### Scenario: Entrypoint loads config then instantiates stack

- **GIVEN** CDK is invoked with `-c stage=<value>`
- **WHEN** the CDK app runs (synth or deploy)
- **THEN** the entrypoint SHALL first load full environment config for the given stage (including secrets)
- **AND** the entrypoint SHALL pass the full config to the WmsConnectorStack constructor
- **AND** the stack SHALL not be constructed until config load completes (or fails)

#### Scenario: Deploy workflow passes stage context

- **WHEN** the deploy workflow runs `cdk deploy`
- **THEN** the command SHALL include `-c stage=$STAGE_NAME` so the app receives the stage
- **AND** the app SHALL use that stage to load the correct full environment config
