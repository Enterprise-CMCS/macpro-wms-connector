## Why

Ephemeral environments (feature branches) need topic namespacing so their Kafka topics and Connect internal topics are isolated from main, val, and production. The stage name is the Git branch name; topic and service names are derived from it. Environment config currently has no topic namespace field, so ephemeral deployments cannot be configured correctly. We also need to validate the stage name so that invalid characters or patterns do not produce errors in Kafka topic names or ECS/service names.

## What Changes

- **Environment config:** Add a topic namespace (or equivalent) to environment config so that ephemeral stages get a prefix for data topics and Connect internal topics (e.g. `{stage}.wms.MMDL.*`, `mgmt.connect.wms-connector-{stage}.*`). Main, val, and production continue to have no prefix.
- **Stage source:** Treat stage as the Git branch name when deploying or synthesizing for ephemeral; require stage to be supplied where needed (e.g. CDK context or pipeline variable).
- **Stage validation:** Validate the stage name before using it in topic names or service names. Reject or normalize values that would break Kafka topic naming rules (e.g. invalid characters) or cause CDK/ECS naming errors, and fail fast at synth or deploy time with a clear error.

## Capabilities

### New Capabilities

- `ephemeral-topic-namespacing`: Topic namespace in environment config for ephemeral stages (stage = Git branch name); derivation of topic prefix from stage; main/val/production remain non-namespaced.
- `stage-validation`: Validation of stage name for use in topic names and service names; rules aligned with Kafka and CDK/ECS constraints; validation applied when stage is required (e.g. synth or deploy); clear failure message when invalid.

### Modified Capabilities

- _(None; openspec/specs/ is empty. If this change later aligns with archived environment-and-topics spec, that would be a sync to main, not a modified capability here.)_

## Impact

- **Code:** `src/environment-config.ts` — add topic namespace (or prefix) to `EnvironmentConfig` and/or `getEnvironmentConfig`; add or use a stage validation function; ensure ephemeral stages resolve to a namespace while main/val/production do not.
- **CDK:** Stage context may be required for ephemeral deploys; validation of stage at synth/deploy when used for namespacing; possible normalization (e.g. slash to hyphen) if safe and documented.
- **Docs:** Document that ephemeral stage = Git branch name, validation rules, and that stage is required when deploying/synthesizing for ephemeral.
