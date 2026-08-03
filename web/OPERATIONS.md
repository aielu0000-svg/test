# The Test Web 運用

## デプロイ

```sh
oc apply -f web/openshift.yaml
oc apply -f web/openshift-operations.yaml
```

Secret内の仮値は適用前に必ず変更する。アプリ、MariaDB、証跡、バックアップは別々のPVCを使う。

## バックアップ

`the-test-daily-backup` CronJobが毎日02:00にMariaDBの整合したダンプと証跡アーカイブを同一世代へ保存する。`SHA256SUMS`を付け、最新3世代だけ保持する。

手動実行:

```sh
oc create job --from=cronjob/the-test-daily-backup the-test-backup-manual
```

大量インポート、SQLite移行、DBスキーマ更新、プロジェクト一括削除、復元の直前には手動バックアップを実行する。

## 復元

復元中はアプリの更新を停止し、対象世代の`SHA256SUMS`検証後に`web/ops/restore.sh`をMariaDBクライアントがある管理用Podから実行する。復元前にも現在状態を別世代へ退避する。

## SQLite移行

```sh
npm --prefix web run migrate:sqlite -- /path/to/project /tmp/the-test-migration.json
```

生成JSONをWeb画面または正式JSONプレビューAPIへ渡す。`attachments/`内の証跡はmanifest照合後、別途証跡PVCへ取り込む。

## 物理削除

復元期限超過データの物理削除は`the-test-retention-purge`で実行する。定義を参照する現役データがある場合は外部キーにより削除されず、管理者が参照関係を確認する。

