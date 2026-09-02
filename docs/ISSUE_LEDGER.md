# Issue Ledger

> 2026-09-02に台帳を再継続ファイル化した。2026-08-06以前の記録は `ISSUE_LEDGER_ARCHIVE_20260806.md`、2026-08-07〜2026-09-01の記録は `ISSUE_LEDGER_ARCHIVE_20260901.md` に内容を変更せず保存している。本ファイルは以後の追加課題を管理し、各archiveと合わせて一つの台帳として扱う。

## Active and historical issues

| ID | 登録日 | 種別 | 優先度 | 状態 | 対象 | 原因 | 対応結果 | 検証 | 関連レビュー |
|---|---|---|---|---|---|---|---|---|---|
| ISSUE-20260902-001 | 2026-09-02 | UX / Usability | P2 | In Progress | テスト実行の証跡パネル・フィードバック | 初回修正では`.evidence-card`のshadowだけを削除したが、外側の`section.panel.evidence-panel`は共通`.panel`のshadowを継承したままだった。また上余白を`.success-message`だけへ限定したため、同じ位置に出る`.error-message`には適用されなかった。 | 追修正で証跡パネルだけ共通shadowを上書きし、パネル直下の成功・エラー両メッセージへ同じ上余白を適用する。証跡保存/API/DB仕様は変更しない。 | 実装後にWeb CIとChromium E2Eでパネル・カードのcomputed shadow、成功/エラー両方の実寸間隔を確認予定。 | User Request 2026-09-02 |
| ISSUE-20260902-002 | 2026-09-02 | Security / TechnicalDebt | P2 | In Progress | `sanitize-html`依存とWeb Node runtime | Web CIのnpm auditで`sanitize-html` 2.17.5にGHSA-g8qq-57p8-ggw5（moderate）が報告された。現行allowlistはSVG/SMILを許可していないが、脆弱版依存自体が残っている。修正版2.17.7はNode >=22.12.0を要求する。 | `sanitize-html`を2.17.7へ更新し、Webのローカル/CI/コンテナNodeを22.12.0へ揃え、CI audit gateをmoderateへ引き上げる。SMIL URI-list payloadの回帰Unitを追加する。 | 実装後にnpm audit、TypeCheck、Unit/API、MariaDB統合、Build、OpenShift互換コンテナ、Chromium E2Eを実行予定。 | User Request 2026-09-02 |
| ISSUE-20260902-003 | 2026-09-02 | UX / Specification | P2 | In Progress | ユーザー初回利用ガイド | 現行Web版には主要機能を順番に説明する初回ナビゲーションがなく、新規ユーザーが画面構成を自力で把握する必要がある。 | 各ユーザー単位で完了状態をDBへ保持し、初回パスワード変更後に主要機能を1項目ずつ説明するガイドを表示する。完了または明示的スキップ後は再表示しない。管理者専用機能は管理者だけに説明する。 | 実装後にTypeCheck、Unit/API、Migration/Schema validation、MariaDB統合、Build、Chromium E2Eで初回表示・完了後非表示・ユーザー分離・権限差を確認する。 | User Request 2026-09-02 |
