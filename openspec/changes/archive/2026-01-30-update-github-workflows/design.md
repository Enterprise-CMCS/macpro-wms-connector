## Context

The WMS connector project inherited its `.github` directory from macpro-appian-connector. While the workflow structure is sound, the copied files contain Appian-specific references that will cause CI/CD failures:

- **Current state**: Workflows reference `infra/` directory (doesn't exist here - CDK is at root), Appian stack names, and `.nvmrc` (missing)
- **CDK structure difference**: Appian uses `infra/` subdirectory; WMS has CDK at project root
- **Stack naming inconsistency**: WMS uses `WmsConnectorStack-{stage}` (PascalCase) while Appian uses `appian-connector-{stage}` (kebab-case)

## Goals / Non-Goals

**Goals:**
- Enable working CI/CD pipelines for main/val/production deployments
- Establish consistent kebab-case stack naming (`wms-connector-{stage}`) matching Appian patterns
- Create `.nvmrc` to support the setup action's Node.js version detection
- Update action versions to current stable releases (v4 where available)

**Non-Goals:**
- Adding new workflow capabilities beyond what exists in Appian
- Creating `wms-alerts` stack (future work, but naming convention supports it)
- Modifying PR/issue template content beyond removing Appian references

## Decisions

### 1. Stack naming pattern: `wms-connector-{stage}`

**Choice**: Use kebab-case pattern `wms-connector-{stage}` matching Appian's `appian-connector-{stage}`

**Rationale**:
- Cross-project consistency makes operations easier
- Prepares for future stacks (`wms-alerts-{stage}`)
- CloudFormation stack names are case-insensitive anyway, but kebab-case is conventional

**Alternative considered**: Keep `WmsConnectorStack-{stage}` — rejected because it diverges from established patterns

### 2. CDK execution: Root directory (no `infra/` subdirectory)

**Choice**: Run CDK commands from project root, not `infra/`

**Rationale**: This project's CDK is already at root level (`src/bin/`, `src/cdk/`). No need to change project structure.

**Alternative considered**: Move CDK to `infra/` to match Appian — rejected as unnecessary restructuring

### 3. Node.js version management: Create `.nvmrc` with Node 20

**Choice**: Create `.nvmrc` containing `20` to work with existing setup action

**Rationale**:
- `package.json` already specifies `"node": ">=18"`
- Node 20 is current LTS
- Keeps setup action working without modification

**Alternative considered**: Modify setup action to use explicit version — rejected because `.nvmrc` is the standard pattern

### 4. Deploy single stack initially

**Choice**: Deploy only `wms-connector-$STAGE_NAME` (single stack for now)

**Rationale**: Unlike Appian which has both connector and alerts stacks, WMS currently only has the connector stack. When alerts are added, the workflow can be extended.

## Risks / Trade-offs

**[Risk] Stack rename requires destroy/redeploy for existing deployments**
→ Mitigation: This is a new project with no existing deployments. If there were, CloudFormation stack rename isn't supported — would need to destroy old stack first.

**[Risk] Workflows may have other Appian-specific assumptions not yet identified**
→ Mitigation: Review each workflow file line-by-line during implementation; test in ephemeral branch before merging.

**[Trade-off] Single stack in deploy command vs. future multi-stack**
→ Accepted: Simpler now; easy to add more stacks to the command later.
