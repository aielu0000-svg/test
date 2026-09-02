import { useEffect, useState } from "react";
import type { AuthUser, ProjectSummary } from "../shared/types.js";
import "./workspace.css";
import { request } from "./api.js";
import { ExportPanel } from "./ExportPanel.js";
import { RunsPanelV2 } from "./RunWorkspace.js";
import { RecycleBinPanel } from "./RecycleBinPanel.js";
import { TestDesignEditor } from "./TestDesignEditor.js";

type Tab = "bulk" | "runs" | "excel" | "trash";
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

interface ExcelPreview {
  previewId: string;
  scenarios: Array<{ scenarioKey: string; title: string; cases: unknown[] }>;
  errors: string[];
  warnings: string[];
  counts: { scenarios: number; cases: number };
}

function ErrorNotice({ value }: { value: string }) {
  return value ? <p className="error-message" role="alert">{value}</p> : null;
}

export function Workspace({ project, user, initialRunId, onBack, onLogout }: { project: ProjectSummary; user: AuthUser; initialRunId?: string; onBack: () => void; onLogout: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>(initialRunId ? "runs" : "bulk");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [dataSets, setDataSets] = useState<DataSet[]>([]);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
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
    setError("");
    const form = new FormData(event.currentTarget);
    try { setPreview(await request<ExcelPreview>(`/api/imports/excel/preview?projectId=${encodeURIComponent(project.id)}`, { method: "POST", body: form })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Excel検証に失敗しました。"); }
  }
  async function confirmExcel() {
    if (!preview) return;
    setError("");
    try {
      await request(`/api/imports/excel/${preview.previewId}/confirm`, { method: "POST" });
      setPreview(null);
      await refresh();
      setTab("bulk");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Excel取込に失敗しました。");
    }
  }

  return <div className="app-shell">
    <header className="topbar"><div className="workspace-title"><button onClick={onBack} className="back-button">← プロジェクト</button><div><p className="eyebrow">THE TEST WEB</p><h1>{project.name}</h1></div></div><div className="user-menu"><span>{user.displayName || user.username}</span><span className="permission-badge">{canEdit ? "編集可" : "閲覧のみ"}</span><button type="button" className="small" onClick={() => { setError(""); void onLogout().catch((reason) => setError(reason instanceof Error ? reason.message : "ログアウトに失敗しました。もう一度お試しください。")); }}>ログアウト</button></div></header>
    <nav className="workspace-tabs" aria-label="プロジェクト操作">{([["bulk", "テスト設計"], ["runs", "テスト実行"], ["excel", "Excelから追加・エクスポート"], ["trash", "削除済み"]] as Array<[Tab, string]>).map(([key, label]) => <button type="button" key={key} className={tab === key ? "active" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => setTab(key)}>{label}</button>)}</nav>
    <main className="workspace-content">
      <ErrorNotice value={error} />
      {tab === "bulk" && <TestDesignEditor projectId={project.id} canEdit={canEdit} scenarios={scenarios} folders={folders} cases={cases}
        onChanged={refresh}
        onRun={(scenarioId) => { setRunScenarioId(scenarioId); setTab("runs"); }}
        onOpenExcel={() => setTab("excel")}
      />}
      {tab === "runs" && <RunsPanelV2 projectId={project.id} canEdit={canEdit} cases={cases} scenarios={scenarios} dataSets={dataSets} initialScenarioId={runScenarioId} initialRunId={initialRunId} />}
      {tab === "trash" && <RecycleBinPanel projectId={project.id} canEdit={canEdit} onChanged={refresh} />}
      {tab === "excel" && <div className="transfer-page">
        <div className="transfer-page-heading"><p className="eyebrow">IMPORT / EXPORT</p><h2>Excelから追加・エクスポート</h2><p className="muted">「追加する」と「外へ出す」を分けています。必要な側だけ上から順に進めてください。</p></div>
        <div className="transfer-workspace">
          <section className="panel import-panel transfer-card">
            <div className="section-heading"><div><p className="eyebrow">追加する</p><h2>Excelからテストを追加</h2><p className="muted">システム用キーを入力する必要はありません。通常は「入力」シートだけで作業できます。</p></div></div>
            <div className="transfer-steps">
              <div className="transfer-step"><span className="transfer-step-number">1</span><div><strong>公式テンプレートを取得</strong><p>最新テンプレートには入力順と選択肢が設定されています。</p><a className="link-button primary" href="/api/imports/excel/template" download>公式テンプレートをダウンロード</a></div></div>
              <div className="transfer-step"><span className="transfer-step-number">2</span><div><strong>「入力」シートへ記入</strong><p>最初はテスト名・確認項目名・操作・期待結果だけで開始できます。同じテストや確認項目の続きは名前を繰り返さず、次の行へそのまま入力します。</p></div></div>
              <div className="transfer-step"><span className="transfer-step-number">3</span><div><strong>アップロードして内容を確認</strong>{canEdit ? <form className="stack-form upload-form" onSubmit={previewExcel}><label>.xlsxファイル<input type="file" name="file" accept=".xlsx" required /></label><button className="primary">アップロードして検証</button></form> : <p className="muted">追加には編集権限が必要です。</p>}</div></div>
            </div>
            {preview && <div className="preview-result"><h3>追加前の確認</h3><p><strong>{preview.counts.scenarios}テスト / {preview.counts.cases}確認項目</strong></p>{preview.scenarios.map((scenario) => <p key={scenario.scenarioKey}>{scenario.title}（{scenario.cases.length}確認項目）</p>)}{preview.errors.map((item) => <p className="error-message" key={item}>{item}</p>)}{preview.warnings.map((item) => <p className="warning-message" key={item}>{item}</p>)}<button className="primary" disabled={preview.errors.length > 0} onClick={() => void confirmExcel()}>この内容を追加</button></div>}
          </section>
          <ExportPanel projectId={project.id} />
        </div>
      </div>}
    </main>
  </div>;
}
