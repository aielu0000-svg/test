# Task Log

## TASK-20260801-001: 既存DB Migration補修と主要導線検証

- 開始日: 2026-08-01 JST
- 完了日: 2026-08-03 JST
- 対応課題: ISSUE-20260801-001, ISSUE-20260801-002, ISSUE-20260801-003
- 状態: Completed

### 発生したこと

- 適用済みと記録されたMigrationと実スキーマが一致せず、既存DBで保存時に列不足エラーが発生した。
- 実行作成、連続保存、証跡、完了後更新、ログアウトの実ブラウザ検証が不足していた。
- 見る場所画像で申告MIME依存と未関連ファイル回収の安全性が不足していた。

### 原因

- 適用済みMigrationファイルへの後追い変更により、Migration履歴とDB構造が乖離した。
- 保存応答後のstate同期と実MariaDB・Chromiumを使う検証環境が不足した。
- 画像実体検証と回収状態の管理が不足した。

### 実施内容

- 補修Migration 011と起動時スキーマ構造検証を追加した。
- run state同期、開始拒否監査、完了後更新方針Aを実装した。
- Sharpによる画像実体検証、SVG拒否、参照確認付き回収を実装した。
- E2Eを機能別specへ分割した。

### 検証

- TypeCheck: 成功
- Unit/API: 成功
- MariaDB統合: 成功
- Build: 成功
- Chromium E2E: 後続の独立CIタスクで実施

### 結果

- 既存DB補修、主要導線、画像実体検証を実装した。
- Chromium本走はTASK-20260803-002へ引き継いだ。

## TASK-20260801-002: codex-review利用可否と代替レビュー規則

- 開始日: 2026-08-01 JST
- 完了日: 2026-08-01 JST
- 対応課題: ISSUE-20260801-004
- 状態: Completed

### 発生したこと

- `codex review`はリポジトリ内容を外部サービスへ送信するため、安全制約により実行が拒否された。

### 対応

- 本環境では`codex-review`を使用しない。
- 外部送信を回避し、ローカル差分確認、仕様照合、静的解析、自動テスト、実DB・実ブラウザ確認を代替レビューとする。
- 外部送信が必要な場合は、送信対象とリスクを説明し、事前の明示承認を必要とする。

### 更新

- `docs/codex-development-operation-rules.md`
- `docs/AI_REVIEW_HISTORY.md`
- `docs/ISSUE_LEDGER.md`

## TASK-20260803-001: Review 9初回修正

- 開始日: 2026-08-03 JST
- 完了日: 2026-08-03 JST
- 対応課題: ISSUE-20260803-001〜011
- 状態: Completed with follow-up

### 発生したこと

- BIGINTのJSON化、合格率、409競合、完了後編集、シナリオ状態、PNG再エンコード、スキーマ検証、E2E構造、文書整合性にReview 9指摘があった。

### 実施内容

- BIGINT共通正規化を実装した。
- 合格率を`pass / (pass + fail + blocked)`へ統一した。
- run versionマージ、完了後編集方針A、シナリオ自動集計、Sharp PNG再エンコード、構造スキーマ検証を追加した。
- E2Eを9機能別spec・10テストへ分割した。

### 初回検証

- TypeCheck: 成功
- Unit/API: 26件成功
- MariaDB統合: 成功
- Build: 成功
- Chromium E2E: 資格情報不足で未完了

### 後続課題

- 独立CI環境での本走
- ケース保存応答を含む単調versionマージ
- 409復旧UIの3操作
- 編集画像失敗時のサムネイル回収
- 仕様版管理と台帳正規化

## TASK-20260803-002: GitHub Actions独立検証環境

- 開始日: 2026-08-03 JST
- 完了日: 2026-08-03 JST
- 対象: Pull Request #1 / `codex/web-review`
- 状態: Completed

### 発生したこと

1. 初回CIでは`006_phase4_evidence_procedures.sql`の照合順序不一致により外部キー作成が失敗した。
2. 次回CIでは空bodyのログアウトにJSON Content-Typeを付与したためFastifyが500を返した。
3. E2Eの戻る操作、警告文言、要素指定にテスト設計上の誤りがあった。

### 原因

- Migrationで親子テーブルの`utf8mb4_unicode_ci`指定が統一されていなかった。
- APIクライアントがbodyの有無に関係なくJSON Content-Typeを付与した。
- E2Eがブラウザ履歴とDOMの実構造を正確に限定していなかった。

### 実施内容

- 006の4テーブルへcharset/collationを明示した。
- 異なるDB既定照合順序でMigrationを実行する統合テストを追加した。
- bodyがある場合だけJSON Content-Typeを付与するよう修正した。
- 認証・テスト設計E2Eを修正した。
- MariaDB統合テスト2件をCIで実行するよう変更した。

### 検証結果

GitHub Actions run `30799180203`:

- TypeCheck: 成功
- Unit/API: 26件成功
- MariaDB統合: 2件成功
- Build: 成功
- Web起動・readiness: 成功
- Chromium E2E: 10件成功
- DBダンプ・監査ログ・Playwright成果物: 保存成功

## TASK-20260803-003: Review 9残件修正と完了確認

- 開始日時: 2026-08-03 19:04 JST
- 完了日時: 2026-08-03 19:20 JST
- 対応課題: ISSUE-20260803-003, ISSUE-20260803-004, ISSUE-20260803-005, ISSUE-20260803-007, ISSUE-20260803-009, ISSUE-20260803-011
- 状態: Completed

### 作業前の状態

- 既存CIは成功していたが、ケース保存応答がrun/case stateを直接上書きしていた。
- 409競合時は入力控え表示だけで、再読込・コピー・差分確認の操作が不足していた。
- 編集画像のDB更新失敗時にJPEGサムネイルが残る経路があった。
- 確定仕様書の変更履歴とReview 9の最終検証記録が不足していた。

### 確定原因

- 単調versionマージが証跡更新経路に限定され、ケース保存経路へ共通適用されていなかった。
- 競合復旧を自動再読込だけで実装し、利用者が操作できる復旧UIとして設計していなかった。
- 例外処理で一時ファイルとPNG本体だけを削除し、後から生成したサムネイルを削除対象へ含めていなかった。
- 仕様変更時の版上げと台帳更新がDefinition of Doneへ反映されていなかった。

### 実施内容

- `runUpdateMerge.ts`を追加し、runとrun caseへ単調versionマージを適用した。
- 古いrun応答、古いcase応答、完了後更新metadata保持の単体テストを追加した。
- 409競合UIへ「最新状態を再読み込み」「現在入力をコピー」「差分を確認」を追加した。
- 競合時の入力控えを、再読込後も保持するよう変更した。
- Chromium用`run-conflict.spec.ts`を追加した。
- 画像編集失敗時に一時ファイル、PNG本体、JPEGサムネイルを回収し、回収失敗を構造化ログへ出力するよう変更した。
- 確定仕様v1.1.0を追加し、単調versionマージ、409復旧UI、画像回収、独立CI条件を明文化した。
- Issue LedgerとTask Logを正規化した。

### 変更ファイル

- `web/src/client/runUpdateMerge.ts`
- `web/src/client/runUpdateMerge.test.ts`
- `web/src/client/OperationsWorkspaceV2.tsx`
- `web/src/server/routes/evidenceDerived.ts`
- `web/e2e/run-conflict.spec.ts`
- `the-test-web-confirmed-spec-v1.1.0.md`
- `docs/ISSUE_LEDGER.md`
- `docs/TASK_LOG.md`

### 独立検証結果

GitHub Actions run `30804989151`:

- TypeCheck: 成功
- Unit/API: 29件成功
  - 単調versionマージ単体テスト3件を含む
- MariaDB統合: 2件成功
  - 新規・補修MigrationとAPI統合
  - DB既定照合順序差異の再発防止
- Build: 成功
- Web起動・readiness: 成功
- Chromium E2E: 11件成功
  - 409競合時の再読込・入力コピー・差分確認を含む
- DBダンプ: 保存成功
- 監査ログ・テーブル件数: 保存成功
- Playwright HTMLレポート: 保存成功
- Artifact: `web-ci-30804989151-1`（ID `8852421312`）

### 結果

- Review 9の対象課題はすべて実装・独立検証済みとして完了した。
- フォルダのエクスプローラー操作はReview 9対象外のP2として継続する。
- OS権限によるファイル削除失敗の強制注入は、追加の堅牢化候補として残す。現在の実装は回収失敗を構造化ログへ記録し、黙って成功扱いにしない。
- GitHub Actionsの一部公式ActionについてNode.js 20ランタイム廃止警告がある。アプリ自体はNode.js 20.20.0で検証済みだが、Actionの次期メジャー版への更新は運用保守項目とする。

## TASK-20260803-004: P2フォルダエクスプローラー操作

- 開始日時: 2026-08-03 19:30 JST
- 完了日時: 2026-08-03 20:15 JST
- 対応課題: ISSUE-20260801-009
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 状態: Completed

### 作業前の状態

- フォルダとテストは階層表示されていたが、操作が単純なボタンと`window.prompt`中心だった。
- 右クリック、F2、複数選択、複数移動、パンくず、ドラッグ＆ドロップ、ドロップ先表示がなかった。
- サーバーAPIには楽観ロックと、自分自身・子孫へのフォルダ移動を拒否する検証が既に存在した。

### 確定原因

- 一覧表示と編集フォームが同一コンポーネントへ密結合しており、エクスプローラー固有の選択状態、展開状態、フォーカス、DnD状態を管理する責務が分離されていなかった。
- フォルダ操作の受け入れ試験がなく、API機能がUIから十分利用されていなかった。

### 実施内容

- `FolderExplorer.tsx`へフォルダ・テストのツリー操作を分離した。
- フォルダの展開・折りたたみ、選択中・アクティブ・編集中・ドロップ先を視覚表示した。
- プロジェクト直下、フォルダ、テストごとの右クリックメニューを追加した。
- F2インライン名前変更、Enterで開く/展開、矢印移動、Delete削除、Esc取消を追加した。
- Ctrl/Cmdによる追加選択とShiftによる範囲選択を追加した。
- 複数のフォルダ・テストを移動先選択またはDnDで移動できるようにした。
- UIで移動対象自身と子孫を移動先候補から除外し、既存APIの循環参照防止と二重化した。
- パンくずを追加し、親フォルダへ移動できるようにした。
- フォルダ作成をインライン入力へ変更し、削除理由を独自ダイアログで入力するようにした。
- `folderExplorerModel.ts`へパンくず、深さ、子孫、無効移動先の計算を分離した。

### 変更ファイル

- `web/src/client/FolderExplorer.tsx`
- `web/src/client/folderExplorerModel.ts`
- `web/src/client/folderExplorerModel.test.ts`
- `web/src/client/TestDesignEditor.tsx`
- `web/src/client/test-design.css`
- `web/e2e/folder-explorer.spec.ts`
- `docs/ISSUE_LEDGER.md`
- `docs/OPEN_ISSUES.md`
- `docs/TASK_LOG.md`

### 作業中に発生したこと

1. 初回CI run `30807423395`では、Playwrightの`dragTo()`がReactの再描画中に完了せず、新規E2Eが120秒でタイムアウトした。
2. `dragTo()`をブラウザの`DataTransfer`と`DragEvent`を明示発火する方式へ変更した。
3. 次のCI run `30807863581`では、クリック直後にF2を送ったためフォーカス確定前となり、名前変更入力を待ってタイムアウトした。
4. ツリー項目へ明示的にフォーカスしてからF2、Enter、Deleteを送信し、動的入力欄の表示を先に検証するようE2Eを修正した。

### 独立検証結果

GitHub Actions run `30808270002`:

- TypeCheck: 成功
- Unit/API: 32件成功
  - フォルダパンくず・深さ計算
  - 自分自身・子孫への移動先除外
  - 複数選択時の無効移動先統合
- MariaDB統合: 2件成功
- Build: 成功
- Web起動・readiness: 成功
- Chromium E2E: 12件成功
  - ルート・サブフォルダ作成
  - F2名前変更とEsc取消
  - Ctrl複数選択と複数移動
  - パンくず
  - Enter展開・折りたたみ・テスト表示
  - DnD移動
  - 循環移動拒否
  - Deleteと削除理由入力
- DBダンプ、監査ログ、テーブル件数、Playwright成果物: 保存成功

### 結果

- ISSUE-20260801-009を`Verified`へ変更した。
- Review 9完了ブランチ`codex/web-review`を変更せず、専用ブランチと下書きPR #2で検証した。
- 現時点でReview 9およびP2フォルダ操作に属する未解決の製品不具合はない。

## TASK-20260804-001: Excelインポート確定とフォルダ表示修正

- 開始日時: 2026-08-04 02:55 JST
- 完了日時: 2026-08-04 03:25 JST
- 対応課題: ISSUE-20260804-001, ISSUE-20260804-002
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 状態: Completed

### 発生したこと

- Excelファイルのプレビュー後に「追加を確定」を実行すると、画面にはサーバーエラーが表示された。
- フォルダを選択すると、右クリックメニューと機能が重複する選択ツールバーが一覧下部に残った。
- 右クリックメニューおよびフォルダ削除ダイアログより、固定保存バー等の画面要素が前面に表示される場合があった。

### 確定原因

- `Workspace.tsx`の画面固有request helperが、bodyのないPOSTにも`Content-Type: application/json`を付与していた。Fastifyはこれを空JSON bodyとして拒否し、`FST_ERR_CTP_EMPTY_JSON_BODY`で500を返していた。
- 同じ欠陥を持つrequest helperが`OperationsWorkspace.tsx`にも重複し、正式JSONインポート確定も同じ障害候補だった。
- フォルダ複数操作ツールバーは右クリック、キーボード、DnD導入後も削除されていなかった。
- `.design-browser`がsticky要素として独立したスタッキングコンテキストを作り、固定保存バーより低いz-indexに留まっていた。

### 実施内容

- `api.ts`の`request`を共有化し、JSON文字列bodyだけに`application/json`を設定した。
- bodyなしPOSTとFormDataではContent-Typeを手動設定せず、ブラウザへ委ねた。
- `Workspace.tsx`と`OperationsWorkspace.tsx`の重複request helperを削除した。
- フォルダの選択ツールバーを削除し、複数操作は右クリック、Ctrl/Cmd・Shift選択、キーボード、DnDへ統一した。
- コンテキストメニューと削除ダイアログ表示中は`.design-browser`のスタッキング順を上げ、モーダルをさらに上位へ配置した。
- コンテキストメニューへ画面高さ上限とスクロールを設定した。
- Content-Type単体テスト3件を追加した。
- 公式Excelテンプレートのダウンロード、multipartプレビュー、確定、DB/API照合を行うChromium E2Eを追加した。
- 重複ツールバー非表示、右クリック削除、モーダル全面被覆のChromium E2Eを追加した。
- 既存フォルダE2Eを、削除したツールバー依存から複数選択DnD検証へ更新した。

### 作業中に発生したこと

1. 初回CI run `30839806601`では、Excel E2Eを含む主要試験は成功したが、既存フォルダE2Eが削除済みツールバーを参照して失敗した。
2. 同runで右クリックメニューの削除ボタンが固定保存バーに遮られ、実際のz-index不具合を確認した。
3. 既存E2Eを複数選択DnDへ更新し、スタッキングコンテキスト、メニュー高さ、モーダル階層を修正した。
4. run `30840236639`は新しいコミットによるconcurrencyのため途中キャンセルされ、最終runで全件再検証した。

### 独立検証結果

GitHub Actions run `30840831542`:

- TypeCheck: 成功
- Unit/API: 35件成功
  - bodyなしPOST、JSON文字列、FormDataのContent-Type単体テスト3件を含む
- MariaDB統合: 2件成功
- Build: 成功
- Web起動・readiness: 成功
- Chromium E2E: 14件成功
  - 公式Excelテンプレートの検証・確定・DB/API照合
  - フォルダ複数選択DnD
  - 重複操作ツールバー非表示
  - 右クリック削除と削除ダイアログ全面被覆
- DBダンプ、監査ログ、テーブル件数、Playwright成果物: 保存成功
- Artifact: `web-ci-30840831542-1`（ID `8866738604`）

### 保守上の確認事項

- `web/src/server/routes/excel.ts`に未使用の`objectBody` importが残っている。
- `web/src/client/test-design.css`に旧フォルダUI用と考えられるselector候補が残っている。削除は全参照検索と回帰試験を伴う別cleanupとする。
- CIの`npm ci`はhigh severity vulnerabilityを1件報告した。今回の機能試験は成功しているが、依存経路と修正版の互換性確認が必要である。

### 結果

- ISSUE-20260804-001とISSUE-20260804-002を`Verified`へ変更した。
- Excelインポート確定のサーバーエラー、重複フォルダ操作UI、右クリック・削除ダイアログの前後関係を修正した。
- 修正は`agent/folder-explorer-p2`へpushし、PR #2はDraft・未マージのまま維持した。

## TASK-20260804-002: Excelテスト設計全体取込と保守整理

- 開始日時: 2026-08-04 03:50 JST
- 完了日時: 2026-08-04 04:07 JST
- 対応課題: ISSUE-20260804-003, ISSUE-20260804-004
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 状態: Completed

### 発生したこと

- Excel確定のサーバーエラーは解消したが、取り込んだデータがテスト設計のテスト一覧へ表示されなかった。
- 公式テンプレートが現在のテスト設計画面より古く、確認項目と手順しか表現できなかった。
- 前タスクで確認した未使用import、旧フォルダUI用CSS、補正専用CSSファイルが残っていた。

### 確定原因

- Excel確定処理は`test_cases`、`test_steps`、タグ、確認項目フォルダだけを登録し、`scenarios`と`scenario_cases`を作成していなかった。
- 現行画面が扱うテスト情報、テスト全体の前提条件、個別テストデータ、共通データを旧テンプレートが保持できなかった。
- Excel解析・テンプレート生成・HTTPルートが1ファイルへ密結合していた。
- フォルダUI更新後も参照されないCSSと、一時的に追加した補正CSSファイルが残っていた。

### 実施内容

- Excelの型、テンプレート生成、検証・解析を`web/src/server/excelImport.ts`へ分離した。
- テンプレートを`使い方`、`Scenarios`、`Cases`、`Steps`、`CommonData`の5シート構成へ変更した。
- テストキーと確認項目キーでシート間を関連付ける形式とした。
- テスト、確認項目、手順、テストと確認項目の関連、階層フォルダ、複数フォルダ所属、タグ、個別テストデータ、共通データを確定トランザクションで登録するよう変更した。
- 確定後に再読込し、テスト設計タブへ自動的に戻るようUIを変更した。
- 旧テンプレートは見えない確認項目を作成せず、「最新版を再ダウンロードしてください」と明示エラーにした。
- 最新テンプレートの生成・解析と旧テンプレート拒否の単体テスト2件を追加した。
- Excel E2Eを、HTTP 200だけでなくテスト一覧、テスト名、確認項目名、個別テストデータ、共通データの画面復元まで検証するよう強化した。
- 未使用の`objectBody` importと旧フォルダUI用CSSを削除した。
- `folder-explorer-fixes.css`を`test-design.css`へ統合し、補正専用ファイルとimportを削除した。

### 変更ファイル

- `web/src/server/excelImport.ts`
- `web/src/server/excelImport.test.ts`
- `web/src/server/routes/excel.ts`
- `web/src/client/Workspace.tsx`
- `web/src/client/test-design.css`
- `web/src/client/main.tsx`
- `web/e2e/excel-import.spec.ts`
- `docs/ISSUE_LEDGER.md`
- `docs/OPEN_ISSUES.md`
- `docs/TASK_LOG.md`

### 独立検証結果

GitHub Actions run `30844134585`:

- TypeCheck: 成功
- Unit/API: 37件成功、2件skip
  - 最新テンプレートの生成・解析
  - 旧テンプレートの明示拒否
- MariaDB統合: 2件成功
- Build: 成功
  - client CSS: 31.00 kB（整理前32.39 kB）
- Web起動・readiness: 成功
- Chromium E2E: 14件成功
  - 最新テンプレートのダウンロード
  - プレビューで1テスト・1確認項目を確認
  - Excel確定HTTP 200
  - テスト一覧への表示
  - テスト名・確認項目名・個別テストデータ・共通データの復元
- DBダンプ、監査ログ、テーブル件数、Playwright成果物: 保存成功
- Artifact: `web-ci-30844134585-1`（ID `8868021343`、SHA256 `a476286d2d7a1f62aaeee4f1a5c7d0be68b41997057c3cb0`）

### 結果

- ISSUE-20260804-003とISSUE-20260804-004を`Verified`へ変更した。
- Excelから現在のテスト設計画面が扱う主要データを復元できるようになった。
- 旧テンプレートで不完全なデータを登録する経路を閉じた。
- 安全に削除可能と確認した未使用コード・CSSを整理し、Excel処理の責務を分離した。
- PR #2はDraft・未マージのまま維持した。

## TASK-20260804-003: 完了済み実行の証跡表示と依存脆弱性

- 開始日時: 2026-08-04 04:25 JST
- 完了日時: 2026-08-04 05:04 JST
- 対応課題: ISSUE-20260804-005, ISSUE-20260804-006
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 状態: Completed

### 発生したこと

- 完了済み実行を表示すると、証跡欄に「実行ケースがプロジェクトに存在しません。」と表示される場合があった。
- `npm ci`がhigh severity vulnerabilityを1件報告していた。

### 確定原因

- 実行を切り替えた直後、証跡パネルの`selectedCaseId`が前の実行ケースIDを保持したまま、新しい`runId`と組み合わせて証跡APIを呼び出していた。
- 証跡再取得の古い非同期応答を破棄する仕組みがなく、後から不正なエラー表示で上書きされる可能性があった。
- `brace-expansion` 5.0.8がCVE-2026-69152の影響範囲に含まれ、サービス拒否につながる高重大度脆弱性として検出された。

### 実施内容

- 現在の`runCases`に含まれるIDだけを有効とする`activeCaseId`を導入した。
- 実行切替時に選択中ケースを現在の実行へ同期した。
- 証跡取得へsequence guardを追加し、古い非同期応答を破棄するようにした。
- 読込エラーと登録・削除などの操作メッセージを別stateへ分離した。
- GET、ファイルアップロード、クリップボードアップロード、選択欄、ボタン活性条件を`activeCaseId`へ統一した。
- 完了済み実行を2件作成して交互に切り替え、証跡APIの4xx/5xxとエラー表示が発生しないことを確認するChromium E2Eを追加した。
- `brace-expansion`を5.0.9、`minimatch`を10.2.6へ固定し、lockfileを更新した。
- CIへ`npm audit --audit-level=high`を必須工程として追加した。

### 変更ファイル

- `web/src/client/OperationsWorkspaceV2.tsx`
- `web/e2e/completed-run-evidence.spec.ts`
- `web/package.json`
- `web/package-lock.json`
- `.github/workflows/web-ci.yaml`
- `docs/ISSUE_LEDGER.md`
- `docs/OPEN_ISSUES.md`
- `docs/TASK_LOG.md`

### 独立検証結果

GitHub Actions run `30848395288`:

- `npm ci`: 脆弱性0件
- `npm audit --audit-level=high`: 脆弱性0件
- TypeCheck: 成功
- Unit/API: 37件成功、2件skip
- MariaDB統合: 2件成功
- Build: 成功
- Web起動・readiness: 成功
- Chromium E2E: 15件成功
  - 完了済み実行を切り替えても以前の実行ケースで証跡を取得しないことを確認
- DBダンプ、監査ログ、テーブル件数、Playwright成果物: 保存成功
- Artifact: `web-ci-30848395288-1`（ID `8869654688`、SHA256 `d97fd493eb913b7d71a0c864698cb4c39afbabe23f9160102ea6cb48739a9638`）

### 結果

- 完了済み実行の閲覧時に、別実行のケースIDを使った証跡API要求が発生しなくなった。
- 依存関係のhigh severity vulnerabilityを解消し、将来の再発時はCIが失敗するようになった。
- ISSUE-20260804-005とISSUE-20260804-006を`Verified`へ変更した。
- PR #2はDraft・未マージのまま維持した。

## TASK-20260804-004: Docker MariaDBパスワード設定

- 開始日時: 2026-08-04 06:04 JST
- 完了日時: 2026-08-04 06:15 JST
- 対応課題: ISSUE-20260804-007
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 担当: ChatGPT
- 状態: Completed

### 作業前の状態

- 発生していた現象: DockerでMariaDBを再起動した際、アプリ側が空のDBパスワードで接続する構成となり、アプリを起動できなかった。
- 再現手順: 作成済みMariaDBボリュームを残したままコンテナを再起動し、DB接続設定を確認する。
- 期待動作: MariaDBのrootユーザーとアプリ用ユーザーに非空パスワードが設定され、アプリも同じパスワードを使用する。
- 実際の動作: ローカルDocker用の統一Compose設定がなく、`DB_PASSWORD`未設定時はアプリが空文字を使用できた。
- 関連ログ: MariaDB 11.4.12が3306番ポートでreadyになったログ。ログ自体は認証方式を示さないが、接続設定の不一致を調査する契機となった。

### 調査内容

- 確認したファイル: `web/src/server/config.ts`、`web/src/server/server.ts`、`web/Dockerfile`、`.github/workflows/web-ci.yaml`、`web/README.md`。
- 確認したDB: GitHub ActionsのMariaDB 11.4サービス。
- 確定原因:
  - ローカル起動用にMariaDBとWebアプリへ同一資格情報を渡すCompose設定がなかった。
  - アプリ設定が`DB_PASSWORD`未設定時に空文字を既定値としていた。
  - MariaDB公式イメージの初期化環境変数は、既に初期化済みのデータボリュームへ再適用されない。

### 実施内容

- 変更ファイル:
  - `compose.yaml`
  - `.env.example`
  - `.gitignore`
  - `web/README.md`
  - `web/package.json`
  - `web/scripts/configure-local-mariadb-password.mjs`
  - `web/src/server/config.ts`
  - `web/src/server/config.test.ts`
  - `web/src/server/server.ts`
  - `.github/workflows/web-ci.yaml`
  - `docs/ISSUE_LEDGER.md`
  - `docs/OPEN_ISSUES.md`
  - `docs/TASK_LOG.md`
- DB変更: スキーマ変更なし。既存ボリュームに対してrootとアプリ用ユーザーの認証情報を更新する運用コマンドを追加した。
- Migration: なし。
- API変更: なし。
- UI変更: なし。
- テスト追加: `DB_PASSWORD`未設定・空白拒否と設定値保持の単体テスト3件を追加した。
- ドキュメント更新: 新規起動、既存ボリューム修復、破壊的な`down -v`の注意事項を記載した。

### 作業中に発生したこと

- GitHub ActionsのCompose検証では、`MARIADB_ROOT_PASSWORD`と既存CI用`DB_ROOT_PASSWORD`の環境変数名が異なり、Compose側だけローカル既定値を使用していた。
- CIへ`MARIADB_ROOT_PASSWORD`を明示し、既存ボリューム修復スクリプトの`node --check`を追加して再検証した。
- 既存ボリューム修復処理は、希望するrootパスワードまたは空パスワードで接続できる場合を対象とする。別の未知のrootパスワードが設定済みの場合は明示エラーで停止する。

### 検証

GitHub Actions run `30853941396`:

- Docker Compose構文・展開: 成功
- 既存ボリューム修復スクリプト構文: 成功
- `npm ci`: 脆弱性0件
- `npm audit --audit-level=high`: 脆弱性0件
- TypeCheck: 成功
- Unit Test: 40件成功、2件skip
- Integration Test: MariaDB 2件成功
- Build: 成功
- E2E: Chromium 15件成功
- Web起動・readiness: 成功
- DB確認: パスワード付きCIユーザーでMigration、API、DBダンプ、監査ログ取得に成功
- セキュリティ確認: DBポートとWebポートをlocalhostへ限定し、空の`DB_PASSWORD`を起動前に拒否することを確認
- 手動確認: 利用者の既存ローカルボリューム上での修復コマンド実行は未実施

### 結果

- 新規Docker環境はMariaDBとWebアプリで同じ非空パスワードを使用する。
- アプリは`DB_PASSWORD`が未設定または空の場合に起動を拒否する。
- 作成済み無パスワードボリュームは、データを削除せず`npm run db:password`で修復できる手順を追加した。
- 残るリスク: 利用者環境でrootに別の未知パスワードが既に設定されている場合、そのパスワードを指定する追加手順が必要。
- PR #2はDraft・未マージのまま維持した。

## TASK-20260805-001: 業務導線の小規模改善

- 開始日時: 2026-08-05 12:24 JST
- 対応課題: ISSUE-20260805-001
- 担当: ChatGPT
- 状態: Verified

### 作業前の状態

- テスト保存後、対象実行への直接復帰、次の未実行への移動、完了前の状態確認、不合格・ブロックだけの再実行作成が分断されていた。

### 実施内容

- 保存と実行作成を一操作へ統合した。
- ダッシュボードの「作業を再開」から対象runへ直接遷移するようにした。
- 保存後に次の未実行・実行中項目へ循環移動する処理と単体試験を追加した。
- 完了前チェックに状態別件数と該当項目への移動を追加した。
- 完了済み実行からfail・blockedの元確認項目だけを選択したdraftを作るAPIを追加した。前回結果と証跡はコピーしない。
- 回帰E2Eを追加し、既存E2E helperを更新した。

### DB・Migration

- Migration追加なし。既存スナップショットのsource IDとdraft選択JSONを利用する。

### 検証

- GitHub Actions run `30973198333`では既存E2E 15件と新規導線の実処理は成功したが、最後の未選択確認が部分一致で2要素に一致し、テストコードだけが失敗した。
- チェックボックスを名前の完全一致で取得するよう修正した。
- GitHub Actions run `30973373586`で依存監査0件、TypeCheck、Unit/API 42件（2件skip）、MariaDB統合2件、Build、Web起動、Chromium E2E 16件、DB・監査・Playwright成果物保存が成功した。
- Migration追加なし。既存データの変換なし。
- Artifact: `web-ci-30973373586-1`、ID `8917372044`、SHA256 `2eccc4b8ef3aea4ef9262bbf63d2efc36637ded72d5fa01271d56b57d09e12eb`。

## TASK-20260805-002: OpenShift用コンテナ・運用基盤

- 開始日時: 2026-08-05 13:29 JST
- 完了日時: 2026-08-05 14:00 JST
- 対応課題: ISSUE-20260805-002
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 担当: ChatGPT
- 状態: Verified

### 作業前の状態

- Web用DockerfileとOpenShiftマニフェストは存在したが、OpenShiftの任意UID、読み取り専用root filesystem、Route、内部ビルド、MariaDB永続化、Secret、NetworkPolicy、バックアップを一体で検証していなかった。
- OpenShift Router配下でクライアントIPを扱うproxy設定と、Pod終了時のgraceful shutdownがなかった。

### 実施内容

- Node.js 20.20.0のマルチステージDockerfileへ更新し、production依存だけを実行イメージへ配置した。
- root groupへ必要な読書き権限を付与し、OpenShiftの任意UIDで実行できるようにした。
- root filesystemを読み取り専用とし、`/tmp`と証跡PVCだけを書込先に限定した。
- BuildConfig、ImageStream、Web Deployment/Service/Route、MariaDB StatefulSet/Service、PVC、ConfigMap、NetworkPolicyを追加した。
- Secretをリポジトリへ保存せず作成するデプロイスクリプトと、Secret例を追加した。
- startup/readiness/liveness probe、resource request/limit、capability drop、seccomp、ServiceAccount token無効化を設定した。
- 証跡、MariaDB、バックアップの永続化と、日次バックアップ3世代保持・保持期限処理のCronJobを追加した。
- `TRUST_PROXY=true`をOpenShift環境へ設定し、FastifyがRouterの転送ヘッダーを扱えるようにした。
- SIGTERM/SIGINTでHTTP受付とDB接続を終了するgraceful shutdownを追加した。
- `web/OPENSHIFT.md`と`web/scripts/openshift/deploy.sh`へ構築・配備・ストレージ・外部DB・運用確認手順を記載した。

### DB・Migration

- アプリケーションのMigration追加なし。既存の起動時Migrationをコンテナ起動時に実行する。
- OpenShift上のMariaDBはRed Hat MariaDB 10.11イメージを使用する構成とした。
- Webは1 replica・Recreate戦略とし、複数Podによる同時Migrationを避ける。

### 検証

GitHub Actions run `30976592066`:

- Docker Compose展開: 成功
- OpenShift Kustomize生成: 成功
- OpenShiftデプロイスクリプト構文: 成功
- `npm ci` / `npm audit --audit-level=high`: 脆弱性0件
- TypeCheck: 成功
- Unit/API: 43件成功、2件skip
- MariaDB統合: 2件成功
- Build: 成功
- OpenShift互換コンテナ構築: 成功
- UID `1000780000:0`・read-only root filesystem・書込先限定でMigrationとreadiness: 成功
- Web起動: 成功
- Chromium E2E: 16件成功
- DBダンプ、監査ログ、Kustomize生成物、Playwright成果物: 保存成功
- Artifact: `web-ci-30976592066-1`（ID `8918512909`、SHA256 `c3f3b65303b13665af89cbb5edbe411bfa3798da9105da0343eccbcb94e30465`）

### 結果

- `anyuid`または`privileged` SCCを付与せずに動作できるコンテナとマニフェストになった。
- HTTPS Route、Secure Cookie、Router proxy、永続ストレージ、DB、バックアップまでOpenShift配備に必要な構成を追加した。
- 実OpenShiftクラスターへの適用は、クラスター接続情報・権限・StorageClassが提供されていないため未実施。CIではOpenShift想定制約でコンテナを実起動した。
- 実配備時は`registry.redhat.io`のpull権限、証跡・バックアップ用RWX StorageClass、MariaDB用RWO StorageClassを確認する。
- PR #2はDraft・未マージのまま維持した。

## TASK-20260805-003: プロジェクト削除とユーザー管理UI

- 開始日時: 2026-08-05 18:13 JST
- 完了日時: 2026-08-05 19:24 JST
- 対応課題: ISSUE-20260805-003
- 担当: ChatGPT
- 状態: Verified

### 実施内容

- アーカイブ済みプロジェクトだけを対象とする論理削除APIを追加した。
- 削除時は管理者権限、version、プロジェクト名完全一致、削除理由を必須とし、割当削除と監査ログ記録を行う。
- ユーザー作成フォームを常時表示からモーダルへ変更した。
- ユーザー一覧へ検索、状態別集計、権限・有効状態・ロック・初回変更待ち・担当プロジェクトを追加した。
- 編集、仮パスワード再設定、ロック解除を一覧からモーダルまたは直接操作できるようにした。

### DB・Migration

- Migration追加なし。既存の`projects.deleted_at`、`project_assignments`、監査ログを利用する。

### 検証

- 管理画面を開いた時点ではユーザー作成ダイアログが非表示であることを確認した。
- 作成ボタンからモーダルを開閉できることを確認した。
- アーカイブ済みプロジェクトが確認名・理由入力後に一覧から削除されることを確認した。

## TASK-20260805-004: フォルダとテスト設計の操作改善

- 開始日時: 2026-08-05 18:13 JST
- 完了日時: 2026-08-05 19:24 JST
- 対応課題: ISSUE-20260805-004
- 担当: ChatGPT
- 状態: Verified

### 実施内容

- 選択中またはパンくず上のフォルダを新規テストの初期所属先へ設定した。
- 親子フォルダを同時選択した移動では最上位選択だけを移動し、子フォルダや配下テストを二重移動しないようにした。
- フォルダ右クリックへ「選択項目をこのフォルダへ移動」を追加した。
- フォルダ操作説明文と確認項目詳細の複数フォルダ選択を削除した。
- 一覧の操作・期待結果欄に全手順を番号付きで表示し、詳細パネルで全手順を編集する構成へ変更した。
- 見る場所画像へ元画像を保持する派生編集を追加した。

### DB・Migration

- Migration追加なし。既存のフォルダ親子関係、scenario所属、画像テーブルを利用する。

### 検証

- 選択フォルダから新規作成したテストが同フォルダへ所属することを確認した。
- 2手順の操作・期待結果が一覧と詳細の双方で欠落せず表示されることを確認した。

## TASK-20260805-005: テスト実行のデータ・画像導線

- 開始日時: 2026-08-05 18:13 JST
- 完了日時: 2026-08-05 19:24 JST
- 対応課題: ISSUE-20260805-005
- 担当: ChatGPT
- 状態: Verified

### 実施内容

- 実行開始時、選択scenario・caseへリンクされたデータセットを明示選択なしでもスナップショットへ含めるようにした。
- 実行詳細APIへデータ項目を追加し、確認項目データと共通データを分けて表示した。
- 見る場所画像をライトボックスで拡大できるようにした。
- 実行用編集画像を新規保存し、元テスト定義の画像URLを変更せずrun caseだけを更新するAPIを追加した。
- 未実行・実行中が0件になった場合、「保存して次の未実行へ」を無効化した。

### DB・Migration

- Migration追加なし。既存のrun data snapshot、run case snapshot、画像テーブルを利用する。

### 検証

- 確認項目固有値と共通データを実行画面で確認した。
- 画像編集キャンバス、保存、拡大表示を確認した。
- 全項目保存後に次の未実行ボタンが無効になることを確認した。

## TASK-20260805-006: 選択式エクスポートと証跡Excel

- 開始日時: 2026-08-05 18:13 JST
- 完了日時: 2026-08-05 19:24 JST
- 対応課題: ISSUE-20260805-006
- 担当: ChatGPT
- 状態: Verified

### 実施内容

- エクスポート対象を「プロジェクト全体」「テスト設計」「テスト実行」から選択するUIへ変更した。
- テスト実行選択時は実行名と状態を選択し、Excelを生成するようにした。
- 実行Excelへ`実行概要`、`実行結果`、`テストデータ`、`証跡`シートを追加した。
- 証跡は最新versionのメタデータを出力し、画像証跡はExcelへ埋め込むようにした。
- Sharp変換に失敗したPNG/JPEGは原本を埋め込むフォールバックを追加した。

### DB・Migration

- Migration追加なし。実行・データ・証跡の既存スナップショットを読み取り専用で出力する。

### 統合検証

GitHub Actions run `30997068195`:

- Docker Compose / OpenShift Kustomize: 成功
- `npm ci` / `npm audit --audit-level=high`: 脆弱性0件
- TypeCheck: 成功
- Unit/API: 43件成功、2件skip
- MariaDB統合: 2件成功
- Build: 成功
- OpenShift互換コンテナ構築: 成功
- UID `1000780000:0`・read-only root filesystemで起動: 成功
- Web起動・readiness: 成功
- Chromium E2E: 19件成功
- 追加E2E: 管理モーダル・プロジェクト削除、選択フォルダ・複数手順、実行データ・画像編集・証跡Excel
- DBダンプ、監査ログ、Kustomize生成物、Playwright成果物: 保存成功
- Artifact: `web-ci-30997068195-1`（ID `8926675705`、SHA256 `fdf5cd1f25461ceadbcc4f4e492d001a942f8abbd6fe9be387f6fd3a568bcf73`）

### 結果

- 依頼された管理、テスト設計、実行、エクスポートの各導線を実装し、実MariaDB・実Chromiumで一連確認した。
- PR #2はDraft・未マージのまま維持した。

## TASK-20260806-001: Review 10全体修正

- 開始日時: 2026-08-06 02:01 JST
- 完了日時: 2026-08-06 10:26 JST
- 対応課題: ISSUE-20260806-001〜004
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 担当: ChatGPT
- 状態: Completed

### 発生事象

- 別チャットで追加されたプロジェクト削除処理が、DELETE 404を成功扱いし、ブラウザ内だけでカードを非表示にしていた。
- 全体レビューで削除、監査、ファイル、保持、バックアップ、実行状態、認証、import、Migration、UI試験を横断する50項目を抽出した。
- 広範囲パッチの初回反映では新規6ファイルが欠落し、その後もMariaDB Migration、request transaction、バックアップ復元、保持SQL、証跡XHRのCSRFヘッダーで段階的にCI失敗が判明した。

### 実施内容

- ユーザー判定に従いREV-031〜033を仕様として維持し、それ以外を指定された仕様変更込みで修正した。
- プロジェクト削除を復元なしの完全削除に変更し、監査保持、任意理由、DB/API一意名称、再読込・API・DBを確認する回帰試験へ置換した。
- 変更要求単位のDB transaction、同一transaction監査、rollback時ファイル補償、再試行可能なfile cleanup queueを追加した。
- request単位のAsyncLocalStorage contextを導入し、並行更新でもtransaction接続を正しく解放するようにした。
- バックアップ・復元・保持処理、管理者運用画面、completed結果制約、最後の管理者保護、import競合、Migration checksum/lock、JSON破損検知、snapshot一括処理を修正した。
- DB Migration専用CLIを追加し、3世代作成、正常2世代保持、checksum、DB・証跡同世代復元、復元前バックアップ、保持期限SQLをCIで検証した。
- 証跡アップロード用XHRへ`X-The-Test-Request: 1`を付与し、画面説明を1要求1ファイル・最大100 MiBへ統一した。
- 確定仕様v1.2.0、Issue Ledger、Open Issues、運用文書、OpenShift定義、独立CI工程を更新した。

### 独立検証結果

GitHub Actions run `31062560323`:

- Docker Compose展開: 成功
- OpenShift Kustomize生成: 成功
- `npm ci` / `npm audit --audit-level=high`: 脆弱性0件
- TypeCheck: 成功
- Unit/API: 49件成功、2件skip
- MariaDB 11.4統合: 2件成功
  - 異なる既定照合順序でのMigration
  - 同名プロジェクト並行作成の409拒否
  - 監査失敗時の業務更新rollback
  - 最後の有効管理者保護
  - completedの最終4状態制約
  - プロジェクト完全削除
- Migration CLI: 成功
- バックアップ・復元・保持: 成功
  - 3世代作成後に正常2世代保持
  - DB、証跡、manifestのchecksum確認
  - DBと証跡の同一世代復元
  - 復元前世代を含む2世代カタログ正規化
  - 保持期限SQLとファイル回収キュー
- Production Build: 成功
- OpenShift互換コンテナBuild: 成功
- UID `1000780000:0`・read-only root filesystemでreadiness成功
- Chromium E2E: 19件成功
  - 完全削除、completed後編集、証跡アップロード、画像・Excel、409復旧を含む
- DBダンプ、監査ログ、テーブル件数、Playwrightレポート: 保存成功
- Artifact: `web-ci-31062560323-1`（ID `8952679751`、SHA256 `22eac1a3e49e2fd858b995b8cc9a44397bcdca1a9ed27ca16041436fa5f939d4`）

### 結果

- ISSUE-20260806-001〜004を`Verified`へ変更した。
- Review 10の仕様判定と修正対象を実装し、実MariaDB、実Chromium、OpenShift相当の任意UIDコンテナで回帰確認した。
- PR #2はDraft・未マージのまま維持した。

## TASK-20260806-002: リポジトリ構成整理

- 開始日時: 2026-08-06 11:41 JST
- 対応課題: ISSUE-20260806-005
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 担当: ChatGPT
- 完了日時: 2026-08-06 12:18 JST
- 状態: Completed

### 作業前の状態

- 旧レビュー依頼、画面試作、スクリーンショット、ローカル証跡がソースと同居していた。
- 未参照の`DefinitionAdminPanel.tsx`、同一内容のOpenAPI、未使用の保持SQLが残っていた。
- 現行UIと移行CLIの主要ファイル名に`V2`や作業名が残り、正本が分かりにくかった。
- Electron版とWeb版の双方が現行CI対象だが、ルートに説明がなく重複実装に見えた。

### 実施内容

- 生成済み証跡、旧レビュー資料、試作資料、スクリーンショット、AI作業メモを削除した。
- 仕様書とセキュリティ資料を`docs/`へ集約し、参照先を更新した。
- 未参照コンポーネント、重複OpenAPI、旧保持SQLを削除した。
- 実行ワークスペース、エクスポートパネル、SQLite移行CLIのファイル名を現在の責務名へ変更した。
- `web/openapi.yaml`をAPI契約の唯一の正本とした。
- `.gitignore`へWebの実行データと検証成果物を追加した。
- ルート`README.md`へ現行の2アプリ構成と責務境界を記載した。
- Electron版は`build-win.yaml`で現行ビルド対象のため削除しなかった。

### 検証

- 静的参照検査: 成功（未参照実装、重複契約、旧参照の残存なし）
- TypeCheck: GitHub Actions run `31067948455`で成功
- Unit Test: GitHub Actions run `31067948455`で成功
- Integration Test: GitHub Actions run `31067948455`でMariaDB統合成功
- Build: GitHub Actions run `31067948455`でProduction BuildとOpenShift互換コンテナBuildが成功
- E2E: GitHub Actions run `31067948455`でChromium E2E成功
- DB確認: DB変更なし

### 結果

- GitHub Actions run `31067948455`で通常Web CI全工程が成功した。
- Artifact: `web-ci-31067948455-1`（ID `8954562403`）。
- ISSUE-20260806-005を`Verified`へ変更した。
- PR #2はDraft・未マージのまま維持した。
