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
| ISSUE-20260804-003 | 2026-08-04 | Data integrity | P1 | Verified | Excelテスト設計インポート | 旧テンプレートと確定処理が`test_cases`中心の旧構造のままで、`scenarios`と`scenario_cases`を作成せず、取り込み後のテスト一覧に表示されなかった。 | テンプレートとパーサーを`Scenarios`、`Cases`、`Steps`、`CommonData`へ再設計し、テスト、確認項目、関連、フォルダ、タグ、個別データ、共通データを単一トランザクションで登録するよう変更した。旧テンプレートは明示エラーとした。 | GitHub Actions run 30844134585でUnit/API 37件、MariaDB統合2件、Build、Web起動、テスト設計全体のExcel取込を含むChromium E2E 14件が成功。 | User Report 2026-08-04 |
| ISSUE-20260804-004 | 2026-08-04 | Maintainability | P2 | Verified | Excel・フォルダUIコード | Excelルートに解析・テンプレート生成が密結合し、未使用import、旧フォルダUI用CSS、補正専用CSSファイルが残っていた。 | Excel解析・テンプレート生成を`excelImport.ts`へ分離し、未使用importと旧CSSを削除、補正CSSを`test-design.css`へ統合した。 | TypeCheck、Unit/API 37件、Build、Chromium E2E 14件が成功。CSSバンドルは32.39 kBから31.00 kBへ縮小した。 | User Report 2026-08-04 |
| ISSUE-20260804-005 | 2026-08-04 | Bug | P1 | Verified | 完了済み実行・証跡表示 | 実行切替時に証跡パネルが前の実行ケースIDを保持し、新しい実行IDと組み合わせてAPIを呼び出していた。非同期応答の世代管理もなかった。 | 現在の`runCases`に属する`activeCaseId`へ正規化し、古い応答を無視するsequence guard、読込エラーと操作メッセージの分離を追加した。 | GitHub Actions run 30848395288でnpm audit 0件、Unit/API 37件、MariaDB統合2件、完了済み実行切替を含むChromium E2E 15件が成功。 | User Report 2026-08-04 |
| ISSUE-20260804-006 | 2026-08-04 | Security | P1 | Verified | npm依存関係 | `brace-expansion` 5.0.8がCVE-2026-69152の影響範囲にあり、入力次第でDoSにつながる高重大度脆弱性として検出された。 | `brace-expansion` 5.0.9と`minimatch` 10.2.6へ固定し、lockfileを更新した。CIへ`npm audit --audit-level=high`を必須工程として追加した。 | GitHub Actions run 30848395288で`npm ci`と`npm audit`が脆弱性0件、全検証成功。 | User Report 2026-08-04 |
| ISSUE-20260804-007 | 2026-08-04 | Security | P1 | Verified | Docker MariaDB認証 | ローカルDocker用の維持されたCompose設定がなく、アプリ設定は`DB_PASSWORD`未設定時に空文字を使用した。またMariaDB初期化環境変数は作成済みボリュームへ再適用されない。 | MariaDBとアプリへ同じ非空パスワードを渡すCompose、localhost限定ポート、認証付きhealthcheck、空パスワード拒否、既存ボリューム修復コマンド、`.env.example`と手順書を追加した。 | GitHub Actions run 30853941396でCompose検証、修復スクリプト構文検証、依存監査、Unit/API 40件、MariaDB統合2件、Build、Web起動、Chromium E2E 15件が成功。 | User Report 2026-08-04 |

| ISSUE-20260805-001 | 2026-08-05 | Usability | P2 | Verified | 業務導線 | テスト設計から実行作成、作業再開、未実行移動、完了前確認、不合格・ブロック再実行の導線が分断され、業務上のクリックと見落としが多かった。 | 保存と実行作成を一操作へ統合し、ダッシュボードから実行へ直接復帰、次の未実行への保存移動、状態別完了前チェック、失敗項目だけの再実行draft作成を追加した。 | GitHub Actions run 30973373586で依存監査0件、TypeCheck、Unit/API 42件（2件skip）、MariaDB統合2件、Build、Web起動、Chromium E2E 16件が成功。 | User Request 2026-08-05 |
| ISSUE-20260805-002 | 2026-08-05 | Operation / Security | P1 | Verified | OpenShift deployment | 既存のコンテナとOpenShift定義は任意UID、読み取り専用root filesystem、内部ビルド、Route経由のプロキシ、永続化、バックアップを一体で検証していなかった。 | 任意UID対応のマルチステージイメージ、BuildConfig/ImageStream、MariaDB StatefulSet、Route、PVC、NetworkPolicy、Secret運用、バックアップ・保持CronJob、graceful shutdownを追加した。 | GitHub Actions run 30976592066でKustomize生成、任意UID・read-only root filesystem起動、Unit/API 43件、MariaDB統合2件、Chromium E2E 16件を含む全工程成功。実OpenShiftクラスターへの適用は接続情報がないため未実施。 | User Request 2026-08-05 |
| ISSUE-20260805-003 | 2026-08-05 | Usability / Operation | P1 | Verified | プロジェクト・ユーザー管理 | プロジェクトはアーカイブまでで削除導線がなく、ユーザー作成フォームが常時表示され、一覧から状態・担当・必要操作を把握しにくかった。 | アーカイブ済み・名称完全一致・理由必須の論理削除と監査を追加し、ユーザー作成・編集・仮パスワード設定をモーダル化、検索・状態集計・担当表示中心のUIへ変更した。 | GitHub Actions run 30997068195で管理モーダルとプロジェクト削除E2Eを含む全19件成功。 | User Request 2026-08-05 |
| ISSUE-20260805-004 | 2026-08-05 | Usability / Bug | P1 | Verified | フォルダ・テスト設計 | 選択フォルダが新規テストへ引き継がれず、親子フォルダ同時移動で二重移動が起こり得た。確認項目のフォルダ指定と複数手順の一覧表示も利用者を混乱させた。 | 選択フォルダの自動設定、親子選択を整理した移動、移動先メニューを追加し、不要説明・確認項目フォルダ指定を削除した。全操作手順を一覧要約し、詳細側で全件編集する構成へ変更した。 | GitHub Actions run 30997068195で選択フォルダ配置・複数手順表示を含む全19件成功。 | User Request 2026-08-05 |
| ISSUE-20260805-005 | 2026-08-05 | Usability / Data integrity | P1 | Verified | テスト実行 | 実行スナップショットへ関連データが自動で含まれず、テストデータ・共通データを確認できなかった。見る場所画像は拡大・実行単位編集ができず、全件完了後も次の未実行ボタンが有効だった。 | 関連データセットの自動スナップショット、実行画面のデータ表示、画像ライトボックス、元定義を変更しない実行用派生画像、完了時の次項目ボタン無効化を実装した。 | GitHub Actions run 30997068195でデータ表示・画像編集・拡大・ボタン制御を含む全19件成功。 | User Request 2026-08-05 |
| ISSUE-20260805-006 | 2026-08-05 | Usability / Export | P1 | Verified | エクスポート | エクスポート対象を明示選択できず、テスト実行の結果・データ・証跡画像を一体で出力できなかった。 | プロジェクト全体・テスト設計・テスト実行の選択UIを追加し、実行概要・結果・データ・証跡シートと最新画像証跡を埋め込むExcelを実装した。画像変換失敗時はPNG/JPEG原本を使用する。 | GitHub Actions run 30997068195で証跡画像入り実行Excelの生成・再読込を含む全19件成功。 | User Request 2026-08-05 |

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

- ISSUE-20260804-001からISSUE-20260804-007までを`Verified`とする。
- Excel確定の通信エラーはrun `30840831542`、テスト設計全体の取り込みと保守整理はrun `30844134585`で独立検証した。
- 完了済み実行の証跡表示と依存監査はrun `30848395288`で独立検証した。
- Docker MariaDB認証はrun `30853941396`でCompose設定、修復スクリプト構文、空パスワード拒否、MariaDB接続と全回帰を検証した。
- 作成済みの無パスワードボリュームは初期化環境変数だけでは変更されないため、データを保持したまま`npm run db:password`を一度実行する必要がある。

## Review 10（2026-08-06）

| ID | 登録日 | 種別 | 優先度 | 状態 | 対象 | 原因 | 対応結果 | 検証 | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260806-001 | 2026-08-06 | Data integrity / Bug | P0 | Verified | プロジェクト完全削除・名称 | クライアントがDELETEの404を成功扱いし、ブラウザメモリだけで対象を隠していた。削除の意味と永続状態も不一致だった。 | サーバーを唯一の正とし、アーカイブ済みプロジェクトを管理者が完全削除する単一トランザクションへ変更した。理由は任意、復元なし、監査は保持する。同名の有効プロジェクトをAPIとDBで拒否する。 | GitHub Actions run `31062560323`で同名並行作成409、完全削除、管理画面E2Eを含む全工程成功。 | Review 10 REV-001〜009, REV-042〜045, REV-050 |
| ISSUE-20260806-002 | 2026-08-06 | Data integrity / Security | P0 | Verified | 更新・監査・ファイル整合性 | 業務更新と監査が別commitで、ファイル生成後の監査失敗時にDB行だけ残る経路があった。 | 変更APIをrequest transactionへ統合し、監査を同一接続へ含めた。生成ファイルはrollback補償、物理削除は再試行可能なfile cleanup queueへ移した。画像取得状態と派生元を検証する。 | GitHub Actions run `31062560323`で監査失敗rollback、ファイル補償、証跡アップロード、Unit/API・MariaDB・Chromiumが成功。 | Review 10 REV-010〜017, REV-034〜035, REV-048〜049 |
| ISSUE-20260806-003 | 2026-08-06 | Operation / Recovery | P0 | Verified | バックアップ・復元・保持処理 | DBと証跡を更新中に別時点で保存し、manifest・手動復元・失敗回収・保持容量が不足していた。保持処理はファイルを先に削除していた。 | 更新停止と進行中要求待機、DB・証跡同世代、manifest/checksum、02:00日次・正常2世代・220GiB、管理者要求API/UI、復元前バックアップ、DB先行の再試行可能保持処理を実装した。 | GitHub Actions run `31062560323`で3世代作成、正常2世代保持、checksum、DB・証跡復元、保持SQL、任意UID起動が成功。 | Review 10 REV-016〜023 |
| ISSUE-20260806-004 | 2026-08-06 | Data integrity / Maintainability | P1 | Verified | 実行・認証・インポート・Migration | completed結果の状態矛盾、最後の管理者喪失、import二重確定、Migration部分適用・改変・競合、JSON破損黙殺、N+1処理があった。 | completedを最終4状態へ限定、not_run日時解除、最後の管理者保護、import先行claim、権限先行・1ファイル100MiB、Migration checksum/status/lock、破損JSON明示失敗、snapshot一括処理を追加した。 | GitHub Actions run `31062560323`でUnit/API 49件、MariaDB統合2件、Chromium E2E 19件を含む全回帰が成功。 | Review 10 REV-024〜030, REV-036〜041, REV-046〜047 |

### Review 10仕様判定

- `REV-031` アーカイブ済みプロジェクトの編集可否は現行仕様を維持する。
- `REV-032` 未割当ユーザーの参照・エクスポート可は現行仕様を維持する。
- `REV-033` パスワード4文字以上・種類制約なし・前後空白除去は現行仕様を維持する。
- `REV-005` プロジェクト完全削除の理由は任意とする。
- `REV-007` プロジェクトは完全削除後に復元しない。
- `REV-020` 日次バックアップ時刻はCronJobに合わせて02:00とする。
- `REV-021` 正常バックアップは2世代保持とする。
- `REV-024` completedのケース結果はpass/fail/blocked/skipだけに限定する。
- `REV-049` multipartは1ファイル100MiB、最大1000 field/1001 partとする。
- `REV-050` 同名の有効プロジェクトを許可しない。

## Repository structure cleanup（2026-08-06）

| ID | 登録日 | 種別 | 優先度 | 状態 | 対象 | 原因 | 対応結果 | 検証 | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260806-005 | 2026-08-06 | TechnicalDebt / Maintainability | P2 | Verified | リポジトリ構成 | 旧レビュー資料、生成済み証跡、未参照コンポーネント、重複OpenAPI、作業名を含む現行ファイルが同居し、正本と実行対象を判別しにくかった。 | 生成物と履歴資料を削除し、仕様・セキュリティ資料を`docs/`へ集約した。未参照コードと重複ファイルを削除し、現行UIと移行CLIの主要ファイル名を責務名へ統一した。Electron版はWindows CIの現行対象のため維持した。 | 静的参照検査に成功。GitHub Actions run `31067948455`で通常Web CI全工程が成功。Artifact `web-ci-31067948455-1`（ID `8954562403`）。 | User Request 2026-08-06 |
