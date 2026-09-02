# Open Issues

## Product issues

- [ ] ISSUE-20260902-001 証跡パネルの残存shadowとフィードバック余白
  - 影響: 外側の証跡パネルに共通`.panel`由来のshadowが残り、同位置に表示されるエラー文は成功文と異なり直前コンテンツへ詰まる。
  - 対応中: 証跡パネルだけshadowを無効化し、直下success/error messageへ同一上余白を適用する。
  - 完了条件: Chromium E2Eでパネル・カードのcomputed shadowが`none`、成功/エラー両メッセージの上側間隔が12px以上であることを確認する。

2026-09-01以前の製品課題・完了検証の詳細は `OPEN_ISSUES_ARCHIVE_20260901.md`、`ISSUE_LEDGER_ARCHIVE_20260901.md` と既存archiveを参照してください。

## Additional hardening candidates

- [ ] ISSUE-20260902-002 `sanitize-html` moderate advisory
  - 影響: Web CIのnpm auditでGHSA-g8qq-57p8-ggw5がmoderateとして報告される。現行allowlistはSVG/SMILを許可していないが脆弱版依存が残る。
  - 対応中: `sanitize-html` 2.17.7へ更新し、要件に合わせてWeb runtimeをNode 22.12.0へ更新、audit gateをmoderateへ引き上げる。
  - 完了条件: `npm audit --audit-level=moderate`が成功し、TypeCheck、Unit/API、MariaDB統合、Build、OpenShift互換コンテナ、Chromium E2Eが全て成功する。
- OS権限を操作したファイル削除失敗の強制注入
  - 現在の実装は回収失敗を構造化ログへ記録し、黙って成功扱いにしない。
- JPEG、WebP、SVG、破損画像を組み合わせた形式別API試験の拡張
  - Sharpによる実体検証、PNG再エンコード、SVG・破損画像拒否は実装済み。
- 全種類の部分破損DBを対象とするスキーマ検証試験の拡張
  - 型、NULL、default、索引順、FK、ON DELETEの構造検証は実装済み。
- GitHub公式ActionのNode.js 20ランタイム廃止警告への追随
  - これはGitHub Action自体の実行ランタイム警告であり、今回更新するアプリNode runtimeとは別。Actionの次期メジャー版公開後に更新する。
- `TestDesignEditor.tsx`の通信エラー型統合
  - 画面固有request helperは400/409の編集競合情報を扱うため維持している。共通化する場合は、競合情報を保持できる共通エラー型の導入を先に行う。
- 既存MariaDBボリュームの認証修復を使うDocker統合試験
  - 修復スクリプトの構文、新規Compose設定、空パスワード拒否はCI検証済み。
- 実OpenShiftクラスターでの配備確認
  - Kustomize生成、任意UID、読み取り専用root filesystem、Migration、readiness、全回帰試験はCI検証済み。実クラスターではStorageClass、Red Hat Registry pull権限、Route、NetworkPolicyを確認する。

## Completed verification

- 初回の証跡成功メッセージ余白・カード影調整: 製品head `9a93fd2fef278d5a179f6d9539250a90dde9e723` のGitHub Actions run `33583803359`で全工程成功。ただし利用者確認で外側パネルshadowとerror message余白が残ることが判明し、ISSUE-20260902-001を追修正中。

## Review policy

- 本環境では`codex-review`を使用しない。
- ローカル差分確認、仕様照合、静的解析、自動テスト、実MariaDB・Chromiumを使う独立CIを代替レビューとする。
