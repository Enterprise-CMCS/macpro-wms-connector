## 1. Lockfile and .gitignore

- [x] 1.1 Run `yarn install` to create `yarn.lock` from current package.json (no dependency changes)
- [x] 1.2 Remove `package-lock.json` from the repo
- [x] 1.3 Add `package-lock.json` to `.gitignore` to avoid accidental re-creation; ensure `yarn.lock` is not ignored

## 2. package.json scripts

- [x] 2.1 Update `synth` script to use Yarn (e.g. `yarn build && yarn cdk synth` or `yarn run build && yarn exec cdk synth`)
- [x] 2.2 Update `cdk` script to use Yarn (e.g. `yarn build && yarn cdk` or equivalent)
- [x] 2.3 Add a simple, smart npm guard (e.g. `preinstall` script) that detects npm (e.g. via `npm_config_user_agent`) and exits with a clear message to use Yarn; ensure the guard does not run when Yarn is used so install and CI succeed

## 3. Documentation

- [x] 3.1 Update README (or contributor docs) to state that the project uses Yarn and list main commands: `yarn install`, `yarn build`, `yarn synth`, `yarn cdk`

## 4. CI (if present)

- [x] 4.1 Update any CI config (e.g. GitHub Actions, other pipelines) to use `yarn install`, `yarn build`, `yarn synth` instead of npm; ensure Yarn is available in the CI environment

## 5. Verify

- [x] 5.1 Run `yarn install`, `yarn build`, `yarn synth` locally and confirm they succeed
- [x] 5.2 Confirm `npm install` (or `npm run build`) fails with the guard message when npm is used
