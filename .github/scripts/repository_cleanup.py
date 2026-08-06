from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
TASK_MARKER = "## TASK-20260806-002: リポジトリ構成整理"
ISSUE_ID = "ISSUE-20260806-005"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8-sig")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def remove(path: str) -> None:
    target = ROOT / path
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()


def move(source: str, destination: str) -> None:
    src = ROOT / source
    dst = ROOT / destination
    if not src.exists():
        raise RuntimeError(f"Move source is missing: {source}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        raise RuntimeError(f"Move destination already exists: {destination}")
    src.rename(dst)


def replace(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"Expected text was not found in {path}: {old!r}")
    write(path, content.replace(old, new))


def append_once(path: str, marker: str, block: str) -> None:
    content = read(path)
    if marker in content:
        return
    write(path, content.rstrip() + "\n\n" + block.strip() + "\n")


def apply_cleanup() -> None:
    for path in (
        "Instructions",
        "function_order",
        "スクショ",
        "web/data",
        "compress-source.ps1",
        "untitled.pen",
        "シナリオサンプル.md",
        "初期データサンプル.md",
        "改善点.md",
        "PROGRESS.md",
        "web/src/client/DefinitionAdminPanel.tsx",
        "web/openapi-v1.0.0.yaml",
        "web/ops/purge.sql",
        "src/main/CLAUDE.md",
        "src/preload/CLAUDE.md",
        "src/renderer/src/CLAUDE.md",
        "src/renderer/src/components/CLAUDE.md",
        "src/renderer/src/styles/CLAUDE.md",
    ):
        remove(path)

    move("SECURITY_ASSESSMENT.md", "docs/SECURITY_ASSESSMENT.md")
    move("the-test-web-confirmed-spec-v1.0.0.md", "docs/the-test-web-confirmed-spec-v1.0.0.md")
    move("the-test-web-confirmed-spec-v1.1.0.md", "docs/the-test-web-confirmed-spec-v1.1.0.md")
    move("the-test-web-confirmed-spec-v1.2.0.md", "docs/the-test-web-confirmed-spec-v1.2.0.md")

    # Keep a shallow client directory and use responsibility names for active entry files.
    move("web/src/client/OperationsWorkspace.tsx", "web/src/client/ExportPanel.tsx")
    move("web/src/client/OperationsWorkspaceV2.tsx", "web/src/client/RunWorkspace.tsx")
    move("web/src/tools/sqlite-export-v2.ts", "web/src/tools/sqlite-export.ts")

    replace(
        "web/src/client/Workspace.tsx",
        'import { ExportPanel } from "./OperationsWorkspace.js";\nimport { ProceduresPanelV2, RunsPanelV2 } from "./OperationsWorkspaceV2.js";',
        'import { ExportPanel } from "./ExportPanel.js";\nimport { ProceduresPanelV2, RunsPanelV2 } from "./RunWorkspace.js";',
    )
    replace(
        "web/package.json",
        '"migrate:sqlite": "tsx src/tools/sqlite-export-v2.ts"',
        '"migrate:sqlite": "tsx src/tools/sqlite-export.ts"',
    )

    replace("AGENTS.md", "- `the-test-web-confirmed-spec-v1.0.0.md`", "- `docs/the-test-web-confirmed-spec-v1.0.0.md`")
    replace("AGENTS.md", "- `the-test-web-confirmed-spec-v1.1.0.md`", "- `docs/the-test-web-confirmed-spec-v1.1.0.md`")
    replace("AGENTS.md", "- `the-test-web-confirmed-spec-v1.2.0.md`", "- `docs/the-test-web-confirmed-spec-v1.2.0.md`")
    replace("AGENTS.md", "- `docs/AI_REVIEW_HISTORY.md`", "- `docs/AI_REVIEW_HISTORY.md`\n- `docs/SECURITY_ASSESSMENT.md`")

    rules = read("docs/codex-development-operation-rules.md")
    rules = rules.replace("the-test-web-confirmed-spec-v1.0.0.md", "docs/the-test-web-confirmed-spec-v1.0.0.md")
    rules = rules.replace("the-test-web-confirmed-spec-v1.1.0.md", "docs/the-test-web-confirmed-spec-v1.1.0.md")
    rules = rules.replace("the-test-web-confirmed-spec-v1.2.0.md", "docs/the-test-web-confirmed-spec-v1.2.0.md")
    rules = rules.replace("PROGRESS.md\n改善点.md\nSECURITY_ASSESSMENT.md", "docs/SECURITY_ASSESSMENT.md")
    write("docs/codex-development-operation-rules.md", rules)

    replace(
        "web/README.md",
        "確定仕様書 `the-test-web-confirmed-spec-v1.0.0.md`、追補`v1.1.0`、`v1.2.0`に基づくWeb基盤です。",
        "確定仕様書 `../docs/the-test-web-confirmed-spec-v1.0.0.md`、追補`v1.1.0`、`v1.2.0`に基づくWeb基盤です。",
    )

    gitignore = read(".gitignore").rstrip()
    if "web/data/" not in gitignore:
        gitignore += "\n\n# Web runtime and verification data\nweb/data/\nweb/.ci/\nweb/playwright-report/"
    write(".gitignore", gitignore + "\n")

    write(
        "README.md",
        """# ザ・テスト

テスト設計、テスト実行、証跡、手順書を管理するアプリケーションです。

## 構成

```text
.
├── src/             Electronデスクトップアプリ
├── web/             Web UI、Fastify API、MariaDB Migration、OpenShift運用
├── docs/            現行仕様、課題台帳、作業記録、セキュリティ資料
├── import-examples/ 現行インポート形式の例
├── compose.yaml     ローカルWeb環境
├── SPEC.md          全体の基礎仕様
└── AGENTS.md        開発作業の入口
```

`src/`と`web/`はどちらも現行のビルド対象です。Electron版は`.github/workflows/build-win.yaml`、Web版は`.github/workflows/web-ci.yaml`で独立して検証します。

## Web版の責務境界

- `web/src/client`: React UI
- `web/src/server`: Fastify API、認証、DBアクセス、業務処理
- `web/src/server/routes`: HTTP境界
- `web/src/shared`: UIとAPIで共有する型・検証規則
- `web/migrations`: 追記専用のMariaDB Migration
- `web/ops`: バックアップ、復元、保持処理
- `web/openapi.yaml`: API契約の唯一の正本

階層は責務の境界が必要な場合だけ追加します。置換済みの旧実装、レビュー作業用資料、生成済み証跡、テスト成果物はソースへ残しません。Git履歴が過去資料の保管場所です。

Web版の起動方法は`web/README.md`、OpenShift配備は`web/OPENSHIFT.md`を参照してください。開発前には`AGENTS.md`を確認してください。
""",
    )

    append_once(
        "docs/ISSUE_LEDGER.md",
        ISSUE_ID,
        """## Repository structure cleanup（2026-08-06）

| ID | 登録日 | 種別 | 優先度 | 状態 | 対象 | 原因 | 対応結果 | 検証 | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260806-005 | 2026-08-06 | TechnicalDebt / Maintainability | P2 | Ready for Verification | リポジトリ構成 | 旧レビュー資料、生成済み証跡、未参照コンポーネント、重複OpenAPI、作業名を含む現行ファイルが同居し、正本と実行対象を判別しにくかった。 | 生成物と履歴資料を削除し、仕様・セキュリティ資料を`docs/`へ集約した。未参照コードと重複ファイルを削除し、現行UIと移行CLIの主要ファイル名を責務名へ統一した。Electron版はWindows CIの現行対象のため維持した。 | 静的参照検査と通常Web CI待ち。 | User Request 2026-08-06 |""",
    )

    append_once(
        "docs/TASK_LOG.md",
        TASK_MARKER,
        """## TASK-20260806-002: リポジトリ構成整理

- 開始日時: 2026-08-06 11:41 JST
- 対応課題: ISSUE-20260806-005
- 対象: Pull Request #2 / `agent/folder-explorer-p2` → `codex/web-review`
- 担当: ChatGPT
- 状態: Ready for Verification

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

- 静的参照検査: 実施予定
- TypeCheck: 通常Web CI待ち
- Unit Test: 通常Web CI待ち
- Integration Test: 通常Web CI待ち
- Build: 通常Web CI待ち
- E2E: 通常Web CI待ち
- DB確認: DB変更なし

### 結果

- 状態: 通常Web CIによる独立検証待ち。""",
    )

    open_issues = read("docs/OPEN_ISSUES.md")
    expected = "Review 10で検出した製品不具合（ISSUE-20260806-001〜004）は修正・独立検証済みで、未解決の製品不具合はありません。"
    replacement = """Review 10で検出した製品不具合（ISSUE-20260806-001〜004）は修正・独立検証済みです。

- [ ] ISSUE-20260806-005 リポジトリ構成整理
  - 影響: 実行時の機能変更はない。参照切れやビルド対象漏れがないことを通常Web CIで確認する。
  - 完了条件: TypeCheck、Unit/API、MariaDB統合、Build、OpenShift互換起動、Chromium E2Eが成功する。"""
    if expected not in open_issues:
        raise RuntimeError("Current product-issue summary was not found")
    write("docs/OPEN_ISSUES.md", open_issues.replace(expected, replacement))

    review_history = read("docs/AI_REVIEW_HISTORY.md")
    review_history = review_history.replace(
        "- 独立CI: 実MariaDB・Chromiumを含むGitHub Actions実行待ち。",
        "- 独立CI: GitHub Actions run `31063129147`で実MariaDB、OpenShift互換コンテナ、Chromium E2Eを含む全工程成功。",
    )
    if "## Repository maintenance review" not in review_history:
        review_history = review_history.rstrip() + """

## Repository maintenance review

- 実施日: 2026-08-06
- 入力ソース: 現行ブランチの全ファイル一覧、import参照、package scripts、Docker/OpenShift/CI定義
- 総評: Electron版とWeb版は双方が現行CI対象であり維持する。履歴資料、生成物、未参照実装、重複契約ファイルは削除対象と判定した。
- 対応課題: ISSUE-20260806-005
- 状態: 通常Web CIによる独立検証待ち。
"""
    write("docs/AI_REVIEW_HISTORY.md", review_history)


def verify_cleanup() -> None:
    forbidden = (
        "Instructions",
        "function_order",
        "スクショ",
        "web/data",
        "web/src/client/DefinitionAdminPanel.tsx",
        "web/src/client/OperationsWorkspace.tsx",
        "web/src/client/OperationsWorkspaceV2.tsx",
        "web/src/tools/sqlite-export-v2.ts",
        "web/openapi-v1.0.0.yaml",
        "web/ops/purge.sql",
    )
    leftovers = [path for path in forbidden if (ROOT / path).exists()]
    if leftovers:
        raise RuntimeError(f"Cleanup leftovers: {leftovers}")

    required = (
        "README.md",
        "docs/SECURITY_ASSESSMENT.md",
        "docs/the-test-web-confirmed-spec-v1.0.0.md",
        "docs/the-test-web-confirmed-spec-v1.1.0.md",
        "docs/the-test-web-confirmed-spec-v1.2.0.md",
        "web/src/client/ExportPanel.tsx",
        "web/src/client/RunWorkspace.tsx",
        "web/src/tools/sqlite-export.ts",
        "web/openapi.yaml",
    )
    missing = [path for path in required if not (ROOT / path).is_file()]
    if missing:
        raise RuntimeError(f"Required files are missing: {missing}")

    for path in ROOT.rglob("package.json"):
        json.loads(path.read_text(encoding="utf-8"))

    unresolved: list[str] = []
    import_pattern = re.compile(r'(?:from\s+|import\s*)["\'](\.[^"\']+)["\']')
    for base in (ROOT / "web/src/client", ROOT / "web/src/server", ROOT / "web/src/shared", ROOT / "web/src/tools"):
        for source in base.rglob("*"):
            if source.suffix not in {".ts", ".tsx"}:
                continue
            for match in import_pattern.finditer(source.read_text(encoding="utf-8-sig")):
                specifier = match.group(1)
                target = source.parent / specifier
                if specifier.endswith(".js"):
                    stem = Path(str(target)[:-3])
                    candidates = (stem.with_suffix(".ts"), stem.with_suffix(".tsx"), stem / "index.ts", stem / "index.tsx")
                else:
                    candidates = (target, target.with_suffix(".ts"), target.with_suffix(".tsx"), target / "index.ts", target / "index.tsx")
                if not any(candidate.exists() for candidate in candidates):
                    unresolved.append(f"{source.relative_to(ROOT)} -> {specifier}")
    if unresolved:
        raise RuntimeError("Unresolved relative imports:\n" + "\n".join(unresolved))

    stale_tokens = ("OperationsWorkspace.js", "OperationsWorkspaceV2.js", "sqlite-export-v2.ts")
    stale_hits: list[str] = []
    for source in ROOT.rglob("*"):
        if not source.is_file() or ".git" in source.parts:
            continue
        if source.suffix.lower() not in {".ts", ".tsx", ".json", ".md", ".yaml", ".yml"}:
            continue
        text = source.read_text(encoding="utf-8-sig", errors="ignore")
        for token in stale_tokens:
            if token in text and source.name not in {"TASK_LOG.md", "ISSUE_LEDGER.md", "AI_REVIEW_HISTORY.md"}:
                stale_hits.append(f"{source.relative_to(ROOT)}: {token}")
    if stale_hits:
        raise RuntimeError("Stale active references:\n" + "\n".join(stale_hits))

    print("Repository cleanup verification: OK")


def finalize(run_id: str, artifact_name: str, artifact_id: str) -> None:
    completed_at = datetime.now(ZoneInfo("Asia/Tokyo")).strftime("%Y-%m-%d %H:%M JST")

    ledger = read("docs/ISSUE_LEDGER.md")
    old_row_prefix = f"| {ISSUE_ID} | 2026-08-06 | TechnicalDebt / Maintainability | P2 | Ready for Verification |"
    new_row_prefix = f"| {ISSUE_ID} | 2026-08-06 | TechnicalDebt / Maintainability | P2 | Verified |"
    if old_row_prefix not in ledger:
        raise RuntimeError("Pending repository cleanup issue row was not found")
    ledger = ledger.replace(old_row_prefix, new_row_prefix)
    ledger = ledger.replace(
        "| 静的参照検査と通常Web CI待ち。 | User Request 2026-08-06 |",
        f"| 静的参照検査に成功。GitHub Actions run `{run_id}`で通常Web CI全工程が成功。Artifact `{artifact_name}`（ID `{artifact_id}`）。 | User Request 2026-08-06 |",
    )
    write("docs/ISSUE_LEDGER.md", ledger)

    task_log = read("docs/TASK_LOG.md")
    before, marker, section = task_log.partition(TASK_MARKER)
    if not marker:
        raise RuntimeError("Repository cleanup task section was not found")
    section = marker + section
    section = section.replace(
        "- 担当: ChatGPT\n- 状態: Ready for Verification",
        f"- 担当: ChatGPT\n- 完了日時: {completed_at}\n- 状態: Completed",
        1,
    )
    section = section.replace("- 静的参照検査: 実施予定", "- 静的参照検査: 成功（未参照実装、重複契約、旧参照の残存なし）")
    section = section.replace("- TypeCheck: 通常Web CI待ち", f"- TypeCheck: GitHub Actions run `{run_id}`で成功")
    section = section.replace("- Unit Test: 通常Web CI待ち", f"- Unit Test: GitHub Actions run `{run_id}`で成功")
    section = section.replace("- Integration Test: 通常Web CI待ち", f"- Integration Test: GitHub Actions run `{run_id}`でMariaDB統合成功")
    section = section.replace("- Build: 通常Web CI待ち", f"- Build: GitHub Actions run `{run_id}`でProduction BuildとOpenShift互換コンテナBuildが成功")
    section = section.replace("- E2E: 通常Web CI待ち", f"- E2E: GitHub Actions run `{run_id}`でChromium E2E成功")
    section = section.replace(
        "- 状態: 通常Web CIによる独立検証待ち。",
        f"- GitHub Actions run `{run_id}`で通常Web CI全工程が成功した。\n- Artifact: `{artifact_name}`（ID `{artifact_id}`）。\n- {ISSUE_ID}を`Verified`へ変更した。\n- PR #2はDraft・未マージのまま維持した。",
    )
    write("docs/TASK_LOG.md", before + section)

    open_issues = read("docs/OPEN_ISSUES.md")
    pending = """Review 10で検出した製品不具合（ISSUE-20260806-001〜004）は修正・独立検証済みです。

- [ ] ISSUE-20260806-005 リポジトリ構成整理
  - 影響: 実行時の機能変更はない。参照切れやビルド対象漏れがないことを通常Web CIで確認する。
  - 完了条件: TypeCheck、Unit/API、MariaDB統合、Build、OpenShift互換起動、Chromium E2Eが成功する。"""
    resolved = "Review 10で検出した製品不具合（ISSUE-20260806-001〜004）とリポジトリ構成整理（ISSUE-20260806-005）は修正・独立検証済みで、未解決の製品不具合はありません。"
    if pending not in open_issues:
        raise RuntimeError("Pending OPEN_ISSUES block was not found")
    open_issues = open_issues.replace(pending, resolved)
    completed_marker = "## Completed verification\n\n"
    completed_line = f"- リポジトリ構成整理（ISSUE-20260806-005）: GitHub Actions run `{run_id}`でTypeCheck、Unit/API、MariaDB統合、バックアップ・復元、OpenShift互換起動、Chromium E2Eを含む全工程成功。Artifact `{artifact_name}`（ID `{artifact_id}`）。\n\n"
    open_issues = open_issues.replace(completed_marker, completed_marker + completed_line, 1)
    write("docs/OPEN_ISSUES.md", open_issues)

    history = read("docs/AI_REVIEW_HISTORY.md")
    history = history.replace(
        "- 状態: 通常Web CIによる独立検証待ち。",
        f"- 状態: GitHub Actions run `{run_id}`で独立検証済み。Artifact `{artifact_name}`（ID `{artifact_id}`）。",
        1,
    )
    write("docs/AI_REVIEW_HISTORY.md", history)

    append_once(
        "web/README.md",
        "## Repository cleanup verification",
        f"""## Repository cleanup verification

GitHub Actions run `{run_id}`で、ファイル整理後のTypeCheck、Unit/API、MariaDB統合、バックアップ・復元、Production Build、OpenShift互換起動、Chromium E2Eが成功しています。検証成果物はArtifact `{artifact_name}`（ID `{artifact_id}`）です。""",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("apply")
    sub.add_parser("verify")
    final = sub.add_parser("finalize")
    final.add_argument("--run-id", required=True)
    final.add_argument("--artifact-name", required=True)
    final.add_argument("--artifact-id", required=True)
    args = parser.parse_args()

    if args.command == "apply":
        apply_cleanup()
    elif args.command == "verify":
        verify_cleanup()
    else:
        finalize(args.run_id, args.artifact_name, args.artifact_id)


if __name__ == "__main__":
    main()
