# マークダウン手順書データモデル案

最終更新: 2026-04-27

## 方針

- Markdown は手順定義の原本として扱う
- SQLite は取込結果、予定日時、実施日時、手動調整、再読込対応情報を保持する
- 一覧の 1 行は `###` 見出し単位で管理する
- `#` と `##` は表示用グループと再読込時の同一性判定材料として保持する
- Markdown 再読込時は、手順の安定 ID を使って入力済みデータを引き継ぐ

## 想定エンティティ

1. 手順書ヘッダ
2. 手順グループ
3. 手順行
4. 手順コンテンツブロック
5. 予定情報
6. 実施情報

## テーブル案

### `procedure_documents`

手順書ファイル単位の管理。

| カラム | 型 | 用途 |
| --- | --- | --- |
| `id` | TEXT PK | 手順書 ID |
| `title` | TEXT NOT NULL | 手順書タイトル |
| `source_path` | TEXT NOT NULL | 取り込んだ Markdown の絶対パスまたは管理パス |
| `source_name` | TEXT NOT NULL | 表示用ファイル名 |
| `source_hash` | TEXT NOT NULL | ファイル全体ハッシュ |
| `last_imported_at` | TEXT NOT NULL | 最終取込日時 |
| `created_at` | TEXT NOT NULL | 作成日時 |
| `updated_at` | TEXT NOT NULL | 更新日時 |

用途。

- 同じ Markdown を再読込する対象を識別する
- ファイル差し替え検知を行う

### `procedure_groups`

`#` と `##` の階層を保持する。

| カラム | 型 | 用途 |
| --- | --- | --- |
| `id` | TEXT PK | グループ ID |
| `document_id` | TEXT NOT NULL FK | 親の手順書 |
| `level` | INTEGER NOT NULL | `1` = `#`, `2` = `##` |
| `title` | TEXT NOT NULL | 見出し文字列 |
| `path_key` | TEXT NOT NULL | 例: `事前準備 > OpenShift作業` |
| `position` | INTEGER NOT NULL | 手順書内の並び順 |
| `created_at` | TEXT NOT NULL | 作成日時 |
| `updated_at` | TEXT NOT NULL | 更新日時 |

用途。

- 一覧上の区切り表示
- 手順の所属情報保持
- 再読込時の見出しパス比較

### `procedure_steps`

一覧の 1 行になる `###` 手順本体。

| カラム | 型 | 用途 |
| --- | --- | --- |
| `id` | TEXT PK | 手順 ID |
| `document_id` | TEXT NOT NULL FK | 親の手順書 |
| `group_level_1_id` | TEXT FK | 直近の `#` |
| `group_level_2_id` | TEXT FK | 直近の `##` |
| `stable_key` | TEXT NOT NULL | 再読込引継ぎ用キー |
| `path_key` | TEXT NOT NULL | `# / ## / ###` を連結したキー |
| `heading` | TEXT NOT NULL | `###` 見出し |
| `step_no` | INTEGER NOT NULL | `##` 配下の自動採番 |
| `position` | INTEGER NOT NULL | 文書全体での並び順 |
| `body_text` | TEXT NOT NULL DEFAULT '' | プレーン本文要約または全文 |
| `content_hash` | TEXT NOT NULL | 手順内容ハッシュ |
| `status` | TEXT NOT NULL DEFAULT 'not_started' | `not_started` / `in_progress` / `done` |
| `created_at` | TEXT NOT NULL | 作成日時 |
| `updated_at` | TEXT NOT NULL | 更新日時 |

`stable_key` の第一案。

- `path_key + heading + normalized_body_hash` を元に生成する
- 将来より安定させたい場合は Markdown 内コメントで明示 ID を許可する

例。

```text
事前準備/namespace作成/8f3b2c...
```

### `procedure_step_blocks`

詳細ポップアップ描画用の本文ブロック。

| カラム | 型 | 用途 |
| --- | --- | --- |
| `id` | TEXT PK | ブロック ID |
| `step_id` | TEXT NOT NULL FK | 親手順 |
| `block_type` | TEXT NOT NULL | `paragraph` / `code` / `heading` / `list` / `note` / `hr` |
| `block_order` | INTEGER NOT NULL | 表示順 |
| `heading_level` | INTEGER | `####` 以降を使う場合の見出しレベル |
| `language` | TEXT | コードブロック言語 |
| `content` | TEXT NOT NULL | 本文またはコード |
| `meta_json` | TEXT | 箇条書きや補助情報 |
| `created_at` | TEXT NOT NULL | 作成日時 |
| `updated_at` | TEXT NOT NULL | 更新日時 |

用途。

- 詳細ポップアップを Markdown 再パースなしで表示できる
- コードコピー対象をそのまま保持できる

### `procedure_schedule`

予定日時と手動調整情報。

| カラム | 型 | 用途 |
| --- | --- | --- |
| `step_id` | TEXT PK FK | 対象手順 |
| `planned_start_at` | TEXT | 予定開始 |
| `planned_end_at` | TEXT | 予定終了 |
| `planned_duration_minutes` | INTEGER | 予定所要分 |
| `plan_anchor_type` | TEXT NOT NULL DEFAULT 'auto' | `auto` / `manual` |
| `plan_anchor_at` | TEXT | 手動調整した基準日時 |
| `plan_anchor_note` | TEXT | 将来の監査用メモ |
| `created_at` | TEXT NOT NULL | 作成日時 |
| `updated_at` | TEXT NOT NULL | 更新日時 |

用途。

- 所要時間入力と自動展開結果を保持する
- 途中手順の手動調整を後続再計算の基準点として保持する

### `procedure_execution`

実施打刻と実績値。

| カラム | 型 | 用途 |
| --- | --- | --- |
| `step_id` | TEXT PK FK | 対象手順 |
| `actual_start_at` | TEXT | 実施開始 |
| `actual_end_at` | TEXT | 実施終了 |
| `actual_duration_minutes` | INTEGER | 実績所要分 |
| `started_by` | TEXT | 将来の操作者名 |
| `finished_by` | TEXT | 将来の操作者名 |
| `created_at` | TEXT NOT NULL | 作成日時 |
| `updated_at` | TEXT NOT NULL | 更新日時 |

用途。

- 詳細ポップアップの開始打刻、終了打刻
- 一覧での実績表示

## 手順同一性判定案

第一案は次の優先順。

1. 既存 `stable_key` 一致
2. `path_key` 一致かつ `heading` 一致
3. `heading` 一致かつ `content_hash` が近い

補足。

- `##` 内で順番だけ変わるケースを考えると `position` だけに依存しない方がよい
- 見出し名の重複が多い運用なら、将来的に Markdown コメント ID を追加した方が安全

## TypeScript 型案

```ts
type ProcedureDocument = {
  id: string;
  title: string;
  sourcePath: string;
  sourceName: string;
  sourceHash: string;
  lastImportedAt: string;
  createdAt: string;
  updatedAt: string;
};

type ProcedureGroup = {
  id: string;
  documentId: string;
  level: 1 | 2;
  title: string;
  pathKey: string;
  position: number;
};

type ProcedureStep = {
  id: string;
  documentId: string;
  groupLevel1Id: string | null;
  groupLevel2Id: string | null;
  stableKey: string;
  pathKey: string;
  heading: string;
  stepNo: number;
  position: number;
  bodyText: string;
  contentHash: string;
  status: "not_started" | "in_progress" | "done";
};

type ProcedureStepBlock = {
  id: string;
  stepId: string;
  blockType: "paragraph" | "code" | "heading" | "list" | "note" | "hr";
  blockOrder: number;
  headingLevel: number | null;
  language: string | null;
  content: string;
  metaJson: string | null;
};

type ProcedureSchedule = {
  stepId: string;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  plannedDurationMinutes: number | null;
  planAnchorType: "auto" | "manual";
  planAnchorAt: string | null;
};

type ProcedureExecution = {
  stepId: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  actualDurationMinutes: number | null;
};
```

## この案で先に確定したい点

1. `stable_key` を自動生成だけで始めるか
2. `####` 以下をブロックとして保存するか
3. 予定所要時間を `INTEGER 分` 保存でよいか
4. 実績情報を 1 手順 1 レコードで十分か

## 実装順の提案

1. SQLite テーブル追加
2. Markdown 取込パーサ
3. 再読込時マージ処理
4. 一覧画面
5. 詳細ポップアップ
6. 予定再計算と実施打刻
