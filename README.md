# Notion Auto Lock Worker

Create an unofficial [Notion Worker](https://developers.notion.com/workers/get-started/overview) that automatically locks stale Notion pages.

The generated Worker scans configured root pages and data sources on a schedule, then locks pages that are still unlocked after the configured waiting period.

> Notion Workers is currently in beta. APIs, CLI commands, pricing, templates, and hosting behavior may change.

This project is not made by, endorsed by, or affiliated with Notion.

## Quick Start

```bash
npm create notion-auto-lock-worker@latest my-auto-lock-worker
cd my-auto-lock-worker
npm install
npm run check
ntn login
```

Create a Notion connection or personal access token with [`Read content` and `Update content`](https://developers.notion.com/reference/capabilities). If you use an internal connection, share the target root pages or databases with that connection.

Set Worker secrets and deploy:

```bash
ntn workers env set AUTO_LOCK_API_TOKEN=ntn_...
ntn workers env set AUTO_LOCK_ROOT_PAGE_IDS=...
ntn workers env set DRY_RUN=true
ntn workers deploy
```

Keep `DRY_RUN=true` until the audit log looks correct. The generated project includes its own README with detailed setup, dry-run, deploy, and troubleshooting steps.

## Configuration

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `AUTO_LOCK_API_TOKEN` | yes | none | Notion API token |
| `AUTO_LOCK_ROOT_PAGE_IDS` | conditional | none | Comma-separated root page IDs to crawl recursively |
| `AUTO_LOCK_DATA_SOURCE_IDS` | conditional | none | Comma-separated data source IDs to query directly |
| `LOCK_AFTER_MINUTES` | no | `180` | Minutes after last edit before locking |
| `DRY_RUN` | no | `true` | Count eligible pages without locking them |
| `LOCK_ROOT_PAGES` | no | `false` | Lock configured root pages themselves |
| `PAGE_SIZE` | no | `100` | Notion API pagination size |
| `MAX_CRAWL_DEPTH` | no | `10` | Maximum nested crawl depth |
| `MAX_CRAWL_PAGES` | no | `1000` | Maximum pages to crawl in one run |

Set at least one of `AUTO_LOCK_ROOT_PAGE_IDS` or `AUTO_LOCK_DATA_SOURCE_IDS`.

## Behavior

- Runs as a scheduled [`worker.sync()`](https://developers.notion.com/workers/guides/syncs).
- Crawls root pages, child pages, child databases, and data sources.
- Locks pages with [`is_locked: true`](https://developers.notion.com/reference/patch-page#locking-and-unlocking-a-page) only after rechecking that they are still old enough and unlocked.
- Treats configured root pages as crawl anchors unless `LOCK_ROOT_PAGES=true`.
- Writes one summary row per run to a managed `Auto Lock Runs` audit database.

## Schedule And Cost

The default schedule is `1h`, and the default lock delay is `180` minutes. Notion supports [interval schedules](https://developers.notion.com/workers/guides/syncs#set-a-schedule) from `5m` to `7d`.

As of 2026-06-23, Notion's [Workers pricing guide](https://www.notion.com/help/understand-pricing-for-workers) says scheduled sync executions count as Worker runs, Workers typically cost about `$0.0023` per run, and actual usage may vary.

| Schedule | Runs / month | Approx cost / month |
| --- | ---: | ---: |
| `1d` | 30 | `$0.07` |
| `1h` | 720 | `$1.66` |
| `15m` | 2,880 | `$6.62` |
| `5m` | 8,640 | `$19.87` |

Customize the generated Worker:

```bash
npm create notion-auto-lock-worker@latest my-worker --schedule 15m
npm create notion-auto-lock-worker@latest my-worker --lock-after-minutes 120
```

## Security

- Do not commit Notion tokens.
- Generated projects keep `.env` ignored. Store production values in [Worker secrets](https://developers.notion.com/workers/guides/secrets).
- Logs and audit rows avoid page titles, page content, property values, emails, full page URLs, and tokens.
- Prefer an [internal connection](https://developers.notion.com/guides/get-started/internal-connections) token for narrower access.
- Report vulnerabilities privately using `SECURITY.md`.

## References

- [Notion Workers overview](https://developers.notion.com/workers/get-started/overview)
- [Official Notion Workers template](https://github.com/makenotion/workers-template)
- [Workers syncs guide](https://developers.notion.com/workers/guides/syncs)
- [Worker secrets](https://developers.notion.com/workers/guides/secrets)
- [Connection capabilities](https://developers.notion.com/reference/capabilities)
- [Update page API](https://developers.notion.com/reference/patch-page)
- [Workers pricing](https://www.notion.com/help/understand-pricing-for-workers)

## License

MIT
