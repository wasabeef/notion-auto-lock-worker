# Development

This document is for maintainers and contributors working on `create-notion-auto-lock-worker`.

## Local Setup

Install project-local tools with mise:

```bash
mise install
mise reshim
node --version
npm --version
ntn --version
```

Install dependencies:

```bash
npm install
```

## Checks

Run the full check:

```bash
npm run check
```

`npm run check` runs TypeScript unit tests, type-checks the scaffolder and worker template, builds the published CLI output, generates a disposable project under `.tmp/generated`, installs its dependencies, builds it, and type-checks it.

For a faster local loop:

```bash
npm run check:quick
```

Verify only the generated project path:

```bash
npm run check:generated
```

Verify the checked-in example project:

```bash
npm run check:example
```

Dry-run package contents:

```bash
npm run pack:dry-run
```

`npm pack` runs `npm run build` through `prepack`, so the published package includes generated `dist/` CLI files even though `dist/` is ignored by git.

If your local npm cache has permission issues, use a project-local cache:

```bash
npm --cache .tmp/npm-cache pack --dry-run
```

Verify publish metadata without publishing:

```bash
npm --cache .tmp/npm-cache publish --dry-run --access public
```

## Release Automation

This repository follows the same release-note style as [`wasabeef/AgentNote`](https://github.com/wasabeef/AgentNote):

- `main` and pull requests run CI on Node.js 22 and 26.
- CI runs `npm run check`, `npm pack --dry-run`, and `npm publish --dry-run`.
- Pushing a `vX.Y.Z` tag starts `.github/workflows/release.yml`.
- The tag version must match `package.json` and `package-lock.json`.
- GitHub Release notes are generated from Conventional Commits with `.github/cliff.toml`.
- npm publish uses the `NPM_TOKEN` secret and provenance.

Before tagging:

```bash
npm version patch --no-git-tag-version
npm run check
npm --cache .tmp/npm-cache publish --dry-run --access public
git commit -am "chore: bump version to vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

## Official Template Alignment

This project follows the shape of the official [`makenotion/workers-template`](https://github.com/makenotion/workers-template) where it applies to generated Worker projects:

- Generated projects provide `npm run build` and `npm run check`.
- Generated projects target Node.js 22 or later and npm 10.9.2 or later.
- The root scaffolder and generated Worker template are both TypeScript.
- TypeScript uses `NodeNext`, strict checking, and the same compatibility options as the official template.
- Root tests and generated-project validation run TypeScript directly with `tsx`, matching the official template's dev tooling.
- User-facing docs call out that Notion Workers is currently beta.

The schedule minimum follows the current [Workers syncs guide](https://developers.notion.com/workers/guides/syncs#set-a-schedule), which documents `5m` as the minimum interval.

## Manual Notion Validation

The checked-in `example/` project is used for manual validation against a real Notion workspace.

```bash
cd example
npm install
cp .env.example .env.production
```

Edit `.env.production`, then push it to the remote Worker environment:

```bash
ntn workers create --name notion-auto-lock
ntn workers env push --file .env.production
ntn workers deploy --no-git
ntn workers sync trigger autoLockPages
```

Keep `DRY_RUN=true` until the logs and `Auto Lock Runs` audit database look correct.

`example/.gitignore` keeps `.env*`, `workers.json`, `node_modules/`, and `dist/` out of source control.
