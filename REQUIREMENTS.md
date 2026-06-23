# notion-auto-lock-worker 要件定義

## 目的

`notion-auto-lock-worker` は、指定した Notion root page または data source 配下のページを定期的に確認し、最終更新から一定時間が経過した未ロックページを自動でロックする Notion Workers 向け OSS である。

編集完了後のページを自動で保護し、意図しない追記・変更・誤操作を減らすことを目的とする。

## 背景と前提

Notion のページロックは手動操作が必要であり、運用ルールとして「編集後にロックする」ことを徹底するのは難しい。

Notion API にはページの `last_edited_time` と `is_locked` が存在し、`pages.update` の `is_locked: true` でページを Notion app UI 上の編集から保護できる。ただし、ページロックは API からの更新を禁止しない。

MVP は Notion の page / block / database / data source API を対象とし、deprecated database query API は対象外とする。対象範囲は利用者が明示した root page または data source に限定する。

Notion Public API の search endpoint は workspace 全体を漏れなく列挙する用途には最適化されていないため、MVP では「workspace 全体」ではなく「connection が access でき、利用者が root として明示した範囲」を監視対象とする。

Notion Workers には汎用 cron job ではなく schedule 付きの `worker.sync()` があるため、MVP では scheduled sync capability を実行トリガーとして使う。`worker.sync()` は managed database を必要とするため、ロック対象 data source とは別に、実行履歴を書き込む最小限の managed audit database を作成する。

## 対象ユーザー

- Notion をドキュメント管理・ナレッジ管理に使っている個人・チーム
- 編集後のページを一定時間後に自動ロックしたいユーザー
- Notion Workers と Notion API を使った軽量な automation を導入したいユーザー
- 自前の server / cron / queue を持たずに Notion 側で完結する automation を使いたいユーザー

## MVP Scope

MVP では、指定した Notion root page 配下と、必要に応じて直接指定した data source 配下のページを対象に、最終更新から一定時間経過した未ロックページを自動ロックする。

MVP の配布形態は npm create package とし、利用者が repository を clone せずに worker project を生成できることを必須とする。

## 機能要件

- Notion Worker として deploy できること
- `worker.sync()` の schedule により定期実行できること
- 実行履歴用の managed audit database を作成できること
- 設定された root page を起点に child page を再帰的に確認できること
- root page 自体は default ではロックせず、必要な場合だけ opt-in でロック対象にできること
- root page 配下の `child_database` を検出し、その database の data source を query できること
- data source query 結果に含まれる page を確認できること
- data source query 結果に含まれる data source を追加で query できること
- 設定された target data source を直接 query できること
- `last_edited_time` が cutoff time 以前のページを候補にできること
- `is_locked` が `false` のページだけをロックできること
- 対象ページに対して `is_locked: true` を設定できること
- pagination された query 結果を最後まで処理できること
- block children pagination を最後まで処理できること
- 同一 page / database / data source を複数経路で発見しても重複処理しないこと
- すでにロック済みのページは変更しないこと
- 同じページを複数回処理しても結果が壊れない idempotent な処理であること
- 実行結果として以下を log 出力できること
- checked page count
- eligible page count
- locked page count
- skipped page count
- error count
- crawled page count
- crawled block count
- crawled database count
- crawled data source count
- crawl limit status
- dry run status
- audit database に実行サマリを 1 run につき 1 record 保存できること

## 非機能要件

- Notion API rate limit を考慮すること
- retry 可能なエラーは bounded retry すること
- `Retry-After` header がある場合は尊重すること
- MVP では Notion API request を sequential に処理し、同時 lock request は行わないこと
- secret は Notion Worker secret または local `.env` として扱うこと
- token、page content、user content などの機密情報を log / audit database に出さないこと
- TypeScript で実装すること
- Node.js `22` 以上、npm `10.9.2` 以上を前提にすること
- Notion API version は生成 template 内で明示的に pin すること
- crawl depth と crawl page 数に上限を設け、巨大な page tree で無制限に API request しないこと
- OSS として README だけで setup、dry run、deploy、運用が理解できること
- npm package として配布できること
- 利用者が `git clone` なしで導入できること

## 配布方針

MVP では npm registry で create package を公開する。

公開 package 名は `create-notion-auto-lock-worker` とする。利用者向け command は npm の create convention に合わせて以下とする。

```bash
npm create notion-auto-lock-worker@latest my-auto-lock-worker
cd my-auto-lock-worker
```

`npm create notion-auto-lock-worker` は npm により `create-notion-auto-lock-worker` の実行に変換される。

生成される worker project は利用者の workspace に deploy され、token と監視対象 scope は利用者が管理する。MVP では SaaS / hosted service として提供しない。

## 生成 project

生成される project には以下を含める。

- `src/index.ts`
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `.env.example`
- `README.md`
- Notion CLI が deploy に必要とする設定ファイル

生成される project は `ntn workers deploy` でそのまま deploy できる状態であること。

## Install UX

利用者は以下の流れで導入できること。

1. Node.js `22` 以上と npm `10.9.2` 以上を用意する
2. Notion CLI `ntn` を install する
3. `npm create notion-auto-lock-worker@latest my-auto-lock-worker` で project を生成する
4. `ntn login` で Notion workspace に login する
5. Notion connection を作成し、必要な capabilities を付与する
6. 対象 root page または database / data source に connection を追加する
7. Worker secret を設定する
8. `DRY_RUN=true` で deploy して挙動を確認する
9. `DRY_RUN=false` に変更して本番実行する

## Notion 権限

MVP で必要な Notion connection capability は以下とする。

- Read content
- Update content

対象 root page、database、data source は Notion 側で connection に共有されている必要がある。root page に connection を追加した場合、その子 page も access 対象になる。

MVP では internal integration token または personal access token を利用者が secret として設定する。public OAuth connection は将来拡張とする。

## Worker 実行方式

MVP では `worker.sync()` を scheduled execution primitive として採用する。

`worker.sync()` は managed database を必要とするため、`Auto Lock Runs` という managed audit database を宣言する。この database はロック対象ではなく、実行履歴の保存だけに使う。

audit sync は `mode: "incremental"` とし、過去の audit record を削除しない。各 run は一意な run id を key として 1 record を upsert する。

sync の実行 cycle では以下を行う。

1. 現在時刻から `LOCK_AFTER_MINUTES` を引いて cutoff time を計算する
2. `AUTO_LOCK_ROOT_PAGE_IDS` の page を起点に block children を再帰的に取得する
3. `child_page` を page として処理し、その子 block も再帰的に取得する
4. `child_database` を database として retrieve し、database 配下の data source を query する
5. `AUTO_LOCK_DATA_SOURCE_IDS` の data source を直接 query する
6. data source query 結果に含まれる page / data source / database を処理する
7. 各候補 page を lock 直前に再取得する
8. 再取得した page がまだ `last_edited_time <= cutoff time` かつ `is_locked === false` の場合だけ lock する
9. 実行サマリを log と audit database に出力する

`webhook` はページ更新イベントの検知には使えるが、「更新から一定時間後にロックする」という遅延実行には定期実行の方が単純であるため、MVP では採用しない。

## Schedule

初期値は以下とする。

- `LOCK_AFTER_MINUTES`: `180`
- `WORKER_SCHEDULE`: `1h`
- `LOCK_ROOT_PAGES`: `false`

実際のロック時刻は、最終更新時刻から `LOCK_AFTER_MINUTES` 経過後、次回 Worker 実行時点となる。

`WORKER_SCHEDULE` は Worker manifest の `worker.sync({ schedule })` に反映される。利用者は scaffold 時または生成済み project の設定変更により schedule を変えられる。変更後は再 deploy が必要である。

Worker は scheduled sync の実行 1 回ごとに Worker run として扱われる。Notion の Workers pricing guide では、scheduled sync は実行ごとに 1 Worker run として count され、Worker run は通常 `$0.0023` 程度と説明されている。Notion Workers が Notion credits を消費する料金体系では、schedule 頻度を高くするほど run 数と想定 cost が増える。そのため、MVP の default は安全側の `1h` とする。

MVP の通常運用では Notion Workers SDK がサポートする interval schedule を使う。`continuous` と `manual` は MVP の通常運用では使わない。

Notion の Workers syncs guide では、interval schedule の最小値は `5m`、最大値は `7d` と説明されている。documented examples は `5m`、`15m`、`30m`、`1h`、`1d` とする。

README では schedule 別の概算 run 数と cost 注意を記載し、Notion の Workers pricing guide への参照を明記する。

## 定常確認

source repository では、利用者が実際に使う npm create flow を定常的に検証できること。

- `npm run check:quick` で scaffold logic の unit test と template typecheck を実行できること
- `npm run check:generated` で disposable な generated project を `.tmp/generated` 配下に作成できること
- generated project で `npm install` と `npm run typecheck` を実行できること
- generated project に未置換 template placeholder が残っていないこと
- generated project の検証 artifact は repository に含めず、`.tmp/` 配下に閉じること
- `npm run check` で quick check と generated project check の両方を実行できること

## 設定項目

MVP で扱う設定は以下とする。

| Name | Required | Default | Scope | Description |
| --- | --- | --- | --- | --- |
| `AUTO_LOCK_API_TOKEN` | yes | none | secret | Notion API token |
| `AUTO_LOCK_ROOT_PAGE_IDS` | conditional | none | secret | crawl 起点 root page ID の comma-separated list |
| `AUTO_LOCK_DATA_SOURCE_IDS` | conditional | none | secret | 直接 query する data source ID の comma-separated list |
| `AUTO_LOCK_DATA_SOURCE_ID` | no | none | secret | backward compatibility 用の単一 data source ID |
| `LOCK_AFTER_MINUTES` | no | `180` | secret | 最終更新からロックまでの待機時間 |
| `DRY_RUN` | no | `true` | secret | `true` の場合、ロックせず log / audit のみ出力 |
| `LOCK_ROOT_PAGES` | no | `false` | secret | `true` の場合、crawl 起点の root page 自体もロック対象に含める |
| `PAGE_SIZE` | no | `100` | secret | data source query の page size |
| `MAX_RETRIES` | no | `3` | secret | retry 可能な API request の最大 retry 回数 |
| `MAX_CRAWL_DEPTH` | no | `10` | secret | root page crawl の最大 depth |
| `MAX_CRAWL_PAGES` | no | `1000` | secret | 1 run で crawl する最大 page 数 |
| `WORKER_SCHEDULE` | no | `1h` | scaffold | Worker の定期実行間隔 |
| `AUDIT_DATABASE_TITLE` | no | `Auto Lock Runs` | scaffold | managed audit database の初期 title |
| `NOTION_API_VERSION` | no | `2026-03-11` | scaffold | Notion API version |

値の validation は起動時または初回実行時に行う。

- `AUTO_LOCK_API_TOKEN` は空文字を許可しない
- `AUTO_LOCK_ROOT_PAGE_IDS` と `AUTO_LOCK_DATA_SOURCE_IDS` の少なくとも一方は空でないこと
- `LOCK_AFTER_MINUTES` は `1` 以上の integer とする
- `PAGE_SIZE` は `1` 以上 `100` 以下の integer とする
- `MAX_RETRIES` は `0` 以上の integer とする
- `MAX_CRAWL_DEPTH` は `0` 以上の integer とする
- `MAX_CRAWL_PAGES` は `1` 以上の integer とする
- `DRY_RUN` は `true` または `false` の文字列だけを許可する
- `LOCK_ROOT_PAGES` は `true` または `false` の文字列だけを許可する
- `WORKER_SCHEDULE` は Notion Workers SDK が受け付ける schedule 形式だけを許可する
- `NOTION_API_VERSION` は生成 template が対応する Notion API version と一致させる

## ロック条件

ページは以下の条件をすべて満たす場合に自動ロックされる。

- target root page 配下、または target data source 配下に含まれている
- root page 自体の場合は `LOCK_ROOT_PAGES=true` である
- lock 直前の再取得時点でも `last_edited_time` が cutoff time 以前である
- lock 直前の再取得時点で `is_locked` が `false` である
- Notion API token に対象ページの update 権限がある
- `DRY_RUN` が `false` である

`DRY_RUN=true` の場合は、条件を満たすページを lock 予定として count するが、`pages.update` は呼ばない。

## Race Condition 対策

query 後、lock 実行前にユーザーがページを更新する可能性がある。

そのため、実装では lock 直前に `pages.retrieve` 相当の API で page を再取得し、`last_edited_time` と `is_locked` を再確認する。再取得後に条件を満たさない page は skip する。

この仕様により、直近で編集されたページを古い query 結果だけでロックすることを避ける。

## Error Handling

### retry 対象

- HTTP `409`
- HTTP `429`
- HTTP `500`
- HTTP `502`
- HTTP `503`
- HTTP `504`
- HTTP `529`
- 一時的な network error

### retry 方針

- exponential backoff を使う
- `Retry-After` header がある場合はその値を優先する
- retry 回数には `MAX_RETRIES` の上限を設ける
- retry 後も失敗した page は skip して error count に含める
- 1 page の失敗で Worker 全体を停止しない

### fail fast 対象

- `AUTO_LOCK_API_TOKEN` 未設定
- `AUTO_LOCK_ROOT_PAGE_IDS` と `AUTO_LOCK_DATA_SOURCE_IDS` がどちらも未設定
- 不正な設定値
- 認証エラー
- 権限エラー
- root page / database / data source が存在しない、または connection に共有されていない

これらは設定または権限の問題であるため、実行を継続しない。

## Logging

log は運用判断に必要な最小情報だけを出力する。

出力してよい情報:

- run id
- dry run status
- scope count
- checked page count
- eligible page count
- locked page count
- skipped page count
- error count
- elapsed milliseconds
- crawled page / block / database / data source count
- crawl limit status
- error code

出力してはいけない情報:

- `AUTO_LOCK_API_TOKEN`
- page title
- page content
- property value
- user name
- email address
- full page URL

## Audit Database

managed audit database は `worker.sync()` の出力先として使う。

audit sync は `mode: "incremental"` とし、過去の実行履歴を保持する。

MVP の audit record は以下の情報だけを持つ。

- run id
- run started at
- scope summary
- dry run status
- checked page count
- eligible page count
- locked page count
- skipped page count
- error count
- crawled page count
- crawled block count
- crawled database count
- crawled data source count
- crawl limit status
- elapsed milliseconds

page title、page content、property value、full page URL は audit database に保存しない。

## Security

- `AUTO_LOCK_API_TOKEN` は repository に含めない
- `.env` は commit 対象にしない
- `.env.example` には placeholder だけを書く
- secret value を log / audit database に出さない
- Notion connection は必要最小限の capability だけを使う
- README に unofficial project であることを明記する
- npm package の README に公式 Notion 製ではないことを明記する
- package publish では npm 2FA を有効化することを推奨する

## Documentation 要件

README には以下を含める。

- project の目的
- unofficial notice
- prerequisites
- install
- Notion connection 作成手順
- root page / database / data source の共有手順
- configuration
- schedule と cost 注意
- dry run
- deploy
- logs / audit database の見方
- troubleshooting
- security policy
- license

## 非要件

MVP では以下を扱わない。

- Search API による workspace 全体の完全列挙
- workspace 全体の完全列挙
- database / data source ごとの個別ロック時間
- page content に応じた条件分岐
- property filter による対象ページ制御
- ロック解除
- UI dashboard
- hosted SaaS
- public OAuth connection
- Notion Marketplace listing
- webhook による即時イベント処理
- Notion 以外の外部 service 連携

## 将来拡張

- data source ごとの `LOCK_AFTER_MINUTES` 設定
- search endpoint を使った best-effort workspace scope
- property filter による対象ページ制御
- 特定 property が指定値のページだけロックする
- lock 対象外 page の allowlist
- dry run report の structured output
- Slack / email notification
- GitHub Actions など Notion Workers 以外での実行 mode
- webhook と scheduled Worker の組み合わせ
- public OAuth connection
- Notion Marketplace listing

## 受け入れ条件

- `npm create notion-auto-lock-worker@latest my-auto-lock-worker` で project が生成される
- 生成された project が `ntn workers deploy` で deploy 可能である
- `DRY_RUN=true` で、対象ページ数・ロック予定ページ数・skip 数・error 数が log と audit database に出る
- `DRY_RUN=true` では page lock API が呼ばれない
- `DRY_RUN=false` で、条件を満たす未ロックページがロックされる
- `AUTO_LOCK_ROOT_PAGE_IDS` で指定した root page 配下の child page が対象になる
- root page 配下の child database に含まれる data source page が対象になる
- `LOCK_ROOT_PAGES=false` の場合、crawl 起点 root page 自体はロック対象にならない
- `AUTO_LOCK_DATA_SOURCE_IDS` で指定した data source page が対象になる
- `MAX_CRAWL_DEPTH` と `MAX_CRAWL_PAGES` により crawl 範囲に上限がある
- `WORKER_SCHEDULE` の default が `1h` である
- `LOCK_ROOT_PAGES` の default が `false` である
- 利用者が scaffold 時または生成済み project の設定変更で `WORKER_SCHEDULE` を変更できる
- ロック済みページは更新されない
- `LOCK_AFTER_MINUTES=180` の場合、最終更新から 3 時間未満のページはロックされない
- crawl / query 後に更新された page は lock 直前の再確認で skip される
- pagination が必要な件数でも対象範囲を確認できる
- retry 対象の status code では bounded retry される
- fail fast 対象の設定・権限エラーでは処理を継続しない
- token、page content、property value が log / audit database に出ない
- README に setup、deploy、configuration、schedule、cost 注意、dry run、security の手順がある

## ライセンス

OSS として公開する。ライセンスは `MIT` を第一候補とする。

## 参考

- [Notion Workers overview](https://developers.notion.com/workers/get-started/overview)
- [Notion Workers SDK reference](https://developers.notion.com/workers/reference/sdk)
- [Notion Workers Quickstart](https://developers.notion.com/workers/get-started/quickstart)
- [Workers syncs guide](https://developers.notion.com/workers/guides/syncs)
- [Worker secrets](https://developers.notion.com/workers/guides/secrets)
- [Using the Notion API from a Worker](https://developers.notion.com/workers/guides/api-client)
- [Connection capabilities](https://developers.notion.com/reference/capabilities)
- [Internal connections](https://developers.notion.com/guides/get-started/internal-connections)
- [Personal access tokens](https://developers.notion.com/guides/get-started/personal-access-tokens)
- [Notion API: Update page](https://developers.notion.com/reference/patch-page)
- [Notion API: Status codes](https://developers.notion.com/reference/status-codes)
- [Workers pricing](https://www.notion.com/help/understand-pricing-for-workers)
- [npm init / npm create](https://docs.npmjs.com/cli/v11/commands/npm-init/)
