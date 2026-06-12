## Why

Currently, the CDK app defaults to stage `main` if no stage is provided. This creates a safety risk: an ephemeral branch deployment that forgets to pass `-c stage=...` would accidentally deploy to the main environment, potentially overwriting production-track infrastructure.

## What Changes

- Remove the default `"stage": "main"` from `cdk.json` context
- Remove the `|| 'main'` fallback in `wms-connector.ts`
- Fail fast with a clear error if stage is not explicitly provided
- Require all deployments (local and CI/CD) to explicitly specify the target stage

## Capabilities

### New Capabilities

None - this modifies an existing capability.

### Modified Capabilities

- `stage-validation`: Add requirement that stage must be explicitly provided; no default allowed

## Impact

- **Files**: `cdk.json`, `src/bin/wms-connector.ts`
- **CI/CD**: All pipelines must pass `-c stage=<env>` (likely already do)
- **Local development**: Developers must now run `cdk synth -c stage=main` instead of just `cdk synth`
- **Risk**: Low - breaking change but failure is explicit and immediate
