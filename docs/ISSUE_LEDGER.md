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
| ISSUE-20260801-009 | 2026-08-01 | Usability | P2 | Verified | フォルダ操作 | 一覧が単純表示で、階層操作・複数選択・キーボード・DnDの一貫したUIがなかった。 | 右クリックメニュー、F2インライン名前変更、Enter/矢印/Delete/Esc、Ctrl/Cmd・Shift複数選択、複数移動、パンくず、DnD、ドロップ先強調、循環移動防止を実装した。 | GitHub Actions run 30808270002でUnit/API 32件、MariaDB統合2件、Chromium E2E 12件が成功。 | Review 7, P2 Follow-up |
| ISSUE-20260804-001 | 2026-08-04 | Bug | P1 | Verified | Excel・正式JSONインポート確定 | bodyなしPOSTへ`Content-Type: application/json`を付ける画面固有request helperが残り、Fastifyが空JSON bodyとして500を返した。 | HTTP helperを共通化し、JSON文字列だけにJSON Content-Typeを設定した。空bodyとFormDataはブラウザ既定へ委ねた。 | GitHub Actions run 30840831542でUnit/API 35件、MariaDB統合2件、公式Excelテンプレートの検証・確定E2Eを含むChromium 14件が成功。 | User Report 2026-08-04 |
| ISSUE-20260804-002 | 2026-08-04 | Usability | P2 | Verified | フォルダ選択・右クリック・削除ダイアログ | 右クリック機能と重複する選択ツールバーが残り、sticky一覧のスタッキングコンテキストが固定保存バーより低かった。 | 重複ツールバーを削除し、複数操作は右クリック・キーボード・DnDへ統一した。コンテキストメニューとモーダルのz-index、overflow、最大高さを補正した。 | GitHub Actions run 30840831542で複数選択DnD、右クリック削除、ダイアログ全面被覆E2Eを含むChromium 14件が成功。 | User Report 2026-08-04 |

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

## P2フォルダ操作完了判定

- ISSUE-20260801-009は`Verified`とする。
- GitHub Actions run `30808270002`でTypeCheck、Unit/API 32件、MariaDB統合2件、Build、Web起動、Chromium E2E 12件、DB・監査・Playwright成果物保存が成功した。
- フォルダ移動の循環参照はUIで不正な移動先を除外し、既存APIでも自分自身および子孫への移動を拒否する二重防御とした。

## 2026-08-04不具合修正完了判定

- ISSUE-20260804-001およびISSUE-20260804-002は`Verified`とする。
- GitHub Actions run `30840831542`でTypeCheck、Unit/API 35件、MariaDB統合2件、Build、Web起動、Chromium E2E 14件が成功した。
- Excelは公式テンプレートのダウンロード、multipartプレビュー、bodyなし確定POST、DB登録後のAPI照合まで実ブラウザで確認した。
- フォルダUIは重複操作非表示、複数選択DnD、右クリック削除、削除ダイアログの全面被覆を確認した。
