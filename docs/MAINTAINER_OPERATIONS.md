# Maintainer Operations

This runbook is for maintainers validating or operating a real Notion Worker from this repository. It intentionally avoids private workspace IDs, page IDs, worker IDs, and token values.

## Local State

The checked-in `example/` project is the manual validation project.

Ignored local files commonly used during validation:

- `example/.env.production`: local copy of remote Worker env values.
- `example/.env.cli`: optional local CLI helper env.
- `example/workers.json`: Notion CLI worker binding for this project.
- `example/dist/`: compiled generated Worker output.

Do not commit those files or paste their secret values into issue comments, PRs, logs, or chat.

## Setup

```bash
mise install
npm install
cd example
npm install
mise exec -- ntn login
mise exec -- ntn debug
```

Use `mise exec -- ntn ...` so future sessions use the same project-local toolchain.

## Check Remote Worker State

List remote env keys and update timestamps:

```bash
mise exec -- ntn workers env list
```

Pull env values only when necessary, and redact immediately:

```bash
mise exec -- ntn workers env pull --no-file --yes
```

Check sync status:

```bash
mise exec -- ntn workers sync status --no-watch --plain
```

List recent runs:

```bash
mise exec -- ntn workers runs list --plain
```

Inspect a run summary:

```bash
mise exec -- ntn workers runs logs <run-id> --plain
```

The Worker logs a `notion_auto_lock_summary` event. Useful fields:

- `dryRun`
- `lockRootPages`
- `scope`
- `lockAfterMinutes`
- `checkedPageCount`
- `eligiblePageCount`
- `lockedPageCount`
- `skippedPageCount`
- `errorCount`
- `crawledPageCount`
- `crawledBlockCount`
- `crawledDatabaseCount`
- `crawledDataSourceCount`
- `crawlLimitReached`

If `LOCK_ROOT_PAGES=false`, root pages are counted as crawled pages but are not checked as lock candidates.

## Update Remote Env

Set a single value:

```bash
mise exec -- ntn workers env set LOCK_ROOT_PAGES=true
```

Push a local env file:

```bash
mise exec -- ntn workers env push --file .env.production
```

Prefer single-key `env set` for small production changes. It lowers the chance of overwriting unrelated remote values from a stale local file.

Runtime env changes such as `DRY_RUN`, `LOCK_AFTER_MINUTES`, `LOCK_ROOT_PAGES`, root IDs, and data source IDs do not require a code deploy.

`WORKER_SCHEDULE` affects the `worker.sync()` capability declaration. After changing it, deploy the Worker so Notion refreshes the schedule.

## Deploy Code Or Capability Changes

From `example/`:

```bash
npm run check
mise exec -- ntn workers deploy --no-git
```

Deploy when:

- `example/src/index.ts` changes.
- the generated Worker dependencies or build output change.
- `WORKER_SCHEDULE` changes.
- Notion CLI requires a capability refresh.

## Trigger A Run

Preview mode:

```bash
mise exec -- ntn workers sync trigger autoLockPages --preview
```

Live run:

```bash
mise exec -- ntn workers sync trigger autoLockPages
```

Use preview first when validating scope or lock counts. Use live trigger only when `DRY_RUN=false` and locking is intended.

## Investigate An Unlocked Page

1. Normalize the page ID from the Notion URL by removing hyphens.
2. Retrieve the page through the same Notion API token used by the Worker.
3. Check `is_locked`, `last_edited_time`, and `parent`.
4. Check whether the page ID is in `AUTO_LOCK_ROOT_PAGE_IDS`.
5. If `parent.type` is `workspace` and the page is configured as a root, verify `LOCK_ROOT_PAGES`.
6. Inspect the latest `notion_auto_lock_summary`.
7. If `errorCount > 0`, inspect `notion_auto_lock_page_error` events.

Common explanation:

- A configured root page remains unlocked when `LOCK_ROOT_PAGES=false`; it is used only as a crawl anchor.
- A recently edited page remains unlocked until `LOCK_AFTER_MINUTES` has elapsed and the next scheduled sync runs.
- A page outside the shared connection scope cannot be crawled or locked.
- A linked database is not expanded by the Notion API; include the original data source in scope.

## Maintainer Validation Profile

The maintainer's live validation Worker may intentionally differ from package defaults. Before assuming behavior, pull and inspect the remote env.

The latest known validation profile used during OSS launch was:

- `WORKER_SCHEDULE=3h`
- `LOCK_AFTER_MINUTES=60`
- `DRY_RUN=false`
- `LOCK_ROOT_PAGES=true`

Do not encode private root page IDs or worker IDs in tracked files.

## Release Publishing Notes

The package is public on npm as `create-notion-auto-lock-worker`.

For a release:

```bash
npm version patch --no-git-tag-version
npm run check
npm --cache .tmp/npm-cache publish --dry-run --access public
git commit -am "chore: bump version to vX.Y.Z"
git tag vX.Y.Z
git push origin main vX.Y.Z
```

If GitHub Actions npm publish fails because of npm 2FA, confirm whether `NPM_TOKEN` is a publish-capable token with 2FA bypass or switch to npm Trusted Publishing.
