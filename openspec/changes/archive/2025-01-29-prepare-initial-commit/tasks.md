## 1. .gitignore

- [x] 1.1 Add `.cursor/` to `.gitignore` so Cursor IDE/tooling files are not committed
- [x] 1.2 Add `cdk.context.json` to `.gitignore` so CDK-generated context (account/region) is not committed
- [x] 1.3 Confirm `.gitignore` already ignores node_modules, lib, cdk.out, package-lock.json, .env/.env.*; confirm `yarn.lock` is NOT ignored

## 2. Remove sensitive or uncommittable files from tracking

- [x] 2.1 If `cdk.context.json` is tracked, run `git rm --cached cdk.context.json` (keep file locally; do not delete)
- [x] 2.2 If `.cursor/` is tracked, run `git rm -r --cached .cursor` (optional; only if it was ever committed)

## 3. No secrets or account IDs

- [x] 3.1 Spot-check tracked source and config files for literal secrets (passwords, API keys); confirm only placeholders or runtime resolution (Secrets Manager) are used
- [x] 3.2 Spot-check tracked files for AWS account ID patterns (e.g. 12-digit IDs); confirm none after cdk.context.json is ignored/untracked

## 4. README

- [x] 4.1 Expand README with project name and one-line description (WMS Oracle CDC to Kafka via Debezium on ECS)
- [x] 4.2 Add prerequisites: Node 18+, Yarn (Classic 1.x), and that the project uses Yarn (not npm); add AWS CLI / CDK bootstrap if deploying
- [x] 4.3 List main commands: `yarn install`, `yarn build`, `yarn synth`, `yarn cdk` (with brief explanations)
- [x] 4.4 Add link to `docs/wms-config-details.md` for Oracle CDC, Debezium, stages, and secrets
- [x] 4.5 Add short first-run or contributing section: clone, yarn install, yarn build, yarn synth (and note that cdk synth recreates context if missing)

## 5. Verify

- [x] 5.1 Confirm `git status` shows no unintended tracked files (e.g. no .cursor, no cdk.context.json) and README/.gitignore changes are staged as intended
- [x] 5.2 Run `yarn install` and `yarn build` (and optionally `yarn synth`) to ensure repo still works after changes
