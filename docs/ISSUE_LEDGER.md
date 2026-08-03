# Issue Ledger

## Active and historical issues

| ID | 登録日 | 種別 | 優先度 | 状態 | 対象 | 原因 | 対応結果 | 検証 | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260801-001 | 2026-08-01 | Migration | P0 | Closed | MariaDB schema | 適用済みMigrationへの後追い変更で履歴と実スキーマが乖離した。 | 補修Migration 011と起動時構造検証を追加した。 | 新規・部分適用MariaDBでMigration、冪等性、保存APIを確認。 | Review 7 |
| ISSUE-20260801-002 | 2026-08-01 | Bug | P0 | Closed | 実行・認証導線 | 保存後state同期と実環境検証が不足した。 | run state同期、監査、機能別E2Eを追加した。 | GitHub Actions run 30804989151で主要導線11件成功。 | Review 7 |
| ISSUE-20260801-003 | 2026-08-01 | Security | P1 | Closed | 見る場所画像 | 申告MIME依存と期限回収が不足した。 | Sharp検証、SVG拒否、参照確認付き回収を追加した。 | TypeCheck、Unit/API、MariaDB統合成功。 | Review 7 |
| ISSUE-20260801-004 | 2026-08-01 | Operation | P2 | Closed | codex-review運用 | 外部送信を伴うレビューが安全制約で拒否された。 | 本環境ではcodex-reviewを使用せず、ローカル解析と独立CIを代替とする。 | 運用ルールとTask Logへ記録。 | Review 8 |
| ISSUE-20260801-005 | 2026-08-01 | Bug | P1 | Closed | evidence byte_size | BIGINTを直接JSON化した。 | 共通JSON正規化と10進文字列表現へ統一した。 | Unit/API、MariaDB統合成功。 | Review 7, Review 9 |
| ISSUE-20260801-006 | 2026-08-01 | Bug | P1 | Closed | 開発時静的配信 | 静的UI既定パスが誤っていた。 | workspace rootから解決するよう修正した。 | 実ブラウザでログイン画面を確認。 | Review 7 |
| ISSUE-20260801-007 | 2026-08-01 | Data integrity | P1 | Closed | 完了後更新 | 完了後更新が通常SQLを共有していた。 | 結果・実績結果・備考だけの専用更新へ分離した。 | MariaDB統合とChromium E2E成功。 | Review 7 |
| ISSUE-20260801-008 | 2026-08-01 | Test architecture | P1 | Verified | E2E | 単一specで失敗原因を分離できなかった。 | 機能別specへ分割し、409競合復旧spec、trace、screenshot、video保存を追加した。 | GitHub Actions run 30804989151でChromium 11件成功。 | Review 7, Review 9 |
| ISSUE-20260801-009 | 2026-08-01 | Usability | P2 | Open | フォルダ操作 | Review 9対象外の別タスク。 | 右クリック、F2、複数選択、移動、パンくず、DnD等は未実装。 | 対象外として継続。 | Review 7, Review 9 |

## Review 9

| ID | 優先度 | 状態 | 確定原因 | 対応結果 | 検証状況・残存リスク |
|---|---|---|---|---|---|
| ISSUE-20260803-001 | P1 | Verified | 経路ごとのBIGINT正規化が分散した。 | 共通JSON正規化、versions/exportの文字列表現、OpenAPIを統一した。 | Unit/API、MariaDB統合、独立CI成功。 |
| ISSUE-20260803-002 | P1 | Verified | 合格率分母が層ごとに不一致だった。 | `pass / (pass + fail + blocked)`へ統一した。 | Unit/API、MariaDB統合、Chromium主要導線成功。 |
| ISSUE-20260803-003 | P1 | Verified | 単調versionマージがケース保存経路へ適用されず、409復旧UIも操作不足だった。 | run/case共通の単調versionマージ、再読込・コピー・差分確認UI、入力控え保持を実装した。 | 単調マージ単体テスト3件とChromium競合specが成功。 |
| ISSUE-20260803-004 | P1 | Verified | FS失敗後の追跡可能な状態と生成物回収が不足した。 | pending/failed状態、再試行、構造化ログに加え、編集失敗時の一時ファイル・PNG・サムネイル回収を実装した。 | TypeCheck、Unit/API、Build成功。OS権限による削除失敗注入は追加強化候補。 |
| ISSUE-20260803-005 | P1 | Verified | 方針Aの文書・OpenAPI・UIの同期が不足した。 | API/UI/監査を方針Aへ統一し、確定仕様v1.1.0と変更履歴を追加した。 | 完了後編集E2Eと文書照合が成功。 |
| ISSUE-20260803-006 | P1 | Verified | 状態名・優先順が未統一だった。 | DBの6状態を正とし、子ケースから自動集計する。 | Unit/API、MariaDB統合成功。 |
| ISSUE-20260803-007 | P1 | Verified | 編集画像をrenameだけでPNG扱いし、例外時にサムネイルが残り得た。 | SharpでPNG再エンコードし、SVG/破損を拒否し、全生成物を回収する。 | TypeCheck、Unit/API、Build成功。OS権限による回収失敗注入は追加強化候補。 |
| ISSUE-20260803-008 | P1 | Verified | スキーマ検証が存在確認中心だった。 | 型、NULL、default、索引順、FK、ON DELETEを検証し、補修Migrationを追加した。 | MariaDB統合2件と異なる既定照合順序テスト成功。 |
| ISSUE-20260803-009 | P1 | Verified | E2Eが巨大で成果物と競合UI試験が不足した。 | 機能別spec、成果物保存、409競合復旧specを追加した。 | GitHub Actions run 30804989151でChromium 11件成功し、成果物保存も成功。 |
| ISSUE-20260803-010 | P2 | Verified | JSON上限とmultipart制限の説明が混在した。 | 25 MiB JSON、multipartアプリ独自上限なし、配備制限を明記した。 | UI文言とOpenAPIを照合。 |
| ISSUE-20260803-011 | P2 | Verified | 現在状態と追記履歴が混在した。 | Issue Ledgerを正規表へ整理し、Task Logをタスク単位へ再構成した。 | 最新CI結果と完了時刻を反映して相互照合した。 |

## Review 9完了判定

- Review 9の対象課題はすべて`Verified`とする。
- 独立検証はGitHub Actions run `30804989151`で実施し、TypeCheck、Unit/API 29件、MariaDB統合2件、Build、Web起動、Chromium E2E 11件、DB・監査・Playwright成果物保存が成功した。
- OS権限によるファイル削除失敗の強制注入は追加の堅牢化候補であり、Review 9完了を妨げる未修正不具合としては扱わない。
- フォルダ操作のISSUE-20260801-009はReview 9対象外のため、別タスクとして継続する。
