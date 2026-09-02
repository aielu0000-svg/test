# Issue Ledger

> 2026-09-02に台帳を再継続ファイル化した。2026-08-06以前の記録は `ISSUE_LEDGER_ARCHIVE_20260806.md`、2026-08-07〜2026-09-01の記録は `ISSUE_LEDGER_ARCHIVE_20260901.md` に内容を変更せず保存している。本ファイルは以後の追加課題を管理し、各archiveと合わせて一つの台帳として扱う。

## Active and historical issues

| ID | 登録日 | 種別 | 優先度 | 状態 | 対象 | 原因 | 対応結果 | 検証 | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260902-001 | 2026-09-02 | UX / Usability | P2 | Verified | テスト実行の証跡カード・成功メッセージ | 証跡登録後の緑色成功メッセージが直前の証跡カードにほぼ接して表示され、上下の区切りが弱かった。また証跡カードだけに独自の`box-shadow`があり、周辺の境界線中心のUIから浮いて見えていた。 | `operations.css`で証跡パネル直下の成功メッセージへ`var(--space-4, 1rem)`の上余白を追加し、`.evidence-card`の独自shadowを削除してborderのみを維持した。証跡保存・画像編集・削除操作、API、DB、Migrationは変更していない。`evidence.spec.ts`へcomputed styleが`box-shadow: none`であることと、カード下端から成功メッセージまで12px以上空くことの回帰検証を追加した。 | 製品head `9a93fd2fef278d5a179f6d9539250a90dde9e723` のGitHub Actions run `33583803359`でTypeCheck、Unit/API 55件成功・2件skip、MariaDB統合2件成功、Migration/Schema validation、Backup/restore/retention、Production Build、OpenShift互換コンテナ、任意UID/read-only root filesystem、Chromium E2E 24件成功。npm auditのhigh以上ゲートは成功。Artifact `web-ci-33583803359-1`（ID `9829383625`、SHA256 `328808b259051f2e78055986f637a3a18f865210d4172398c6ab86e8dad27c91`、485452 bytes）。 | User Request 2026-09-02 |
