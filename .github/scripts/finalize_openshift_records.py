from pathlib import Path

ISSUE_ID = "ISSUE-20260805-002"
TASK_ID = "TASK-20260805-002"
RUN_ID = "30976592066"
ARTIFACT = "web-ci-30976592066-1"
ARTIFACT_ID = "8918512909"
ARTIFACT_SHA = "c3f3b65303b13665af89cbb5edbe411bfa3798da9105da0343eccbcb94e30465"

ledger = Path("docs/ISSUE_LEDGER.md")
ledger_text = ledger.read_text(encoding="utf-8")
issue_row = (
    "| ISSUE-20260805-002 | 2026-08-05 | Operation / Security | P1 | Verified | OpenShift deployment | "
    "既存のコンテナとOpenShift定義は任意UID、読み取り専用root filesystem、内部ビルド、Route経由のプロキシ、永続化、バックアップを一体で検証していなかった。 | "
    "任意UID対応のマルチステージイメージ、BuildConfig/ImageStream、MariaDB StatefulSet、Route、PVC、NetworkPolicy、Secret運用、バックアップ・保持CronJob、graceful shutdownを追加した。 | "
    "GitHub Actions run 30976592066でKustomize生成、任意UID・read-only root filesystem起動、Unit/API 43件、MariaDB統合2件、Chromium E2E 16件を含む全工程成功。実OpenShiftクラスターへの適用は接続情報がないため未実施。 | User Request 2026-08-05 |"
)
if ISSUE_ID not in ledger_text:
    lines = ledger_text.splitlines()
    insert_at = next(
        (index + 1 for index, line in enumerate(lines) if line.startswith("| ISSUE-20260805-001 |")),
        None,
    )
    if insert_at is None:
        raise SystemExit("ISSUE-20260805-001 row was not found")
    lines.insert(insert_at, issue_row)
    ledger.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


task = Path("docs/TASK_LOG.md")
task_text = task.read_text(encoding="utf-8").rstrip()
if TASK_ID not in task_text:
    task_text += f"""

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

GitHub Actions run `{RUN_ID}`:

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
- Artifact: `{ARTIFACT}`（ID `{ARTIFACT_ID}`、SHA256 `{ARTIFACT_SHA}`）

### 結果

- `anyuid`または`privileged` SCCを付与せずに動作できるコンテナとマニフェストになった。
- HTTPS Route、Secure Cookie、Router proxy、永続ストレージ、DB、バックアップまでOpenShift配備に必要な構成を追加した。
- 実OpenShiftクラスターへの適用は、クラスター接続情報・権限・StorageClassが提供されていないため未実施。CIではOpenShift想定制約でコンテナを実起動した。
- 実配備時は`registry.redhat.io`のpull権限、証跡・バックアップ用RWX StorageClass、MariaDB用RWO StorageClassを確認する。
- PR #2はDraft・未マージのまま維持した。
"""
    task.write_text(task_text.rstrip() + "\n", encoding="utf-8")


open_issues = Path("docs/OPEN_ISSUES.md")
open_text = open_issues.read_text(encoding="utf-8")
hardening = """- 実OpenShiftクラスターでの配備確認
  - Kustomize生成、任意UID、読み取り専用root filesystem、Migration、readiness、全回帰試験はCI検証済み。実クラスターではStorageClass、Red Hat Registry pull権限、Route、NetworkPolicyを確認する。
"""
if "実OpenShiftクラスターでの配備確認" not in open_text:
    marker = "## Completed verification\n"
    if marker not in open_text:
        raise SystemExit("Completed verification heading was not found")
    open_text = open_text.replace(marker, hardening + "\n" + marker, 1)

completed = (
    f"- OpenShiftコンテナ・運用基盤（{ISSUE_ID}）: GitHub Actions run `{RUN_ID}`でKustomize生成、"
    "任意UID・read-only root filesystem起動、Unit/API 43件、MariaDB統合2件、Chromium E2E 16件を含む全工程成功。"
)
if completed not in open_text:
    marker = "## Completed verification\n"
    open_text = open_text.replace(marker, marker + "\n" + completed + "\n", 1)
open_issues.write_text(open_text.rstrip() + "\n", encoding="utf-8")
