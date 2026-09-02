import { useEffect, useState } from "react";
import "./operations.css";
import { request } from "./api.js";

// Run Markdown deliberately stays self-contained so saved files remain reviewable without adjacent assets.
interface ExportRunOption { id: string; name: string; status: "draft" | "in_progress" | "completed"; updatedAt: string }
type ExportFormat = "json" | "xlsx" | "csv" | "md";

export function ExportPanel({ projectId }: { projectId: string }) {
  const [target, setTarget] = useState<"project" | "design" | "run">("project");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [runs, setRuns] = useState<ExportRunOption[]>([]);
  const [runId, setRunId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void request<{ runs: ExportRunOption[] }>(`/api/test-runs?projectId=${encodeURIComponent(projectId)}&limit=100`).then((result) => {
      setRuns(result.runs);
      setRunId((current) => current && result.runs.some((item) => item.id === current) ? current : result.runs[0]?.id ?? "");
      setMessage("");
    }).catch((cause) => setMessage(cause instanceof Error ? cause.message : "テスト実行を読み込めませんでした。"));
  }, [projectId]);
  useEffect(() => {
    if (target === "project" && !["json", "xlsx"].includes(format)) setFormat("json");
    if (target === "design" && !["xlsx", "csv", "md"].includes(format)) setFormat("xlsx");
    if (target === "run" && !["xlsx", "md"].includes(format)) setFormat("xlsx");
  }, [target, format]);
  const projectLinks: Record<string, string> = {
    json: `/api/projects/${projectId}/export`, xlsx: `/api/projects/${projectId}/export.xlsx`,
    csv: `/api/projects/${projectId}/export.csv`, md: `/api/projects/${projectId}/export.md`,
  };
  const runLinks: Record<"xlsx" | "md", string> = runId ? {
    xlsx: `/api/test-runs/${runId}/export.xlsx?projectId=${encodeURIComponent(projectId)}`,
    md: `/api/test-runs/${runId}/export.md?projectId=${encodeURIComponent(projectId)}`,
  } : { xlsx: "", md: "" };
  const downloadHref = target === "run" ? runLinks[format === "md" ? "md" : "xlsx"] : projectLinks[format];
  const selectedRun = runs.find((item) => item.id === runId);
  return <section className="panel export-panel transfer-card">
    <div className="section-heading"><div><p className="eyebrow">出力する</p><h2>エクスポート</h2><p className="muted">渡す相手や用途に合わせて、出力する内容を選びます。</p></div></div>
    <div className="export-targets" role="radiogroup" aria-label="エクスポート対象">
      <label className={target === "project" ? "selected" : ""}><input type="radio" name="export-target" checked={target === "project"} onChange={() => setTarget("project")} /><strong>プロジェクト全体</strong><span>保管や環境移行向け。定義・実行・データをまとめて出力します。</span></label>
      <label className={target === "design" ? "selected" : ""}><input type="radio" name="export-target" checked={target === "design"} onChange={() => setTarget("design")} /><strong>テスト設計</strong><span>確認項目と操作手順をレビュー・共有するための出力です。</span></label>
      <label className={target === "run" ? "selected" : ""}><input type="radio" name="export-target" checked={target === "run"} onChange={() => setTarget("run")} /><strong>テスト実行</strong><span>実行結果をExcel、または客先確認向けの単一Markdownで出力します。</span></label>
    </div>
    {target === "run" ? <div className="export-options">
      <label>テスト実行<select value={runId} onChange={(event) => setRunId(event.target.value)}><option value="">選択してください</option>{runs.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.status === "completed" ? "完了" : item.status === "in_progress" ? "実行中" : "下書き"}）</option>)}</select></label>
      <label>形式<select value={format === "md" ? "md" : "xlsx"} onChange={(event) => setFormat(event.target.value as ExportFormat)}><option value="xlsx">Excel</option><option value="md">Markdown（画像埋め込み・単一ファイル）</option></select></label>
      <div className="export-summary"><strong>{selectedRun?.name || "テスト実行を選択してください"}</strong><span>{format === "md" ? "目次／結果別リンク／シナリオ別結果／証跡画像と説明。テストデータと技術情報は含みません。" : "実行概要／実行結果／テストデータ／証跡を複数シートへ出力します。"}</span></div>
    </div> : <div className="export-options">
      <label>形式<select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>{target === "project" && <><option value="json">完全保管JSON</option><option value="xlsx">Excel</option></>}{target === "design" && <><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="md">Markdown</option></>}</select></label>
      <div className="export-summary"><strong>{target === "project" ? "プロジェクト全体" : "テスト設計"}</strong><span>{format === "json" ? "システム保管・移行向けの完全形式です。通常のテスト追加にはExcelを使用してください。" : format === "xlsx" ? "複数シートのExcel" : format === "csv" ? "確認項目中心のCSV" : "確認項目と手順のMarkdown"}</span></div>
    </div>}
    {downloadHref ? <a className="link-button primary export-download" href={downloadHref} download>選択した内容をダウンロード</a> : <button className="primary export-download" disabled>テスト実行を選択してください</button>}
    {message && <p className="error-message" role="alert">{message}</p>}
  </section>;
}
