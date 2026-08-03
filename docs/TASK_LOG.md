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
- 対応課題: ISSUE-20260803-003, ISSUE-20260803-004, ISSUE-20260803-005, ISSUE-20260803-007, ISSUE-20260803-009, ISSUE-20260803-011
- 状態: In Verification

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

### 検証

- TypeCheck: GitHub Actions実行待ち
- Unit/API: GitHub Actions実行待ち
- MariaDB統合: GitHub Actions実行待ち
- Build: GitHub Actions実行待ち
- Chromium E2E: GitHub Actions実行待ち
- DB・監査ログ: GitHub Actions成果物で確認予定

### 残るリスク

- GitHub Actionsの最新runが成功するまではReview 9完了判定を行わない。
- フォルダのエクスプローラー操作はReview 9対象外のP2として継続する。
