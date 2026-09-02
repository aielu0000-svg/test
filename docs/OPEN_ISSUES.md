# Open Issues

## Product issues

現在追加された未解決の製品不具合はありません。

ISSUE-20260902-001の証跡成功メッセージ余白・カード影は修正・独立検証済みです。証跡登録後の緑色成功メッセージへ1remの上余白を設け、証跡カード固有のshadowを除去してborderだけを維持しました。API、DB、Migration、証跡保存仕様は変更していません。

2026-09-01以前の製品課題・完了検証の詳細は `OPEN_ISSUES_ARCHIVE_20260901.md`、`ISSUE_LEDGER_ARCHIVE_20260901.md` と既存archiveを参照してください。

## Additional hardening candidates

以下は既知の製品不具合ではなく、追加の堅牢化・保守候補として管理する。

- `sanitize-html` のmoderate advisory 1件
  - 2026-09-02のWeb CIで`npm audit --audit-level=high`自体は成功したが、moderate advisoryが1件報告された。今回のUI変更とは無関係。依存関係と実利用箇所への影響を確認したうえで更新を検討する。
- OS権限を操作したファイル削除失敗の強制注入
  - 現在の実装は回収失敗を構造化ログへ記録し、黙って成功扱いにしない。
- JPEG、WebP、SVG、破損画像を組み合わせた形式別API試験の拡張
  - Sharpによる実体検証、PNG再エンコード、SVG・破損画像拒否は実装済み。
- 全種類の部分破損DBを対象とするスキーマ検証試験の拡張
  - 型、NULL、default、索引順、FK、ON DELETEの構造検証は実装済み。
- GitHub公式ActionのNode.js 20ランタイム廃止警告への追随
  - アプリ自体はNode.js 20系で検証済み。Actionの次期メジャー版公開後に更新する。
- `TestDesignEditor.tsx`の通信エラー型統合
  - 画面固有request helperは400/409の編集競合情報を扱うため維持している。共通化する場合は、競合情報を保持できる共通エラー型の導入を先に行う。
- 既存MariaDBボリュームの認証修復を使うDocker統合試験
  - 修復スクリプトの構文、新規Compose設定、空パスワード拒否はCI検証済み。無パスワードで初期化した使い捨てボリュームを修復し、無パスワード接続拒否まで確認する試験は追加の堅牢化候補とする。
- 実OpenShiftクラスターでの配備確認
  - Kustomize生成、任意UID、読み取り専用root filesystem、Migration、readiness、全回帰試験はCI検証済み。実クラスターではStorageClass、Red Hat Registry pull権限、Route、NetworkPolicyを確認する。

## Completed verification

- 証跡成功メッセージ余白・カード影（ISSUE-20260902-001）: 製品head `9a93fd2fef278d5a179f6d9539250a90dde9e723` のGitHub Actions run `33583803359`でTypeCheck、Unit/API 55件成功・2件skip、MariaDB統合2件成功、Migration/Schema validation、Backup/restore/retention、Production Build、OpenShift互換コンテナ、任意UID/read-only root filesystem、Chromium E2E 24件成功。`evidence.spec.ts`でカードのcomputed `boxShadow`が`none`、成功メッセージとの間隔が12px以上であることを実寸回帰確認。Artifact `web-ci-33583803359-1`（ID `9829383625`、SHA256 `328808b259051f2e78055986f637a3a18f865210d4172398c6ab86e8dad27c91`、485452 bytes）。

## Review policy

- 本環境では`codex-review`を使用しない。
- ローカル差分確認、仕様照合、静的解析、自動テスト、実MariaDB・Chromiumを使う独立CIを代替レビューとする。
