import { readFile, writeFile } from "node:fs/promises";

async function update(path, transform) {
  const current = await readFile(path, "utf8");
  const next = transform(current);
  if (next === current) return false;
  await writeFile(path, next, "utf8");
  return true;
}

await update("web/src/server/routes/exports.ts", (text) => {
  const importMarker = 'import { normalizeDatabaseRecord } from "../jsonNormalization.js";\n';
  if (!text.includes('from "../runMarkdown.js"')) {
    if (!text.includes(importMarker)) throw new Error("exports import marker not found");
    text = text.replace(importMarker, `${importMarker}import { buildRunMarkdown } from "../runMarkdown.js";\n`);
  }
  if (!text.includes('/api/test-runs/:id/export.md')) {
    const routeMarker = '  app.post("/api/imports/json/preview", async (request) => {';
    if (!text.includes(routeMarker)) throw new Error("exports route marker not found");
    const route = `  app.get("/api/test-runs/:id/export.md", async (request, reply) => {
    const actor = await requireUser(request, db, config);
    const projectId = projectIdFrom(request);
    await requireProjectRead(db, actor, projectId);
    const runId = routeParam(request);
    const exported = await buildRunMarkdown(db, projectId, runId);
    await writeAudit(db, request, actor, { action: "test_run_markdown_exported", entityType: "test_run", entityId: runId, projectId });
    const disposition = \`attachment; filename="the-test-run.md"; filename*=UTF-8''\${encodeURIComponent(exported.filename)}\`;
    return reply.header("Content-Type", "text/markdown; charset=utf-8")
      .header("Content-Disposition", disposition).send(exported.markdown);
  });

`;
    text = text.replace(routeMarker, `${route}${routeMarker}`);
  }
  return text;
});

await update("web/openapi.yaml", (text) => {
  if (text.includes("/api/test-runs/{id}/export.md:")) return text;
  const marker = `    delete:
      tags: [runs]
      responses: { '200': { description: Soft deleted } }
  /api/test-runs/{id}/revisions:
`;
  if (!text.includes(marker)) throw new Error("OpenAPI insertion marker not found");
  const addition = `    delete:
      tags: [runs]
      responses: { '200': { description: Soft deleted } }
  /api/test-runs/{id}/export.xlsx:
    get:
      tags: [exports]
      description: 実行概要、結果、テストデータ、証跡をExcelで出力する。
      parameters:
        - { $ref: '#/components/parameters/id' }
        - { $ref: '#/components/parameters/projectId' }
      responses:
        '200':
          description: Excel workbook
          content:
            application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
              schema: { type: string, format: binary }
  /api/test-runs/{id}/export.md:
    get:
      tags: [exports]
      description: 単一Markdownへ実行概要、結果別目次、シナリオ別結果、画像証跡と説明を出力する。テストデータと証跡メタデータは含めない。
      parameters:
        - { $ref: '#/components/parameters/id' }
        - { $ref: '#/components/parameters/projectId' }
      responses:
        '200':
          description: 内部リンクとData URI画像を含む単一Markdown文書
          content:
            text/markdown:
              schema: { type: string }
  /api/test-runs/{id}/revisions:
`;
  return text.replace(marker, addition);
});

await update("docs/TASK_LOG.md", (text) => {
  if (text.includes("## 2026-08-06 テスト実行Markdownエクスポート")) return text;
  return `${text.trimEnd()}\n\n## 2026-08-06 テスト実行Markdownエクスポート\n\n- 要求: テスト実行を単一Markdownで保存・客先提示できるようにする。\n- 実施: 結果別・シナリオ別・確認項目別の固定内部リンクを持つ目次を追加した。\n- 実施: 証跡画像を縮小PNGのData URIとして単一Markdown内へ埋め込んだ。\n- 実施: Markdownからテストデータ、ファイル名、MIME type、サイズ、SHA-256、内部IDを除外した。\n- 実施: Export UI、OpenAPI、監査イベント、単体テストを更新した。\n- UI: テスト設計UI本体は変更せず、HTMLモック評価後に実装する。\n`;
});

await update("docs/ISSUE_LEDGER.md", (text) => {
  if (text.includes("## ISSUE-20260806-006 テスト実行Markdown出力")) return text;
  return `${text.trimEnd()}\n\n## ISSUE-20260806-006 テスト実行Markdown出力\n\n- Status: Implemented\n- Request: 単一Markdown、内部目次、画像と説明のみの証跡、客先提示を優先した可読性。\n- Resolution: \`/api/test-runs/{id}/export.md\`を追加し、結果区分・シナリオ・確認項目へ固定アンカーで移動可能にした。画像はData URI埋め込みとし、テストデータと証跡メタデータは出力しない。\n- Verification: Unit test、TypeCheck、Production Build、Web CIで確認する。\n`;
});
