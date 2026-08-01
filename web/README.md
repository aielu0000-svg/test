# ザ・テスト Web版

確定仕様書 `the-test-web-confirmed-spec-v1.0.0.md` のPhase 1基盤です。既存Electron版とは独立したWebワークスペースとして構築しています。

## ローカル起動

MariaDBを起動し、次の環境変数を設定してから実行します。

```bash
cd web
npm ci
export DB_HOST=127.0.0.1 DB_NAME=the_test DB_USER=the_test DB_PASSWORD=secret
export INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD=change-me
npm run dev
```

初回起動時にマイグレーションを実行し、ユーザーが存在しない場合だけ初期管理者を作成します。初期管理者は初回ログイン時にパスワード変更が必要です。

## Phase 1で実装した範囲

- Fastify JSON API、Cookieセッション、Argon2idパスワードハッシュ
- 5回連続ログイン失敗時の5分ロック、IP単位の20回/5分制限、無効ユーザー、初期パスワード変更
- MariaDBマイグレーション（ユーザー、セッション、プロジェクト、割当、監査ログ）
- 管理者／実行者のプロジェクト権限とAPI側のproject_id検証
- プロジェクト一覧・作成・編集・アーカイブ・JSONエクスポート
- ユーザー作成・変更・無効化・パスワード再設定・ロック解除
- 楽観ロック、監査ログ、`/healthz`、`/readyz`
- ログイン、初回パスワード変更、プロジェクト、管理者画面の最小UI
- OpenAPI定義、非rootコンテナ、MariaDB／証跡PVCを含むOpenShiftマニフェスト

テストケース、シナリオ、データセット、実行スナップショット、証跡アップロード、Excel、バックアップ／復元は次のフェーズで追加します。
