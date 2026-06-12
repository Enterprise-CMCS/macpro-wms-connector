## Context

CDK bootstrap creates resources (S3 bucket, ECR repository, IAM roles) that CDK uses during deployment. These environments were bootstrapped with a custom qualifier `one`, which changes the SSM parameter path from the default `/cdk-bootstrap/hnb659fds/version` to `/cdk-bootstrap/one/version`.

Currently, the CDK app uses the default synthesizer configuration, which expects the default bootstrap qualifier. Deployments fail because CDK cannot locate the bootstrap version parameter.

## Goals / Non-Goals

**Goals:**
- Configure CDK to use the custom bootstrap qualifier `one`
- Enable successful deployments to all environments (main, val, production, ephemeral)
- Maintain a single configuration that works across all stages

**Non-Goals:**
- Re-bootstrapping environments (already done with qualifier `one`)
- Changing the bootstrap qualifier to something else
- Per-environment bootstrap configuration (all environments use the same qualifier)

## Decisions

### Decision 1: Configure qualifier via `cdk.json` context

**Choice**: Set `@aws-cdk/core:bootstrapQualifier` in `cdk.json` context

**Alternatives considered**:
- **Programmatic DefaultStackSynthesizer**: More verbose, requires modifying TypeScript code
- **CLI flag `--qualifier`**: Must be passed on every command, easy to forget

**Rationale**: Context in `cdk.json` applies automatically to all CDK commands and stacks without code changes. This is the recommended approach for project-wide bootstrap configuration.

### Decision 2: No code changes required

**Choice**: Use `cdk.json` context only, no changes to `wms-connector.ts`

**Rationale**: The `@aws-cdk/core:bootstrapQualifier` context key is recognized by CDK's default synthesizer. No need to explicitly configure `DefaultStackSynthesizer` in the stack code.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Qualifier mismatch if environments are re-bootstrapped | Document that all environments must use qualifier `one` |
| Future stacks might forget this requirement | Configuration in `cdk.json` applies to all stacks automatically |
