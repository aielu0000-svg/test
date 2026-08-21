# Task Log

> 2026-08-07にログを継続ファイル化した。2026-08-06以前の既存記録は `TASK_LOG_ARCHIVE_20260806.md` に内容を変更せず保存している。本ファイルへ以後の作業を追記する。

## TASK-20260807-001: テスト複製・実行画像・証跡・Excel導線の認知負荷低減

- 開始日時: 2026-08-07 18:36 JST
- 完了日時: 2026-08-07 19:20 JST
- 対応課題: ISSUE-20260807-001, ISSUE-20260807-002, ISSUE-20260807-003
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- 発生していた現象:
  - テスト／確認項目を複製しても「見る場所」画像が独立して複製されなかった。
  - テスト実行の画像ライトボックスは拡大表示だけで、Ctrl+スクロールによる追加ズームができなかった。
  - 証跡欄に100 MiB制約などの長い技術説明が常時表示されていた。
  - disabledボタンが`cursor: wait`となり、待機中のようなカーソル表示になった。活性・非活性の視覚差も小さかった。
  - 「保存して次の未実行へ」は未実行0件でもdisabled表示された。
  - テスト設計の主要操作が同系統の色で、保存・実行・追加・複製・モード切替・Excel取込の役割を判別しにくかった。
  - 公式Excelテンプレートは複数シート間でScenarioKey／CaseKeyを人が合わせる必要があり、通常画面には説明不足の正式JSONインポートが露出していた。
- 再現手順:
  - 画像付き確認項目／テストを複製し、複製先の画像状態を確認する。
  - 実行画面で見る場所画像を開きCtrl+ホイールする。
  - 証跡欄、未実行0件時の実行操作、テスト設計ツールバー、Excel追加画面を確認する。
- 期待動作:
  - 複製先は画像も独立コピーされる。画像はさらにズームできる。説明は必要時に展開できる。無効操作は明確で、不要になった次未実行ボタンは消える。設計操作とExcel導線を短時間で理解できる。
- 実際の動作:
  - 上記の各UI／複製動作が期待と一致していなかった。
- 関連エラーID: なし
- 関連ログ: なし

### 調査内容

- 確認したファイル:
  - `docs/codemap/codemap.lock`, `docs/codemap/codemap.json`
  - `web/src/client/TestDesignEditor.tsx`, `FolderExplorer.tsx`, `RunWorkspace.tsx`, `ViewImageEditor.tsx`, `EvidenceImageEditor.tsx`, `Workspace.tsx`, `ExportPanel.tsx`
  - `web/src/client/styles.css`, `test-design.css`, `workspace.css`, `operations.css`
  - `web/src/server/excelImport.ts`, `web/src/server/routes/excel.ts`, `definitions.ts`, `scenarioEditor.ts`
  - 関連Unit/E2E
- 確認したDB: DBスキーマ変更なし。既存のtest_case_images、scenario/case/data保存経路を利用することを確認。
- 実行した確認:
  - codemap.lock基準commit `bd94514ac30ddcea3689a03064bfbcb2ea7edbf1` と作業開始head `37da602ccf1e16b217f89f03349a71141dc0ffc6` を比較し、差分がcodemap生成物3ファイルのみで製品モジュールが未変更であることを確認。
  - コードマップから変更対象の呼び出し元、影響先、テストを確認。
- 仮説:
  - 複製は浅いscenario_cases関連付け、ライトボックスはズーム状態なし、disabled待機表示は共通CSS、Excel負荷は内部キーを人へ露出していることが主因。
- 仮説の検証結果: 実ソースで確認して成立。
- 確定原因: 上記の設計・UI要因。

### 実施内容

- 変更ファイル:
  - `web/src/client/TestDesignEditor.tsx`
  - `web/src/client/test-design.css`
  - `web/src/client/RunWorkspace.tsx`
  - `web/src/client/operations.css`
  - `web/src/client/styles.css`
  - `web/src/client/Workspace.tsx`
  - `web/src/client/workspace.css`
  - `web/src/client/ExportPanel.tsx`
  - `web/src/server/excelImport.ts`
  - `web/src/server/excelImport.test.ts`
  - `web/e2e/helpers.ts`
  - `web/e2e/excel-import.spec.ts`
  - `web/e2e/requested-improvements.spec.ts`
  - `web/e2e/design-duplicate-images.spec.ts`
- DB変更: なし
- Migration: なし
- API変更: 新規route／契約追加なし。既存scenario-editorとtest-case-images APIを組み合わせて深い複製を実現。旧`/api/scenarios/:id/duplicate`はAPI互換のため残し、通常UIからは使用しない。
- UI変更:
  - テスト／確認項目複製時に画像を再アップロードして独立URL化。
  - 実行画像ライトボックスに50〜500%ズーム、Ctrl+ホイール、±、100%リセット、スクロール領域を追加。
  - 証跡説明を短縮し、アップロード条件・説明文・ファイル情報を`details`で必要時のみ表示。
  - disabledボタンを中立色＋`not-allowed`へ変更し、待機カーソルを廃止。
  - 未実行0件では「保存して次の未実行へ」を非表示。
  - テスト設計の操作を保存／実行／追加／複製／モード／Excelで色・明度・ラベル・記号を併用して区別。
  - Excel追加／エクスポートを「追加する」「出力する」の2導線へ整理し、通常UIから正式JSONインポートを除外。
- Excel:
  - 公式テンプレートを`使い方`、`入力`、`共通データ`の3シートへ変更。
  - 主入力はテスト名・確認項目名・操作・期待結果の4列を中心とし、1行1手順と空欄継続から内部キーを自動生成。
  - 優先度に入力規則、先頭行・先頭列の固定、補足コメントを設定。
  - 旧キー付き現行形式は互換読込を維持。
- テスト追加:
  - 新Excelテンプレートの構造・キー自動生成・互換読込。
  - 確認項目複製の画像独立コピー。
  - テスト複製の画像独立コピー。
  - 実行ライトボックスのCtrl+スクロールズーム。
  - 未実行0件時の次未実行ボタン非表示。
  - 証跡の折りたたみ説明。
  - 正式JSONインポートが通常UIにないこと。
- ドキュメント更新: ISSUE_LEDGER、TASK_LOG、OPEN_ISSUES。コードマップはモジュール境界・依存関係・route・DB・queue・主要データフローを変更していないため再生成対象外。

### 作業中に発生したこと

- 新たに発生したエラー:
  - 最初のCI run `31169007532`でTypeCheckが失敗した。
  - `web/src/server/excelImport.test.ts`の`workbook.xlsx.load(await buildCasesTemplate())`で、ExcelJS側の`Buffer<ArrayBuffer>`とNodeの`Buffer<ArrayBufferLike>`の型差によりTS2345が発生した。
- 想定外の影響: 製品コードの失敗ではなくテストコードの型互換だったため、後続工程は初回runでは未実施。
- 追加で判明した課題: なし
- 回避策:
  - 生成Bufferを一時`.xlsx`へ書き、`workbook.xlsx.readFile()`で読み込む方式へ変更した。
  - 修正commit `e96325cb93fa0cbacbd3709588fc8f32c459b333`で再CIした。

### 検証

GitHub Actions run `31169231328`（head `e96325cb93fa0cbacbd3709588fc8f32c459b333`）:

- Docker Compose validation: 成功
- OpenShift Kustomize validation: 成功
- npm audit --audit-level=high: 成功、脆弱性0件
- TypeCheck: 成功
- Unit/API Test: 52件成功、2件skip
- MariaDB Integration Test: 2件成功
- Migration CLI / schema validation: 成功
- Backup / restore / retention: 成功
- Production Build: 成功
- OpenShift-compatible container build: 成功
- arbitrary UID / read-only root filesystem readiness: 成功
- Chromium E2E: 21件成功
- DB・監査・Playwright成果物保存: 成功
- Artifact: `web-ci-31169231328-1`（ID `9007154348`、SHA256 `f3f392f083c939bd1356398085459549832afb6901da00427978e1db74e5b028`）
- 手動確認: 独立ブラウザE2Eで対象導線を確認
- DB確認: MariaDB統合とCI DB export成功
- セキュリティ確認: npm audit 0件、既存CSRF/画像実体検証経路を変更せず使用

### 結果

- 解消した内容: 対応課題3件を実装し、最新製品headの独立CIで全工程成功。
- 解消していない内容: なし（既存のAdditional hardening candidatesは別管理）。
- 残るリスク:
  - Ctrl+ホイールは50〜500%へ制限している。
  - 正式JSONインポートAPI自体は互換性のため残るが、通常利用者向けUIからは除外した。
  - 旧キー付きExcel形式は既存ファイル互換のため解析を維持している。
- 次のタスク: 利用者による画面確認。必要に応じて文言・余白など視覚調整を行う。

## TASK-20260821-001: Excel公式テンプレートの枠線・記入例追加と回帰確認

- 開始日時: 2026-08-21 12:52 JST
- 完了日時: 2026-08-21 13:07 JST
- 対応課題: ISSUE-20260821-001
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- 発生していた現象: 公式Excelテンプレートの入力領域に枠線がなく、各列の具体的な記入例を一覧で確認しにくかった。
- 再現手順: Excelテンプレートをダウンロードし、`入力`・`共通データ`シートの入力領域と各項目の記入方法を確認する。
- 期待動作: 入力領域が枠線で視認でき、全項目の具体的な記入例を確認できる。
- 実際の動作: 改善前は枠線がなく、記入例も十分ではなかった。
- 関連エラーID: GitHub Actions run `32444607705`, `32445345845`
- 関連ログ: 最初はpackage manifest/lock不一致、その解消後はExcelJSとNode Buffer型境界のTS2345でTypeCheckが停止した。

### 調査内容

- 確認したファイル: `AGENTS.md`, `docs/codex-development-operation-rules.md`, `docs/codemap/codemap.lock`, `docs/codemap/codemap.json`, `web/src/server/excelTemplatePresentation.ts`, `web/src/server/excelTemplatePresentation.test.ts`, `web/src/server/routes/excel.ts`, `web/package.json`, `web/package-lock.json`, 課題管理ドキュメント。
- 確認したDB: DB変更なし。
- コードマップ確認:
  - 呼び出し元: `web/src/server/routes/excel.ts` が `buildCasesTemplate()` 後に `decorateCasesTemplate()` を呼ぶ。
  - 影響先: 公式Excelテンプレートのダウンロード時の見た目（枠線・記入例）だけで、Excel解析・DB保存には影響しない。
  - テスト: `web/src/server/excelTemplatePresentation.test.ts`, `web/src/server/excelImport.test.ts`, `web/e2e/excel-import.spec.ts`。
- 仮説と検証:
  - `nanoid` override追加後のlockfile未同期はrun `32444607705`の`npm ci`ログで確定。
  - lock同期後のrun `32445345845`で`excelTemplatePresentation.ts`のBuffer型キャストがExcelJSの実際の引数型と一致していないことをTypeCheckで確定。

### 実施内容

- Excelテンプレート本体（commit `f26879027ad8c02ffbb49b9669fa2705dfb6874f`）:
  - `入力`シートA1:N201へthin枠線を追加。
  - `共通データ`シートA1:F201へthin枠線を追加。
  - 入力14項目・共通データ6項目の全20項目へ記入例を追加。
  - 記入例は`使い方`シート一覧と各ヘッダー注記へ配置し、インポート対象のサンプル行は追加しない。
- 依存同期:
  - `nanoid` 3.3.18 overrideに合わせ`web/package-lock.json`を正規生成して同期（commit `ea7a08748c309f54b9af021c19370b269907763f`）。
  - 同期用一時workflowは自己削除し、恒久ファイルを残していない。
- TypeScript修正:
  - `decorateCasesTemplate()`でExcelJS `load` の実際の引数型を`Parameters<typeof workbook.xlsx.load>[0]`から取得し、Node Bufferとの境界を明示した（commit `9b624888f5156361eb896762ca231e7b158e6c2f`）。
- DB変更: なし
- Migration: なし
- API route変更: なし
- モジュール境界・主要データフロー変更: なし。コードマップ再生成不要。

### 作業中に発生したこと

- run `32444607705`: `npm ci`が`nanoid@3.3.16 does not satisfy nanoid@3.3.18`で停止。
- run `32445345845`: lock同期後、`excelTemplatePresentation.ts`でExcelJS/Node Buffer型のTS2345によりTypeCheck停止。
- 対処後run `32445558693`で全工程成功。

### 検証

GitHub Actions run `32445558693`（製品head `9b624888f5156361eb896762ca231e7b158e6c2f`）:

- Docker Compose validation: 成功
- OpenShift Kustomize validation: 成功
- npm ci: 396 packages追加、397 packages監査、脆弱性0件
- npm audit --audit-level=high: 成功、脆弱性0件
- TypeCheck: 成功
- Unit/API Test: 53件成功、2件skip（19 test files成功、2 files skip）
- Excelテンプレート表示Unit: 2件成功（枠線、全項目の記入例）
- Excel import Unit: 3件成功
- MariaDB Integration Test: 2件成功
- Migration CLI / schema validation: 成功
- Backup / restore / retention: 成功、2世代保持確認
- Production Build: 成功
- OpenShift-compatible container build: 成功
- arbitrary UID / read-only root filesystem readiness: 成功
- Chromium E2E: 21件成功（`excel-import.spec.ts`を含む）
- DB・監査・Playwright成果物保存: 成功
- Artifact: `web-ci-32445558693-1`（ID `9433980395`、SHA256 `cc63d38f0d3c8a08a0d5913652aa71d5f994a90e4ddaca298085d568ebbd4701`、450676 bytes）
- 手動確認: 未実施。ExcelJSで生成物を再読込するUnitが枠線と全項目注記を直接検証し、Chromium E2Eが公式テンプレートのダウンロード・入力・取込を検証した。
- DB確認: MariaDB統合・DB export成功。今回DB変更なし。
- セキュリティ確認: npm audit 0件。

### 結果

- 解消した内容: Excel公式テンプレートの視認性向上（枠線）と全20項目の記入例追加を実装し、依存lock同期とExcelJS Buffer型境界も修正した。
- 解消していない内容: なし。
- 残るリスク: Excelの表示はExcelクライアント差により細部が異なる可能性があるが、生成ファイル上のborder/note値はUnitで検証済み。
- 次のタスク: 利用者による実ファイルの見た目確認。必要なら列幅・行高・色などを追加調整する。

## TASK-20260821-002: Excel簡略テンプレートの実セル記入例化と回帰確認

- 開始日時: 2026-08-21 13:43 JST
- 完了日時: 2026-08-21 14:02 JST
- 対応課題: ISSUE-20260821-002
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- 利用者確認では、以前の「大幅簡略化」が消えたように見え、記入例も実際の入力欄に入っていなかった。
- 実ソース確認では、公式テンプレートは引き続き`使い方`・`入力`・`共通データ`の3シート構成で、`入力`A1:N201と`共通データ`A1:F201のthin枠線も残っていた。
- 差異は記入例の置き場所で、前回は`使い方`シートとヘッダー注記に置き、データ行にはサンプルを入れない実装だった。

### 調査内容

- 作業開始head `dee33eb005474e1644a6f211855fb93cc05ac3c8` と`docs/codemap/codemap.lock`を比較した結果、`web/src/server`と依存manifest側に後続修正があり、コードマップ基準が現行headを完全には表していなかったため、製品変更前に`codemap.html`・`codemap.json`・`codemap.lock`を再生成した。
- コードマップから変更対象を確認:
  - 呼び出し元: `web/src/server/routes/excel.ts` が`buildCasesTemplate()`後に`decorateCasesTemplate()`を呼ぶ。
  - 影響先: ダウンロードする公式Excelテンプレートの表示・初期セル値。preview/confirm parserとDB保存処理は変更しない。
  - テスト: `web/src/server/excelTemplatePresentation.test.ts`, `web/src/server/excelImport.test.ts`, `web/e2e/excel-import.spec.ts`。
- `web/src/server/excelImport.ts`で、3シート簡略化、14列の利用者向け入力列、内部キー自動生成、旧キー付き形式の互換読込が維持されていることを確認した。

### 実施内容

- `web/src/server/excelTemplatePresentation.ts`:
  - 3シート簡略構成と既存の枠線範囲を維持。
  - `入力`2行目へ14項目すべての具体的な記入例を実セルとして配置。
  - `入力`3行目へ2手順目の継続行例を配置し、テスト名・確認項目名は真の空セルとして空欄継続を例示。
  - `共通データ`2行目へ6項目すべての記入例を実セルとして配置。
  - 記入例行を淡色で識別できるようにした。
  - `使い方`シートに「例を上書きするか削除してからアップロードする」案内を追加。
- `web/src/server/excelTemplatePresentation.test.ts`:
  - シートが正確に`使い方`・`入力`・`共通データ`の3枚であることを固定化。
  - `テストキー`・`確認項目キー`列がないこと、枠線、実セル例、継続行の真の空セルを検証。
- `web/e2e/excel-import.spec.ts`:
  - APIから取得した公式テンプレートを最初に読み、3シート簡略構成、技術キー列なし、実セル記入例を確認してからサンプル値を上書きし、preview/confirm/importまで実行するよう強化。
- DB、Migration、route契約、parserの意味論は変更していない。
- 製品ソース変更後にコードマップを再生成し、最終製品基準を`42e3a95a5a3e8c1940dda453742a16ece2e7499f`へ更新した。

### 作業中に発生したこと

- 初回実装では継続行のテスト名・確認項目名を空文字列`""`で設定した。
- GitHub Actions run `32448609709`のUnitで、ExcelJS再読込後のセル値が真の空セル`null`ではなく空文字列`""`になることを検出した。
- 実際の空欄継続例として曖昧さを残さないため、該当セルを`null`へ変更し、commit `42e3a95a5a3e8c1940dda453742a16ece2e7499f`で修正した。

### 検証

GitHub Actions run `32448865787`（head `b7a170d51167e55b394c2f1994864894d874eedd`）:

- Docker Compose validation: 成功
- OpenShift Kustomize validation: 成功
- npm ci: 396 packages追加、397 packages監査
- npm audit --audit-level=high: 成功、脆弱性0件
- TypeCheck: 成功
- Unit/API Test: 53件成功、2件skip（19 test files成功、2 files skip）
- Excel import Unit: 3件成功
- Excelテンプレート表示Unit: 2件成功
- MariaDB Integration Test: 2件成功
- Migration CLI / schema validation: 成功
- Backup / restore / retention: 成功
- Production Build: 成功
- OpenShift-compatible container build: 成功
- arbitrary UID / read-only root filesystem readiness: 成功
- Chromium E2E: 21件成功（`excel-import.spec.ts`を含む）
- DB・監査・Playwright成果物保存: 成功
- Artifact: `web-ci-32448865787-1`（ID `9435028667`、SHA256 `6c0d1033ac4d8f94f285b1b5d96d9ff9cc2baa1904f04e1d6124465f6d2a73cd`、449361 bytes）

### 結果

- 簡略化修正は消えておらず、3シート・利用者向け14列・内部キー非表示のまま維持した。
- 枠線修正も維持した。
- 記入例は説明文ではなく実際の入力セルへ移動した。
- UnitとブラウザE2Eで「簡略化・枠線・実セル記入例」を明示的な回帰条件として固定した。
- 未解決の製品不具合: なし。

## TASK-20260821-003: Excel公式テンプレートの最小列化

- 開始日時: 2026-08-21 15:30 JST
- 完了日時: 2026-08-21 15:42 JST
- 対応課題: ISSUE-20260821-003
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- 利用者が求める「大幅簡略化」は、公式`入力`シートを通常利用に必要な4列だけへ絞り、`共通データ`も最小列だけへ絞る意味だった。
- 作業前は3シート化と内部キー非表示は実装済みだったが、`入力`は14列、`共通データ`は6列が常時表示されていた。
- 枠線と実セル記入例は維持対象とした。

### 調査内容

- 作業開始head `fedb126a4c7f8915e4f4bfc97e063386af773a08` と`docs/codemap/codemap.lock`の製品基準`42e3a95a5a3e8c1940dda453742a16ece2e7499f`を比較した。
- 差分は課題管理・コードマップ生成物だけで、対象製品ソースに後続差分がないことを確認したため、既存コードマップは変更前調査に使用可能と判断した。
- コードマップから変更対象を確認:
  - 呼び出し元: `web/src/server/routes/excel.ts`が`buildCasesTemplate()`と`decorateCasesTemplate()`を呼ぶ。
  - 影響先: 公式テンプレート生成、friendly Excel解析、テンプレートの見た目、Excel preview/confirm導線。
  - テスト: `web/src/server/excelImport.test.ts`, `web/src/server/excelTemplatePresentation.test.ts`, `web/e2e/excel-import.spec.ts`。

### 実施内容

- `web/src/server/excelImport.ts`:
  - 公式`入力`を「テスト名・確認項目名・操作・期待結果」の4列だけへ変更。
  - 公式`共通データ`を「テスト名・項目名・値」の3列だけへ変更。
  - 省略した優先度・見る場所・テストデータ・タグ・フォルダ・目的・前提条件・共通データメモ等は公式テンプレートには表示せず、必要なら取込後に画面で設定する案内へ変更。
  - friendly parserは従来の14列/6列を引き続き任意列として認識し、旧ファイル互換を維持。
  - 旧キー付き形式の互換読込も維持。
  - 最小テンプレートでは優先度は既定の`medium`、その他詳細項目は空欄として取り込む。
- `web/src/server/excelTemplatePresentation.ts`:
  - 枠線を`入力`A1:D201、`共通データ`A1:C201へ最小列に合わせて維持。
  - `入力`2〜3行目と`共通データ`2行目へ実際の記入例を維持。
  - 継続行のテスト名・確認項目名は真の空セルを維持。
- テスト:
  - 公式テンプレートが正確に4列/3列で、それ以降の列が空であることをUnit/E2Eで固定化。
  - 最小列からの取込を検証。
  - 従来14列/6列friendly workbookの詳細情報が引き続き解析される互換テストを追加。
  - 旧キー付き形式の互換テストも維持。
- DB変更: なし。
- Migration: なし。
- API route契約変更: なし。
- 製品変更後、コードマップ3ファイルを新しいExcel制約へ更新し、製品基準を`96303f31b8b7cb561a472040da0d6af964e9e94d`へ更新した。

### 検証

GitHub Actions run `32455211801`（製品head `96303f31b8b7cb561a472040da0d6af964e9e94d`）:

- Docker Compose validation: 成功
- OpenShift Kustomize validation: 成功
- npm ci: 396 packages追加、397 packages監査
- npm audit --audit-level=high: 成功、脆弱性0件
- TypeCheck: 成功
- Unit/API Test: 54件成功、2件skip（19 test files成功、2 files skip）
- Excel import Unit: 4件成功（最小列生成・取込、従来詳細friendly互換、旧キー付き互換を含む）
- Excelテンプレート表示Unit: 2件成功（4列/3列、枠線、実セル記入例を含む）
- MariaDB Integration Test: 2件成功
- Migration CLI / schema validation: 成功
- Backup / restore / retention: 成功
- Production Build: 成功
- OpenShift-compatible container build: 成功
- arbitrary UID / read-only root filesystem readiness: 成功
- Chromium E2E: 21件成功（`excel-import.spec.ts`を含む）
- DB・監査・Playwright成果物保存: 成功
- Artifact: `web-ci-32455211801-1`（ID `9437062798`、SHA256 `07d40d5e29a0472a82fdfb495b448db0ba9f1efcc172a65940dd1037c812d665`、446824 bytes）

### 結果

- 公式テンプレートは3シート構成を維持しつつ、通常入力面を本当に最小化した。
- `入力`は4列だけ、`共通データ`は3列だけとなり、不要な横スクロールと詳細項目の常時露出を除去した。
- 枠線と実セル記入例は維持した。
- 過去に作成した詳細列付きExcelと旧キー付きExcelの読込互換は維持した。
- 未解決の製品不具合: なし。

## TASK-20260821-004: Excel参照テンプレート復元・枠線・記入例・案内シート非表示

- 開始日時: 2026-08-21 16:04 JST
- 完了日時: 2026-08-21 16:22 JST
- 対応課題: ISSUE-20260821-004
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- 利用者が提示した`the-test-design-template.xlsx`の構成が、直前の4列/3列版より分かりやすい基準として指定された。
- 参照ファイルの`入力`は必須4列＋任意4列の8列、`共通データ`は6列で、必須列を青、任意列を橙に分け、優先度には`高/中/低`の入力規則があった。
- 参照ファイル自身では案内用`使い方`シートがvisibleで、現行生成処理も同様にvisibleだったため、以前に意図した「作業手順タブを非表示」が保持されていなかった。

### 調査内容

- 作業開始head `b9cd1df93d72dd5c576d7b16ac2174de89158c7f` と`docs/codemap/codemap.lock`の製品基準`96303f31b8b7cb561a472040da0d6af964e9e94d`を比較し、製品モジュール差分がなく、コードマップを変更前調査に利用可能と確認した。
- コードマップから変更対象を確認:
  - 呼び出し元: `web/src/server/routes/excel.ts`が`buildCasesTemplate()`、`decorateCasesTemplate()`、`parseCasesWorkbook()`を使用する。
  - 影響先: 公式Excelテンプレートの生成・表示とExcel preview/confirm解析。DB保存契約、route、Migrationは変更しない。
  - テスト: `web/src/server/excelImport.test.ts`, `web/src/server/excelTemplatePresentation.test.ts`, `web/e2e/excel-import.spec.ts`。
- 提示ファイルを確認し、入力8列・共通データ6列、列幅、必須/任意色、優先度ドロップダウンを復元基準にした。

### 実施内容

- `web/src/server/excelImport.ts`:
  - 公式`入力`を提示ファイルと同じ8列へ復元。
  - 公式`共通データ`を提示ファイルと同じ6列へ復元。
  - 必須4列/任意4列の青/橙色分けと、共通データの必須/任意色分け、列幅、優先度`高/中/低`ドロップダウンを復元。
  - `使い方`は物理シートとして残しつつ`hidden`へ変更。
  - 旧4列/3列、14列/6列friendly、旧キー付き形式の読込互換を維持。
- `web/src/server/excelTemplatePresentation.ts`:
  - `入力`A1:H201、`共通データ`A1:F201へthin枠線を設定。
  - `入力`2行目へ8列すべての実記入例、3行目へ空欄継続の2手順目例を配置。
  - `共通データ`2行目へ6列すべての実記入例を配置。
  - 最終生成物でも`使い方`をhiddenに再設定。
- Unit/E2E:
  - 8列/6列、hidden案内シート、色分け、優先度ドロップダウン、枠線、実セル例を固定化。
  - 4列/3列、14列/6列、キー付き形式の互換読込を回帰確認。
- DB変更: なし。
- Migration: なし。
- API route契約変更: なし。
- 製品変更後、`docs/codemap/codemap.html`、`codemap.json`、`codemap.lock`を製品head `586e1406b4b7c4c98283ff6aa13bed0cd537687a`基準へ更新した。

### 作業中に発生したこと

- 最初のUnit/E2Eヘッダー検証ではExcelJSの`row.values`の1始まり配列表現に依存した比較になっていたため、ヘッダーの実セルテキストを列番号で取得する検証へ変更した。
- 製品ロジックの不具合ではなくテスト表現の問題で、修正後に独立CIを再実行した。

### 検証

GitHub Actions run `32458072345`（製品head `586e1406b4b7c4c98283ff6aa13bed0cd537687a`）:

- Docker Compose validation: 成功
- OpenShift Kustomize validation: 成功
- npm ci: 396 packages追加、397 packages監査
- npm audit --audit-level=high: 成功、脆弱性0件
- TypeCheck: 成功
- Unit/API Test: 55件成功、2件skip（19 test files成功、2 files skip）
- Excel import Unit: 5件成功
- Excelテンプレート表示Unit: 2件成功
- MariaDB Integration Test: 2件成功
- Migration CLI / schema validation: 成功
- Backup / restore / retention: 成功
- Production Build: 成功
- OpenShift-compatible container build: 成功
- arbitrary UID / read-only root filesystem readiness: 成功
- Chromium E2E: 21件成功（`excel-import.spec.ts`を含む）
- DB・監査・Playwright成果物保存: 成功
- Artifact: `web-ci-32458072345-1`（ID `9437996267`、SHA256 `b3078b4040775b2b8e0d7cbe9a062a8fc250d14313db83eeb2fc9c2c927a41a3`、449924 bytes）

### 結果

- 公式テンプレートを提示ファイルと同じ理解しやすい8列/6列構成へ戻し、枠線と実記入例を追加した。
- 案内用`使い方`シートはブックに保持したまま非表示になった。
- 以前の4列/3列・14列/6列・キー付きExcelは引き続き読み込める。
- 未解決の製品不具合: なし。

## TASK-20260821-005: プロジェクト作業手順タブの非表示化

- 開始日時: 2026-08-21 16:44 JST
- 完了日時: 2026-08-21 16:55 JST
- 対応課題: ISSUE-20260821-005
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- Excelテンプレートの`使い方`シートは非表示になったが、プロジェクト画面上部には`作業手順`タブが引き続き表示されていた。
- 前タスクでは利用者の「作業手順のタブを非表示」という指定をExcelの案内シートと解釈しており、プロジェクトナビゲーションの確認が不足していた。

### 調査内容

- `AGENTS.md`と開発運用ルールを再確認した。
- 作業開始時点のbranch headと`docs/codemap/codemap.lock`を比較し、製品ソース基準はExcel修正head `586e1406b4b7c4c98283ff6aa13bed0cd537687a`のままで、後続差分は管理ドキュメント/コードマップのみと確認した。
- 既存コードマップは`Workspace.tsx`のプロジェクトタブ責務について「呼び出し元・影響先・テスト」の3点を十分に回答できなかったため、製品変更前に3ファイルを再生成した。
- 再生成したコードマップで確認した内容:
  - 呼び出し元: `web/src/client/App.tsx`がプロジェクトを開いた際に`Workspace`をrenderする。
  - 影響先: `Workspace.tsx`がプロジェクトレベルの表示タブと`TestDesignEditor`、`RunWorkspace`、`ExportPanel`、削除済みパネルの構成を管理する。タブ非表示だけではbackend/APIを削除しない。
  - テスト: `web/e2e/workflow-guidance.spec.ts`がプロジェクトを開いた導線を、`web/e2e/excel-import.spec.ts`がExcelタブ導線をカバーする。
- 実ソースで`Workspace.tsx`に`"procedures"` Tab、`["procedures", "作業手順"]`ナビ項目、`ProceduresPanelV2`表示分岐が残っていることを確定した。

### 実施内容

- `web/src/client/Workspace.tsx`:
  - `Tab`型から`procedures`を削除。
  - プロジェクトナビゲーションから`作業手順`ボタンを削除。
  - `ProceduresPanelV2`表示分岐と不要importを削除。
  - 表示タブを`テスト設計 / テスト実行 / Excelから追加・エクスポート / 削除済み`の4つへ固定。
- `web/e2e/workflow-guidance.spec.ts`:
  - プロジェクト作成直後に`作業手順`ボタンが0件であることを明示的にassertし、今後の再表示を回帰として検出するようにした。
- 互換性:
  - `RunWorkspace.tsx`内の`ProceduresPanelV2`コンポーネントや既存procedure backend/APIは削除せず保持した。今回の変更はプロジェクトナビゲーションからの非表示だけ。
- DB変更: なし。
- Migration: なし。
- API route変更: なし。
- 製品変更後、コードマップ3ファイルをproduct head `76548555e7387c1c37c052f9a2d68870e50eef90`基準へ更新し、`作業手順`がvisible navigationに存在しないことと回帰テストを明記した。

### 検証

GitHub Actions run `32460494663`（製品head `76548555e7387c1c37c052f9a2d68870e50eef90`）:

- Docker Compose validation: 成功
- OpenShift Kustomize validation: 成功
- npm ci: 396 packages追加、397 packages監査
- npm audit --audit-level=high: 成功、脆弱性0件
- TypeCheck: 成功
- Unit/API Test: 55件成功、2件skip（19 test files成功、2 files skip）
- Excel import Unit: 5件成功
- Excelテンプレート表示Unit: 2件成功
- MariaDB Integration Test: 2件成功
- Migration CLI / schema validation: 成功
- Backup / restore / retention: 成功
- Production Build: 成功
- OpenShift-compatible container build: 成功
- arbitrary UID / read-only root filesystem readiness: 成功
- Chromium E2E: 21件成功。`workflow-guidance.spec.ts`の作業手順タブ非表示assertionも成功。
- DB・監査・Playwright成果物保存: 成功
- Artifact: `web-ci-32460494663-1`（ID `9438819309`、SHA256 `46bddb6b005427e75b8cfb0827705e79ddab7fd34d5e16f122f873ba8a4bcfce`、450468 bytes）

### 結果

- プロジェクト画面の`作業手順`タブを実際に非表示化した。
- Excelの`使い方`シート非表示とは別のUIであることをコード・テスト・コードマップ上で明確化した。
- procedure互換機能は削除せず、通常プロジェクトナビゲーションからのみ除外した。
- 未解決の製品不具合: なし。

## TASK-20260821-006: Web UIレイアウト基盤の初期導入

- 開始日時: 2026-08-21 19:02 JST
- 完了日時: 未完了
- 対応課題: ISSUE-20260821-006
- 担当: ChatGPT
- 状態: In Progress

### 作業前の状態

- Web UIは独自CSSで実装され、テスト設計画面には操作役割ごとの色分けやレスポンシブ対応がすでにある。
- 一方で、色・余白・角丸・影の値は`styles.css`、`workspace.css`、`test-design.css`などへ個別に記述され、画面横断の命名規則とレイアウトレビュー手順がない。
- `web/package.json`にはUIコンポーネントライブラリがなく、現在の機能を保ったまま基盤だけを段階導入するのが適切である。

### 変更前調査

- 作業開始head: `c57ff48252675d015606fb388b82b94fd48dbbbb`。
- `docs/codemap/codemap.lock`の製品基準は`76548555e7387c1c37c052f9a2d68870e50eef90`で、そこから作業開始headまでの差分は台帳・作業記録・コードマップ生成物だけだった。
- 既存コードマップは`Workspace.tsx`の呼び出し元・影響先・E2Eを記録しているが、CSS基盤のimport元・画面影響・回帰対象を独立モジュールとして回答できないため、製品コード変更前に再生成する。
- 変更対象の呼び出し元: `main.tsx`が`styles.css`、`Workspace.tsx`が`workspace.css`、`TestDesignEditor.tsx`が`test-design.css`をimportする。
- 影響先: 全Web画面の基本コントロール、プロジェクトナビゲーション、テスト設計の編集レイアウト。
- 回帰対象: `web/e2e/auth.spec.ts`、`workflow-guidance.spec.ts`、`test-design.spec.ts`、`excel-import.spec.ts`。

### 導入方針

- Impeccableは自動hookや外部skillを追加せず、`critique / layout / audit / harden / distill`の観点を手動レビューのチェックリストへ取り込む。
- Fluent 2から意味ベースのカラー、余白、角丸、影、フォーカス表現を参考にし、4px基準のトークンへ落とし込む。
- Ant Design Proからページ見出し、主ナビゲーション、コンテンツカード、主操作の配置パターンを参考にする。
- 初回は依存追加、全面的なコンポーネント置換、DB/API/Migration変更を行わない。

### 検証予定

- npm audit: 未実施
- TypeCheck: 未実施
- Unit/API: 未実施
- Production Build: 未実施
- Chromium E2E: 未実施

### 実施内容

- `web/src/client/styles.css`へ意味ベースの色、4px基準余白、角丸、影、content width、focusの共通トークンを追加した。
- `workspace.css`と`test-design.css`の主要なシェル、ナビゲーション、カード、フォーム余白を共通トークンへ接続した。
- DashboardとWorkspaceのナビゲーションへ`type="button"`と`aria-current="page"`を追加し、Workspaceの現在地をE2Eで固定した。
- `docs/WEB_DESIGN_GUIDELINES.md`と`AGENTS.md`へ手動デザインレビュー手順とUI変更ルールを追加した。
- 初回CIで再現したFolderExplorerの右クリックメニューviewport overflowを、マウント後の実寸計測と8pxマージン内クランプで修正した。
- DB、Migration、API route契約、runtime UI依存は変更していない。

### 検証

- 初回ローカル依存導入はNode 24の`better-sqlite3`ネイティブビルドで失敗したため、`npm ci --ignore-scripts`で検証環境を整えた。リポジトリCIは指定条件で実行した。
- ローカルTypeCheck: 成功。
- ローカルUnit/API: 55件成功、2件skip。
- ローカルProduction Build: 成功。
- GitHub Actions run `32472543116`: 主要工程成功後、既存`folder-overlay.spec.ts`がviewport外クリックで失敗。
- 修正後GitHub Actions run `32473680363`: npm audit 0件、TypeCheck、Unit/API 55件（2件skip）、MariaDB統合2件、Migration/Schema validation、Backup/restore/retention、Production Build、OpenShift互換コンテナ、任意UID/read-only root filesystem、Chromium E2E 21件、成果物保存まで全工程成功。
- Artifact: `web-ci-32473680363-1`（ID `9443553164`、SHA256 `3ad47c33939810100a41f79b8ae5e0e174bda599222dcc92da9d4db5f232415d`）。

### 結果

- ISSUE-20260821-006をVerifiedへ更新した。
- 未解決の製品不具合: なし。
- 完了日時: 2026-08-21 19:45 JST
- 状態: Completed / Verified

## TASK-20260821-007: siji.mdによる画面修正

- 開始日時: 2026-08-21 21:03+09:00
- 完了日時: 未完了
- 対応課題: ISSUE-20260821-007, ISSUE-20260821-008, ISSUE-20260821-009, ISSUE-20260821-010
- 担当: ChatGPT
- 状態: In Progress

### 作業前の状態

- 発生していた現象: 実行担当者を設定しても、実行開始後の確認項目担当者へ初期値が反映されない。証跡項目の情報配置を改善する必要がある。確認項目一覧には右クリックの複製・削除がなく、「既存からコピー」導線が残っている。
- 再現手順: テスト実行で担当者を設定して開始する。テスト設計の確認項目一覧と証跡項目を表示する。
- 期待動作: 実行担当者が項目担当者の初期値になる。証跡のファイル名・プレビュー・補足情報・操作が順序立って見える。確認項目の右クリックで複製・削除でき、「既存からコピー」が表示されない。
- 実際の動作: 要修正。詳細な原因は実装確認中。

### 調査内容

- 確認したファイル: `web/src/client/RunWorkspace.tsx`, `web/src/client/TestDesignEditor.tsx`, `web/src/client/operations.css`, `web/src/client/test-design.css`, `web/src/server/routes/runs.ts`, 関連Playwright E2E
- 実行したコマンド: GitHub current-head取得、コードマップとcurrent tree比較、対象ファイル読取
- 仮説: 実行開始時のsnapshot INSERTに担当者列がなく、証跡カードと確認項目リストの情報階層が現行ガイドラインに対して不足している。
- 仮説の検証結果: 実装確認後に確定する。
- 確定原因: 未確定

### 実施内容

- 変更ファイル: 未実施
- DB変更: なし（予定）
- Migration: なし（予定）
- API変更: 未実施
- UI変更: 未実施
- テスト追加: 未実施
- ドキュメント更新: コードマップ再生成、課題台帳・Open Issues・タスクログ開始記録

### 作業中に発生したこと

- 新たに発生したエラー: なし
- 想定外の影響: なし
- 追加で判明した課題: コードマップの基準コミットが現行PR headから遅れていた。
- 回避策: 最新headのソースツリーを確認し、コード変更前にコードマップを現行headへ更新する。

### 検証

- TypeCheck: 未実施
- Unit Test: 未実施
- Integration Test: 未実施
- Build: 未実施
- E2E: 未実施
- 手動確認: 未実施
- DB確認: 実行開始時のsnapshot INSERTをコード確認済み
- セキュリティ確認: 未実施

### 結果

- 解消した内容: なし。実装前。
- 解消していない内容: siji.mdの4項目すべて。
- 残るリスク: 担当者の初期反映、画面操作、既存複製機能の回帰。
- 次のタスク: コードマップ更新を反映後、実装と回帰テストを行う。
