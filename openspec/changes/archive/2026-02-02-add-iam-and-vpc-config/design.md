# Design: Add IAM and VPC Config from Secrets

## Context

The wms-connector CDK stack currently creates a new VPC when no `vpcId` context is provided and creates IAM roles without a permissions boundary or path. In this AWS organization, an SCP denies VPC creation and requires IAM roles to have a permissions boundary. Deployments therefore fail. The macpro-appian-connector uses the same CDK/ECS pattern but fetches VPC config, IAM path, and IAM permissions boundary from AWS Secrets Manager at synth time and passes them into the stack. We align wms-connector with that pattern so it deploys successfully using existing VPC and org IAM constraints.

Current state: `src/environment-config.ts` has SecretPaths for brokerString and dbInfo only; `FullEnvironmentConfig` and `loadEnvironmentSecrets` do not include VPC or IAM. The stack accepts `stage` and optionally `vpcId` from context, and creates roles without boundary or path. The CDK app entrypoint is synchronous and does not load secrets before instantiating the stack.

## Goals / Non-Goals

**Goals:**

- Resolve VPC (id and subnets), IAM path, and IAM permissions boundary from Secrets Manager using `mmdl/{stage}/...` with fallback to `mmdl/default/...`.
- Use the resolved VPC in the stack (no new VPC creation). Place ECS Fargate service in subnets from VPC config (data or private).
- Set the resolved permissions boundary and path on all IAM roles created by the stack.
- Load full environment config (including these secrets) at synth time in the app entrypoint and pass it to the stack.
- Fix the deploy workflow so the CDK command passes `-c stage=$STAGE_NAME`.

**Non-Goals:**

- Changing CDC, topic naming, or connector behavior.
- Introducing new stages or changing stage-validation rules.
- Creating or modifying Secrets Manager secrets via code (secrets are assumed to exist or be created out-of-band).

## Decisions

**1. Secret paths and VPC shape**

- Use `mmdl/{stage}/vpc`, `mmdl/{stage}/iam/path`, `mmdl/{stage}/iam/permissionsBoundary` with fallbacks `mmdl/default/vpc`, `mmdl/default/iam/path`, `mmdl/default/iam/permissionsBoundary` to match existing mmdl naming and appian-connector pattern.
- VPC secret value: JSON with `{ id, dataSubnets, privateSubnets, publicSubnets }` (same shape as appian-connector) so we can reuse `Vpc.fromVpcAttributes` and place the service in data or private subnets.

**2. Synth-time secret loading**

- Load full config (including VPC, IAM path, permissions boundary) in the CDK app entrypoint before constructing the stack. The entrypoint becomes async (or wraps sync in a top-level async that runs before `app.synth()`). This matches appian-connector and keeps secrets out of context/cdk.json.
- Alternative considered: passing secret ARNs via context and resolving in the stack. Rejected to keep one place for secret resolution and to avoid spreading AWS SDK usage across stack code.

**3. VPC usage in the stack**

- Use `ec2.Vpc.fromVpcAttributes(this, 'Vpc', { vpcId: vpc.id, availabilityZones, privateSubnetIds: vpc.privateSubnets })` (or dataSubnets if that is the intended placement). No `Vpc.fromLookup` in the stack so we avoid extra SDK/lookup at deploy time; the secret already holds the IDs.
- ECS Fargate service: use `vpc.privateSubnets` or `vpc.dataSubnets` from the config for `vpcSubnets` so the service runs in the correct subnets.

**4. IAM roles**

- Task role and execution role (if/when added): set `permissionsBoundary: iam.ManagedPolicy.fromManagedPolicyArn(this, 'Boundary', fullConfig.iamPermissionsBoundary)` (or equivalent from ARN string) and `path: fullConfig.iamPath`.
- Use the same pattern as appian-connector so role creation complies with org policy.

**5. Deploy workflow**

- Add `-c stage=$STAGE_NAME` to the `cdk deploy` command in `.github/workflows/deploy.yml` so the app receives the stage via context. No other workflow changes required for this capability.

## Risks / Trade-offs

- **Secret availability at synth time**: If mmdl/default (or stage-specific) secrets are missing, synth fails. Mitigation: document required secrets and, if needed, a one-time setup step or runbook to create them (e.g. from appian/default values).
- **Async entrypoint**: The CDK app must be invoked in a way that waits for the async config load (e.g. top-level `void getFullEnvironmentConfig(stage).then(...)` or a small async IIFE). Mitigation: keep the pattern minimal and match appian-connector’s approach.
- **VPC/subnet consistency**: If the VPC or subnet IDs in the secret are wrong or deleted, deploy or runtime can fail. Mitigation: use the same VPC config source as other connectors (e.g. bigmac-east-dev) and document ownership of mmdl/default/vpc.

## Migration Plan

1. **Prerequisites**: Ensure Secrets Manager contains `mmdl/default/vpc`, `mmdl/default/iam/path`, and `mmdl/default/iam/permissionsBoundary` (create from appian/default or shared values if missing).
2. **Code**: Implement environment-config changes, stack props and VPC/IAM usage, and async entrypoint; update deploy workflow. No feature flag required.
3. **Deploy**: Run `cdk deploy wms-connector-main -c stage=main --require-approval never` (or equivalent for val/production). Stack will use existing VPC and create roles with boundary/path.
4. **Rollback**: Revert the change and redeploy; stack will revert to previous behavior (e.g. requiring vpcId context and no boundary). If secrets are removed, revert must be in place before removing secrets to avoid synth failures.

## Open Questions

- None. Subnet choice (dataSubnets vs privateSubnets) can be fixed at implementation time based on how appian-connector and existing wms docs define placement for Connect tasks.
