## Context

Environment config (`src/environment-config.ts`) currently has no topic namespace field. Named stages (main, val, production) are defined in `environmentConfigs` and get resource sizing; any other stage falls back to main and has no topic prefix. Ephemeral environments use the Git branch name as stage; their topics and Connect internal topics should be prefixed (e.g. `{stage}.wms.MMDL.*`, `mgmt.connect.wms-connector-{stage}.*`) so they do not collide with main/val/prod. Stage is supplied via CDK context or pipeline when deploying/synthesizing; it must be validated so that invalid characters do not break Kafka topic names or CDK/ECS resource names.

## Goals / Non-Goals

**Goals:**

- Add a topic namespace (or prefix) to environment config so that ephemeral stages get a non-empty namespace and main/val/production get none.
- Treat stage as the Git branch name for ephemeral; require stage where it is needed for namespacing (e.g. CDK context for synth/deploy).
- Validate the stage name before using it in topic names or service names; fail at synth or deploy with a clear error when invalid; align rules with Kafka topic naming and CDK/ECS naming constraints.

**Non-Goals:**

- Changing how main, val, or production resolve (no topic prefix).
- Changing the secrets fallback pattern or resource sizing.
- Implementing topic deletion for ephemeral (already designed elsewhere); this change is only namespacing and validation.

## Decisions

### 1. Where to add topic namespace

- **Choice:** Add an optional `topicNamespace` (or `topicPrefix`) to `EnvironmentConfig`. For main, val, production set it to empty string (or omit). For any other stage (ephemeral), set it to the validated stage value so that data topics and Connect internal topics can be prefixed (e.g. `topicNamespace` = stage → topics like `{stage}.wms.MMDL.PLAN_BASE_WVR_TBL`).
- **Rationale:** Keeps stage-based config in one place; CDK and connector config can read `topicNamespace` from `getEnvironmentConfig(stage)`.
- **Alternative:** Compute namespace in CDK only; rejected so that connector/runtime can use the same rule without duplicating logic.

### 2. How to distinguish ephemeral from named stages

- **Choice:** Treat only **main**, **val**, and **production** as named stages with no topic namespace. Any other stage string (e.g. Git branch name) is ephemeral and gets `topicNamespace = <validated-stage>`.
- **Rationale:** Simple and explicit; no separate “isEphemeral” flag—if it’s not main/val/production, it’s ephemeral.
- **Implementation:** In `getEnvironmentConfig(stage)`, if stage is main/val/production return the existing config with `topicNamespace: ''`. Otherwise return a config that includes sizing (e.g. fallback to main for CPU/memory) and `topicNamespace: validateStage(stage)`.

### 3. Stage validation rules

- **Choice:** Validate stage to satisfy Kafka topic naming and CDK/ECS naming. Kafka topic names allow alphanumeric, period, hyphen, underscore; length limits apply. CDK resource names and ECS service names have similar constraints (alphanumeric, hyphen). Reject stage if it contains disallowed characters (e.g. slash, space, uppercase if we normalize to lowercase). Optionally normalize (e.g. replace slash with hyphen, lowercase) only if documented and safe; otherwise reject invalid input and fail fast with a clear message.
- **Rationale:** Failing at synth/deploy avoids cryptic Kafka or CloudFormation errors later.
- **Implementation:** Add `validateStage(stage: string): string` (or throw). Call it when resolving config for ephemeral or when CDK receives stage from context; use validated value for `topicNamespace` and service names.

### 4. When to require and validate stage

- **Choice:** When deploying or synthesizing for an ephemeral stage, stage must be supplied (e.g. `-c stage=feature-xyz`). Validate as soon as stage is used for namespacing (e.g. in `getEnvironmentConfig` when stage is not main/val/production, or at CDK stack entry when stage is from context). Do not require stage for main/val/production (default can remain main).
- **Rationale:** Ephemeral deploys are explicit (branch pipeline or manual); named stages can keep current behavior.
- **Alternative:** Always require stage; rejected to avoid breaking existing “main” default.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-------------|
| Git branch name contains invalid characters (e.g. slash, space) | Validate and reject or normalize (e.g. slash → hyphen); document allowed pattern; fail at synth/deploy with message like “Stage must match …”. |
| Normalization changes meaning (e.g. two branches differ only by slash vs hyphen) | Prefer reject over normalize for ambiguous cases; if normalizing, document and keep it deterministic. |
| Ephemeral stage missing at deploy time | Require stage in context for non–main/val/production; CDK or script checks and errors with “Stage required for ephemeral deploy”. |

## Migration Plan

- Add `topicNamespace` to `EnvironmentConfig` and `getEnvironmentConfig` logic; add `validateStage`.
- Deploy as code change; no data migration. Existing main/val/production deploys unchanged (topicNamespace empty).
- Rollback: revert env config and CDK usage of topicNamespace; ephemeral topics may remain in MSK until cleaned up separately.

## Open Questions

- Exact validation regex or allow-list (e.g. `[a-z0-9][a-z0-9.-]*` or similar) to align with Kafka and CDK.
- Whether to normalize (e.g. to lowercase, slash to hyphen) or strictly reject; document choice in code and docs.
