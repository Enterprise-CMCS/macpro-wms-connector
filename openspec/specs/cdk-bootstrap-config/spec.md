### Requirement: CDK uses custom bootstrap qualifier
The CDK configuration SHALL specify bootstrap qualifier `one` to locate bootstrap resources at the custom SSM parameter path `/cdk-bootstrap/one/version`.

#### Scenario: CDK synth locates bootstrap version
- **WHEN** CDK synthesizes a stack
- **THEN** CDK reads the bootstrap version from SSM parameter `/cdk-bootstrap/one/version`

#### Scenario: CDK deploy uses correct bootstrap resources
- **WHEN** CDK deploys to any environment (main, val, production, or ephemeral)
- **THEN** CDK uses the S3 bucket and ECR repository created by the `one` qualifier bootstrap

### Requirement: Bootstrap qualifier applies to all stacks
The bootstrap qualifier configuration SHALL apply automatically to all CDK stacks without requiring per-stack configuration.

#### Scenario: New stack inherits bootstrap qualifier
- **WHEN** a new stack is added to the CDK app
- **THEN** the stack uses the `one` bootstrap qualifier without explicit configuration

#### Scenario: Multi-stack deployment uses same qualifier
- **WHEN** the CDK app contains multiple stacks
- **THEN** all stacks use the same bootstrap qualifier `one`

### Requirement: Configuration via cdk.json context
The bootstrap qualifier SHALL be configured in `cdk.json` using the `@aws-cdk/core:bootstrapQualifier` context key.

#### Scenario: cdk.json contains qualifier context
- **WHEN** `cdk.json` is read
- **THEN** the context contains `"@aws-cdk/core:bootstrapQualifier": "one"`

#### Scenario: No code changes required for qualifier
- **WHEN** deploying with the configured qualifier
- **THEN** no TypeScript code changes are needed beyond `cdk.json`
