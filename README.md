# ザ・テスト

テスト設計、テスト実行、証跡、手順書を管理するアプリケーションです。

## 構成

```text
.
├── src/             Electronデスクトップアプリ
├── web/             Web UI、Fastify API、MariaDB Migration、OpenShift運用
├── docs/            現行仕様、課題台帳、作業記録、セキュリティ資料
├── import-examples/ 現行インポート形式の例
├── compose.yaml     ローカルWeb環境
├── SPEC.md          全体の基礎仕様
└── AGENTS.md        開発作業の入口
```

`src/`と`web/`はどちらも現行のビルド対象です。Electron版は`.github/workflows/build-win.yaml`、Web版は`.github/workflows/web-ci.yaml`で独立して検証します。

## Web版の責務境界

- `web/src/client`: React UI
- `web/src/server`: Fastify API、認証、DBアクセス、業務処理
- `web/src/server/routes`: HTTP境界
- `web/src/shared`: UIとAPIで共有する型・検証規則
- `web/migrations`: 追記専用のMariaDB Migration
- `web/ops`: バックアップ、復元、保持処理
- `web/openapi.yaml`: API契約の唯一の正本

階層は責務の境界が必要な場合だけ追加します。置換済みの旧実装、レビュー作業用資料、生成済み証跡、テスト成果物はソースへ残しません。Git履歴が過去資料の保管場所です。

Web版の起動方法は`web/README.md`、OpenShift配備は`web/OPENSHIFT.md`を参照してください。開発前には`AGENTS.md`を確認してください。
