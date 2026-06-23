# Notion Auto Lock Worker

[English](README.md) | 日本語

Notion のページを、最終更新から一定時間が経過したら自動でロックする Notion Worker を生成します。

生成された Worker は、指定した root page や data source を定期的に巡回し、条件を満たす未ロックのページだけを再確認してからロックします。

> Notion Workers は beta です。API、CLI、料金、template、hosting の仕様は変わる可能性があります。

このプロジェクトは Notion 公式の製品ではなく、Notion による承認や提携を受けたものではありません。

## できること

- root page 配下にある child page、child database、data source を再帰的に確認
- data source ID を指定し、database page を直接確認
- `last_edited_time` が指定時間より古く、`is_locked=false` のページだけを lock
- lock 直前にページを再取得し、直近で更新されたページを skip
- `DRY_RUN=true` で lock せずに対象数だけ確認
- 実行結果を managed audit database に記録

## 必要なもの

- Node.js 22 以上
- npm 10.9.2 以上
- Notion CLI の `ntn`
- Notion connection または personal access token
- connection capability として `Read content` と `Update content`

internal connection を使う場合は、対象の root page または database で `Connections` を開き、connection を追加してください。

## クイックスタート

```bash
npm create notion-auto-lock-worker@latest my-auto-lock-worker
cd my-auto-lock-worker
npm install
npm run check
ntn login
```

Worker secrets を設定して deploy します。

```bash
ntn workers env set AUTO_LOCK_API_TOKEN=ntn_...
ntn workers env set AUTO_LOCK_ROOT_PAGE_IDS=...
ntn workers env set DRY_RUN=true
ntn workers deploy
```

最初は `DRY_RUN=true` のまま実行し、log と audit database の結果を確認してください。問題なければ `DRY_RUN=false` に変更して再 deploy します。

生成されたプロジェクトには、setup、dry run、deploy、troubleshooting を含む専用 README が入ります。

## 設定

| 変数 | 必須 | 初期値 | 説明 |
| --- | --- | --- | --- |
| `AUTO_LOCK_API_TOKEN` | はい | なし | Notion API token |
| `AUTO_LOCK_ROOT_PAGE_IDS` | 条件付き | なし | 再帰的に巡回する root page ID。複数指定はカンマ区切り |
| `AUTO_LOCK_DATA_SOURCE_IDS` | 条件付き | なし | 直接 query 対象にする data source ID。複数指定はカンマ区切り |
| `WORKER_SCHEDULE` | いいえ | `1h` | Worker の実行間隔。`5m` から `7d` |
| `LOCK_AFTER_MINUTES` | いいえ | `180` | 最終更新から lock 対象になるまでの分数 |
| `DRY_RUN` | いいえ | `true` | lock せず対象数だけ確認 |
| `LOCK_ROOT_PAGES` | いいえ | `false` | 指定した root page 自体も lock 対象にする |
| `MAX_CRAWL_DEPTH` | いいえ | `10` | root page crawl の最大 depth |
| `MAX_CRAWL_PAGES` | いいえ | `1000` | 1 回の run で crawl する最大 page 数 |

`AUTO_LOCK_ROOT_PAGE_IDS` と `AUTO_LOCK_DATA_SOURCE_IDS` の少なくとも一方を設定してください。

## 実行間隔と料金

初期値では `WORKER_SCHEDULE=1h`、`LOCK_AFTER_MINUTES=180` です。この場合、ページは最終更新から 3 時間経過したあと、次回の scheduled sync で lock されます。

Notion の sync schedule は `5m` から `7d` まで指定できます。頻度を上げるほど lock までの遅延は短くなりますが、Worker run の回数は増えます。

```bash
npm create notion-auto-lock-worker@latest my-worker --schedule 15m
npm create notion-auto-lock-worker@latest my-worker --lock-after-minutes 120
```

2026 年 6 月 23 日時点の Notion Workers 料金ガイドでは、beta 期間中は Business / Enterprise plan で試用無料、2026 年 8 月 11 日から Notion credits が必要とされています。scheduled sync は実行ごとに 1 Worker run として数えられ、通常は 1 run あたり約 `$0.0023` と説明されています。

| 実行間隔 | 月間実行回数の目安 | 月額費用の目安 |
| --- | ---: | ---: |
| `1d` | 30 | `$0.07` |
| `1h` | 720 | `$1.66` |
| `15m` | 2,880 | `$6.62` |
| `5m` | 8,640 | `$19.87` |

実際の使用量は Worker が処理する量や Notion 側の料金体系変更によって変わります。

## 動作

1. `worker.sync()` の scheduled sync として実行される
2. root page、child page、child database、data source を巡回する
3. `LOCK_AFTER_MINUTES` から cutoff time を計算する
4. ページを lock する直前に再取得する
5. `last_edited_time <= cutoff time` かつ `is_locked=false` のページだけを lock する
6. checked、eligible、locked、skipped、error count を audit database に記録する

指定した root page は標準では crawl の起点として扱われ、lock 対象にはなりません。root page 自体も lock したい場合は `LOCK_ROOT_PAGES=true` を設定します。

## セキュリティ

- Notion token をコミットしない
- `.env` や `.env.production` をコミットしない
- 本番環境の値は Worker secrets に保存する
- ログと audit row には page title、page content、property value、email、完全な page URL、token を出さない
- personal access token より、必要なページだけに共有した internal connection を優先する
- 脆弱性の報告は `SECURITY.md` を参照する

## 開発者向け

開発、test、release、CHANGELOG 運用は `DEVELOPMENT.md` を参照してください。

## 参考リンク

- [Notion Workers の概要](https://developers.notion.com/workers/get-started/overview)
- [Notion 公式 Workers template](https://github.com/makenotion/workers-template)
- [sync schedule の公式ガイド](https://developers.notion.com/workers/guides/syncs)
- [Worker secrets の公式ガイド](https://developers.notion.com/workers/guides/secrets)
- [connection capability の公式リファレンス](https://developers.notion.com/reference/capabilities)
- [ページ更新 API](https://developers.notion.com/reference/patch-page)
- [Workers 料金](https://www.notion.com/help/understand-pricing-for-workers)

## ライセンス

MIT
