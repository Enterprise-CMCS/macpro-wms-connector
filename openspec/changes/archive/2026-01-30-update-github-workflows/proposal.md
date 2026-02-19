## Why

The `.github` directory was copied from macpro-appian-connector and contains hardcoded references to that project's structure (e.g., `appian-connector`, `appian-alerts` stack names, `infra/` directory). These workflows will fail if used as-is because this project has a different CDK structure (root-level) and is missing expected files like `.nvmrc`. Additionally, the current CDK stack naming (`WmsConnectorStack-{stage}`) doesn't follow the kebab-case pattern used by Appian (`appian-connector-{stage}`), making cross-project consistency harder as more stacks are added.

## What Changes

- **CDK stack naming**: Update `src/bin/wms-connector.ts` to use kebab-case pattern `wms-connector-{stage}` to match Appian's `appian-connector-{stage}` pattern (enables future `wms-alerts-{stage}`, etc.)
- **deploy.yml**: Remove `working-directory: infra`, update CDK deploy command to use `wms-connector-$STAGE_NAME`
- **destroy.yml**: Remove `cd infra`, update CDK destroy command to use `wms-connector-$STAGE_NAME`
- **setup/action.yml**: Fix Node.js version configuration since `.nvmrc` doesn't exist (create `.nvmrc` with Node 20)
- **Update action versions**: Upgrade checkout, setup-node, and other actions to latest stable versions where applicable
- **PR/Issue templates**: Review and update any Appian-specific references in templates

## Capabilities

### New Capabilities
- `github-workflows`: Configuration for GitHub Actions workflows adapted for WMS connector deployment, including deploy, destroy, PR automation, and CI checks
- `cdk-stack-naming`: Consistent kebab-case stack naming pattern (`wms-connector-{stage}`) aligned with Appian connector conventions for cross-project consistency

### Modified Capabilities
_(none - this is new infrastructure for this repository)_

## Impact

- **CDK Code**: `src/bin/wms-connector.ts` stack ID changes from `WmsConnectorStack-{stage}` to `wms-connector-{stage}`
- **Workflows**: All 7 workflow files in `.github/workflows/` need review and updates
- **Actions**: Custom setup action needs Node.js version fix
- **New file**: Create `.nvmrc` with Node 20 to match setup action expectations
- **Templates**: PR and issue templates may need project-specific updates
- **CI/CD**: Once updated, enables automated deployment to main/val/production environments
