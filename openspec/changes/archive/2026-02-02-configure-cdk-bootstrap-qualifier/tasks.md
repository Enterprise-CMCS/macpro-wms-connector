## 1. Configuration

- [x] 1.1 Add `@aws-cdk/core:bootstrapQualifier` context key with value `one` to `cdk.json`

## 2. Verification

- [x] 2.1 Run `cdk synth` to verify stack synthesizes without bootstrap version errors
- [x] 2.2 Verify synthesized template references correct bootstrap qualifier in asset paths
