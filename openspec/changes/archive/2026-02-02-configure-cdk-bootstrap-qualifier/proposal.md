## Why

CDK has been bootstrapped in all deployment environments using a custom qualifier, storing the bootstrap version at SSM parameter `/cdk-bootstrap/one/version` instead of the default location (`/cdk-bootstrap/hnb659fds/version`). Without specifying this custom qualifier in the CDK configuration, deployments will fail because CDK cannot locate the bootstrap resources.

## What Changes

- Add CDK bootstrap qualifier configuration to `cdk.json` specifying the custom qualifier `one`
- Configure the CDK app to use the custom bootstrap stack name synthesizer
- Ensure all CDK deployments across environments (main, val, production, ephemeral) use the correct bootstrap resources

## Capabilities

### New Capabilities

- `cdk-bootstrap-config`: Configuration for custom CDK bootstrap qualifier and SSM parameter paths to enable deployments against pre-bootstrapped environments

### Modified Capabilities

None - this is additive configuration that doesn't change existing spec requirements.

## Impact

- **Files**: `cdk.json`, `src/bin/wms-connector.ts`
- **Deployment**: Required for CDK deployments to succeed in all environments
- **Dependencies**: None - uses existing CDK bootstrap infrastructure
- **Risk**: Low - configuration-only change with no infrastructure modifications
