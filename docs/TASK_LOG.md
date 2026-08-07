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
