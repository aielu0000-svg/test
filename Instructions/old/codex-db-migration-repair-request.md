# ザ・テスト Web版  
# DBマイグレーション不整合 修正依頼

作成日: 2026-08-01  
対象: `web/` 配下のMariaDBマイグレーション、起動処理、スキーマ検証、関連テスト

---

## 1. 目的

既存DBで発生した、マイグレーション履歴と実スキーマの不整合を修正してください。

画面からテストを登録した際、次のエラーが発生しました。

```text
Unknown column 'view_images_json' in 'INSERT INTO'
```

対象SQLは次です。

```sql
INSERT INTO test_cases (
  id,
  project_id,
  title,
  objective,
  preconditions,
  view_location,
  view_images_json,
  priority,
  created_by
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
```

DBを確認したところ、`schema_migrations`には以下が適用済みとして登録されていました。

```text
008_ui_workflow.sql
009_post_completion_updates.sql
010_test_case_view_images.sql
```

しかし、`008_ui_workflow.sql`に記載されている以下の列が実DBに存在していませんでした。

```text
test_cases.view_images_json
run_case_snapshots.view_images_json
run_case_snapshots.notes
test_runs.draft_scenario_ids_json
test_runs.draft_case_ids_json
test_runs.draft_data_set_ids_json
```

`test_cases.view_images_json`および`run_case_snapshots.view_images_json`は暫定的に手動追加済みです。

```sql
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS view_images_json LONGTEXT NULL AFTER view_location;

ALTER TABLE run_case_snapshots
  ADD COLUMN IF NOT EXISTS view_images_json LONGTEXT NULL AFTER view_location;
```

残りの不足列についても、正式な修復マイグレーションで補完してください。

---

## 2. 原因

適用済みの`008_ui_workflow.sql`が、適用後に変更または追記された可能性が高いです。

マイグレーション実行処理は、`schema_migrations`に同一IDが存在する場合、そのSQLを再実行しません。そのため、履歴上は適用済みでも、後から追加されたDDLが既存DBへ反映されません。

この運用は、新規DBと既存DBのスキーマ差異を発生させます。

---

## 3. 必須修正

### 3.1 新規修復マイグレーションを追加

次のファイルを新規作成してください。

```text
web/migrations/011_repair_ui_workflow_columns.sql
```

内容は、少なくとも次を含めてください。

```sql
ALTER TABLE run_case_snapshots
  ADD COLUMN IF NOT EXISTS notes LONGTEXT NULL AFTER actual_result;

ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS view_images_json LONGTEXT NULL AFTER view_location;

ALTER TABLE run_case_snapshots
  ADD COLUMN IF NOT EXISTS view_images_json LONGTEXT NULL AFTER view_location;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS draft_scenario_ids_json LONGTEXT NULL AFTER memo;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS draft_case_ids_json LONGTEXT NULL AFTER draft_scenario_ids_json;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS draft_data_set_ids_json LONGTEXT NULL AFTER draft_case_ids_json;
```

`ADD COLUMN IF NOT EXISTS`を使用し、以下の両方で安全に実行できるようにしてください。

- 一部の列を手動追加済みの既存DB
- 008の全DDLが反映済みの新規DB

---

### 3.2 適用済みマイグレーションを変更しない

`001`から`010`までの適用済みマイグレーションは、今後の修正対象にしないでください。

特に`008_ui_workflow.sql`へ追加修正を行わないでください。

今後のDDL変更は、必ず新しい連番のマイグレーションで実施してください。

---

### 3.3 起動時スキーマ検証を追加

`schema_migrations`の履歴確認だけでは不十分です。

マイグレーション実行後に、必須テーブル、必須列、必須インデックス、必須外部キーの実体を検証してください。

最低限、次を検査対象にしてください。

#### 必須列

```text
scenarios.folder_id
run_case_snapshots.notes
test_cases.view_images_json
run_case_snapshots.view_images_json
test_runs.draft_scenario_ids_json
test_runs.draft_case_ids_json
test_runs.draft_data_set_ids_json
test_runs.post_completion_updated_at
test_runs.post_completion_updated_by
```

#### 必須テーブル

```text
test_case_view_images
```

#### 必須インデックス

```text
ix_scenarios_project_folder
```

#### 必須外部キー

```text
fk_scenarios_folder
```

検証に失敗した場合は、サーバーをready状態にしないでください。

例:

```text
Schema validation failed.

Missing columns:
- run_case_snapshots.notes
- test_runs.draft_case_ids_json

Missing indexes:
- ix_scenarios_project_folder
```

不足項目を起動ログへ具体的に出してください。

---

### 3.4 ヘルスチェックを分離

可能であれば、次を分離してください。

```text
/health/live
/health/ready
```

- `live`: Node.jsプロセスが生存しているか
- `ready`: DB接続、マイグレーション、スキーマ検証がすべて成功しているか

スキーマ不整合時は`live`は成功しても、`ready`は失敗させてください。

---

### 3.5 保存APIの統合テストを追加

次のAPIを、実際のMariaDBへ接続する統合テストで検証してください。

```text
POST /api/scenario-editor/save
```

少なくとも次を含めてください。

1. 新規テストを保存できる
2. `test_cases`へ正常にINSERTできる
3. 複数ケースを一括保存できる
4. `view_images_json`がNULLでも保存できる
5. 見る場所画像がある場合も保存できる
6. トランザクション途中で失敗した場合、ケースだけ残らない
7. 既存テストのUPDATEが成功する

---

## 4. マイグレーション検証パターン

### 4.1 新規DB

空DBへ`001`から`011`までを順番に適用してください。

確認項目:

- 全マイグレーション成功
- 必須テーブル・列・FK・INDEXが存在
- アプリ起動成功
- `POST /api/scenario-editor/save`成功

---

### 4.2 既存DB

次の状態を再現してください。

- `schema_migrations`には`008`から`010`が存在
- `008`後半の一部列が存在しない
- `view_images_json`の一部のみ手動追加済み

そのDBへ`011`を適用し、すべての不足列が補完されることを確認してください。

---

### 4.3 冪等性

同じスキーマに対して、修復SQL相当のチェックを複数回行っても失敗しないことを確認してください。

マイグレーションファイル自体は一度だけ適用しますが、DDLは既存列があっても安全な内容にしてください。

---

## 5. 受け入れ条件

以下をすべて満たした場合のみ完了としてください。

- [ ] `011_repair_ui_workflow_columns.sql`が追加されている
- [ ] 既存の`008_ui_workflow.sql`を変更していない
- [ ] 不足していた6列がすべて存在する
- [ ] 新規DBで`001`から`011`まで適用できる
- [ ] 既存DBへ`011`だけを適用できる
- [ ] 起動時スキーマ検証が実装されている
- [ ] スキーマ不整合時にreadyにならない
- [ ] `/api/scenario-editor/save`のMariaDB統合テストが成功する
- [ ] 型検査、単体テスト、本番ビルドが成功する
- [ ] 実ブラウザからテスト登録が成功する
- [ ] 実施内容と結果を課題管理台帳・タスクログへ記録している

---

## 6. 作業報告に必ず含める内容

作業完了報告では、次を具体的に記載してください。

```text
原因
変更したファイル
追加したマイグレーション
検証したDBパターン
実行したコマンド
テスト結果
残っているリスク
課題管理台帳の更新箇所
タスクログの更新箇所
```

単に「修正しました」「テスト成功」と報告せず、実行結果と証拠を提示してください。
