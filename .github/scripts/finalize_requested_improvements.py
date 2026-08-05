from pathlib import Path

RUN_ID = "30997068195"
ARTIFACT = "web-ci-30997068195-1"
ARTIFACT_ID = "8926675705"
ARTIFACT_SHA = "fdf5cd1f25461ceadbcc4f4e492d001a942f8abbd6fe9be387f6fd3a568bcf73"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def write(path: Path, text: str) -> None:
    path.write_text(text.rstrip() + "\n", encoding="utf-8")


ledger = Path("docs/ISSUE_LEDGER.md")
ledger_text = read(ledger)
rows = [
    "| ISSUE-20260805-003 | 2026-08-05 | Usability / Operation | P1 | Verified | プロジェクト・ユーザー管理 | プロジェクトはアーカイブまでで削除導線がなく、ユーザー作成フォームが常時表示され、一覧から状態・担当・必要操作を把握しにくかった。 | アーカイブ済み・名称完全一致・理由必須の論理削除と監査を追加し、ユーザー作成・編集・仮パスワード設定をモーダル化、検索・状態集計・担当表示中心のUIへ変更した。 | GitHub Actions run 30997068195で管理モーダルとプロジェクト削除E2Eを含む全19件成功。 | User Request 2026-08-05 |",
    "| ISSUE-20260805-004 | 2026-08-05 | Usability / Bug | P1 | Verified | フォルダ・テスト設計 | 選択フォルダが新規テストへ引き継がれず、親子フォルダ同時移動で二重移動が起こり得た。確認項目のフォルダ指定と複数手順の一覧表示も利用者を混乱させた。 | 選択フォルダの自動設定、親子選択を整理した移動、移動先メニューを追加し、不要説明・確認項目フォルダ指定を削除した。全操作手順を一覧要約し、詳細側で全件編集する構成へ変更した。 | GitHub Actions run 30997068195で選択フォルダ配置・複数手順表示を含む全19件成功。 | User Request 2026-08-05 |",
    "| ISSUE-20260805-005 | 2026-08-05 | Usability / Data integrity | P1 | Verified | テスト実行 | 実行スナップショットへ関連データが自動で含まれず、テストデータ・共通データを確認できなかった。見る場所画像は拡大・実行単位編集ができず、全件完了後も次の未実行ボタンが有効だった。 | 関連データセットの自動スナップショット、実行画面のデータ表示、画像ライトボックス、元定義を変更しない実行用派生画像、完了時の次項目ボタン無効化を実装した。 | GitHub Actions run 30997068195でデータ表示・画像編集・拡大・ボタン制御を含む全19件成功。 | User Request 2026-08-05 |",
    "| ISSUE-20260805-006 | 2026-08-05 | Usability / Export | P1 | Verified | エクスポート | エクスポート対象を明示選択できず、テスト実行の結果・データ・証跡画像を一体で出力できなかった。 | プロジェクト全体・テスト設計・テスト実行の選択UIを追加し、実行概要・結果・データ・証跡シートと最新画像証跡を埋め込むExcelを実装した。画像変換失敗時はPNG/JPEG原本を使用する。 | GitHub Actions run 30997068195で証跡画像入り実行Excelの生成・再読込を含む全19件成功。 | User Request 2026-08-05 |",
]
if "ISSUE-20260805-003" not in ledger_text:
    lines = ledger_text.splitlines()
    insert_at = next((index + 1 for index, line in enumerate(lines) if line.startswith("| ISSUE-20260805-002 |")), None)
    if insert_at is None:
        raise SystemExit("ISSUE-20260805-002 row not found")
    for row in reversed(rows):
        lines.insert(insert_at, row)
    write(ledger, "\n".join(lines))


task_log = Path("docs/TASK_LOG.md")
task_text = read(task_log).rstrip()
if "TASK-20260805-003" not in task_text:
    task_text += f"""

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

GitHub Actions run `{RUN_ID}`:

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
- Artifact: `{ARTIFACT}`（ID `{ARTIFACT_ID}`、SHA256 `{ARTIFACT_SHA}`）

### 結果

- 依頼された管理、テスト設計、実行、エクスポートの各導線を実装し、実MariaDB・実Chromiumで一連確認した。
- PR #2はDraft・未マージのまま維持した。
"""
    write(task_log, task_text)


open_issues = Path("docs/OPEN_ISSUES.md")
open_text = read(open_issues)
completed = f"""- 管理・テスト設計・実行・エクスポート改善（ISSUE-20260805-003〜006）: GitHub Actions run `{RUN_ID}`でUnit/API 43件、MariaDB統合2件、OpenShift任意UID起動、Chromium E2E 19件を含む全工程成功。\n"""
if completed.strip() not in open_text:
    marker = "## Completed verification\n"
    if marker not in open_text:
        raise SystemExit("Completed verification heading not found")
    open_text = open_text.replace(marker, marker + "\n" + completed, 1)
open_text = open_text.replace(
    "現在、Review 9、P2フォルダ操作、Excelテスト設計インポート、フォルダ重複UI・オーバーレイ表示、完了済み実行の証跡表示、Docker MariaDB認証に属する未解決の製品不具合はない。",
    "現在、Review 9、フォルダ・テスト設計、管理画面、実行データ・画像、選択式エクスポート、OpenShift配備に属する既知の未解決製品不具合はない。",
)
write(open_issues, open_text)


readme = Path("web/README.md")
readme_text = read(readme)
readme_text = readme_text.replace(
    "- プロジェクト一覧・作成・編集・アーカイブ・JSONエクスポート",
    "- プロジェクト一覧・作成・編集・アーカイブ・確認付き論理削除・JSONエクスポート",
)
readme_text = readme_text.replace(
    "- ユーザー作成・変更・無効化・パスワード再設定・ロック解除",
    "- 検索・状態集計付きユーザー管理、モーダル作成・変更・無効化・パスワード再設定・ロック解除",
)
section = """

## 管理・設計・実行・エクスポートの改善

- プロジェクトは、管理者がアーカイブ後にプロジェクト名と削除理由を確認して論理削除できます。
- ユーザー管理は一覧・検索・状態集計を中心とし、作成、編集、仮パスワード設定を必要時だけモーダルで開きます。
- フォルダを選択して新しいテストを作ると、そのフォルダが初期所属先になります。複数手順は一覧に全件を要約し、詳細で編集します。
- 見る場所画像はテスト設計と実行の双方で編集でき、実行時は拡大表示できます。実行用編集は元テスト定義へ反映しません。
- テスト実行には確認項目データと共通データを表示し、未実行項目がなくなると「保存して次の未実行へ」を無効化します。
- エクスポート対象はプロジェクト全体、テスト設計、テスト実行から選択できます。テスト実行Excelには結果、データ、最新証跡メタデータと画像を出力します。
"""
if "## 管理・設計・実行・エクスポートの改善" not in readme_text:
    marker = "## OpenShiftへデプロイ"
    readme_text = readme_text.replace(marker, section.strip() + "\n\n" + marker, 1)
write(readme, readme_text)


temporary_paths = [
    ".github/scripts/apply_admin_improvements.py",
    ".github/scripts/apply_export_improvements.py",
    ".github/scripts/apply_requested_improvement_tests.py",
    ".github/scripts/apply_run_execution_improvements.py",
    ".github/scripts/apply_test_design_improvements.py",
    ".github/scripts/fix_canvas_expectation.py",
    ".github/scripts/fix_evidence_excel_images.py",
    ".github/scripts/fix_requested_improvement_e2e.py",
    ".github/scripts/finalize_requested_improvements.py",
    ".github/workflows/apply-admin-improvements.yml",
    ".github/workflows/apply-export-improvements.yml",
    ".github/workflows/apply-requested-improvement-tests.yml",
    ".github/workflows/apply-run-execution-improvements.yml",
    ".github/workflows/apply-test-design-improvements.yml",
    ".github/workflows/diagnose-excel-image.yml",
    ".github/workflows/fix-canvas-expectation.yml",
    ".github/workflows/fix-evidence-excel-images.yml",
    ".github/workflows/fix-requested-improvement-e2e.yml",
    ".github/workflows/finalize-requested-improvements.yml",
    "web/.requested-improvements-ci-trigger",
]
for name in temporary_paths:
    Path(name).unlink(missing_ok=True)
