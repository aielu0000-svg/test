# The Test Web 運用

## デプロイ

```sh
oc apply -k web
```

Secret内の仮値は適用前に必ず変更する。アプリ、MariaDB、証跡、バックアップは別々のPVCを使う。

## バックアップ

`the-test-daily-backup` CronJobが毎日02:00（Asia/Tokyo）に実行される。アプリ更新をDB上で一時停止し、処理中の更新が完了してからMariaDB dump、証跡アーカイブ、`manifest.json`、`SHA256SUMS`を同じ世代へ保存する。正常な2世代だけを保持し、作成失敗時は既存正常世代を削除しない。

バックアップPVCの初期要求は220GiB。証跡100GiBの2世代とDB dumpを格納できることを前提とし、実使用量に応じて拡張する。

管理者はWeb画面の「バックアップ・復元」から手動バックアップを要求する。要求は`operation_requests`へ記録され、`the-test-operation-worker`が2分間隔で処理する。CronJobを直接起動する運用確認は次のとおり。

```sh
oc create job --from=cronjob/the-test-daily-backup the-test-backup-manual-$(date +%s)
```

大量インポート、SQLite移行、DBスキーマ更新、プロジェクト完全削除、復元の直前には手動バックアップを実行する。

## 復元

管理者画面で正常な世代を選び、バックアップIDを完全一致入力して復元を要求する。workerは共有ロックを取得し、復元元を検証した後、現在状態を自動バックアップする。更新停止を維持したままDBと証跡を同じbackup IDから復元する。復元後は、復元元と復元前退避の2世代を保持する。

復元中の要求、開始、終了、失敗、復元元、復元前退避世代はDBと監査ログに残る。

## SQLite移行

```sh
npm --prefix web run migrate:sqlite -- /path/to/project /tmp/the-test-migration.json
```

生成JSONをWeb画面または正式JSONプレビューAPIへ渡す。`attachments/`内の証跡はmanifest照合後、別途証跡PVCへ取り込む。

## 削除と保持

プロジェクトの画面上の「完全削除」は、管理者がアーカイブ後に実行する即時物理削除であり復元できない。DB削除とファイル削除キュー登録を同一トランザクションで確定し、実ファイルはコミット後に回収する。

通常業務データは論理削除し、30日間復元できる。期限超過データのDB削除は`the-test-retention-purge`で先に確定し、証跡と見る場所画像は`file_cleanup_queue`から再実行可能に回収する。

## 障害確認

```sh
oc get cronjob,job,pod,pvc
oc logs cronjob/the-test-daily-backup
oc logs cronjob/the-test-operation-worker
oc logs cronjob/the-test-retention-purge
```

`file_cleanup_queue`の`failed`行、`operation_requests`の`failed`行、`schema_migrations`の`failed`行を確認し、エラー原因を解消してから再実行する。
