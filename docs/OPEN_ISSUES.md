# Open Issues

## Product issues

現在、Review 9、P2フォルダ操作、Excelインポート確定、フォルダ重複UI・オーバーレイ表示に属する未解決の製品不具合はない。

## Additional hardening candidates

以下は既知の不具合ではなく、追加の堅牢化・保守候補として管理する。

- OS権限を操作したファイル削除失敗の強制注入
  - 現在の実装は回収失敗を構造化ログへ記録し、黙って成功扱いにしない。
- JPEG、WebP、SVG、破損画像を組み合わせた形式別API試験の拡張
  - Sharpによる実体検証、PNG再エンコード、SVG・破損画像拒否は実装済み。
- 全種類の部分破損DBを対象とするスキーマ検証試験の拡張
  - 型、NULL、default、索引順、FK、ON DELETEの構造検証は実装済み。
- GitHub公式ActionのNode.js 20ランタイム廃止警告への追随
  - アプリ自体はNode.js 20.20.0で検証済み。Actionの次期メジャー版公開後に更新する。
- npm依存関係の脆弱性確認
  - GitHub Actions run `30840831542`の`npm ci`でhigh severityが1件報告された。アプリの試験は成功しているが、`npm audit`で依存経路と修正版の互換性を確認する。
- 未使用コード候補の整理
  - `web/src/server/routes/excel.ts`の未使用`objectBody` import。
  - `web/src/client/test-design.css`の旧フォルダUI用selector候補（`.design-folder-create`、`.design-test-select`、`.design-folder-contents`、`.design-item-menu`）。削除前に全参照検索と画面回帰確認を行う。
  - `TestDesignEditor.tsx`の画面固有request helperは400/409の編集競合情報を扱うため現時点では維持し、共通化する場合はエラー型の統合を先に行う。

## Completed verification

- Review 9: GitHub Actions run `30804989151`
  - TypeCheck、Unit/API 29件、MariaDB統合2件、Build、Web起動、Chromium E2E 11件が成功。
- P2フォルダ操作: GitHub Actions run `30808270002`
  - TypeCheck、Unit/API 32件、MariaDB統合2件、Build、Web起動、Chromium E2E 12件が成功。
  - 右クリック、F2、キーボード、複数選択・移動、パンくず、DnD、循環移動防止、削除理由入力を確認。
- Excelインポート・フォルダ表示修正: GitHub Actions run `30840831542`
  - TypeCheck、Unit/API 35件、MariaDB統合2件、Build、Web起動、Chromium E2E 14件が成功。
  - 公式Excelテンプレートのプレビュー・確定・DB/API照合、重複操作非表示、複数選択DnD、右クリック削除、ダイアログ全面被覆を確認。

## Review policy

- 本環境では`codex-review`を使用しない。
- ローカル差分確認、仕様照合、静的解析、自動テスト、実MariaDB・Chromiumを使う独立CIを代替レビューとする。
