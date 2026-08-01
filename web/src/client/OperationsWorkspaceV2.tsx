import { useEffect, useRef, useState } from "react";
import { localDateTimeValue, requiresActualResult, toUtcIso, type SaveState } from "./autosave.js";
import { EvidenceImageEditor } from "./EvidenceImageEditor.js";
import "./operations.css";
import "./phase25.css";

interface DefinitionRef { id: string; title: string }
interface DataSetRef { id: string; name: string }
interface Assignee { id: string; username: string; displayName: string | null; role: string }
interface RunSummary {
  id: string; name: string; status: "draft" | "in_progress" | "completed"; version: number;
  currentRevision: number; updatedAt: string; environmentName?: string | null; buildName?: string | null;
  assigneeId?: string | null; memo?: string | null;
  postCompletionUpdatedAt?: string | null; postCompletionUpdatedBy?: string | null;
}
export interface RunCase {
  id: string; title: string; status: "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "skip";
  actual_result: string | null; notes: string | null; assignee_id: string | null; executed_at: string | null; version: number;
  view_images_json?: string | null;
  steps?: Array<{ stepNo: number; action: string; expected: string }>;
  excluded_at: string | null; exclusion_reason?: string | null;
}
interface RunScenario {
  id: string; title: string; status: RunCase["status"]; assignee_id: string | null; version: number;
  excluded_at: string | null; exclusion_reason?: string | null; started_at?: string | null; completed_at?: string | null;
}
interface RunDetail {
  run: RunSummary & {
    plannedStartAt?: string | null; plannedEndAt?: string | null; startedAt?: string | null; completedAt?: string | null;
    environmentName?: string | null; buildName?: string | null; assigneeId?: string | null; memo?: string | null;
    scenarioIds?: string[]; caseIds?: string[]; dataSetIds?: string[];
  };
  cases: RunCase[];
  scenarios: RunScenario[];
  dataSets: Array<{ id: string; name: string; revision_no: number; scope: string }>;
  revisions: Array<{ revision_no: number; change_reason: string; created_at: string }>;
  stats: { total: number; byStatus: Record<string, number>; passRate: number | null };
}

interface RunFormValues {
  name: string;
  environmentName: string;
  buildName: string;
  assigneeId: string;
  memo: string;
  plannedStartAt: string;
  plannedEndAt: string;
  selectedCases: string[];
  selectedScenarios: string[];
  selectedDataSets: string[];
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: init.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; requestId?: string } };
  if (!response.ok) throw new Error(`${response.status >= 500 ? "処理を完了できませんでした。もう一度お試しください。" : payload.error?.message ?? "通信に失敗しました。"}${payload.error?.requestId ? `（エラーID: ${payload.error.requestId}）` : ""}`);
  return payload as T;
}

const resultLabels: Record<RunCase["status"], string> = {
  not_run: "未実行", in_progress: "実行中", pass: "合格", fail: "不合格", blocked: "ブロック", skip: "スキップ",
};
function runCaseImages(item: RunCase): string[] {
  try {
    const value = JSON.parse(item.view_images_json ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string" && (entry.startsWith("data:image/") || /^\/api\/test-case-images\/[0-9a-f-]{36}\/content$/i.test(entry)))
      : [];
  } catch { return []; }
}
const saveLabels: Record<SaveState, string> = {
  idle: "", waiting: "保存待ち", saving: "保存中…", saved: "保存済み", error: "保存失敗",
};

function AssigneeSelect({ value, assignees, disabled, onChange }: {
  value: string | null | undefined; assignees: Assignee[]; disabled?: boolean; onChange: (value: string) => void;
}) {
  return <select aria-label="担当者" value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
    <option value="">未割当</option>
    {assignees.map((item) => <option key={item.id} value={item.id}>{item.displayName || item.username}{item.role === "admin" ? "（管理者）" : ""}</option>)}
  </select>;
}

function RunCreatePanel({ projectId, cases, scenarios, dataSets, assignees, initialScenarioId, onCreated, onError }: {
  projectId: string; cases: DefinitionRef[]; scenarios: DefinitionRef[]; dataSets: DataSetRef[]; assignees: Assignee[];
  initialScenarioId?: string; onCreated: (id: string) => void; onError: (message: string) => void;
}) {
  const [values, setValues] = useState<RunFormValues>(() => ({
    name: "", environmentName: "", buildName: "", assigneeId: "", memo: "", plannedStartAt: "", plannedEndAt: "",
    selectedCases: [], selectedScenarios: initialScenarioId ? [initialScenarioId] : [], selectedDataSets: [],
  }));
  const [saving, setSaving] = useState(false);
  function change<K extends keyof RunFormValues>(key: K, value: RunFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true); onError("");
    try {
      const result = await api<{ id: string }>("/api/test-runs", {
        method: "POST",
        body: JSON.stringify({
          projectId, name: values.name, environmentName: values.environmentName, buildName: values.buildName,
          assigneeId: values.assigneeId, memo: values.memo, plannedStartAt: toUtcIso(values.plannedStartAt),
          plannedEndAt: toUtcIso(values.plannedEndAt), scenarioIds: values.selectedScenarios,
          caseIds: values.selectedCases, dataSetIds: values.selectedDataSets,
        }),
      });
      onCreated(result.id);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "実行作成に失敗しました。");
    } finally { setSaving(false); }
  }
  return <div className="run-preparation">
    <div className="section-heading"><div><p className="eyebrow">PREPARATION</p><h2>実行準備</h2><p className="muted">対象テストと実行条件を決めてから開始します。</p></div></div>
    <form className="stack-form run-create-form" onSubmit={submit}>
      <label>実行名<input required value={values.name} onChange={(event) => change("name", event.target.value)} /></label>
      <div className="field-grid"><label>環境<input value={values.environmentName} onChange={(event) => change("environmentName", event.target.value)} /></label><label>ビルド<input value={values.buildName} onChange={(event) => change("buildName", event.target.value)} /></label><label>担当者<AssigneeSelect value={values.assigneeId} assignees={assignees} onChange={(value) => change("assigneeId", value)} /></label><label>予定日時<input type="datetime-local" value={values.plannedStartAt} onChange={(event) => change("plannedStartAt", event.target.value)} /></label></div>
      <label>メモ<textarea value={values.memo} onChange={(event) => change("memo", event.target.value)} /></label>
      <fieldset><legend>対象テスト</legend><SelectionLists cases={cases} scenarios={scenarios} dataSets={dataSets} selectedCases={values.selectedCases} selectedScenarios={values.selectedScenarios} selectedDataSets={values.selectedDataSets} setCases={(value) => change("selectedCases", value)} setScenarios={(value) => change("selectedScenarios", value)} setDataSets={(value) => change("selectedDataSets", value)} /></fieldset>
      <button className="primary" disabled={saving}>{saving ? "保存中…" : "実行準備を保存"}</button>
    </form>
  </div>;
}

export function RunsPanelV2({ projectId, canEdit, cases, scenarios, dataSets, onCasesAvailable, initialScenarioId }: {
  projectId: string;
  canEdit: boolean;
  cases: DefinitionRef[];
  scenarios: DefinitionRef[];
  dataSets: DataSetRef[];
  onCasesAvailable?: (cases: RunCase[]) => void;
  initialScenarioId?: string;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [environmentName, setEnvironmentName] = useState("");
  const [buildName, setBuildName] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [memo, setMemo] = useState("");
  const [plannedStartAt, setPlannedStartAt] = useState("");
  const [plannedEndAt, setPlannedEndAt] = useState("");
  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const [selectedScenarios, setSelectedScenarios] = useState<string[]>([]);
  const [selectedDataSets, setSelectedDataSets] = useState<string[]>([]);
  const [excludeCases, setExcludeCases] = useState<string[]>([]);
  const [excludeScenarios, setExcludeScenarios] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  async function refreshLists() {
    const sequence = ++listSequence.current;
    try {
      const [runResult, assigneeResult] = await Promise.all([
        api<{ runs: RunSummary[] }>(`/api/test-runs?projectId=${encodeURIComponent(projectId)}`),
        api<{ assignees: Assignee[] }>(`/api/project-assignees?projectId=${encodeURIComponent(projectId)}`),
      ]);
      if (sequence !== listSequence.current) return;
      setRuns(runResult.runs);
      setAssignees(assigneeResult.assignees);
      setError("");
    } catch (cause) {
      if (sequence === listSequence.current) setError(cause instanceof Error ? cause.message : "読み込みに失敗しました。");
    }
  }

  async function loadDetail(id: string) {
    const sequence = ++detailSequence.current;
    if (!id) {
      setDetail(null); onCasesAvailable?.([]);
      return;
    }
    try {
      const loaded = await api<RunDetail>(`/api/test-runs/${id}?projectId=${encodeURIComponent(projectId)}`);
      if (sequence !== detailSequence.current) return;
      setDetail(loaded);
      setEnvironmentName(loaded.run.environmentName ?? ""); setBuildName(loaded.run.buildName ?? "");
      setAssigneeId(loaded.run.assigneeId ?? ""); setMemo(loaded.run.memo ?? "");
      setPlannedStartAt(localDateTimeValue(loaded.run.plannedStartAt)); setPlannedEndAt(localDateTimeValue(loaded.run.plannedEndAt));
      setSelectedScenarios(loaded.run.status === "draft" ? loaded.run.scenarioIds ?? [] : []);
      setSelectedCases(loaded.run.status === "draft" ? loaded.run.caseIds ?? [] : []);
      setSelectedDataSets(loaded.run.status === "draft" ? loaded.run.dataSetIds ?? [] : []);
      onCasesAvailable?.(loaded.cases.filter((item) => !item.excluded_at));
      setError("");
    } catch (cause) {
      if (sequence === detailSequence.current) setError(cause instanceof Error ? cause.message : "実行詳細の読み込みに失敗しました。");
    }
  }
  useEffect(() => { void refreshLists(); }, [projectId]);
  useEffect(() => { void loadDetail(selectedId); }, [projectId, selectedId]);

  async function patchRun(status = detail?.run.status) {
    if (!detail || !status) return;
    await api(`/api/test-runs/${detail.run.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        projectId, version: detail.run.version, name: detail.run.name, status, environmentName, buildName, assigneeId, memo,
        plannedStartAt: toUtcIso(plannedStartAt), plannedEndAt: toUtcIso(plannedEndAt),
        scenarioIds: selectedScenarios, caseIds: selectedCases, dataSetIds: selectedDataSets,
      }),
    });
    await Promise.all([loadDetail(detail.run.id), refreshLists()]);
  }

  async function changeRunStatus(status: RunSummary["status"]) {
    try { await patchRun(status); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "状態変更に失敗しました。"); }
  }

  async function saveCase(item: RunCase, values: { status: RunCase["status"]; actualResult: string; notes: string; executedAt: string | null; assigneeId: string }) {
    const result = await api<{ runCase: RunCase }>(`/api/run-cases/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ projectId, version: item.version, ...values }),
    });
    setDetail((current) => {
      if (!current) return current;
      const nextCases = current.cases.map((entry) => entry.id === item.id ? { ...entry, ...result.runCase } : entry);
      const total = nextCases.filter((entry) => !entry.excluded_at).length;
      const passed = nextCases.filter((entry) => !entry.excluded_at && entry.status === "pass").length;
      onCasesAvailable?.(nextCases.filter((entry) => !entry.excluded_at));
      return { ...current, cases: nextCases, stats: { ...current.stats, total, passRate: total ? passed / total : null } };
    });
  }

  async function revise() {
    if (!detail) return;
    try {
      await api(`/api/test-runs/${detail.run.id}/revisions`, {
        method: "POST",
        body: JSON.stringify({
          projectId, version: detail.run.version, reason, addScenarioIds: selectedScenarios, addCaseIds: selectedCases, addDataSetIds: selectedDataSets,
          excludeScenarioSnapshotIds: excludeScenarios, excludeCaseSnapshotIds: excludeCases,
        }),
      });
      setReason(""); setSelectedCases([]); setSelectedScenarios([]); setSelectedDataSets([]); setExcludeCases([]); setExcludeScenarios([]);
      await Promise.all([loadDetail(detail.run.id), refreshLists()]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "改訂に失敗しました。"); }
  }

  async function deleteRun() {
    if (!detail) return;
    const deleteReason = window.prompt("削除理由を入力してください。");
    if (!deleteReason?.trim()) return;
    try {
      await api(`/api/test-runs/${detail.run.id}`, { method: "DELETE", body: JSON.stringify({ projectId, reason: deleteReason.trim() }) });
      setSelectedId(""); setDetail(null); await refreshLists();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "削除に失敗しました。"); }
  }

  const activeCases = detail?.cases.filter((item) => !item.excluded_at) ?? [];
  const runStatusLabel: Record<RunSummary["status"], string> = { draft: "実行準備", in_progress: "実行中", completed: "完了" };
  return <div className="run-workflow">
    <aside className="panel run-workflow-sidebar">
      <div className="section-heading"><div><p className="eyebrow">RUNS</p><h2>テスト実行</h2></div><span>{runs.length}件</span></div>
      {canEdit && <button type="button" className="primary" onClick={() => { setSelectedId(""); setDetail(null); }}>＋ 新しい実行</button>}
      <div className="definition-list run-list">{runs.map((run) => <button key={run.id} className={selectedId === run.id ? "selected list-button" : "list-button"} onClick={() => setSelectedId(run.id)}><strong>{run.name}</strong><small>{runStatusLabel[run.status]} / {run.updatedAt ? new Date(run.updatedAt).toLocaleString("ja-JP") : ""}</small></button>)}</div>
    </aside>
    <section className="panel run-workflow-main">
      {!detail && (canEdit ? <RunCreatePanel key={`${projectId}-${initialScenarioId ?? ""}`} projectId={projectId} cases={cases} scenarios={scenarios} dataSets={dataSets} assignees={assignees} initialScenarioId={initialScenarioId} onCreated={(id) => { void refreshLists(); setSelectedId(id); }} onError={setError} /> : <p className="muted">このプロジェクトは閲覧のみです。</p>)}
      {detail?.run.status === "draft" && <div className="run-preparation">
        <div className="section-heading"><div><p className="eyebrow">PREPARATION</p><h2>{detail.run.name}</h2></div><span className="run-status draft">実行準備</span></div>
        <div className="field-grid"><label>環境<input disabled={!canEdit} value={environmentName} onChange={(event) => setEnvironmentName(event.target.value)} /></label><label>ビルド<input disabled={!canEdit} value={buildName} onChange={(event) => setBuildName(event.target.value)} /></label><label>担当者<AssigneeSelect disabled={!canEdit} value={assigneeId} assignees={assignees} onChange={setAssigneeId} /></label><label>予定日時<input disabled={!canEdit} type="datetime-local" value={plannedStartAt} onChange={(event) => setPlannedStartAt(event.target.value)} /></label></div>
        <label>メモ<textarea disabled={!canEdit} value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
        <fieldset><legend>対象テスト</legend><SelectionLists cases={cases} scenarios={scenarios} dataSets={dataSets} selectedCases={selectedCases} selectedScenarios={selectedScenarios} selectedDataSets={selectedDataSets} setCases={setSelectedCases} setScenarios={setSelectedScenarios} setDataSets={setSelectedDataSets} /></fieldset>
        {canEdit && <div className="button-row"><button type="button" onClick={() => void patchRun().catch((cause) => setError(cause instanceof Error ? cause.message : "保存に失敗しました。"))}>準備内容を保存</button><button type="button" className="primary" disabled={!selectedCases.length && !selectedScenarios.length} onClick={() => void changeRunStatus("in_progress")}>実行を開始</button><button type="button" className="danger" onClick={() => void deleteRun()}>削除</button></div>}
      </div>}
      {detail && detail.run.status === "in_progress" && <FocusedRunPanel projectId={projectId} runId={detail.run.id} runStatus={detail.run.status} cases={activeCases} canEdit={canEdit} assignees={assignees} onSave={saveCase} onComplete={() => changeRunStatus("completed")} />}
      {detail && detail.run.status === "completed" && <CompletedRunPanel projectId={projectId} runId={detail.run.id} cases={activeCases} canEdit={canEdit} assignees={assignees} onSave={saveCase} postCompletionUpdatedAt={detail.run.postCompletionUpdatedAt} postCompletionUpdatedBy={detail.run.postCompletionUpdatedBy} />}
      {detail && <details className="run-advanced"><summary>実行の詳細・改訂履歴</summary><p>環境: {detail.run.environmentName || "未設定"} / ビルド: {detail.run.buildName || "未設定"} / 改訂{detail.run.currentRevision}</p>{detail.revisions.length > 0 && <ul>{detail.revisions.map((item) => <li key={item.revision_no}>#{item.revision_no} {item.change_reason}</li>)}</ul>}</details>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  </div>;
}

function CompletedRunPanel({ postCompletionUpdatedAt, postCompletionUpdatedBy, ...props }: Omit<React.ComponentProps<typeof FocusedRunPanel>, "runStatus" | "onComplete"> & { postCompletionUpdatedAt?: string | null; postCompletionUpdatedBy?: string | null }) {
  const updater = props.assignees.find((item) => item.id === postCompletionUpdatedBy);
  return <div><p className="warning-banner" role="status">この実行は完了済みです。変更内容は「完了後更新」として監査ログへ記録されます。{postCompletionUpdatedAt && <> 最終更新: {new Date(postCompletionUpdatedAt).toLocaleString("ja-JP")} / {updater?.displayName || updater?.username || postCompletionUpdatedBy || "不明"}</>}</p><FocusedRunPanel {...props} runStatus="completed" onComplete={async () => undefined} /></div>;
}

function FocusedRunPanel({ projectId, runId, runStatus, cases, canEdit, assignees, onSave, onComplete }: {
  projectId: string; runId: string; runStatus: RunSummary["status"]; cases: RunCase[]; canEdit: boolean; assignees: Assignee[];
  onSave: (item: RunCase, values: { status: RunCase["status"]; actualResult: string; notes: string; executedAt: string | null; assigneeId: string }) => Promise<void>;
  onComplete: () => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const item = cases[Math.min(index, Math.max(cases.length - 1, 0))];
  const [status, setStatus] = useState<RunCase["status"]>("not_run");
  const [actualResult, setActualResult] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [executedAt, setExecutedAt] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const editRevision = useRef(0);
  const lastSubmittedRevision = useRef(0);
  const lastResolvedRevision = useRef(0);

  function edit<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) {
    editRevision.current += 1;
    setIsEditing(true);
    setter(value);
  }

  useEffect(() => {
    if (!item) return;
    setStatus(item.status); setActualResult(item.actual_result ?? ""); setNotes(item.notes ?? "");
    setAssigneeId(item.assignee_id ?? ""); setExecutedAt(localDateTimeValue(item.executed_at));
    editRevision.current = 0; lastSubmittedRevision.current = 0; lastResolvedRevision.current = 0;
    setIsEditing(false); setSaveState("idle"); setError("");
  }, [item?.id]);

  if (!item) return <div className="run-empty"><h2>確認項目がありません</h2><p className="muted">実行準備へ戻り、対象テストを選択してください。</p></div>;

  const dirty = isEditing || status !== item.status || actualResult !== (item.actual_result ?? "") || notes !== (item.notes ?? "")
    || assigneeId !== (item.assignee_id ?? "") || executedAt !== localDateTimeValue(item.executed_at);
  const completedCount = cases.filter((entry) => !["not_run", "in_progress"].includes(entry.status)).length;
  const incompleteCount = cases.length - completedCount;

  function changeIndex(next: number) {
    if (dirty && !window.confirm("この確認項目には未保存の変更があります。保存せずに移動しますか？")) return;
    setIndex(Math.min(Math.max(next, 0), cases.length - 1));
  }
  async function saveCurrent(next = false) {
    if (requiresActualResult(status) && !actualResult.trim()) {
      setSaveState("error"); setError("不合格・ブロック・スキップでは実績結果を入力してください。"); return;
    }
    const requestRevision = ++lastSubmittedRevision.current;
    const submittedEditRevision = editRevision.current;
    setSaveState("saving"); setError("");
    try {
      await onSave(item, { status, actualResult, notes, assigneeId, executedAt: toUtcIso(executedAt) });
      if (requestRevision < lastSubmittedRevision.current || requestRevision < lastResolvedRevision.current) return;
      lastResolvedRevision.current = requestRevision;
      if (editRevision.current === submittedEditRevision) {
        setIsEditing(false); setSaveState("saved");
        if (next && index < cases.length - 1) setIndex((current) => Math.min(current + 1, cases.length - 1));
      } else {
        setSaveState("idle");
      }
    } catch (cause) {
      if (requestRevision < lastSubmittedRevision.current || requestRevision < lastResolvedRevision.current) return;
      lastResolvedRevision.current = requestRevision;
      setSaveState("error");
      setError(cause instanceof Error ? cause.message : "保存できませんでした。再読み込みして、もう一度お試しください。");
    }
  }
  async function completeRun() {
    if (dirty || saveState === "saving" || evidenceUploading) {
      setError("未保存の変更または証跡アップロードが完了してから実行を完了してください。");
      return;
    }
    if (incompleteCount > 0) {
      setError(`未実行または実行中の確認項目が${incompleteCount}件あります。すべての結果を保存してください。`);
      return;
    }
    if (!window.confirm(`全${cases.length}件の結果を確認しました。テストを完了しますか？`)) return;
    await onComplete();
  }

  return <div className="focused-run">
    <aside className="focused-run-list">
      <div className="focused-run-progress"><strong>進捗 {completedCount} / {cases.length}</strong><div><span style={{ width: `${cases.length ? (completedCount / cases.length) * 100 : 0}%` }} /></div></div>
      {cases.map((entry, caseIndex) => <button type="button" key={entry.id} className={caseIndex === index ? "active" : ""} onClick={() => changeIndex(caseIndex)}><span>{caseIndex + 1}. {entry.title}</span><small>{resultLabels[entry.status]}</small></button>)}
    </aside>
    <section className="focused-run-case">
      <div className="case-top"><div><p className="eyebrow">確認項目 {index + 1} / {cases.length}</p><h2>{item.title}</h2></div><span className={`save-state ${saveState}`}>{saveLabels[saveState] || (dirty ? "未保存" : "")}</span></div>
      {!!item.steps?.length && <div className="run-instructions">{item.steps.map((step) => <div key={step.stepNo}><strong>操作 {step.stepNo}</strong><p>{step.action}</p><strong>期待結果</strong><p>{step.expected}</p></div>)}</div>}
      <fieldset className="run-result-status"><legend>結果</legend><div>{(["not_run", "pass", "fail", "blocked", "skip"] as RunCase["status"][]).map((value) => <button type="button" disabled={!canEdit} className={status === value ? "selected" : ""} key={value} onClick={() => edit(setStatus, value)}>{resultLabels[value]}</button>)}</div></fieldset>
      <label>実績結果{requiresActualResult(status) && "（必須）"}<textarea disabled={!canEdit} aria-invalid={requiresActualResult(status) && !actualResult.trim()} value={actualResult} onChange={(event) => edit(setActualResult, event.target.value)} /></label>
      <label>備考<textarea disabled={!canEdit} value={notes} onChange={(event) => edit(setNotes, event.target.value)} /></label>
      <div className="field-grid"><label>担当者<AssigneeSelect disabled={!canEdit} value={assigneeId} assignees={assignees} onChange={(value) => edit(setAssigneeId, value)} /></label><label>実行日時<input disabled={!canEdit} type="datetime-local" value={executedAt} onChange={(event) => edit(setExecutedAt, event.target.value)} /></label></div>
      {!!runCaseImages(item).length && <section className="run-reference-images"><h3>見る場所の画像</h3><div>{runCaseImages(item).map((source, imageIndex) => <img key={imageIndex} src={source} alt={`参考画像 ${imageIndex + 1}`} />)}</div></section>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <EvidencePanelV2 projectId={projectId} canEdit={canEdit} runCases={[item]} runId={runId} onUploadingChange={setEvidenceUploading} />
      {runStatus === "in_progress" && index === cases.length - 1 && incompleteCount > 0 && <p className="muted">完了まで残り {incompleteCount} 件です。未実行・実行中の確認項目を保存してください。</p>}
      <div className="focused-run-actions"><button type="button" disabled={index === 0} onClick={() => changeIndex(index - 1)}>← 前へ</button><div>{canEdit && <><button type="button" disabled={!dirty || saveState === "saving"} onClick={() => void saveCurrent(false)}>保存</button><button type="button" className="primary" disabled={saveState === "saving"} onClick={() => void saveCurrent(true)}>保存して次へ →</button></>}{runStatus === "in_progress" && index === cases.length - 1 && <button type="button" className="primary" disabled={dirty || saveState === "saving" || evidenceUploading || incompleteCount > 0} onClick={() => void completeRun()}>テストを完了</button>}</div></div>
    </section>
  </div>;
}

function Check({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return <label className="check-label"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}

function SelectionLists({ cases, scenarios, dataSets, selectedCases, selectedScenarios, selectedDataSets, setCases, setScenarios, setDataSets }: {
  cases: DefinitionRef[]; scenarios: DefinitionRef[]; dataSets: DataSetRef[];
  selectedCases: string[]; selectedScenarios: string[]; selectedDataSets: string[];
  setCases: (value: string[]) => void; setScenarios: (value: string[]) => void; setDataSets: (value: string[]) => void;
}) {
  return <div className="selection-columns selection-three"><div><strong>シナリオ</strong>{scenarios.map((item) => <Check key={item.id} checked={selectedScenarios.includes(item.id)} label={item.title} onChange={(checked) => setScenarios(checked ? [...selectedScenarios, item.id] : selectedScenarios.filter((id) => id !== item.id))} />)}</div><div><strong>単独ケース</strong>{cases.map((item) => <Check key={item.id} checked={selectedCases.includes(item.id)} label={item.title} onChange={(checked) => setCases(checked ? [...selectedCases, item.id] : selectedCases.filter((id) => id !== item.id))} />)}</div><div><strong>データセット</strong>{dataSets.map((item) => <Check key={item.id} checked={selectedDataSets.includes(item.id)} label={item.name} onChange={(checked) => setDataSets(checked ? [...selectedDataSets, item.id] : selectedDataSets.filter((id) => id !== item.id))} />)}</div></div>;
}

interface EvidenceItem {
  id: string; original_filename: string; content_type: string; byte_size: number; sha256: string;
  current_version: number; description?: string | null;
}

export function EvidencePanelV2({ projectId, canEdit, runCases, runId, onUploadingChange }: { projectId: string; canEdit: boolean; runCases: RunCase[]; runId: string; onUploadingChange?: (uploading: boolean) => void }) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [editing, setEditing] = useState<EvidenceItem | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState(runCases[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { onUploadingChange?.(uploading); return () => onUploadingChange?.(false); }, [uploading, onUploadingChange]);
  async function refresh() {
    if (!selectedCaseId) {
      setEvidence([]);
      return;
    }
    const scopeQuery = `testRunId=${encodeURIComponent(runId)}&runCaseSnapshotId=${encodeURIComponent(selectedCaseId)}`;
    try { setEvidence((await api<{ evidence: EvidenceItem[] }>(`/api/evidence?projectId=${encodeURIComponent(projectId)}&${scopeQuery}`)).evidence); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "読み込みに失敗しました。"); }
  }
  useEffect(() => { setSelectedCaseId((current) => runCases.some((item) => item.id === current) ? current : runCases[0]?.id ?? ""); }, [runCases]);
  useEffect(() => { void refresh(); }, [projectId, runId, selectedCaseId]);
  function uploadEvidence(form: FormData, caseId: string): Promise<void> {
    if (!caseId) return Promise.reject(new Error("関連するテストケースを選択してください。"));
    setUploading(true);
    setUploadProgress(0);
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `/api/evidence?projectId=${encodeURIComponent(projectId)}&testRunId=${encodeURIComponent(runId)}&runCaseSnapshotId=${encodeURIComponent(caseId)}`);
      request.withCredentials = true;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () => reject(new Error("ネットワークエラーによりアップロードできませんでした。"));
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          setUploadProgress(100);
          resolve();
          return;
        }
        let detail = "アップロードに失敗しました。";
        try {
          const payload = JSON.parse(request.responseText) as { error?: { message?: string; requestId?: string } };
          if (request.status < 500 && payload.error?.message) detail = payload.error.message;
          if (payload.error?.requestId) detail += `（エラーID: ${payload.error.requestId}）`;
        } catch { /* HTMLなどの予期しない応答では一般向け文言を使う */ }
        reject(new Error(detail));
      };
      request.onloadend = () => setUploading(false);
      request.send(form);
    });
  }
  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const caseId = runCases.length === 1 ? runCases[0].id : String(form.get("runCaseSnapshotId") ?? "");
    try {
      await uploadEvidence(form, caseId);
      formElement.reset(); setMessage("証跡を登録しました。"); await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "アップロードに失敗しました。"); }
  }
  async function pasteFromClipboard() {
    try {
      if (!navigator.clipboard?.read) throw new Error("このブラウザでは画像のクリップボード貼り付けを利用できません。ファイル選択を使用してください。");
      const items = await navigator.clipboard.read();
      const imageType = items.flatMap((item) => item.types).find((type) => type.startsWith("image/"));
      const owner = items.find((item) => imageType && item.types.includes(imageType));
      if (!owner || !imageType) throw new Error("クリップボードに画像がありません。");
      const blob = await owner.getType(imageType);
      const form = new FormData();
      form.append("file", blob, "clipboard.png");
      await uploadEvidence(form, selectedCaseId);
      setMessage("クリップボード画像を登録しました。");
      await refresh();
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setMessage("クリップボードの読み取りが許可されませんでした。ブラウザの権限とHTTPS接続を確認してください。");
      } else {
        setMessage(cause instanceof Error ? cause.message : "クリップボードからの貼り付けに失敗しました。");
      }
    }
  }
  async function remove(item: EvidenceItem) {
    const reason = window.prompt("証跡の削除理由を入力してください。");
    if (!reason?.trim()) return;
    try {
      await api(`/api/evidence/${item.id}`, { method: "DELETE", body: JSON.stringify({ reason: reason.trim() }) });
      setMessage("証跡をごみ箱へ移動しました。"); await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "削除に失敗しました。"); }
  }
  return <section className="panel">
    <h2>証跡</h2>
    <p className="muted">ファイルはストリームで保存します。1リクエストのAPI上限は25MBで、配備先のプロキシ設定によりさらに制限される場合があります。編集時も元版を保持します。</p>
    {canEdit && <div className="evidence-entry"><form className="field-grid evidence-form" onSubmit={upload}>{runCases.length === 1 ? <p>関連する確認項目: <strong>{runCases[0].title}</strong></p> : <label>関連するテストケース<select name="runCaseSnapshotId" required value={selectedCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>{runCases.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>}<label>ファイル<input name="file" type="file" required disabled={uploading || !selectedCaseId} /></label><label>説明<input name="description" disabled={uploading || !selectedCaseId} /></label><button className="primary" disabled={uploading || !selectedCaseId}>{uploading ? "アップロード中…" : "ファイルを追加"}</button></form><button type="button" disabled={uploading || !selectedCaseId} onClick={() => void pasteFromClipboard()}>クリップボードから貼り付け</button></div>}
    {uploadProgress !== null && <div className="evidence-progress" aria-live="polite"><progress max={100} value={uploadProgress} /><span>{uploadProgress}%</span></div>}
    <div className="evidence-grid">{evidence.map((item) => <article key={item.id}><a href={`/api/evidence/${item.id}/download`}><img src={`/api/evidence/${item.id}/thumbnail`} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /><strong>{item.original_filename}</strong></a><small>{Number(item.byte_size).toLocaleString()} bytes / v{item.current_version} / SHA-256 {item.sha256.slice(0, 12)}…</small>{canEdit && <div className="evidence-actions">{item.content_type.startsWith("image/") && <button onClick={() => setEditing(item)}>画像編集</button>}<button className="danger" onClick={() => void remove(item)}>削除</button></div>}</article>)}</div>
    {editing && <EvidenceImageEditor projectId={projectId} evidenceId={editing.id} filename={editing.original_filename} onClose={() => setEditing(null)} onSaved={refresh} />}
    {message && <p className={message.includes("しました") ? "success-message" : "error-message"}>{message}</p>}
  </section>;
}

interface ProcedureItem { id: string; title: string; current_version: number; version: number; source_filename?: string | null }
interface ProcedureDetail extends ProcedureItem { markdown_source: string; html: string }

export function ProceduresPanelV2({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const [items, setItems] = useState<ProcedureItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [sourceFilename, setSourceFilename] = useState("");
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");
  async function refresh() {
    try { setItems((await api<{ procedures: ProcedureItem[] }>(`/api/procedures?projectId=${encodeURIComponent(projectId)}`)).procedures); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "読み込みに失敗しました。"); }
  }
  useEffect(() => { void refresh(); }, [projectId]);
  async function select(id: string) {
    setSelectedId(id);
    if (!id) { setVersion(0); setTitle(""); setMarkdown(""); setSourceFilename(""); setPreview(""); return; }
    try {
      const detail = (await api<{ procedure: ProcedureDetail }>(`/api/procedures/${id}?projectId=${encodeURIComponent(projectId)}`)).procedure;
      setVersion(detail.version); setTitle(detail.title); setMarkdown(detail.markdown_source); setSourceFilename(detail.source_filename ?? ""); setPreview(detail.html);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "手順書を読み込めませんでした。"); }
  }
  async function render() {
    try { setPreview((await api<{ html: string }>("/api/markdown/render", { method: "POST", body: JSON.stringify({ source: markdown }) })).html); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "プレビューに失敗しました。"); }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    try {
      const path = selectedId ? `/api/procedures/${selectedId}` : "/api/procedures";
      await api(path, { method: selectedId ? "PATCH" : "POST", body: JSON.stringify({ projectId, version, title, markdown, sourceFilename }) });
      setMessage(selectedId ? "新しい手順書バージョンを保存しました。" : "手順書を保存しました。");
      await refresh();
      if (!selectedId) await select("");
      else await select(selectedId);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "保存に失敗しました。"); }
  }
  async function remove() {
    if (!selectedId) return;
    const reason = window.prompt("手順書の削除理由を入力してください。");
    if (!reason?.trim()) return;
    try {
      await api(`/api/procedures/${selectedId}`, { method: "DELETE", body: JSON.stringify({ projectId, reason: reason.trim() }) });
      await select(""); await refresh(); setMessage("手順書をごみ箱へ移動しました。");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "削除に失敗しました。"); }
  }
  return <div className="workspace-grid"><section className="panel"><h2>手順書一覧</h2><button className={!selectedId ? "primary" : ""} onClick={() => void select("")}>新規作成</button><div className="definition-list">{items.map((item) => <button className={selectedId === item.id ? "list-button selected" : "list-button"} key={item.id} onClick={() => void select(item.id)}><strong>{item.title}</strong><small>version {item.current_version}</small></button>)}</div></section><section className="panel"><h2>{selectedId ? "Markdown手順書を更新" : "Markdown手順書を作成"}</h2>{canEdit ? <form className="stack-form" onSubmit={save}><label>タイトル<input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Markdownファイル（任意）<input type="file" accept=".md,text/markdown,text/plain" onChange={(event) => { const file = event.target.files?.[0]; if (file) { setSourceFilename(file.name); void file.text().then(setMarkdown); } }} /></label><label>Markdown<textarea className="markdown-editor" required value={markdown} onChange={(event) => setMarkdown(event.target.value)} /></label><div className="button-row"><button type="button" onClick={() => void render()}>安全なプレビュー</button>{selectedId && <button type="button" className="danger" onClick={() => void remove()}>削除</button>}<button className="primary">{selectedId ? "新しい版として保存" : "保存"}</button></div></form> : <p className="muted">閲覧のみです。</p>}{preview && <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: preview }} />}{message && <p>{message}</p>}</section></div>;
}
