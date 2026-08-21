# Open Issues

## Product issues

2026-08-21のExcel公式テンプレート視認性改善（ISSUE-20260821-001）と、簡略3シート・枠線を維持した実セル記入例化（ISSUE-20260821-002）は修正・独立検証済みです。2026-08-07のテスト複製・実行画像・証跡・テスト設計・Excel導線改善（ISSUE-20260807-001〜003）も修正・独立検証済みで、現在追加された未解決の製品不具合はありません。

Review 10で検出した製品不具合（ISSUE-20260806-001〜004）とリポジトリ構成整理（ISSUE-20260806-005）も修正・独立検証済みです。

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
- `TestDesignEditor.tsx`の通信エラー型統合
  - 画面固有request helperは400/409の編集競合情報を扱うため維持している。共通化する場合は、競合情報を保持できる共通エラー型の導入を先に行う。
- 既存MariaDBボリュームの認証修復を使うDocker統合試験
  - 修復スクリプトの構文、新規Compose設定、空パスワード拒否はCI検証済み。無パスワードで初期化した使い捨てボリュームを修復し、無パスワード接続拒否まで確認する試験は追加の堅牢化候補とする。
- 実OpenShiftクラスターでの配備確認
  - Kustomize生成、任意UID、読み取り専用root filesystem、Migration、readiness、全回帰試験はCI検証済み。実クラスターではStorageClass、Red Hat Registry pull権限、Route、NetworkPolicyを確認する。

## Completed verification

- Excel公式テンプレートの簡略3シート・枠線維持と実セル記入例（ISSUE-20260821-002）: GitHub Actions run `32448865787`でnpm audit 0件、TypeCheck、Unit/API 53件（2件skip）、Excel表示Unit 2件、MariaDB統合2件、Migration/Schema validation、バックアップ・復元、OpenShift互換起動、Chromium E2E 21件を含む全工程成功。`入力`2〜3行目と`共通データ`2行目を実例とし、継続行のテスト名・確認項目名は真の空セルで確認。Artifact `web-ci-32448865787-1`（ID `9435028667`、SHA256 `6c0d1033ac4d8f94f285b1b5d96d9ff9cc2baa1904f04e1d6124465f6d2a73cd`）。

- Excel公式テンプレートの枠線・全項目記入例（ISSUE-20260821-001）: GitHub Actions run `32445558693`でnpm audit 0件、TypeCheck、Unit/API 53件（2件skip）、Excel表示Unit 2件、MariaDB統合2件、Migration/Schema validation、バックアップ・復元、OpenShift互換起動、Chromium E2E 21件を含む全工程成功。Artifact `web-ci-32445558693-1`（ID `9433980395`、SHA256 `cc63d38f0d3c8a08a0d5913652aa71d5f994a90e4ddaca298085d568ebbd4701`）。

- テスト複製・実行画像・証跡・テスト設計・Excel導線改善（ISSUE-20260807-001〜003）: GitHub Actions run `31169231328`でnpm audit 0件、TypeCheck、Unit/API 52件（2件skip）、MariaDB統合2件、Migration/Schema validation、バックアップ・復元、OpenShift互換起動、Chromium E2E 21件を含む全工程成功。Artifact `web-ci-31169231328-1`（ID `9007154348`、SHA256 `f3f392f083c939bd1356398085459549832afb6901da00427978e1db74e5b028`）。

- リポジトリ構成整理（ISSUE-20260806-005）: GitHub Actions run `31067948455`でTypeCheck、Unit/API、MariaDB統合、バックアップ・復元、OpenShift互換起動、Chromium E2Eを含む全工程成功。Artifact `web-ci-31067948455-1`（ID `8954562403`）。

- Review 10（ISSUE-20260806-001〜004）: GitHub Actions run `31062560323`でUnit/API 49件、MariaDB統合2件、バックアップ・復元・正常2世代保持、OpenShift任意UID起動、Chromium E2E 19件を含む全工程成功。Artifact ID `8952679751`。

- 管理・テスト設計・実行・エクスポート改善（ISSUE-20260805-003〜006）: GitHub Actions run `30997068195`でUnit/API 43件、MariaDB統合2件、OpenShift任意UID起動、Chromium E2E 19件を含む全工程成功。

- OpenShiftコンテナ・運用基盤（ISSUE-20260805-002）: GitHub Actions run `30976592066`でKustomize生成、任意UID・read-only root filesystem起動、Unit/API 43件、MariaDB統合2件、Chromium E2E 16件を含む全工程成功。

- 業務導線改善（ISSUE-20260805-001）: GitHub Actions run `30973373586`でUnit/API 42件、MariaDB統合2件、Chromium E2E 16件を含む全工程成功。

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
- 完了済み実行の証跡表示・依存監査: GitHub Actions run `30848395288`
  - `npm ci`と`npm audit --audit-level=high`は脆弱性0件。
  - TypeCheck、Unit/API 37件、MariaDB統合2件、Build、Web起動、Chromium E2E 15件が成功。
  - 完了済み実行間の切替で以前のrun case IDを使用しないことを確認。
  - Artifact: `web-ci-30848395288-1`（ID `8869654688`）。
- Docker MariaDB認証: GitHub Actions run `30853941396`
  - Compose構文・環境変数展開と既存ボリューム修復スクリプト構文が成功。
  - `npm ci`と`npm audit --audit-level=high`は脆弱性0件。
  - TypeCheck、Unit/API 40件、MariaDB統合2件、Build、Web起動、Chromium E2E 15件が成功。
  - DBポート・Webポートのlocalhost限定、非空DBパスワード、認証付きhealthcheck、空パスワード拒否を確認。

## Review policy

- 本環境では`codex-review`を使用しない。
- ローカル差分確認、仕様照合、静的解析、自動テスト、実MariaDB・Chromiumを使う独立CIを代替レビューとする。
