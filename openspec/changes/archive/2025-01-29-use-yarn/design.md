## Context

The repo currently uses npm: `package-lock.json` exists, and `package.json` scripts use `npm run` and `npx` (e.g. `synth`, `cdk`). Other applications in the ecosystem use Yarn; this change aligns tooling and lockfile format for consistency and shared CI.

## Goals / Non-Goals

**Goals:**

- Use Yarn as the sole package manager for install, scripts, and lockfile.
- Update all script invocations to Yarn equivalents (`yarn`, `yarn run`, `yarn exec`).
- Document Yarn usage in README or contributor docs (install, scripts, CI).
- Remove npm lockfile and add `yarn.lock`; ensure `.gitignore` does not ignore `yarn.lock`.

**Non-Goals:**

- Changing dependencies or Node/engine requirements.
- Migrating other repos; this design applies only to macpro-wms-connector.
- Adding Yarn plugins or workspaces unless needed for consistency with other apps.

## Decisions

### 1. Yarn version (Classic vs Berry)

- **Choice:** Use Yarn Classic (1.x) unless the team standard is Yarn Berry (2+). Classic is the default `yarn` in many environments and matches typical “use Yarn” expectations; Berry has different config (e.g. `.yarnrc.yml`, PnP) and would be a larger change.
- **Rationale:** Minimize surprise; align with “Yarn instead of npm” as understood elsewhere. If the org standard is Berry, switch to Berry in a follow-up.
- **Implementation:** Use `yarn` (Classic) for install and scripts; add `yarn.lock` and optional `.yarnrc` only if needed (e.g. engine strictness).

### 2. Script updates in package.json

- **Choice:** Replace `npm run` with `yarn run` (or bare `yarn <script>`) and `npx` with `yarn exec`. Keep script names unchanged (`build`, `synth`, `cdk`).
- **Rationale:** Same behavior, different CLI; no need to change CDK or tsc usage.
- **Example:** `"synth": "yarn run build && yarn exec cdk synth"` or `"synth": "yarn build && yarn cdk synth"` (if cdk is a dependency bin). Prefer the form used in other apps for consistency.

### 3. Lockfile and .gitignore

- **Choice:** Remove `package-lock.json` from the repo; add `yarn.lock` and commit it. Ensure `.gitignore` does not ignore `yarn.lock`. Optionally add `package-lock.json` to `.gitignore` to avoid accidental re-creation.
- **Rationale:** Single source of truth for installs; CI and local use the same lockfile.

### 4. CI and documentation

- **Choice:** Update any CI that runs install/build/synth to use `yarn install`, `yarn build`, `yarn synth` (or equivalent). Document in README that the project uses Yarn and list the main commands.
- **Rationale:** Contributors and pipelines must use Yarn after the switch; docs and CI are the contract.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-------------|
| Contributors run `npm install` by habit | Document Yarn in README; optional `preinstall` script that exits with a message when npm is used (if desired). |
| CI still uses npm | Update CI config as part of this change; verify pipeline after merge. |
| Lockfile drift (yarn.lock vs previous package-lock.json) | Generate `yarn.lock` from current `package.json` (e.g. `yarn install`), then run tests/synth to confirm; no dependency changes intended. |
| Yarn not installed in CI image | Use an image or step that includes Yarn, or install Yarn in CI (e.g. corepack enable), consistent with other apps. |

## Migration Plan

1. Add Yarn: ensure Yarn is available locally (and in CI). Run `yarn install` to create `yarn.lock` from current `package.json`.
2. Update `package.json` scripts to use `yarn` / `yarn run` / `yarn exec`.
3. Remove `package-lock.json`; add `package-lock.json` to `.gitignore` if not already; ensure `yarn.lock` is not ignored.
4. Update README (and any contributor/CI docs) with Yarn install and command examples.
5. Update CI to use Yarn for install and run steps.
6. Verify: `yarn install`, `yarn build`, `yarn synth` (and `yarn cdk` if used) succeed locally and in CI.
7. **Rollback:** Revert the commit; restore `package-lock.json` from git history if needed; switch CI back to npm.

## Open Questions

- (Resolved) Use Yarn Classic (1.x) with simple but smart npm guards in scripts (e.g. lifecycle script that detects npm and exits with a clear message; does not run when Yarn is used).
