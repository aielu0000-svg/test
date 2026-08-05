# ザ・テスト Web版

確定仕様書 `the-test-web-confirmed-spec-v1.0.0.md` のPhase 1基盤です。既存Electron版とは独立したWebワークスペースとして構築しています。

## Dockerでローカル起動

リポジトリ直下の`compose.yaml`は、MariaDBとWebアプリへ同じ非空のDBパスワードを設定します。MariaDBとWebのポートはlocalhostだけに公開します。

```bash
cp .env.example .env
docker compose up -d --build
```

起動後は`http://127.0.0.1:3000`を開きます。`.env.example`の値はローカル開発専用です。本番環境では別の十分に長い値へ変更してください。

### 既存MariaDBボリュームが無パスワードの場合

MariaDBの初期化用環境変数は、既に作成済みの`mariadb-data`ボリュームには再適用されません。データを削除せず、現在の無パスワードroot接続からrootとアプリ用ユーザーへ`.env`のパスワードを設定するには次を実行します。

```bash
cd web
npm ci
npm run db:password
cd ..
docker compose up -d --build
```

`npm run db:password`は次を実施します。

- MariaDBコンテナを起動する
- `root@localhost`へ`MARIADB_ROOT_PASSWORD`を設定する
- `DB_USER`の`%`および`localhost`アカウントへ`DB_PASSWORD`を設定する
- `DB_NAME`に対する権限を付与する

データを破棄してよい場合だけ、`docker compose down -v`でボリュームを削除してから再作成できます。この操作はMariaDBデータと証跡データを削除します。

## ホスト上でWebアプリだけを起動

MariaDBをDockerで起動し、Webアプリをホスト側で実行する場合は、`compose.yaml`と同じパスワードを明示的に設定します。`DB_PASSWORD`が未設定または空の場合、アプリは起動を拒否します。

```bash
cd web
npm ci
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=the_test DB_USER=the_test
export DB_PASSWORD=the-test-local-db-password
export INITIAL_ADMIN_USERNAME=admin INITIAL_ADMIN_PASSWORD=change-me-local-admin
npm run dev
```

初回起動時にマイグレーションを実行し、ユーザーが存在しない場合だけ初期管理者を作成します。初期管理者は初回ログイン時にパスワード変更が必要です。

## Phase 1で実装した範囲

- Fastify JSON API、Cookieセッション、Argon2idパスワードハッシュ
- 5回連続ログイン失敗時の5分ロック、IP単位の20回/5分制限、無効ユーザー、初期パスワード変更
- MariaDBマイグレーション（ユーザー、セッション、プロジェクト、割当、監査ログ）
- 管理者／実行者のプロジェクト権限とAPI側のproject_id検証
- プロジェクト一覧・作成・編集・アーカイブ・確認付き論理削除・JSONエクスポート
- 検索・状態集計付きユーザー管理、モーダル作成・変更・無効化・パスワード再設定・ロック解除
- 楽観ロック、監査ログ、`/healthz`、`/readyz`
- ログイン、初回パスワード変更、プロジェクト、管理者画面の最小UI
- OpenAPI定義、非rootコンテナ、MariaDB／証跡PVCを含むOpenShiftマニフェスト

現在は、テスト設計、データセット、実行スナップショット、証跡アップロード、Excel入出力、バックアップ／復元まで同一Webワークスペースで扱います。

## 日常業務の導線

- テスト設計では、未保存の内容を保存してそのテストを選択済みの実行準備へ直接進めます。
- ダッシュボードの「作業を再開」から、下書きまたは実行中の対象実行へ直接戻れます。
- 実行中は「保存して次の未実行へ」で、完了済み項目を飛ばして次の未実行・実行中項目へ移動します。
- 完了前チェックでは、合格、不合格、ブロック、スキップ、未実行・実行中の件数を確認し、該当項目へ移動できます。
- 完了済み実行に不合格またはブロックがある場合、その元確認項目だけを選択した再実行の下書きを作成できます。前回の結果と証跡は新しい実行へコピーしません。

## 管理・設計・実行・エクスポートの改善

- プロジェクトは、管理者がアーカイブ後にプロジェクト名と削除理由を確認して論理削除できます。
- ユーザー管理は一覧・検索・状態集計を中心とし、作成、編集、仮パスワード設定を必要時だけモーダルで開きます。
- フォルダを選択して新しいテストを作ると、そのフォルダが初期所属先になります。複数手順は一覧に全件を要約し、詳細で編集します。
- 見る場所画像はテスト設計と実行の双方で編集でき、実行時は拡大表示できます。実行用編集は元テスト定義へ反映しません。
- テスト実行には確認項目データと共通データを表示し、未実行項目がなくなると「保存して次の未実行へ」を無効化します。
- エクスポート対象はプロジェクト全体、テスト設計、テスト実行から選択できます。テスト実行Excelには結果、データ、最新証跡メタデータと画像を出力します。

## OpenShiftへデプロイ

OpenShift用のコンテナ、BuildConfig、ImageStream、MariaDB StatefulSet、Route、PVC、NetworkPolicy、バックアップ・保持CronJobを`web/`配下に用意しています。秘密情報をリポジトリへ保存せずにデプロイする手順は[`OPENSHIFT.md`](./OPENSHIFT.md)を参照してください。
