# AI Review History

## Review 7 follow-up

- 実施日: 2026-08-01
- 入力ソース: Instructions/review7.md と追加修正依頼
- 総評: Review 7の主要対応は完了。機能別E2E本走とフォルダ操作は残課題として移管した。

| 指摘ID | 優先度 | 課題ID | 対応状況 | 検証結果 |
|---|---|---|---|---|
| R7F-01 | P0 | ISSUE-20260801-002 | Closed | 隔離MariaDB+Chromiumで主要実行導線を確認。 |
| R7F-02 | P0 | ISSUE-20260801-001 | Closed | 011補修Migration、起動時構造検証、新規/部分適用MariaDB統合を追加。 |
| R7F-03 | P1 | ISSUE-20260801-007 | Closed | 完了後方針AをAPI、UI、監査、MariaDB統合で統一。 |
| R7F-04 | P1 | ISSUE-20260801-003 | Closed | 画像実体検証、参照判定、クリーンアップを実装。 |
| R7F-05 | P1 | ISSUE-20260801-002 | Closed | 開始拒否監査、version同期、同時更新200/409を確認。 |
| R7F-06 | P1 | ISSUE-20260801-008 | Ready for Verification | 9機能別specへ分割済み。Chromium本走はE2E資格情報待ち。 |
| R7F-07 | P2 | ISSUE-20260801-009 | Open | 未解決はフォルダ操作のみ。アップロード上限表示は対応済み。 |

## Review 8: codex-review利用可否確認

- 実施日: 2026-08-01
- 結果: 当時は外部送信承認がなく実レビューを実行できなかった。
- 今回: ユーザーから外部read-onlyレビューの明示承認を受けたため、Review 9対象コミットで再実行する。

## Review 9

- 実施日: 2026-08-03
- 入力ソース: Instructions/codex-review9-followup-fix-request.md
- 対象: Web版のみ。Electron版、フォルダ操作、DB/ストレージ構成変更は対象外。
- 実装前検証: TypeCheck成功、Unit/API 26成功・MariaDB統合1件skip、実MariaDB統合成功、Build成功、Playwrightは認証情報未設定で明示的失敗。
- 対応状況: ISSUE_LEDGERのReview 9 current stateを正とする。
- 外部read-onlyレビュー: Codex CLIで2回試行したが、判定前にタイムアウトした。ユーザー指示により再試行を中止し、ok判定は未取得。
## Review 10

- 実施日: 2026-08-06
- 入力ソース: 現行PR headの全体静的レビュー、確定仕様v1.0.0/v1.1.0、ユーザーの50項目判定
- 対象: Webクライアント、API、MariaDB Migration、証跡・画像、import、保持、バックアップ・復元、OpenShift、試験、運用文書
- 対応方針: REV-031〜033のみ現行仕様として受容し、その他はユーザー指定の仕様変更を含め修正する。

| 範囲 | 判定 | 対応 |
|---|---|---|
| REV-001〜009 | 修正 | ローカル隠蔽と404成功扱いを廃止し、復元なしの完全削除、任意理由、監査保持、永続確認試験へ変更。 |
| REV-010〜017 | 修正 | request transaction、rollback補償、削除状態確認、画像派生元、file cleanup queue、参照保持型purgeへ変更。 |
| REV-018〜023 | 修正・仕様変更 | 更新停止付き整合バックアップ、manifest/checksum、02:00、正常2世代、220GiB、手動バックアップ・復元を追加。 |
| REV-024〜030 | 修正 | completed最終4状態、not_run日時解除、破損JSON検知、一括snapshot、最後の管理者保護、ログイン上限を追加。 |
| REV-031〜033 | 仕様 | アーカイブ編集可、未割当参照可、4文字パスワード方針を維持。 |
| REV-034〜041 | 修正 | 送信元検証・セキュリティヘッダー、import claim、権限先行upload、Migration checksum/status/lockを追加。 |
| REV-042〜048 | 修正 | 文字化け、UI state、誤テスト、台帳、busy制御、監査原子性を修正。 |
| REV-049〜050 | 仕様変更 | multipartを1ファイル100MiBへ制限し、同名有効プロジェクトを拒否。 |

- 事前静的検証: TypeScript構文、Shell構文、YAML parse、差分空白検査に成功。
- 独立CI: GitHub Actions run `31063129147`で実MariaDB、OpenShift互換コンテナ、Chromium E2Eを含む全工程成功。

## Repository maintenance review

- 実施日: 2026-08-06
- 入力ソース: 現行ブランチの全ファイル一覧、import参照、package scripts、Docker/OpenShift/CI定義
- 総評: Electron版とWeb版は双方が現行CI対象であり維持する。履歴資料、生成物、未参照実装、重複契約ファイルは削除対象と判定した。
- 対応課題: ISSUE-20260806-005
- 状態: 通常Web CIによる独立検証待ち。
