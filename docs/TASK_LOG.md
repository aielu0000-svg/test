# Task Log

> 2026-09-02にログを再継続ファイル化した。2026-08-06以前の記録は `TASK_LOG_ARCHIVE_20260806.md`、2026-08-07〜2026-09-01の記録は `TASK_LOG_ARCHIVE_20260901.md` に内容を変更せず保存している。本ファイルへ以後の作業を追記する。

## TASK-20260902-001: 証跡成功メッセージ余白・カード影の調整

- 開始日時: 2026-09-02 11:27 JST
- 完了日時: 2026-09-02 11:40 JST
- 対応課題: ISSUE-20260902-001
- 担当: ChatGPT
- 状態: Completed / Verified（利用者確認で追修正が必要となりTASK-20260902-002へ継続）

### 作業前の状態

- 利用者確認で、証跡登録後の緑色成功メッセージが直前の証跡カードへ詰まって見えることが判明した。
- 証跡カードだけに独自の薄い影があり、周辺のborder中心のカード表現から浮いて見えていた。
- 期待動作は、成功メッセージの上に明確な余白があり、証跡カードは周囲と同様にborderだけで区切られること。

### 調査内容

- 作業開始時に製品基準commit `fbfd40a21a7f2e38c3ad27f7245b1c1a5a0c9db4` とbranch headを比較し、差分が課題管理・コードマップだけで製品コードのドリフトがないことを確認した。
- `docs/codemap/codemap.json`と実ソースから変更対象を確認した。

### 実施内容

- 製品commit `9a93fd2fef278d5a179f6d9539250a90dde9e723`（`証跡カードの影と成功メッセージ余白を調整`）で`.evidence-card`のshadowを削除し、`.evidence-panel > .success-message`へ上余白を追加した。
- DB/Migration/API変更なし。

### 検証

GitHub Actions run `33583803359`でTypeCheck、Unit/API 55件成功・2件skip、MariaDB統合2件、Migration/Schema validation、Backup/restore/retention、Build、OpenShift互換コンテナ、任意UID/read-only root filesystem、Chromium E2E 24件が成功した。

### 結果

- 初回自動検証は成功したが、利用者確認で外側の`.evidence-panel`に共通`.panel`由来のshadowが残っていること、エラー文へ同じ余白が適用されていないことが判明したため追修正する。

## TASK-20260902-002: sanitize-html advisory解消と証跡表示追修正

- 開始日時: 2026-09-02 13:20 JST
- 完了日時: 未完了
- 対応課題: ISSUE-20260902-001, ISSUE-20260902-002
- 担当: ChatGPT
- 状態: In Progress

### 作業前の状態

- Web CIの`npm audit`で`sanitize-html` 2.17.5にGHSA-g8qq-57p8-ggw5（moderate）が1件残っていた。
- 証跡カード自体のshadowは除去済みだが、外側の`section.panel.evidence-panel`が共通`.panel`のshadowを継承していた。
- 証跡パネル直下の成功メッセージだけに1remの上余白があり、同位置に表示されるエラー文には余白がなかった。

### 調査内容

- 作業開始時にbranchと`docs/codemap/codemap.lock`を比較し、lockが`fbfd40a...`を指しており現製品headとの差分を答えられないため、コード変更前にcodemap 3ファイルを再生成した。
- コードマップと実ソースで変更対象を確認した。
  - UI呼び出し元: `Workspace.tsx` → `RunWorkspace.tsx` → EvidencePanel。`main.tsx`がCSSをロードする。
  - UI影響先: 証跡パネルのshadowと直下success/error messageの余白のみ。証跡API/DB/保存処理には影響しない。
  - UIテスト: `web/e2e/evidence.spec.ts`, `web/e2e/completed-run-evidence.spec.ts`。
  - sanitizer呼び出し元: `web/src/server/routes/evidence.ts`の`GET /api/procedures/:id`が`renderSafeMarkdown`を呼び、クライアントの手順書プレビューへ安全化済みHTMLを返す。
  - sanitizer影響先: `web/src/server/markdown.ts`, dependency manifests, Web Node runtime。
  - sanitizerテスト: `web/src/server/markdown.test.ts`とWeb CI全工程。
- 修正版`sanitize-html` 2.17.7がNode >=22.12.0を要求することを確認したため、Web runtimeをNode 22.12.0へ同時更新する方針とした。

### 実施内容

- 進行中。`sanitize-html` 2.17.7へのlock生成、Node 22.12.0へのruntime更新、証跡パネル専用CSS、Unit/E2E回帰追加を同一製品変更としてまとめる。
- DB変更: なし。
- Migration: なし。
- API契約変更: なし。

### 作業中に発生したこと

- 正しいnpm lockfile生成のため一時GitHub Actions workflowを利用した。一時workflow/生成commitは最終branch履歴へ残さず、コードマップ再同期commitを親にしたclean product commitへ履歴を整理する予定。

### 検証

- TypeCheck: 未実施
- Unit Test: 未実施
- Integration Test: 未実施
- Build: 未実施
- E2E: 未実施
- 手動確認: 未実施
- DB確認: DB変更なし
- セキュリティ確認: 実装後に`npm audit --audit-level=moderate`で確認予定

### 結果

- 解消した内容: 実装・検証中
- 解消していない内容: CIによる最終検証
- 残るリスク: Node major更新を含むため全Web CI工程の確認が必要
- 次のタスク: 製品commit作成後に独立CIを確認し、課題台帳・codemap lockを確定する

## TASK-20260902-003: ユーザー初回利用ガイドの追加

- 開始日時: 2026-09-02 JST
- 完了日時: 2026-09-02 JST
- 対応課題: ISSUE-20260902-003
- 担当: ChatGPT
- 状態: Completed / Verified（全Chromium suiteの既存1件失敗はbaseでも再現）

### 作業前の状態

- Web版には主要機能を順番に説明する初回ガイドが存在しない。
- `AuthUser`は初回パスワード変更状態のみを持ち、ガイド完了状態はDB・API・UIのいずれにも存在しない。
- 利用者指示により、並走作業でHEADが進んでいることを前提とし、本タスクではcodemap再生成を行わない。

### 調査内容

- `docs/codemap/codemap.lock`と作業開始HEADを比較し、lockが古いことを確認した。
- 利用者の明示指示により再生成は省略し、既存`codemap.json`と現行ソースで呼び出し元・影響先・テスト範囲を確認した。
- UI: `main.tsx` → `App.tsx` → `Workspace.tsx`。認証後の画面遷移と主要ナビゲーションへ影響する。
- API/DB: `app.ts` → `auth.ts` → `users`。ユーザー公開情報とセッション読込へ影響する。
- テスト: auth/API、MariaDB integration、schema validation、workflow-guidance系E2Eを中心に確認した。

### 実施内容

- 新規Migration `014_user_onboarding.sql`で`users.onboarding_completed_at`を追加した。適用済みMigrationは変更していない。
- `AuthUser`へ`onboardingCompleted`を追加し、ログイン・セッション復元・`/api/auth/me`でユーザー単位の完了状態を返すようにした。
- `POST /api/auth/onboarding/complete`を追加した。ログイン中の本人だけを対象にし、初回状態遷移時だけDB更新・監査ログ記録を行う冪等処理とした。
- 初回パスワード変更後、未完了ユーザーへ主要機能を1項目ずつスポットライトする`FirstUseGuide`を追加した。
- ダッシュボード／プロジェクトは全ユーザーへ、ユーザー管理／バックアップ・復元は管理者だけへ案内する。
- 任意のプロジェクトを開いた後、テスト設計／テスト実行／Excelから追加・エクスポート／削除済みを案内する。
- 最終OKまたは「今後表示しない」で完了状態を保存し、以後は同一ユーザーへ再表示しない。
- モーダル内のTab/Shift+Tabフォーカスを閉じ込め、モバイル幅の表示調整を追加した。
- OpenAPI、Schema Validation、Unit、MariaDB integration、既存E2E helper、新規`first-use-guide.spec.ts`を更新した。
- DB変更: あり。
- Migration: `014_user_onboarding.sql`。
- API変更: `POST /api/auth/onboarding/complete`。

### 作業中に発生したこと

- 並走スレッドとの競合を避けるため、PR #2の作業開始時HEADから`agent/first-use-guide`ブランチを分離し、Draft PR #3を作成した。
- 初回CIではSchema Validation Unitの成功fixtureに新列を追加し忘れていたため失敗した。fixtureを更新して解消した。
- 次のCIではMariaDB修復テストの部分Migration一覧が013まで固定されていたため014列がなく失敗した。修復経路にも014を追加して解消した。
- 最新CIでは全Chromium E2E中`evidence.spec.ts` 1件のみ失敗した。base commit `e1218b8e...`のrun `33590860184`でも同じテスト・同じ待機箇所で失敗しており、初回ガイド変更による回帰ではないことを確認した。並走中の証跡追修正タスクへ干渉しないため本ブランチでは修正していない。

### 検証

GitHub Actions run `33592597851`:
- npm audit (`--audit-level=moderate`): 成功、0 vulnerabilities
- TypeCheck: 成功
- Unit/API: 成功
- MariaDB Integration: 成功
- Migration/Schema validation: 成功
- Backup/restore/retention: 成功
- Build: 成功
- OpenShift-compatible container: 成功
- 任意UID/read-only root filesystem container: 成功
- Chromium E2E: 新規`first-use-guide.spec.ts`を含むガイド関連は成功。全suiteは既存`evidence.spec.ts` 1件のみ失敗
- 比較確認: base run `33590860184`でも同じ`evidence.spec.ts` 1件が同一内容で失敗
- 手動確認: 実施していない
- DB確認: MariaDB IntegrationとSchema Validationで014適用を確認
- セキュリティ確認: npm audit成功。完了APIは認証必須・本人固定・冪等更新

### 結果

- 解消した内容: ユーザー単位の初回ガイド、権限別案内、初回パスワード変更後の表示、完了/スキップ後の再表示抑止、DB/API/UI/テスト契約を実装した。
- 解消していない内容: 全Chromium suiteの既存`evidence.spec.ts` 1件。変更前baseでも再現するため本タスク対象外。
- 残るリスク: 並走ブランチ側の変更と統合時に競合する可能性がある。codemapは利用者指示により本タスクでは再生成していないため、統合時に最新HEAD基準で再同期が必要。
- 次のタスク: 並走PR側の変更を取り込む段階で競合確認・codemap再同期・全CI再実行を行う。

## TASK-20260902-004: 初回利用ガイド統合とOpenShift配備runbook整備

- 開始日時: 2026-09-02 JST
- 完了日時: 2026-09-02 JST
- 対応課題: ISSUE-20260902-003, ISSUE-20260902-004
- 担当: ChatGPT
- 状態: Completed / Verified

### 作業前の状態

- PR #2は並走スレッドで既に`codex/web-review`へマージ済みで、PR #3は旧`agent/folder-explorer-p2`をbaseにしたDraftのままだった。
- PR #3作業時は利用者指示でcodemap再生成を省略していたため、DB/API/UI境界を追加した初回ガイドを統合する前に最新親branch基準のcodemap再同期が必要だった。
- `web/OPENSHIFT.md`には英日重複、旧branch固定、バックアップ容量150/220GiBの不一致、実装と異なる「3世代保持」、環境固定NFS例が混在していた。

### 調査内容

- `codex/web-review`の最新headと`docs/codemap/codemap.lock`を比較し、初回ガイド境界を回答できないため統合前にcodemap 3ファイルを再生成した。
- PR #2統合後の変更とPR #3を比較し、並走側の追加変更は証跡UI/E2Eとcodemapで、初回ガイド実装ファイルとは競合しないことを確認した。
- 初回ガイドの呼び出し元・影響先・テストを `main.tsx → FirstUseGuide → client api → onboarding route → auth/users/audit` と `migration 014 → schema validation/readiness` までmapへ反映した。
- OpenShift手順は `web/scripts/openshift/deploy.sh`、`web/openshift-build.yaml`、`web/openshift.yaml`、`web/openshift-operations.yaml`、`web/openshift-retention.yaml`、`web/kustomization.yaml`、`web/ops/backup.sh`、`web/OPERATIONS.md`、`web/src/server/server.ts` を正本として照合した。

### 実施内容

- PR #3を`codex/web-review`へretargetし、最新親branchと初回ガイドを2-parent統合したcommit `759b0b758ab9df8ffb5a65967839807f678ecce5`を作成した。
- 統合ツリーと同じGitHub生成merge commit `40ecd27967b066c174cab4cfb53c51b26bfbc9d8`を`codex/web-review`へfast-forwardし、PR #3をmerged状態にした。
- `agent/openshift-deployment-runbook`をmerge commit `40ecd279...`から分岐した。
- `web/OPENSHIFT.md`を現行実装に合わせた日本語runbookへ全面整理した。
  - exact commit/tagで配備対象を固定
  - Secret実値をリポジトリへ保存しない
  - evidence 100Gi RWX / backup 220Gi RWX / MariaDB 20Gi RWO
  - backup通常2世代
  - 新規配備と配備後health/ready確認
  - 初回管理者・初回利用ガイド確認
  - 既存環境の配備前backup
  - Recreate + 起動時Migration/schema validation
  - Migration適用後を考慮したrollback方針
  - 定常CronJob、トラブルシューティング、Go-live checklist
- 環境固定のnamespace、NFS IP、export path例を削除した。
- OpenShift manifest、deploy script、DB/API/アプリコードは変更していないため、このrunbook PRではcodemap追加更新は不要と判断した。

### 検証

統合Web CI run `33597274615`:

- npm audit (`--audit-level=moderate`): 成功、0 vulnerabilities
- TypeCheck: 成功
- Unit/API: 57件成功、2件skip
- MariaDB Integration: 2件成功
- Migration/Schema validation: 成功
- Backup/restore/retention: 成功
- Build: 成功
- OpenShift-compatible container: 成功
- 任意UID/read-only root filesystem: 成功
- Chromium E2E: 25件成功（`first-use-guide.spec.ts`、`evidence.spec.ts`を含む）
- OpenShift runbook: 現行manifest/script/sourceとコマンド・容量・schedule・Migration順序を突合済み
- DB/API/manifest変更: runbook PRではなし

### 結果

- 初回利用ガイドは並走側の証跡修正を保持した状態で`codex/web-review`へ統合済み。
- 統合時にcodemapを最新複合ツリーへ再同期し、全Web CI greenを確認した。
- OpenShiftへ実際に適用するための新規構築・更新・復旧runbookを、環境固有Secret/PV値を含めず作成した。
- 実OpenShiftクラスターへのデプロイ自体は本タスクでは実行していない。

## TASK-20260902-005: OpenShift運用ガイドへユーザー管理・復元手順を追加

- 開始日時: 2026-09-02 JST
- 完了日時: 2026-09-02 JST
- 対応課題: ISSUE-20260902-005
- 担当: ChatGPT
- 状態: Completed / Source Verified（push後Web CI確認待ち）

### 作業前の状態

- PR #4の`web/OPENSHIFT.md`には初回ログイン、配備、アップグレード、ロールバックの手順はあるが、管理者が日常運用で使うユーザー管理の具体的な画面操作はまとまっていなかった。
- 復元はロールバック方針と`web/OPERATIONS.md`への参照だけで、管理画面から成功済み世代を選び、IDを確認して要求し、workerと復元後状態を確認する一連の手順がrunbook内に不足していた。

### 調査内容

- 作業開始時のPR #4 head `9db7fcb7802de024a1fefdcfa9aa0e8d16597e70` と `docs/codemap/codemap.lock` を比較した。PR #4差分は`web/OPENSHIFT.md`と台帳だけで、アプリコード境界は統合時codemapから変化していないことを確認した。
- `docs/codemap/codemap.json`で初回ガイドの呼び出し元・影響先・テストが `main.tsx → FirstUseGuide → client api → onboarding route` と `web/e2e/first-use-guide.spec.ts` で追跡できることを確認した。
- `web/src/client/FirstUseGuide.tsx`と`web/e2e/first-use-guide.spec.ts`を確認し、管理者向けの「ユーザー管理」「バックアップ・復元」案内自体は既に実装・E2E化されていることを確認した。
- `web/src/client/App.tsx`で、ユーザー作成、ユーザー編集、仮パスワード再設定、ロック解除、複数ユーザー/複数プロジェクト割当、成功済みバックアップ選択、バックアップID完全一致入力、復元要求のUI仕様を確認した。
- `web/src/server/app.ts`で、自分自身を無効化できないこと、最後の有効な管理者を無効化/実行者化できないこと、パスワード再設定時に対象ユーザーの既存セッションを破棄することを確認した。
- `web/OPERATIONS.md`で、復元元検証、復元前自動バックアップ、更新停止、DB/証跡同一backup ID復元、復元後2世代保持、監査記録の意味論を確認した。

### 実施内容

- `web/OPENSHIFT.md`の第6章を「初回ログイン・管理者運用ガイド」へ拡張した。
- ユーザー管理ガイドを追加した。
  - ユーザー作成
  - 権限/有効状態の変更
  - 自分自身と最後の有効管理者に対する保護
  - 仮パスワード再設定と次回変更
  - ロック解除
  - 複数ユーザー・複数プロジェクトの割当/解除
  - 権限の基本と作成後確認
- バックアップ・復元ガイドを追加した。
  - 手動バックアップ要求と処理状態確認
  - 成功済み世代の選択
  - バックアップID完全一致確認
  - 復元要求
  - 復元前自動バックアップ、更新停止、DB/証跡同一世代復元
  - workerログ確認
  - 復元後の`/healthz`、`/readyz`、画面データ確認
  - Migrationをまたぐ場合のschema互換性注意
- Go-liveチェックリストへユーザー管理と復元運用の確認項目を追加した。
- `docs/ISSUE_LEDGER.md`へISSUE-20260902-005を登録した。
- アプリコード、DB、Migration、API、OpenShift manifest、deploy scriptは変更していないため、codemapは追加更新していない。

### 検証

- Source照合: `web/src/client/App.tsx`, `web/src/server/app.ts`, `web/OPERATIONS.md`, `web/src/client/FirstUseGuide.tsx`, `web/e2e/first-use-guide.spec.ts`
- DB/API/manifest変更: なし
- Secret実値: 追加なし
- Web CI: push後に最新headで確認する

### 結果

- OpenShift配備runbookだけで、初回管理者の作成後に必要となるユーザー管理と、障害時/復旧時に必要な管理画面からの復元操作まで辿れるようになった。
- 実OpenShiftクラスターでのユーザー作成・復元実行は行っていない。
- 次の確認: PR #4最新headのWeb CIを確認し、結果を台帳/PRへ反映する。