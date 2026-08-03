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
- Artifact: `web-ci-30844134585-1`（ID `8868021343`、SHA256 `a476286d2d7a1f62aaeee4f1a5c7d0be68fd7e3439b7d25a68b41997057c3cb0`）

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
