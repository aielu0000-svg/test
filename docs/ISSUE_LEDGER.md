# Issue Ledger

| ID | 登録日時 | 種別 | 優先度 | 状態 | 対象 | 内容 | 再現手順 | 原因 | 対応方針 | 対応結果 | 検証 | 関連ファイル | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260801-001 | 2026-08-01 | Migration | P0 | Closed | MariaDB schema | 既存DBで列・索引・FKが欠損し保存に失敗する。 | 008適用記録のみの部分DBで保存する。 | 適用済みMigrationの後追い変更で履歴と実スキーマが乖離した。 | 新規011で補修し、構造検証を追加する。 | 011補修Migrationと起動時構造検証を実装した。 | 新規・部分適用MariaDBでMigration、再実行冪等性、保存APIを確認。 | web/migrations/011_repair_ui_workflow_columns.sql, web/src/server/schemaValidation.ts | Review 7 |
| ISSUE-20260801-002 | 2026-08-01 | Bug | P0 | Closed | 実行・認証導線 | 実行作成、連続保存、証跡、完了後更新、ログアウトが未検証だった。 | Chromiumで実行する。 | 保存後のstate同期と実検証が不足していた。 | run state同期、監査、E2Eを追加する。 | 保存応答の反映、開始拒否監査、完了後更新を実装した。 | 実MariaDB統合と隔離MariaDB+Chromiumの主要導線を確認。 | web/src/client, web/src/server, web/e2e | Review 7 |
| ISSUE-20260801-003 | 2026-08-01 | Security | P1 | Closed | 見る場所画像 | 偽装画像と未関連ファイルの安全な扱いが不足していた。 | 偽MIME・破損画像・関連解除を試す。 | 申告MIMEへの依存と期限回収不足。 | 実体検証と参照確認付き回収を追加する。 | Sharp検証、SVG拒否、実体Content-Type、回収処理を実装した。 | TypeCheck、Unit/API、MariaDB統合を確認。 | web/src/server/routes/scenarioEditor.ts, web/src/server/viewImageLifecycle.ts | Review 7 |
| ISSUE-20260801-004 | 2026-08-01 | Operation | P2 | Closed | codex-review運用 | 当時の外部レビューが安全制約で実行できなかった。 | Codex CLIレビューを試行する。 | 外部送信承認が未付与だった。 | ユーザー承認後にread-onlyレビューを再開する。 | 今回のReview 9で外部送信承認を受け、read-onlyレビューを実行する。 | 過去の未実施記録を保持し、今回の結果はAIレビュー履歴へ記録する。 | docs/AI_REVIEW_HISTORY.md | Review 8 |
| ISSUE-20260801-005 | 2026-08-01 | Bug | P1 | Closed | evidence byte_size | BIGINTのJSON化で一覧が500になる。 | 大きなbyte_sizeを含む一覧を取得する。 | BIGINTを直接JSON化した。 | JSON正規化を共通化する。 | Review 9で全経路の共通正規化へ置換した。 | UnitとMariaDB統合を実行。 | web/src/server/jsonNormalization.ts | Review 7, Review 9 |
| ISSUE-20260801-006 | 2026-08-01 | Bug | P1 | Closed | 開発時静的配信 | web配下起動時に静的UIが404になる。 | npm run devをweb配下で起動する。 | 静的UI既定パスが誤っていた。 | workspace rootから解決する。 | configのstaticDir解決を修正した。 | 実ブラウザでログイン画面を確認。 | web/src/server/config.ts | Review 7 |
| ISSUE-20260801-007 | 2026-08-01 | Data integrity | P1 | Closed | 完了後更新 | 方針Aで不許可の担当者・実行日時がnull更新され得る。 | completed後にケースを更新する。 | 更新SQLを通常経路と共有していた。 | 完了後専用SQLへ分離する。 | 結果・実績結果・備考のみの更新へ分離した。 | MariaDB統合で不変性と更新metadataを確認。 | web/src/server/routes/runs.ts | Review 7 |
| ISSUE-20260801-008 | 2026-08-01 | Test architecture | P1 | Ready for Verification | E2E | 単一シナリオで失敗原因を分離できない。 | specを個別実行する。 | fixtureとspec分割が不足していた。 | auth/design/run/evidence/completion等の独立specへ分割する。 | 9 specと共通fixtureへ分割し、trace/screenshot/videoを失敗時保持する。 | Playwright listで10テストを検出。Chromium本走はE2E資格情報未設定で明示的に失敗。 | web/e2e, web/playwright.config.ts | Review 7, Review 9 |
| ISSUE-20260801-009 | 2026-08-01 | Usability | P2 | Open | フォルダ操作 | フォルダのエクスプローラー操作が未実装。 | 右クリック・複数選択等を試す。 | 対象外の別タスク。 | 別タスクで実装する。 | アップロード上限表示は対応済み。未解決はフォルダ操作だけ。 | 対象外として確認。 | web/src/client | Review 7, Review 9 |

## Review 9 current state

| ID | 優先度 | 状態 | 確定原因 | 対応結果 | 検証状況・残存リスク |
|---|---|---|---|---|---|
| ISSUE-20260803-001 | P1 | Ready for Verification | 経路ごとのBIGINT正規化が分散。 | 共通JSON正規化、versions/exportの文字列表現、OpenAPIを統一。 | Unit/MariaDB統合は実行。証跡を含むversions/exportの実ブラウザ確認は資格情報待ち。 |
| ISSUE-20260803-002 | P1 | Ready for Verification | 合格率分母が層ごとに不一致。 | pass/(pass+fail+blocked)へ統一。 | Unit/TypeCheck済み。実画面集計は資格情報待ち。 |
| ISSUE-20260803-003 | P1 | Ready for Verification | 単調versionマージと409復旧UIがなかった。 | 古いrun更新を破棄し、再読込・入力控えUIを追加。 | API同時更新はMariaDB統合済み。応答順序反転UI本走は資格情報待ち。 |
| ISSUE-20260803-004 | P1 | Ready for Verification | FS失敗後の追跡可能な状態がなかった。 | pending/failed状態、再試行、構造化ログを追加。 | MariaDB Migrationは実行。失敗注入テストを外部レビューで再確認する。 |
| ISSUE-20260803-005 | P1 | Ready for Verification | 方針Aの文書・OpenAPI不一致。 | 確定仕様、OpenAPI、API、UI、監査を方針Aへ統一。 | TypeCheck/Unit/MariaDB統合済み。UI本走は資格情報待ち。 |
| ISSUE-20260803-006 | P1 | Verified | 状態名・優先順の未統一。 | DBの6状態を正とし、ケースから自動集計する。 | Unit/MariaDB統合、確定仕様を照合。 |
| ISSUE-20260803-007 | P1 | Ready for Verification | 編集画像をrenameだけでPNG扱いし得る。 | Sharpで実体をPNG化、SVG/破損を拒否し失敗時掃除を追加。 | TypeCheck/Unit済み。形式別API本走は資格情報待ち。 |
| ISSUE-20260803-008 | P1 | Ready for Verification | スキーマ検証が存在確認中心。 | 型、NULL、default、索引順、FK、ON DELETEを構造検証化し012を追加。 | 新規/部分適用MariaDB統合済み。全破損型の失敗注入は追加検証候補。 |
| ISSUE-20260803-009 | P1 | Ready for Verification | E2Eが巨大で成果物不足。 | 9機能別specと失敗時動画/trace/screenshot保持を追加。 | list成功。Chromium本走は資格情報未設定で明示的失敗。 |
| ISSUE-20260803-010 | P2 | Verified | JSON上限とmultipart制限の説明混在。 | 25 MiB JSON、multipartアプリ独自上限なし、配備制限を明記。 | UI文言とOpenAPIを照合。 |
| ISSUE-20260803-011 | P2 | Verified | 現在状態と追記履歴が混在。 | 正規レコードを更新し、重複表を廃止した。 | 本台帳、Open Issues、Review History、Task Logを相互照合。 |