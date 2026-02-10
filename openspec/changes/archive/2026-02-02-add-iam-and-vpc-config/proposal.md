# Proposal: Add IAM and VPC Config from Secrets

## Why

Deployment fails in this AWS account because the organization Service Control Policy (SCP) explicitly denies VPC creation (`ec2:CreateVpc`) and requires IAM roles to have a permissions boundary. The current stack creates a new VPC when none is provided and does not set a permissions boundary on IAM roles, so CloudFormation fails. The macpro-appian-connector already solves this by fetching VPC configuration, IAM path, and IAM permissions boundary from AWS Secrets Manager at synth time and using them in the stack. We need the same pattern for wms-connector so deployments succeed without violating org policy.

## What Changes

- **Environment config**: Add secret paths and types for VPC config, IAM path, and IAM permissions boundary under the existing `mmdl/{stage}/...` and `mmdl/default/...` pattern. Extend `FullEnvironmentConfig` and `loadEnvironmentSecrets` to fetch these at synth time.
- **CDK stack**: Accept full environment config (including secrets). Use VPC from secrets (lookup or attributes) instead of creating a new VPC. Set `permissionsBoundary` and `path` on all IAM roles. Place Fargate service in subnets from VPC config (e.g. data or private subnets).
- **Entrypoint**: Load full environment config at synth time in the CDK app entrypoint and pass it to the stack.
- **Deploy workflow**: Fix deploy step to pass required CDK context: `-c stage=$STAGE_NAME` so the app receives the stage.
- **Secrets**: Ensure mmdl secrets exist in Secrets Manager for VPC, IAM path, and IAM permissions boundary (create or align with appian/default values as needed).

## Capabilities

### New Capabilities

- **iam-vpc-config-from-secrets**: Environment configuration and CDK stack SHALL resolve VPC (id and subnets), IAM path, and IAM permissions boundary from AWS Secrets Manager using `mmdl/{stage}/...` with fallback to `mmdl/default/...`. The stack SHALL use the resolved VPC (no new VPC creation) and SHALL set the resolved permissions boundary and path on all IAM roles it creates.

### Modified Capabilities

- None. Existing specs (github-workflows, stage-validation, etc.) do not have requirement-level changes; the deploy workflow fix is an implementation detail so the CDK app receives the required stage context.

## Impact

- **Code**: `src/environment-config.ts` (SecretPaths, VpcConfig, FullEnvironmentConfig, loadEnvironmentSecrets); `src/cdk/wms-connector-stack.ts` (props, VPC usage, IAM role options); `src/bin/wms-connector.ts` (async full config load, pass to stack).
- **Workflow**: `.github/workflows/deploy.yml` deploy step adds `-c stage=$STAGE_NAME`.
- **Infrastructure**: Stack will deploy into an existing VPC and create IAM roles with org-required permissions boundary and path.
- **Secrets Manager**: Requires `mmdl/default/vpc`, `mmdl/default/iam/path`, and `mmdl/default/iam/permissionsBoundary` (and optionally stage-specific overrides). Values can mirror appian/default if shared networking and IAM policy apply.
