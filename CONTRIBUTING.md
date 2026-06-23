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

## Manual Notion Checks

Use a non-production Notion workspace when possible. Start with `DRY_RUN=true`, inspect logs and the managed `Auto Lock Runs` database, then switch to live locking only after the scope is correct.
