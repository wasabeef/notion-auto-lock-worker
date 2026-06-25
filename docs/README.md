# Docs

Maintainer-oriented documentation lives here. User-facing setup should stay in the root `README.md` and `README.ja.md`.

## Files

- `MAINTAINER_OPERATIONS.md`: live Notion Worker operations, remote env handling, manual validation, and troubleshooting.

## Current State Checks

Do not rely on stale session memory. Verify current external state when needed:

```bash
npm view create-notion-auto-lock-worker version dist-tags.latest repository.url homepage --json
gh release list --repo wasabeef/notion-auto-lock-worker --limit 5
gh run list --repo wasabeef/notion-auto-lock-worker --limit 5
```

Use `mise exec -- ntn ...` from `example/` for live Notion Worker checks.
