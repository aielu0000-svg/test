原因はかなり絞れました。
**`005_phase3_runs.sql` で作るテーブルに文字コード・照合順序の指定がなく、既存テーブルと異なる照合順序を引き継いでいる可能性が高いです。**

既存の `projects.id` は次の定義です。

```text
CHAR(36)
utf8mb4_unicode_ci
```

一方、`test_runs` のCREATE文には末尾にこれがありません。

```sql
ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci
```

そのため `test_runs.project_id` が、データベース既定の別の照合順序になり、外部キーを作れなくなっていると考えられます。

まずMariaDBで確認してください。

```sql
SELECT
  DEFAULT_CHARACTER_SET_NAME,
  DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'the_test';
```

ここが例えば次のようになっていたら原因です。

```text
utf8mb4_uca1400_ai_ci
```

既存テーブルは `utf8mb4_unicode_ci` なので一致していません。

## まず動かすための修正

MariaDB上でデータベースのデフォルトを変更します。

```sql
ALTER DATABASE the_test
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

確認します。

```sql
SELECT
  DEFAULT_CHARACTER_SET_NAME,
  DEFAULT_COLLATION_NAME
FROM information_schema.SCHEMATA
WHERE SCHEMA_NAME = 'the_test';
```

次になればOKです。

```text
utf8mb4
utf8mb4_unicode_ci
```

MariaDBから抜けます。

```sql
exit
```

その後、WSLでサーバーを再実行してください。

```bash
cd /home/ser/dev/the-test/web

npx -y node@20 node_modules/tsx/dist/cli.mjs src/server/server.ts
```

ビルド済みなので、再度Viteビルドをする必要はありません。

## 恒久的な修正

`migrations/005_phase3_runs.sql` の各 `CREATE TABLE` の末尾を修正するのが安全です。

現在は例えば以下です。

```sql
  INDEX idx_runs_deleted (deleted_at)
);
```

これを次に変更します。

```sql
  INDEX idx_runs_deleted (deleted_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
```

`005_phase3_runs.sql` 内にあるすべてのテーブルについて同じ指定を追加します。

対象は少なくとも次のテーブルです。

```text
test_runs
run_revisions
run_scenario_snapshots
run_case_snapshots
run_step_snapshots
run_data_set_snapshots
```

ファイル内の全テーブルを確認するには次です。

```bash
grep -n "^CREATE TABLE" migrations/005_phase3_runs.sql
```

## `SHOW ENGINE INNODB STATUS` の権限エラーについて

これは今回のテーブルエラーとは別です。

```text
Access denied; you need PROCESS privilege
```

`the_test` ユーザーに `PROCESS` 権限がないためです。確認したい場合はrootで接続します。

PowerShellからなら次です。

```powershell
docker exec -it the-test-mariadb mariadb -u root -p
```

rootパスワードは次です。

```text
the-test-root-pass
```

接続後：

```sql
SHOW ENGINE INNODB STATUS\G
```

ただし、今回についてはまず **データベースの照合順序を `utf8mb4_unicode_ci` に変更して再起動**するのが最短です。


## 実装結果と指示の集約

このファイルを `指示` フォルダのDB修正指示の正本とします。確認時点で `指示` フォルダ内に他の指示ファイルはありません。旧Electron版の `CLAUDE.md` は自動生成された作業メモであり、DB修正指示とは異なるため統合対象外として保持します。

恒久修正として `web/migrations/005_phase3_runs.sql` の全7テーブル（`test_runs`、`run_revisions`、`run_scenario_snapshots`、`run_case_snapshots`、`run_step_snapshots`、`run_data_set_snapshots`、`run_data_item_snapshots`）へ `ENGINE=InnoDB`、`DEFAULT CHARSET=utf8mb4`、`COLLATE=utf8mb4_unicode_ci` を追加しました。既存DBでは本文の `ALTER DATABASE the_test ...` を一度実行してからサーバーを再起動してください。