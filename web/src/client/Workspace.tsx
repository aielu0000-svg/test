import { useEffect, useState } from "react";
import type { AuthUser, ProjectSummary } from "../shared/types.js";
import "./workspace.css";
import { ExportPanel } from "./OperationsWorkspace.js";
import { ProceduresPanelV2, RunsPanelV2 } from "./OperationsWorkspaceV2.js";
import { RecycleBinPanel } from "./RecycleBinPanel.js";
import { TestDesignEditor } from "./TestDesignEditor.js";

type Tab = "bulk" | "runs" | "procedures" | "excel" | "trash";
type Priority = "high" | "medium" | "low";

interface CaseSummary {
  id: string;
  title: string;
  priority: Priority;
  version: number;
  updatedAt: string;
}

interface Folder {
  id: string;
  parentId: string | null;
  name: string;
  version: number;
}

interface Scenario {
  id: string;
  folderId?: string | null;
  title: string;
  version: number;
  caseCount: number;
  updatedAt: string;
}

interface DataSet {
  id: string;
  name: string;
  scope: "common" | "case" | "scenario" | "run";
  version: number;
  updatedAt: string;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: init.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; requestId?: string } };
  if (!response.ok) {
    const detail = response.status >= 500 ? "サーバーで問題が発生しました。しばらくしてから再度お試しください。" : payload.error?.message ?? "通信に失敗しました。";
    throw new Error(detail + (payload.error?.requestId ? `（エラーID: ${payload.error.requestId}）` : ""));
  }
  return payload as T;
}

function ErrorNotice({ value }: { value: string }) {
  return value ? <p className="error-message" role="alert">{value}</p> : null;
}

export function Workspace({ project, user, onBack, onLogout }: { project: ProjectSummary; user: AuthUser; onBack: () => void; onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("bulk");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{ previewId: string; cases: unknown[]; errors: string[]; warnings: string[] } | null>(null);
  const [runScenarioId, setRunScenarioId] = useState("");
  const canEdit = user.role === "admin" || project.assigned;
  const query = `projectId=${encodeURIComponent(project.id)}`;

  async function refresh() {
    setError("");
    try {
      const [caseResult, folderResult, scenarioResult, dataResult] = await Promise.all([
        request<{ cases: CaseSummary[] }>(`/api/test-cases?${query}`),
        request<{ folders: Folder[] }>(`/api/folders?${query}`),
        request<{ scenarios: Scenario[] }>(`/api/scenarios?${query}`),
        request<{ dataSets: DataSet[] }>(`/api/data-sets?${query}`),
      ]);
      setCases(caseResult.cases); setFolders(folderResult.folders); setScenarios(scenarioResult.scenarios); setDataSets(dataResult.dataSets);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "読み込みに失敗しました。");
    }
  }
  useEffect(() => { void refresh(); }, [project.id]);

  async function previewExcel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("projectId", project.id);
    try { setPreview(await request("/api/imports/excel/preview", { method: "POST", body: form })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Excel検証に失敗しました。"); }
  }
  async function confirmExcel() {
    if (!preview) return;
    try { await request(`/api/imports/excel/${preview.previewId}/confirm`, { method: "POST" }); setPreview(null); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Excel取込に失敗しました。"); }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="workspace-title"><button onClick={onBack} className="back-button">← プロジェクト</button><div><p className="eyebrow">THE TEST WEB</p><h1>{project.name}</h1></div></div><div className="user-menu"><span>{user.displayName || user.username}</span><span className="permission-badge">{canEdit ? "編集可" : "閲覧のみ"}</span><button type="button" className="small" onClick={() => { setError(""); void onLogout().catch((reason) => setError(reason instanceof Error ? reason.message : "ログアウトに失敗しました。もう一度お試しください。")); }}>ログアウト</button></div></header>
    <nav className="workspace-tabs" aria-label="プロジェクト操作">{([["bulk", "テスト設計"], ["runs", "テスト実行"], ["procedures", "作業手順"], ["excel", "Excelから追加・エクスポート"], ["trash", "削除済み"]] as Array<[Tab, string]>).map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <main className="workspace-content">
      <ErrorNotice value={error} />
      {tab === "bulk" && <TestDesignEditor projectId={project.id} canEdit={canEdit} scenarios={scenarios} folders={folders} cases={cases}
        onChanged={refresh}
        onRun={(scenarioId) => { setRunScenarioId(scenarioId); setTab("runs"); }}
        onOpenExcel={() => setTab("excel")}
      />}
      {tab === "runs" && <RunsPanelV2 projectId={project.id} canEdit={canEdit} cases={cases} scenarios={scenarios} dataSets={dataSets} initialScenarioId={runScenarioId} />}
      {tab === "procedures" && <ProceduresPanelV2 projectId={project.id} canEdit={canEdit} />}
      {tab === "trash" && <RecycleBinPanel projectId={project.id} canEdit={canEdit} onChanged={refresh} />}
      {tab === "excel" && <section className="panel import-panel"><h2>Excelから追加</h2><ol><li>公式テンプレートをダウンロードします。</li><li>テストケースと手順のシートを編集します。</li><li>アップロードして検証結果を確認し、追加を確定します。</li></ol><div className="button-row"><a className="link-button" href="/api/imports/excel/template" download>公式テンプレート</a></div>{canEdit ? <form className="stack-form upload-form" onSubmit={previewExcel}><label>.xlsxファイル<input type="file" name="file" accept=".xlsx" required /></label><button className="primary">アップロードして検証</button></form> : <p className="muted">追加には編集権限が必要です。</p>}{preview && <div className="preview-result"><h3>検証結果</h3><p>{preview.cases.length}ケース</p>{preview.errors.map((item) => <p className="error-message" key={item}>{item}</p>)}{preview.warnings.map((item) => <p className="warning-message" key={item}>{item}</p>)}<button className="primary" disabled={preview.errors.length > 0} onClick={() => void confirmExcel()}>追加を確定</button></div>}</section>}
      {tab === "excel" && <ExportPanel projectId={project.id} canEdit={canEdit} />}
    </main>
  </div>;
}
