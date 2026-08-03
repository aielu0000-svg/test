# Open Issues

## Product issues

現在、Review 9、P2フォルダ操作、Excelテスト設計インポート、フォルダ重複UI・オーバーレイ表示に属する未解決の製品不具合はない。

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
  - GitHub Actions run `30844134585`の`npm ci`でhigh severityが1件報告された。アプリの試験は成功しているが、`npm audit`で依存経路と修正版の互換性を確認する。
- `TestDesignEditor.tsx`の通信エラー型統合
  - 画面固有request helperは400/409の編集競合情報を扱うため維持している。共通化する場合は、競合情報を保持できる共通エラー型の導入を先に行う。

## Completed verification

- Review 9: GitHub Actions run `30804989151`
  - TypeCheck、Unit/API 29件、MariaDB統合2件、Build、Web起動、Chromium E2E 11件が成功。
- P2フォルダ操作: GitHub Actions run `30808270002`
  - TypeCheck、Unit/API 32件、MariaDB統合2件、Build、Web起動、Chromium E2E 12件が成功。
  - 右クリック、F2、キーボード、複数選択・移動、パンくず、DnD、循環移動防止、削除理由入力を確認。
- Excel確定・フォルダ表示修正: GitHub Actions run `30841994179`
  - TypeCheck、Unit/API 35件、MariaDB統合2件、Build、Web起動、Chromium E2E 14件が成功。
- Excelテスト設計全体取込・保守整理: GitHub Actions run `30844134585`
  - TypeCheck、Unit/API 37件、MariaDB統合2件、Build、Web起動、Chromium E2E 14件が成功。
  - 最新テンプレートの生成、旧テンプレート拒否、テスト・確認項目・手順・フォルダ・タグ・個別データ・共通データの登録と画面復元を確認。
  - 未使用`objectBody` import、旧フォルダUI用CSS、補正専用CSSファイルを削除・統合した。
  - Artifact: `web-ci-30844134585-1`（ID `8868021343`）。

## Review policy

- 本環境では`codex-review`を使用しない。
- ローカル差分確認、仕様照合、静的解析、自動テスト、実MariaDB・Chromiumを使う独立CIを代替レビューとする。
