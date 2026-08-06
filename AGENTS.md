# ザ・テスト 開発指示

このリポジトリで作業する前に、必ず次を読んで遵守すること。

- `docs/codex-development-operation-rules.md`
- `SPEC.md`
- `docs/the-test-web-confirmed-spec-v1.0.0.md`
- `docs/the-test-web-confirmed-spec-v1.1.0.md`
- `docs/the-test-web-confirmed-spec-v1.2.0.md`
- `docs/ISSUE_LEDGER.md`
- `docs/OPEN_ISSUES.md`
- `docs/AI_REVIEW_HISTORY.md`
- `docs/SECURITY_ASSESSMENT.md`

## 必須ルール

1. 適用済みMigrationを変更しない。
2. DB変更は必ず新しい連番Migrationで行う。
3. 作業開始時に課題管理台帳と未解決課題を確認する。
4. タスク開始時と終了時に`docs/TASK_LOG.md`を更新する。
5. 発生した不具合、原因、対応、検証結果を`docs/ISSUE_LEDGER.md`へ記録する。
6. 未解決事項を`docs/OPEN_ISSUES.md`へ記録する。
7. レビュー指摘の対応状況を`docs/AI_REVIEW_HISTORY.md`へ記録する。
8. 実行していないテストを成功と報告しない。
9. TypeCheck、単体テスト、統合テスト、ビルド、E2Eの実施状況を明記する。
10. コード変更だけで完了とせず、受け入れ条件と実動作を確認する。

詳細なルールは`docs/codex-development-operation-rules.md`を正とする。
