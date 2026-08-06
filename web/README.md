# ザ・テスト Web

確定仕様書 `../docs/the-test-web-confirmed-spec-v1.0.0.md`、追補`v1.1.0`、`v1.2.0`に基づくWeb基盤です。

## 必要環境

- Node.js 20.19以上
- npm 10以上
- MariaDB 11.4

## ローカル開発

```bash
npm ci
npm run dev
```

MariaDB接続情報は環境変数で指定します。値は`.env.example`を参照してください。

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=the_test
DB_USER=the_test
DB_PASSWORD=change-me
```

初期管理者は、ユーザーが0件のDBでのみ次の環境変数から作成されます。

```bash
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=change-me
```

## Docker Compose

リポジトリルートで実行します。

```bash
docker compose up --build
```

- Web: `http://127.0.0.1:3000`
- MariaDB: `127.0.0.1:3306`
- DBデータ: `mariadb-data` volume
- 証跡: `evidence-data` volume

既存のMariaDB volumeでアプリ用ユーザーの認証設定が古い場合は、`.env`へ現在のrootパスワードと新しいアプリパスワードを設定して、次を実行します。

```bash
npm run db:password
```

## 検証

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

MariaDB統合試験を有効にする場合は`DB_INTEGRATION_TEST=1`を指定します。

## DB Migration

サーバー起動時に`web/migrations`を順番に適用します。Migrationは追記専用です。適用済みファイルの変更はchecksum検証で拒否します。

Migrationだけを適用する場合は次を実行します。

```bash
npm run db:migrate
```

## SQLite移行

旧SQLiteデータをMariaDB投入用SQLへ変換します。

```bash
npm run migrate:sqlite -- /path/to/the-test.db > migrated.sql
```

## 主な機能

- ユーザー管理、プロジェクト管理、割り当て
- フォルダ、テストケース、シナリオ、データセット
- テスト実行、結果記録、証跡、見る場所画像
- 手順書、Markdown表示
- Excel・JSONインポート／エクスポート
- 管理者向けバックアップ・復元要求

## 画面動作

- テスト設計では選択中のフォルダへ新規テストを配置し、手順一覧を表形式で編集できます。
- テスト実行には確認項目データと共通データを表示し、未実行項目がなくなると「保存して次の未実行へ」を無効化します。
- エクスポート対象はプロジェクト全体、テスト設計、テスト実行から選択できます。テスト実行Excelには結果、データ、最新証跡メタデータと画像を出力します。

## OpenShiftへデプロイ

OpenShift用のコンテナ、BuildConfig、ImageStream、MariaDB StatefulSet、Route、PVC、NetworkPolicy、日次バックアップ・手動運用worker・保持CronJobを`web/`配下に用意しています。秘密情報をリポジトリへ保存せずにデプロイする手順は[`OPENSHIFT.md`](./OPENSHIFT.md)を参照してください。

## 運用上限と整合性

- multipartは1ファイル100MiB、1要求1ファイルです。ファイル本体はストリーミング保存します。
- 更新と成功監査は同一DBトランザクションで確定します。失敗時は業務更新もロールバックします。
- 証跡・見る場所画像の削除は再実行可能なファイル削除キューを使います。
- 適用済みMigrationのchecksum変更を拒否し、起動時にschema構造を検証します。
- 管理者画面の「バックアップ・復元」から手動バックアップと確認付き復元を要求できます。

## Review 10独立検証

GitHub Actions run `31062560323`で、TypeCheck、Unit/API 49件、MariaDB統合2件、バックアップ・復元・正常2世代保持、Production Build、OpenShift任意UID・read-only root filesystem起動、Chromium E2E 19件が成功しています。検証成果物はArtifact `web-ci-31062560323-1`（ID `8952679751`）です。

## Repository cleanup verification

構造整理コミット`8d17198c2f114613d06c8a3bee7ee11fc9fd5391`に対するGitHub Actions run `31067948455`で、TypeCheck、Unit/API 49件、MariaDB統合2件、バックアップ・復元、Production Build、OpenShift互換起動、Chromium E2E 19件が成功しています。検証成果物はArtifact `web-ci-31067948455-1`（ID `8954562403`）です。
