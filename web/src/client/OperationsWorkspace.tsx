import { useState } from "react";
import "./operations.css";
import { request } from "./api.js";

export function ExportPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [content, setContent] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [message, setMessage] = useState("");
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
  return <div className="workspace-grid"><section className="panel"><h2>エクスポート</h2><p className="muted">正式JSONは完全移行用です。CSV・Markdownはケース中心、Excelは定義・実行・証跡manifestの複数シートを出力します。</p><div className="export-buttons"><a className="link-button primary" href={`/api/projects/${projectId}/export`} download>正式JSON</a><a className="link-button" href={`/api/projects/${projectId}/export.csv`} download>CSV</a><a className="link-button" href={`/api/projects/${projectId}/export.md`} download>Markdown</a><a className="link-button" href={`/api/projects/${projectId}/export.xlsx`} download>Excel</a></div></section><section className="panel"><h2>正式JSONインポート</h2>{canEdit ? <><textarea className="json-import" placeholder="schema_version付きJSONを貼り付け" value={content} onChange={(event) => { setContent(event.target.value); setPreviewId(""); }} /><div className="button-row"><button onClick={() => void preview()}>プレビュー検証</button>{previewId && <button className="primary" onClick={() => void confirm()}>確定</button>}</div></> : <p className="muted">取込には編集権限が必要です。</p>}{message && <p>{message}</p>}</section></div>;
}
