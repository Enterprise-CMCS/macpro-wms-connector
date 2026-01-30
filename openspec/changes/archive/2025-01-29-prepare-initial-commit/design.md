## Context

The repo is ready for its first commit and push. Current state: `.gitignore` exists (node_modules, lib, cdk.out, package-lock.json, .env, etc.) but does not ignore `.cursor/`. `cdk.context.json` is present and contains account-specific context (e.g. availability zones keyed by account/region). The README is brief (Yarn, commands, link to docs). We need to ensure only appropriate files are tracked, no secrets or account IDs are committed, and the README is sufficient for first-time contributors and operators.

## Goals / Non-Goals

**Goals:**

- Update `.gitignore` so `.cursor/` and any other paths that must not be committed are ignored.
- Ensure no secrets or account identifiers in tracked files; handle `cdk.context.json` (ignore or sanitize).
- Improve README with overview, prerequisites, commands, doc links, and first-run/contributing guidance.

**Non-Goals:**

- Changing application code, CDK logic, or dependencies.
- Adding CI/CD pipelines or branch protection (can be done separately).
- Migrating or changing OpenSpec artifacts beyond what this change touches.

## Decisions

### 1. What to add to .gitignore

- **Choice:** Add `.cursor/` so Cursor IDE/tooling files are not committed. Add `cdk.context.json` so CDK-generated context (which can contain account/region-specific data) is not committed; each environment regenerates it as needed.
- **Rationale:** `.cursor/` is editor-specific and not part of the shared codebase. `cdk.context.json` is commonly gitignored to avoid committing account IDs and region-specific lookups; CDK will recreate it on next synth.
- **Alternative:** Keep `cdk.context.json` and sanitize it (e.g. remove account key); rejected because the file is fully generated and best kept local.

### 2. Handling existing cdk.context.json

- **Choice:** Add `cdk.context.json` to `.gitignore`. If it is currently tracked, remove it from the index (e.g. `git rm --cached cdk.context.json`) so it stops being committed; keep the file locally so synth still works.
- **Rationale:** Prevents account ID (and other context) from ever being committed; aligns with common CDK practice.
- **Alternative:** Commit a sanitized template; rejected because CDK context is environment-specific and regenerated automatically.

### 3. README structure and content

- **Choice:** Expand README with: (1) project name and one-line description; (2) what the connector does (Oracle CDC → Kafka via Debezium); (3) prerequisites (Node 18+, Yarn, AWS CLI/CDK bootstrap if deploying); (4) install and main commands (yarn install, build, synth, cdk); (5) link to `docs/wms-config-details.md` for Oracle/Debezium details; (6) short “First run” or “Contributing” section (clone, install, build, synth). Keep tone concise and scannable.
- **Rationale:** Gives new contributors and operators enough to clone, install, and run without digging through the repo; first push is safe and useful.
- **Alternative:** Separate CONTRIBUTING.md; optional later; README can link to it if added.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-------------|
| Developers lose local cdk.context.json | File stays on disk; only untracked. Document in README that `cdk synth` will recreate context if missing. |
| .cursor/ already committed | Add to .gitignore and remove from index if needed (`git rm -r --cached .cursor`); history will still contain old commits until next push (acceptable for first push if .cursor was never pushed). |
| README too long | Keep to one page; details in docs/wms-config-details.md. |

## Migration Plan

1. Update `.gitignore`: add `.cursor/` and `cdk.context.json`.
2. If `cdk.context.json` is tracked: run `git rm --cached cdk.context.json` (do not delete the file locally).
3. If `.cursor/` was ever committed: run `git rm -r --cached .cursor` (optional; only if it was tracked).
4. Rewrite README with overview, prerequisites, commands, doc link, first-run section.
5. Spot-check: no literal secrets or account IDs in tracked files (grep for account ID patterns, "password", etc. in code/config; docs may have placeholders like `<password>`).
6. First commit and push.

**Rollback:** Revert the commit; restore previous README and .gitignore if needed; re-add cdk.context.json to tracking only if the team explicitly wants to commit it (not recommended).

## Open Questions

- None for this change; scope is limited to ignore rules, no secrets/account IDs, and README.
