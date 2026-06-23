# Contributing

Thanks for helping improve `create-notion-auto-lock-worker`.

## Local Setup

See `DEVELOPMENT.md` for the full local setup, check commands, and manual Notion validation flow.

```bash
mise install
npm install
```

Run the fast local checks:

```bash
npm run check:quick
```

Run the full check before opening a pull request:

```bash
npm run check
```

## Development Notes

- Keep generated Worker defaults conservative: `DRY_RUN=true`, `LOCK_ROOT_PAGES=false`, and `LOCK_AFTER_MINUTES=180`.
- Do not commit `.env`, `.env.cli`, `.env.production`, `workers.json`, tokens, page IDs from private workspaces, or generated `.tmp/` projects.
- Update `templates/worker/*`, `example/*`, `README.md`, `REQUIREMENTS.md`, and tests together when changing generated behavior.
- Prefer small pull requests that separate structural cleanup from behavior changes.

## Commit Messages

Use Conventional Commits:

```text
type(scope): description
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`, and `chore`.

Examples:

```text
feat(worker): crawl child databases
fix(scaffold): preserve generated gitignore
docs(readme): clarify dry-run setup
ci(release): add npm publish dry run
```

GitHub Release notes are generated from commit messages. User-facing `feat:`, `fix:`, and `perf:` commits are included by default. Internal commits are hidden unless their body contains:

```text
Release note: <public summary>
```

Use `Release note: skip` when a public-looking commit should stay out of release notes.

## Release Process

Releases are tag-driven. Maintainers should:

1. Update `package.json` and `package-lock.json` to the same version.
2. Run `npm run check`.
3. Create and push a `vX.Y.Z` tag that matches `package.json`.

The release workflow verifies the version, generates GitHub Release notes with `git-cliff`, and publishes to npm with provenance using the `NPM_TOKEN` repository secret.

## Manual Notion Checks

Use a non-production Notion workspace when possible. Start with `DRY_RUN=true`, inspect logs and the managed `Auto Lock Runs` database, then switch to live locking only after the scope is correct.
