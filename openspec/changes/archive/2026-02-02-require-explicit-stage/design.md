## Context

The CDK app currently defaults to stage `main` via two mechanisms:
1. `cdk.json` context: `"stage": "main"`
2. Code fallback: `app.node.tryGetContext('stage') || 'main'`

This creates risk of accidental deployments to main when stage is not explicitly provided.

## Goals / Non-Goals

**Goals:**
- Require explicit stage parameter for all CDK operations
- Fail fast with clear error message when stage is missing
- Prevent accidental deployments to wrong environment

**Non-Goals:**
- Changing the list of valid stages
- Modifying CI/CD pipelines (they should already pass stage)

## Decisions

### Decision 1: Remove default from cdk.json

**Choice**: Remove `"stage": "main"` from cdk.json context entirely

**Rationale**: No default means CDK context will return undefined, triggering our validation.

### Decision 2: Fail with clear error in TypeScript

**Choice**: Check for missing stage and throw descriptive error before stack creation

**Rationale**: Failing in TypeScript (before CDK synth) gives a clear, immediate error message rather than cryptic CDK errors about undefined values.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Breaks local dev workflow | Clear error message explains how to fix: `-c stage=main` |
| Existing scripts may break | Error is immediate and obvious; easy to fix |
