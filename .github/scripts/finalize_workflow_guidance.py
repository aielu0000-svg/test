from pathlib import Path

ledger = Path("docs/ISSUE_LEDGER.md")
ledger_text = ledger.read_text(encoding="utf-8")
old_row = "| ISSUE-20260805-001 | 2026-08-05 | Usability | P2 | Ready for Verification | 業務導線 | テスト設計から実行作成、作業再開、未実行移動、完了前確認、不合格・ブロック再実行の導線が分断され、業務上のクリックと見落としが多かった。 | 保存と実行作成を一操作へ統合し、ダッシュボードから実行へ直接復帰、次の未実行への保存移動、状態別完了前チェック、失敗項目だけの再実行draft作成を追加した。 | TypeCheck、Unit/API、Buildと新規Chromium E2Eを実施し、最終GitHub Actionsで確認する。 | User Request 2026-08-05 |"
new_row = "| ISSUE-20260805-001 | 2026-08-05 | Usability | P2 | Verified | 業務導線 | テスト設計から実行作成、作業再開、未実行移動、完了前確認、不合格・ブロック再実行の導線が分断され、業務上のクリックと見落としが多かった。 | 保存と実行作成を一操作へ統合し、ダッシュボードから実行へ直接復帰、次の未実行への保存移動、状態別完了前チェック、失敗項目だけの再実行draft作成を追加した。 | GitHub Actions run 30973373586で依存監査0件、TypeCheck、Unit/API 42件（2件skip）、MariaDB統合2件、Build、Web起動、Chromium E2E 16件が成功。 | User Request 2026-08-05 |"
if old_row not in ledger_text:
    raise SystemExit("ISSUE-20260805-001 row was not found")
ledger.write_text(ledger_text.replace(old_row, new_row, 1), encoding="utf-8")

task = Path("docs/TASK_LOG.md")
task_text = task.read_text(encoding="utf-8")
section_start = task_text.index("## TASK-20260805-001:")
prefix = task_text[:section_start]
section = task_text[section_start:]
section = section.replace("- 状態: Ready for Verification", "- 状態: Verified", 1)
section = section.replace(
    "- 最終結果とrun IDはGitHub Actions完了後に追記する。",
    "- GitHub Actions run `30973198333`では既存E2E 15件と新規導線の実処理は成功したが、最後の未選択確認が部分一致で2要素に一致し、テストコードだけが失敗した。\n"
    "- チェックボックスを名前の完全一致で取得するよう修正した。\n"
    "- GitHub Actions run `30973373586`で依存監査0件、TypeCheck、Unit/API 42件（2件skip）、MariaDB統合2件、Build、Web起動、Chromium E2E 16件、DB・監査・Playwright成果物保存が成功した。\n"
    "- Migration追加なし。既存データの変換なし。\n"
    "- Artifact: `web-ci-30973373586-1`、ID `8917372044`、SHA256 `2eccc4b8ef3aea4ef9262bbf63d2efc36637ded72d5fa01271d56b57d09e12eb`。",
    1,
)
task.write_text((prefix + section).rstrip() + "\n", encoding="utf-8")

open_issues = Path("docs/OPEN_ISSUES.md")
open_text = open_issues.read_text(encoding="utf-8")
pending = "- 業務導線改善（ISSUE-20260805-001）: 最終GitHub Actions確認待ち。"
verified = "- 業務導線改善（ISSUE-20260805-001）: GitHub Actions run `30973373586`でUnit/API 42件、MariaDB統合2件、Chromium E2E 16件を含む全工程成功。"
if pending not in open_text:
    raise SystemExit("pending OPEN_ISSUES entry was not found")
open_issues.write_text(open_text.replace(pending, verified, 1), encoding="utf-8")

readme = Path("web/README.md")
readme_text = readme.read_text(encoding="utf-8").rstrip()
if "## 日常業務の導線" not in readme_text:
    readme_text += """

## 日常業務の導線

- テスト設計では、未保存の内容を保存してそのテストを選択済みの実行準備へ直接進めます。
- ダッシュボードの「作業を再開」から、下書きまたは実行中の対象実行へ直接戻れます。
- 実行中は「保存して次の未実行へ」で、完了済み項目を飛ばして次の未実行・実行中項目へ移動します。
- 完了前チェックでは、合格、不合格、ブロック、スキップ、未実行・実行中の件数を確認し、該当項目へ移動できます。
- 完了済み実行に不合格またはブロックがある場合、その元確認項目だけを選択した再実行の下書きを作成できます。前回の結果と証跡は新しい実行へコピーしません。
"""
readme.write_text(readme_text.rstrip() + "\n", encoding="utf-8")
