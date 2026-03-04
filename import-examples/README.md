# インポート例（サンプルファイル）

このフォルダのファイルは、アプリの「エクスポート / インポート」画面から取り込めるサンプルです。

## 取り込み手順（おすすめ順）

1. `test_cases.csv` をインポート（種類: **テストケース** / 形式: **CSV**）
   - Markdown版: `test_cases.md`（種類: **テストケース** / 形式: **マークダウン**）
   - 必要に応じて「取り込み先フォルダ」を指定できます（指定するとファイル内 `folder` より優先）。
2. `scenarios.json` をインポート（種類: **シナリオ** / 形式: **JSON**）
   - Markdown版: `scenarios.md`（種類: **シナリオ** / 形式: **マークダウン**）
3. `data_sets_common.csv` をインポート（種類: **初期データ** / スコープ: **共通初期データ** / 形式: **CSV**）
   - Markdown版: `data_sets_common.md`（読みやすい見た目でインポート可能）
4. `data_sets_run.csv` をインポート（種類: **初期データ** / スコープ: **実行初期データ** / 形式: **CSV**）
   - Markdown版: `data_sets_run.md`（読みやすい見た目でインポート可能）
5. `data_sets.json` をインポート（種類: **初期データ** / 形式: **JSON**）
   - レコードごとに `scope` を切り替えられます（`common` / `case` / `scenario` / `run`）。

## 補足

- `scenarios.json` は `case_titles`（テストケース名の配列）でシナリオにテストケースを紐づけます。先にテストケースを取り込んでください。
- `test_cases.csv` / `test_cases.md` は `folder` 列を持てます。既存フォルダの「ID」または「名前」で指定可能です（未一致なら未分類）。
- `test_cases.csv` / `test_cases.md` は `view_location`（または `見る場所`）列も取り込めます。
- `test_cases.csv` の `steps`、`data_sets_*.csv` の `items` は **JSON文字列**（配列）です。CSVのセル内では `"` を `""` としてエスケープしています。
- `data_sets.json` は `items` を JSON配列としてそのまま書けます（CSVのようなエスケープ不要）。
- 初期データの `value` / `note` は改行を含められます（サンプルでは `\\n` を使用）。
