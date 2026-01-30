## 1. Stage validation

- [x] 1.1 Add validateStage(stage: string): string (or throw) in src/environment-config.ts; align with Kafka topic naming and CDK/ECS naming (e.g. alphanumeric, hyphen, period, underscore; reject slash, space, or document normalization)
- [x] 1.2 Document allowed stage pattern and reject vs normalize behavior in code comments or docs

## 2. Environment config (topic namespace)

- [x] 2.1 Add optional topicNamespace to EnvironmentConfig interface; set to empty string for main, val, production in environmentConfigs
- [x] 2.2 Update getEnvironmentConfig(stage): for main/val/production return existing config with topicNamespace ''; for any other stage (ephemeral) validate stage, then return config with sizing fallback to main and topicNamespace = validated stage

## 3. CDK integration

- [x] 3.1 Use topicNamespace from getEnvironmentConfig(stage) in CDK stack when configuring connector or topic naming (if applicable)
- [x] 3.2 Validate stage at CDK stack entry when stage is from context and is not main/val/production; fail synth/deploy with clear error if stage is missing or invalid for ephemeral

## 4. Docs

- [x] 4.1 Document that ephemeral stage = Git branch name, validation rules, and that stage is required when deploying/synthesizing for ephemeral (e.g. in docs/wms-config-details.md or README)
