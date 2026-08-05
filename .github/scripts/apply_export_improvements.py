from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    return text.replace(old, new, 1)


# Server export
path = Path("web/src/server/routes/exports.ts")
text = path.read_text(encoding="utf-8-sig")
text = replace_once(text, 'import { randomUUID } from "node:crypto";\n', 'import { randomUUID } from "node:crypto";\nimport { readFile } from "node:fs/promises";\n', "fs import")
text = replace_once(text, 'import ExcelJS from "exceljs";\n', 'import ExcelJS from "exceljs";\nimport sharp from "sharp";\n', "sharp import")
marker = '''function asRows(value: unknown, field: string): Array<Record<string, unknown>> {
'''
helpers = r'''
const runStatusLabels: Record<string, string> = {
  draft: "下書き", in_progress: "実行中", completed: "完了",
  not_run: "未実行", pass: "合格", fail: "不合格", blocked: "ブロック", skip: "スキップ",
};

function safeFilename(value: unknown): string {
  return String(value ?? "the-test-run").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim().slice(0, 100) || "the-test-run";
}

function styleRunSheet(sheet: ExcelJS.Worksheet, widths: number[]): void {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17498E" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(1).height = 28;
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    row.alignment = { vertical: "top", wrapText: true };
    row.eachCell((cell) => { cell.border = { bottom: { style: "hair", color: { argb: "FFD9E0EA" } } }; });
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: widths.length } };
}

async function buildRunExcel(db: Database, projectId: string, runId: string): Promise<{ filename: string; buffer: Buffer }> {
  const runRows = await db.query<Record<string, unknown>>(
    `SELECT r.*, u.username AS assignee_username, u.display_name AS assignee_display_name
       FROM test_runs r LEFT JOIN users u ON u.id = r.assignee_id
      WHERE r.id = ? AND r.project_id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [runId, projectId],
  );
  const run = runRows[0];
  if (!run) throw notFound();
  const [scenarioRows, caseRows, stepRows, dataSetRows, dataItemRows, evidenceRows] = await Promise.all([
    db.query<Record<string, unknown>>(
      "SELECT id, title, status, position, excluded_at, exclusion_reason FROM run_scenario_snapshots WHERE test_run_id = ? ORDER BY position, created_at", [runId],
    ),
    db.query<Record<string, unknown>>(
      `SELECT c.*, s.title AS scenario_title, u.username AS assignee_username, u.display_name AS assignee_display_name
         FROM run_case_snapshots c
         LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
         LEFT JOIN users u ON u.id = c.assignee_id
        WHERE c.test_run_id = ? ORDER BY COALESCE(s.position, 999999), c.position, c.created_at`, [runId],
    ),
    db.query<Record<string, unknown>>(
      "SELECT run_case_snapshot_id, step_no, action_text, expected_result FROM run_step_snapshots WHERE run_case_snapshot_id IN (SELECT id FROM run_case_snapshots WHERE test_run_id = ?) ORDER BY run_case_snapshot_id, step_no", [runId],
    ),
    db.query<Record<string, unknown>>(
      "SELECT id, name, scope, description, revision_no FROM run_data_set_snapshots WHERE test_run_id = ? ORDER BY revision_no, name", [runId],
    ),
    db.query<Record<string, unknown>>(
      "SELECT run_data_set_snapshot_id, item_no, label, value_text, memo FROM run_data_item_snapshots WHERE run_data_set_snapshot_id IN (SELECT id FROM run_data_set_snapshots WHERE test_run_id = ?) ORDER BY run_data_set_snapshot_id, item_no", [runId],
    ),
    db.query<Record<string, unknown>>(
      `SELECT e.id, e.run_case_snapshot_id, e.description, e.current_version,
              v.original_filename, v.content_type, v.byte_size, v.sha256, v.stored_path,
              c.title AS case_title, s.title AS scenario_title
         FROM evidence_files e
         JOIN evidence_versions v ON v.evidence_file_id = e.id AND v.version_no = e.current_version
         JOIN run_case_snapshots c ON c.id = e.run_case_snapshot_id
         LEFT JOIN run_scenario_snapshots s ON s.id = c.run_scenario_snapshot_id
        WHERE e.project_id = ? AND c.test_run_id = ? AND e.deleted_at IS NULL
        ORDER BY COALESCE(s.position, 999999), c.position, e.updated_at`, [projectId, runId],
    ),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "The Test";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `テスト実行 ${String(run.name)}`;

  const summary = workbook.addWorksheet("実行概要");
  summary.columns = [{ width: 24 }, { width: 72 }];
  const summaryRows: Array<[string, unknown]> = [
    ["実行名", run.name], ["状態", runStatusLabels[String(run.status)] ?? run.status],
    ["環境", run.environment_name], ["ビルド", run.build_name],
    ["担当者", run.assignee_display_name || run.assignee_username || "未割当"],
    ["メモ", run.memo], ["開始日時", run.started_at], ["完了日時", run.completed_at],
    ["改訂番号", run.current_revision], ["出力日時", new Date().toISOString()],
  ];
  for (const [label, value] of summaryRows) summary.addRow([label, spreadsheetCell(value)]);
  summary.getColumn(1).font = { bold: true };
  summary.eachRow((row) => { row.alignment = { vertical: "top", wrapText: true }; });
  summary.getRow(1).height = 24;

  const scenarioById = new Map(scenarioRows.map((row) => [String(row.id), row]));
  const stepsByCase = new Map<string, Array<Record<string, unknown>>>();
  for (const step of stepRows) {
    const key = String(step.run_case_snapshot_id);
    stepsByCase.set(key, [...(stepsByCase.get(key) ?? []), step]);
  }
  const resultSheet = workbook.addWorksheet("実行結果");
  resultSheet.addRow(["No.", "テスト", "確認項目", "優先度", "結果", "操作手順", "期待結果", "実績結果", "備考", "担当者", "実行日時", "見る場所", "前提条件"]);
  let resultNo = 0;
  for (const item of caseRows) {
    if (item.excluded_at) continue;
    resultNo += 1;
    const steps = stepsByCase.get(String(item.id)) ?? [];
    resultSheet.addRow([
      resultNo,
      item.scenario_title || (item.run_scenario_snapshot_id ? scenarioById.get(String(item.run_scenario_snapshot_id))?.title : "単独確認項目") || "",
      spreadsheetCell(item.title), spreadsheetCell(item.priority), runStatusLabels[String(item.status)] ?? spreadsheetCell(item.status),
      steps.map((step) => `${step.step_no}. ${String(step.action_text ?? "")}`).join("\n"),
      steps.map((step) => `${step.step_no}. ${String(step.expected_result ?? "")}`).join("\n"),
      spreadsheetCell(item.actual_result), spreadsheetCell(item.notes),
      spreadsheetCell(item.assignee_display_name || item.assignee_username || ""), spreadsheetCell(item.executed_at),
      spreadsheetCell(item.view_location), spreadsheetCell(item.preconditions),
    ]);
  }
  styleRunSheet(resultSheet, [7, 24, 32, 10, 12, 42, 42, 36, 30, 18, 22, 28, 32]);

  const dataSetById = new Map(dataSetRows.map((row) => [String(row.id), row]));
  const dataSheet = workbook.addWorksheet("テストデータ");
  dataSheet.addRow(["データセット", "種別", "No.", "ラベル", "値", "メモ", "対象確認項目"]);
  for (const item of dataItemRows) {
    const dataSet = dataSetById.get(String(item.run_data_set_snapshot_id));
    const memo = String(item.memo ?? "");
    const sourceCaseId = memo.startsWith("__case__:") ? memo.slice("__case__:".length) : "";
    const target = sourceCaseId ? caseRows.filter((row) => String(row.source_test_case_id ?? "") === sourceCaseId).map((row) => String(row.title)).join(" / ") : "共通";
    dataSheet.addRow([
      spreadsheetCell(dataSet?.name), sourceCaseId ? "確認項目データ" : "共通データ", Number(item.item_no),
      spreadsheetCell(item.label), spreadsheetCell(item.value_text), sourceCaseId ? "" : spreadsheetCell(item.memo), target,
    ]);
  }
  styleRunSheet(dataSheet, [26, 16, 7, 24, 42, 30, 36]);

  const evidenceSheet = workbook.addWorksheet("証跡");
  evidenceSheet.addRow(["No.", "テスト", "確認項目", "説明", "ファイル名", "種類", "サイズ(bytes)", "SHA-256", "画像"]);
  evidenceSheet.getColumn(9).width = 46;
  let evidenceNo = 0;
  for (const evidence of evidenceRows) {
    evidenceNo += 1;
    const row = evidenceSheet.addRow([
      evidenceNo, spreadsheetCell(evidence.scenario_title || "単独確認項目"), spreadsheetCell(evidence.case_title),
      spreadsheetCell(evidence.description), spreadsheetCell(evidence.original_filename), spreadsheetCell(evidence.content_type),
      String(evidence.byte_size ?? ""), spreadsheetCell(evidence.sha256),
      String(evidence.content_type ?? "").startsWith("image/") ? "画像を右欄へ埋め込み" : "画像以外の証跡",
    ]);
    if (String(evidence.content_type ?? "").startsWith("image/")) {
      try {
        const source = await readFile(String(evidence.stored_path));
        const image = await sharp(source).rotate().resize({ width: 900, height: 600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        const imageId = workbook.addImage({ buffer: image, extension: "png" });
        const rowNumber = row.number;
        evidenceSheet.addImage(imageId, { tl: { col: 8.08, row: rowNumber - 0.92 }, br: { col: 8.92, row: rowNumber - 0.08 }, editAs: "oneCell" });
        row.height = 190;
      } catch {
        row.getCell(9).value = "画像の埋め込みに失敗しました。証跡メタデータは保持されています。";
      }
    }
  }
  styleRunSheet(evidenceSheet, [7, 24, 32, 28, 28, 20, 16, 34, 46]);
  evidenceSheet.getColumn(9).width = 46;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { filename: `${safeFilename(run.name)}-実行結果.xlsx`, buffer };
}

'''
text = replace_once(text, marker, helpers + marker, "run workbook helpers")
route_marker = '''  app.post("/api/imports/json/preview", async (request) => {
'''
route = r'''  app.get("/api/test-runs/:id/export.xlsx", async (request, reply) => {
    const actor = await requireUser(request, db, config);
    const projectId = projectIdFrom(request);
    await requireProjectRead(db, actor, projectId);
    const runId = routeParam(request);
    const exported = await buildRunExcel(db, projectId, runId);
    await writeAudit(db, request, actor, { action: "test_run_excel_exported", entityType: "test_run", entityId: runId, projectId });
    const disposition = `attachment; filename="the-test-run.xlsx"; filename*=UTF-8''${encodeURIComponent(exported.filename)}`;
    return reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", disposition).send(exported.buffer);
  });

'''
if route not in text:
    text = replace_once(text, route_marker, route + route_marker, "run export route")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# Export UI
path = Path("web/src/client/OperationsWorkspace.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(text, 'import { useState } from "react";\n', 'import { useEffect, useState } from "react";\n', "useEffect import")
start = text.index("export function ExportPanel(")
replacement = r'''interface ExportRunOption { id: string; name: string; status: "draft" | "in_progress" | "completed"; updatedAt: string }

export function ExportPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [target, setTarget] = useState<"project" | "design" | "run">("project");
  const [format, setFormat] = useState<"json" | "xlsx" | "csv" | "md">("json");
  const [runs, setRuns] = useState<ExportRunOption[]>([]);
  const [runId, setRunId] = useState("");
  const [content, setContent] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void request<{ runs: ExportRunOption[] }>(`/api/test-runs?projectId=${encodeURIComponent(projectId)}&limit=100`).then((result) => {
      setRuns(result.runs);
      setRunId((current) => current && result.runs.some((item) => item.id === current) ? current : result.runs[0]?.id ?? "");
    }).catch((cause) => setMessage(cause instanceof Error ? cause.message : "テスト実行を読み込めませんでした。"));
  }, [projectId]);
  useEffect(() => {
    if (target === "project" && !["json", "xlsx"].includes(format)) setFormat("json");
    if (target === "design" && !["xlsx", "csv", "md"].includes(format)) setFormat("xlsx");
    if (target === "run") setFormat("xlsx");
  }, [target]);
  const projectLinks: Record<string, string> = {
    json: `/api/projects/${projectId}/export`, xlsx: `/api/projects/${projectId}/export.xlsx`,
    csv: `/api/projects/${projectId}/export.csv`, md: `/api/projects/${projectId}/export.md`,
  };
  const downloadHref = target === "run" ? (runId ? `/api/test-runs/${runId}/export.xlsx?projectId=${encodeURIComponent(projectId)}` : "") : projectLinks[format];
  const selectedRun = runs.find((item) => item.id === runId);
  async function preview() {
    try {
      const payload = JSON.parse(content);
      const result = await request<{ previewId: string; counts: Record<string, number>; warnings: string[] }>("/api/imports/json/preview", { method: "POST", body: JSON.stringify({ projectId, payload }) });
      setPreviewId(result.previewId); setMessage(`検証済み: ${JSON.stringify(result.counts)}`);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "JSON検証に失敗しました。"); }
  }
  async function confirm() {
    try { const result = await request<{ imported: number }>(`/api/imports/json/${previewId}/confirm`, { method: "POST" }); setMessage(`${result.imported}件のID対応を作成して取り込みました。`); setPreviewId(""); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "取込に失敗しました。"); }
  }
  return <div className="workspace-grid export-workspace"><section className="panel export-panel"><div className="section-heading"><div><p className="eyebrow">EXPORT</p><h2>エクスポート</h2><p className="muted">出力したい内容を選択してください。</p></div></div>
    <div className="export-targets" role="radiogroup" aria-label="エクスポート対象"><label className={target === "project" ? "selected" : ""}><input type="radio" name="export-target" checked={target === "project"} onChange={() => setTarget("project")} /><strong>プロジェクト全体</strong><span>移行・保管向け。定義、実行、データ、証跡manifestを含みます。</span></label><label className={target === "design" ? "selected" : ""}><input type="radio" name="export-target" checked={target === "design"} onChange={() => setTarget("design")} /><strong>テスト設計</strong><span>確認項目と操作手順を共有・確認するための出力です。</span></label><label className={target === "run" ? "selected" : ""}><input type="radio" name="export-target" checked={target === "run"} onChange={() => setTarget("run")} /><strong>テスト実行</strong><span>結果、データ、証跡画像を1つのExcelへまとめます。</span></label></div>
    {target === "run" ? <div className="export-options"><label>テスト実行<select value={runId} onChange={(event) => setRunId(event.target.value)}><option value="">選択してください</option>{runs.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.status === "completed" ? "完了" : item.status === "in_progress" ? "実行中" : "下書き"}）</option>)}</select></label><div className="export-summary"><strong>{selectedRun?.name || "テスト実行を選択してください"}</strong><span>Excel：実行概要／実行結果／テストデータ／証跡</span></div></div> : <div className="export-options"><label>形式<select value={format} onChange={(event) => setFormat(event.target.value as typeof format)}>{target === "project" && <><option value="json">正式JSON</option><option value="xlsx">Excel</option></>}{target === "design" && <><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="md">Markdown</option></>}</select></label><div className="export-summary"><strong>{target === "project" ? "プロジェクト全体" : "テスト設計"}</strong><span>{format === "json" ? "完全移行用の正式形式" : format === "xlsx" ? "複数シートのExcel" : format === "csv" ? "確認項目中心のCSV" : "確認項目と手順のMarkdown"}</span></div></div>}
    {downloadHref ? <a className="link-button primary export-download" href={downloadHref} download>選択した内容をダウンロード</a> : <button className="primary export-download" disabled>テスト実行を選択してください</button>}
  </section><section className="panel"><h2>正式JSONインポート</h2>{canEdit ? <><textarea className="json-import" placeholder="schema_version付きJSONを貼り付け" value={content} onChange={(event) => { setContent(event.target.value); setPreviewId(""); }} /><div className="button-row"><button onClick={() => void preview()}>プレビュー検証</button>{previewId && <button className="primary" onClick={() => void confirm()}>確定</button>}</div></> : <p className="muted">取込には編集権限が必要です。</p>}{message && <p>{message}</p>}</section></div>;
}
'''
text = text[:start] + replacement
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# Styles
path = Path("web/src/client/operations.css")
text = path.read_text(encoding="utf-8")
styles = r'''
.export-workspace { align-items: start; }
.export-panel { display: grid; gap: 1.1rem; }
.export-targets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
.export-targets label { display: grid; grid-template-columns: auto 1fr; gap: .25rem .55rem; align-content: start; min-height: 112px; padding: .9rem; border: 1px solid #dfe5ee; border-radius: 12px; cursor: pointer; background: #fff; }
.export-targets label.selected { border-color: #2769bd; box-shadow: 0 0 0 2px rgba(39, 105, 189, .14); background: #f6f9ff; }
.export-targets input { margin-top: .25rem; }
.export-targets strong { color: #24324a; }
.export-targets span { grid-column: 2; color: #6b7689; font-size: .82rem; line-height: 1.45; }
.export-options { display: grid; grid-template-columns: minmax(240px, .7fr) 1fr; gap: 1rem; align-items: end; padding: 1rem; border-radius: 10px; background: #f8faff; }
.export-summary { display: grid; gap: .25rem; min-height: 44px; align-content: center; }
.export-summary span { color: #6b7689; font-size: .84rem; }
.export-download { justify-self: start; }
@media (max-width: 760px) { .export-targets { grid-template-columns: 1fr; } .export-options { grid-template-columns: 1fr; } }
'''
if ".export-targets" not in text:
    text = text.rstrip() + "\n" + styles
path.write_text(text.rstrip() + "\n", encoding="utf-8")
