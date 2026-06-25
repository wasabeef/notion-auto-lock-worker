# Agent Guide

This repository is maintained with AI agents in the loop. Use this file as the first stop for future sessions.

Keep `CLAUDE.md` intentionally aligned with this file. Duplication is preferred so Claude Code can work from `CLAUDE.md` even when it does not load `AGENTS.md`.

## Project Snapshot

- Product name: `Notion Auto Lock Worker`.
- npm package name: `create-notion-auto-lock-worker`.
- User command: `npm create notion-auto-lock-worker@latest`.
- Purpose: scaffold a Notion Worker that scans configured root pages and data sources, then locks stale unlocked pages.
- Runtime target: Node.js 22 or later and npm 10.9.2 or later.
- Notion Workers is beta; verify current CLI/API behavior before making release or operations claims.

## Repository Map

- `src/`: TypeScript scaffolder CLI.
- `templates/worker/`: generated Worker project template.
- `templates/worker/src/index.ts`: canonical generated Worker implementation.
- `example/`: checked-in generated project used for manual Notion validation.
- `test/`: root scaffolder tests.
- `scripts/check-generated.ts`: disposable generated-project verification under `.tmp/generated`.
- `REQUIREMENTS.md`: product requirements and implementation invariants.
- `DEVELOPMENT.md`: maintainer development and release workflow.
- `docs/MAINTAINER_OPERATIONS.md`: live Worker validation and troubleshooting runbook.

When changing generated Worker behavior, keep `templates/worker/` and `example/` aligned unless the change is intentionally template-only or example-only.

## Working Rules

- Keep user-facing README content concise. Put maintainer-only details in `DEVELOPMENT.md` or `docs/`.
- Keep English and Japanese README content conceptually aligned when changing public behavior.
- Do not commit secrets, real Notion tokens, root page IDs, worker IDs, workspace IDs, or generated local config.
- Do not print token values. Redact secrets in command output before sharing.
- Treat `example/.env.production`, `example/.env.cli`, and `example/workers.json` as local operational state. They are intentionally ignored.
- Prefer `mise exec -- ...` for commands that depend on project-local tools.
- Use `rg` for search.
- Use `apply_patch` for manual file edits.
- Do not run destructive git commands unless explicitly requested.
- Ask before committing. Commit requests require confirmation each time.

## Common Commands

Install tools and dependencies:

```bash
mise install
npm install
```

Fast validation:

```bash
npm run check:quick
```

Full validation:

```bash
npm run check
```

Generated project validation:

```bash
npm run check:generated
```

Example project validation:

```bash
npm run check:example
```

Package dry run:

```bash
npm --cache .tmp/npm-cache pack --dry-run
npm --cache .tmp/npm-cache publish --dry-run --access public
```

## Runtime Configuration Notes

Most Worker settings are read at run time:

- `AUTO_LOCK_API_TOKEN`
- `AUTO_LOCK_ROOT_PAGE_IDS`
- `AUTO_LOCK_DATA_SOURCE_IDS`
- `LOCK_AFTER_MINUTES`
- `DRY_RUN`
- `LOCK_ROOT_PAGES`
- `MAX_CRAWL_DEPTH`
- `MAX_CRAWL_PAGES`

`WORKER_SCHEDULE` is used when declaring the `worker.sync()` capability, so changing it should be followed by a deploy to refresh the capability schedule.

Root pages are crawl anchors by default. They are only lock candidates when `LOCK_ROOT_PAGES=true`.

## Live Notion Operations

Use `docs/MAINTAINER_OPERATIONS.md` before touching a live Worker.

Key reminders:

- `ntn workers env set KEY=value` updates remote Worker env.
- `ntn workers env list` shows keys and update timestamps, not values.
- `ntn workers env pull --no-file --yes` can print values. Redact immediately.
- `ntn workers deploy --no-git` updates deployed code/capabilities.
- `ntn workers sync trigger autoLockPages --preview` is safer for inspection.
- `ntn workers runs logs <run-id> --plain` is the fastest way to inspect summary counts.

## Release Notes

Release automation follows Conventional Commits and `.github/cliff.toml`.

Before tagging:

```bash
npm version patch --no-git-tag-version
npm run check
npm --cache .tmp/npm-cache publish --dry-run --access public
git commit -am "chore: bump version to vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

Publishing uses the `NPM_TOKEN` GitHub secret. If token-based publish hits 2FA problems, use npm Trusted Publishing or perform the first publish manually with browser authentication, then rerun the release workflow.

## Completion Checklist

Before handing off substantial work:

- `git status --short --branch` reviewed.
- Relevant tests or checks run, or the reason for skipping is stated.
- Secret scan covers tracked files when docs/config changed.
- README/README.ja.md checked if public behavior changed.
- `templates/worker/` and `example/` alignment checked when generated Worker behavior changed.
- Live Worker changes documented with commands and redacted output.
