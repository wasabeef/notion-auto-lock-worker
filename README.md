# create-notion-auto-lock-worker

Create an unofficial [Notion Worker](https://developers.notion.com/workers/get-started/overview) project that automatically locks stale Notion pages.

The generated Worker periodically scans configured Notion root pages and data sources, then locks pages that are still unlocked after a configurable period since their last edit.

This project is not made by, endorsed by, or affiliated with Notion.

## Quick Start

```bash
npm create notion-auto-lock-worker@latest my-auto-lock-worker
cd my-auto-lock-worker
npm install
```

Then configure Notion [Worker secrets](https://developers.notion.com/workers/guides/secrets) and deploy:

```bash
ntn login
ntn workers env set AUTO_LOCK_API_TOKEN=ntn_...
ntn workers env set AUTO_LOCK_ROOT_PAGE_IDS=...
ntn workers env set DRY_RUN=true
ntn workers env set LOCK_ROOT_PAGES=false
ntn workers deploy
```

Dry run is enabled by default in generated projects.

## What Gets Generated

- `src/index.ts`
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `.env.example`
- `README.md`

The generated project is private by default and can be deployed with `ntn workers deploy`.

The Notion CLI creates and manages `workers.json` when needed. Generated projects ignore `workers.json` because it contains workspace-specific deployment state.

## Live Example

This repository keeps one deployable Worker project in `example/`.

Use it when you want to run the Worker directly from this repository:

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

Keep `DRY_RUN=true` until the logs and `Auto Lock Runs` audit database look correct. `example/.gitignore` keeps `.env*`, `workers.json`, and `node_modules/` out of source control.

## CLI Options

```bash
npm create notion-auto-lock-worker@latest [directory] [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `--schedule <interval>` | `1h` | Worker sync schedule. Notion supports [interval schedules](https://developers.notion.com/workers/guides/syncs#set-a-schedule) from `5m` to `7d` |
| `--lock-after-minutes <number>` | `180` | Minutes after last edit before locking |
| `--audit-title <title>` | `Auto Lock Runs` | Managed audit database title |
| `--api-version <version>` | `2026-03-11` | Pinned Notion API version |
| `--force` | `false` | Overwrite matching files in a non-empty target directory |

Examples:

```bash
npm create notion-auto-lock-worker@latest my-worker --schedule 15m
npm create notion-auto-lock-worker@latest my-worker --lock-after-minutes 120
```

## Runtime Behavior

The generated Worker:

- uses [`worker.sync()`](https://developers.notion.com/workers/guides/syncs) with an interval schedule
- writes one summary row per run to a managed `Auto Lock Runs` audit database
- crawls configured root pages recursively
- treats configured root pages as crawl anchors by default
- follows child pages, child databases, and data sources under those root pages
- queries configured data sources directly
- paginates through Notion API results
- retrieves each candidate page immediately before locking
- sets [`is_locked: true`](https://developers.notion.com/reference/patch-page#locking-and-unlocking-a-page) only when the page is still old enough and unlocked
- locks configured root pages only when `LOCK_ROOT_PAGES=true`
- keeps `DRY_RUN=true` by default
- logs only counts, scope summaries, and safe error codes

## Schedule And Cost

The default schedule is `1h` to keep Worker runs predictable. Notion's [Workers syncs guide](https://developers.notion.com/workers/guides/syncs#set-a-schedule) documents interval schedules such as `5m`, `15m`, `1h`, and `1d`, with a minimum of `5m` and a maximum of `7d`.

As of 2026-06-23, Notion's [Workers pricing guide](https://www.notion.com/help/understand-pricing-for-workers) says Workers are free to try during beta on Business and Enterprise plans, and are expected to require Notion credits starting August 11, 2026. The same guide says each scheduled sync execution counts as one Worker run, Workers typically cost about `$0.0023` per run, and actual usage may vary based on how much work a Worker does.

Approximate examples at `$0.0023` per run:

| Schedule | Runs / month | Approx cost / month |
| --- | ---: | ---: |
| `1d` | 30 | `$0.07` |
| `1h` | 720 | `$1.66` |
| `30m` | 1,440 | `$3.31` |
| `15m` | 2,880 | `$6.62` |
| `5m` | 8,640 | `$19.87` |

The `1d`, `1h`, and `15m` examples align with Notion's published examples. `30m` and `5m` are simple estimates using the same per-run rate.

## Development

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

Run checks:

```bash
npm run check
```

`npm run check` runs unit tests, type-checks the worker template, generates a disposable project under `.tmp/generated`, installs its dependencies, and type-checks that generated project.

For the faster local loop:

```bash
npm run check:quick
```

To verify only the generated project path:

```bash
npm run check:generated
```

To verify the checked-in live example:

```bash
npm run check:example
```

Dry-run package contents:

```bash
npm run pack:dry-run
```

## Contributing And Security

See `CONTRIBUTING.md` for local development and pull request guidance.

Report vulnerabilities privately using `SECURITY.md`.

## Security

- Do not commit Notion tokens.
- Generated projects keep `.env` ignored. Store production values in [Worker secrets](https://developers.notion.com/workers/guides/secrets).
- Logs and audit rows avoid page titles, page content, property values, emails, full page URLs, and tokens.
- Prefer an [internal connection](https://developers.notion.com/guides/get-started/internal-connections) token for narrower access.
- Enable npm 2FA before publishing this package.

## References

- [Notion Workers overview](https://developers.notion.com/workers/get-started/overview)
- [Workers syncs guide](https://developers.notion.com/workers/guides/syncs)
- [Worker secrets](https://developers.notion.com/workers/guides/secrets)
- [Using the Notion API from a Worker](https://developers.notion.com/workers/guides/api-client)
- [Connection capabilities](https://developers.notion.com/reference/capabilities)
- [Update page API](https://developers.notion.com/reference/patch-page)
- [Workers pricing](https://www.notion.com/help/understand-pricing-for-workers)

## License

MIT
