## 1. CDK Stack Naming

- [x] 1.1 Update `src/bin/wms-connector.ts` to use kebab-case stack ID `wms-connector-{stage}` instead of `WmsConnectorStack-{stage}`

## 2. Project Configuration

- [x] 2.1 Create `.nvmrc` file at project root containing `20`

## 3. Deploy Workflow

- [x] 3.1 Update `deploy.yml` to remove `working-directory: infra` from build step
- [x] 3.2 Update `deploy.yml` CDK deploy command to use `wms-connector-$STAGE_NAME` (single stack, no `cd infra`)
- [x] 3.3 Update action versions in `deploy.yml` to v4 where applicable

## 4. Destroy Workflow

- [x] 4.1 Update `destroy.yml` to remove `cd infra` from CDK destroy step
- [x] 4.2 Update `destroy.yml` CDK destroy command to use `wms-connector-$STAGE_NAME`
- [x] 4.3 Update action versions in `destroy.yml` to v4 where applicable

## 5. Setup Action

- [x] 5.1 Verify `setup/action.yml` works with new `.nvmrc` (no changes expected if `.nvmrc` created)

## 6. Other Workflows

- [x] 6.1 Update `pre-commit.yml` action versions (checkout v3→v4, setup-python v2→v5)
- [x] 6.2 Update `dependency-review.yml` action versions (checkout v3→v4, dependency-review v2→v4)
- [x] 6.3 Update `auto-create-pr-val.yml` checkout action version (v3→v4)
- [x] 6.4 Update `auto-create-pr-production.yml` checkout action version (v3→v4)

## 7. Verification

- [x] 7.1 Run `yarn build` to verify CDK compiles with new stack naming
- [x] 7.2 Run `yarn synth` to verify CloudFormation template generates with correct stack name
