## Why

The project currently uses npm for installs and scripts. Other applications in our ecosystem use Yarn; switching this repo to Yarn keeps tooling consistent, simplifies shared CI patterns, and avoids mixed lockfiles across repos.

## What Changes

- Switch package manager from npm to Yarn.
- Add `yarn.lock` and remove `package-lock.json`.
- Update `package.json` scripts to use `yarn` / `yarn run` / `yarn exec` (or equivalent) instead of `npm run` and `npx`.
- Document Yarn usage in README or contributor docs (install, scripts, CI).
- **BREAKING**: Contributors and CI must use Yarn; `npm install` / `npm run` will no longer be the supported path.

## Capabilities

### New Capabilities

- `package-manager-yarn`: Use Yarn as the sole package manager for installs, scripts, and lockfile; document and enforce Yarn in local and CI usage.

### Modified Capabilities

- (none)

## Impact

- **package.json**: Scripts that reference `npm run` or `npx` (e.g. `synth`, `cdk`) will use Yarn equivalents.
- **Lockfile**: `package-lock.json` removed, `yarn.lock` added; `.gitignore` should ignore `package-lock.json` if present and not ignore `yarn.lock`.
- **CI / docs**: Any CI job or doc that assumes npm must be updated to use Yarn (e.g. `yarn install`, `yarn build`, `yarn synth`).
- **Dependencies**: No dependency changes; only the tool used to install and run them changes.
