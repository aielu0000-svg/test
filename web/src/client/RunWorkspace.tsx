import { useEffect, useRef, useState } from "react";
import { localDateTimeValue, requiresActualResult, toUtcIso, type SaveState } from "./autosave.js";
import { EvidenceImageEditor } from "./EvidenceImageEditor.js";
import { ViewImageEditor } from "./ViewImageEditor.js";
import { mergeRunUpdateEntity, mergeVersionedEntity } from "./runUpdateMerge.js";
import { countRunStatuses, nextPendingCaseIndex } from "./runWorkflow.js";
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
type RunUpdate = Pick<RunSummary, "id" | "version" | "postCompletionUpdatedAt" | "postCompletionUpdatedBy">;
export interface RunCase {
  id: string; title: string; status: "not_run" | "in_progress" | "pass" | "fail" | "blocked" | "skip";
  actual_result: string | null; notes: string | null; assignee_id: string | null; executed_at: string | null; version: number;
  view_images_json?: string | null;
  source_test_case_id?: string | null;
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
  dataSets: Array<{ id: string; name: string; revision_no: number; scope: string; items: Array<{ itemNo: number; label: string; value: string; memo: string }> }>;
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

interface ConflictValues {
  status: RunCase["status"];
  actualResult: string;
  notes: string;
  assigneeId: string;
  executedAt: string;
}

class ApiClientError extends Error {
  constructor(readonly status: number, message: string, readonly requestId?: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-The-Test-Request", "1");
  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; requestId?: string } };
  if (!response.ok) {
    const requestId = payload.error?.requestId;
    const message = (response.status >= 500 ? "処理を完了できませんでした。もう一度お試しください。" : payload.error?.message ?? "通信に失敗しました。") + (requestId ? "（エラーID: " + requestId + "）" : "");
    throw new ApiClientError(response.status, message, requestId);
  }
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

export function RunsPanelV2({ projectId, canEdit, cases, scenarios, dataSets, onCasesAvailable, initialScenarioId, initialRunId }: {
  projectId: string;
  canEdit: boolean;
  cases: DefinitionRef[];
  scenarios: DefinitionRef[];
  dataSets: DataSetRef[];
  onCasesAvailable?: (cases: RunCase[]) => void;
  initialScenarioId?: string;
  initialRunId?: string;
}) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [selectedId, setSelectedId] = useState(initialRunId ?? "");
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
  useEffect(() => { if (initialRunId) setSelectedId(initialRunId); }, [initialRunId]);
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

  function mergeRunUpdate(update: RunUpdate | null | undefined) {
    if (!update) return;
    setDetail((current) => current && current.run.id === update.id
      ? { ...current, run: mergeRunUpdateEntity(current.run, update) }
      : current);
    setRuns((current) => current.map((entry) => entry.id === update.id ? mergeRunUpdateEntity(entry, update) : entry));
  }

  async function reloadAfterConflict() {
    if (!detail) return;
    await Promise.all([loadDetail(detail.run.id), refreshLists()]);
  }

  async function saveCase(item: RunCase, values: { status: RunCase["status"]; actualResult: string; notes: string; executedAt: string | null; assigneeId: string }): Promise<RunCase> {
    const body: Record<string, unknown> = {
      projectId, version: item.version, status: values.status, actualResult: values.actualResult, notes: values.notes,
    };
    if (detail?.run.status !== "completed") {
      body.assigneeId = values.assigneeId;
      body.executedAt = values.executedAt;
    }
    const result = await api<{ runCase: RunCase; run: RunUpdate }>(`/api/run-cases/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setDetail((current) => {
      if (!current) return current;
      const nextCases = current.cases.map((entry) => entry.id === item.id
        ? mergeVersionedEntity(entry, { ...entry, ...result.runCase })
        : entry);
      const total = nextCases.filter((entry) => !entry.excluded_at).length;
      const passed = nextCases.filter((entry) => !entry.excluded_at && entry.status === "pass").length;
      const failed = nextCases.filter((entry) => !entry.excluded_at && entry.status === "fail").length;
      const blocked = nextCases.filter((entry) => !entry.excluded_at && entry.status === "blocked").length;
      const denominator = passed + failed + blocked;
      onCasesAvailable?.(nextCases.filter((entry) => !entry.excluded_at));
      return {
        ...current,
        run: mergeRunUpdateEntity(current.run, result.run),
        cases: nextCases,
        stats: { ...current.stats, total, passRate: denominator ? passed / denominator : null },
      };
    });
    setRuns((current) => current.map((entry) => entry.id === result.run.id ? mergeRunUpdateEntity(entry, result.run) : entry));
    return result.runCase;
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

  async function createFailureRerun() {
    if (!detail) return;
    try {
      const result = await api<{ id: string; caseCount: number }>(`/api/test-runs/${detail.run.id}/rerun-failures`, {
        method: "POST", body: JSON.stringify({ projectId }),
      });
      await refreshLists();
      setSelectedId(result.id);
      setError(`${result.caseCount}件の不合格・ブロック項目で再実行を作成しました。`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "再実行を作成できませんでした。");
    }
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
      {detail && detail.run.status === "in_progress" && <FocusedRunPanel projectId={projectId} runId={detail.run.id} runStatus={detail.run.status} cases={activeCases} dataSets={detail.dataSets} canEdit={canEdit} assignees={assignees} onSave={saveCase} onRunUpdated={mergeRunUpdate} onConflict={reloadAfterConflict} onComplete={() => changeRunStatus("completed")} />}
      {detail && detail.run.status === "completed" && <CompletedRunPanel projectId={projectId} runId={detail.run.id} cases={activeCases} dataSets={detail.dataSets} canEdit={canEdit} assignees={assignees} onSave={saveCase} onRunUpdated={mergeRunUpdate} onConflict={reloadAfterConflict} postCompletionUpdatedAt={detail.run.postCompletionUpdatedAt} postCompletionUpdatedBy={detail.run.postCompletionUpdatedBy} failureCount={activeCases.filter((item) => item.status === "fail" || item.status === "blocked").length} onCreateFailureRerun={createFailureRerun} />}
      {detail && <details className="run-advanced"><summary>実行の詳細・改訂履歴</summary><p>環境: {detail.run.environmentName || "未設定"} / ビルド: {detail.run.buildName || "未設定"} / 改訂{detail.run.currentRevision}</p>{detail.revisions.length > 0 && <ul>{detail.revisions.map((item) => <li key={item.revision_no}>#{item.revision_no} {item.change_reason}</li>)}</ul>}</details>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  </div>;
}

function CompletedRunPanel({ postCompletionUpdatedAt, postCompletionUpdatedBy, failureCount, onCreateFailureRerun, ...props }: Omit<React.ComponentProps<typeof FocusedRunPanel>, "runStatus" | "onComplete"> & { postCompletionUpdatedAt?: string | null; postCompletionUpdatedBy?: string | null; failureCount: number; onCreateFailureRerun: () => Promise<void> }) {
  const updater = props.assignees.find((item) => item.id === postCompletionUpdatedBy);
  return <div>
    <p className="warning-banner" role="status">この実行は完了済みです。編集できるのは結果・実績結果・備考・証跡のみで、変更内容は「完了後更新」として監査ログへ記録されます。{postCompletionUpdatedAt && <> 最終更新: {new Date(postCompletionUpdatedAt).toLocaleString("ja-JP")} / {updater?.displayName || updater?.username || postCompletionUpdatedBy || "不明"}</>}</p>
    {props.canEdit && failureCount > 0 && <div className="completed-run-toolbar"><div><strong>再確認が必要な項目: {failureCount}件</strong><p className="muted">前回の結果・証跡はコピーせず、元の確認項目だけで新しい実行準備を作成します。</p></div><button type="button" className="primary" onClick={() => void onCreateFailureRerun()}>不合格・ブロック{failureCount}件で再実行を作成</button></div>}
    <FocusedRunPanel {...props} runStatus="completed" onComplete={async () => undefined} />
  </div>;
}

function FocusedRunPanel({ projectId, runId, runStatus, cases, dataSets, canEdit, assignees, onSave, onRunUpdated, onConflict, onComplete }: {
  projectId: string; runId: string; runStatus: RunSummary["status"]; cases: RunCase[]; dataSets: RunDetail["dataSets"]; canEdit: boolean; assignees: Assignee[];
  onSave: (item: RunCase, values: { status: RunCase["status"]; actualResult: string; notes: string; executedAt: string | null; assigneeId: string }) => Promise<RunCase>;
  onRunUpdated: (update: RunUpdate | null | undefined) => void;
  onConflict: () => Promise<void>;
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
  const [conflictValues, setConflictValues] = useState<ConflictValues | null>(null);
  const [showConflictDiff, setShowConflictDiff] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [completionReviewOpen, setCompletionReviewOpen] = useState(false);
  const [largeImage, setLargeImage] = useState<string | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [editingViewImage, setEditingViewImage] = useState<string | null>(null);
  const lightboxStageRef = useRef<HTMLDivElement>(null);
  const editRevision = useRef(0);
  const lastSubmittedRevision = useRef(0);
  const lastResolvedRevision = useRef(0);
  const loadedCaseId = useRef<string | null>(null);
  const loadedCaseVersion = useRef<number | null>(null);

  function syncFromItem(current: RunCase) {
    setStatus(current.status); setActualResult(current.actual_result ?? ""); setNotes(current.notes ?? "");
    setAssigneeId(current.assignee_id ?? ""); setExecutedAt(localDateTimeValue(current.executed_at));
  }

  function edit<T>(setter: React.Dispatch<React.SetStateAction<T>>, value: T) {
    editRevision.current += 1;
    setIsEditing(true);
    setter(value);
  }

  useEffect(() => {
    if (!item) return;
    const caseChanged = loadedCaseId.current !== item.id;
    const versionChanged = loadedCaseVersion.current !== item.version;
    if (caseChanged || (versionChanged && conflictValues)) {
      syncFromItem(item);
      editRevision.current = 0; lastSubmittedRevision.current = 0; lastResolvedRevision.current = 0;
      setIsEditing(false); setSaveState(caseChanged ? "idle" : "error");
    }
    if (caseChanged) {
      setError(""); setConflictValues(null); setShowConflictDiff(false); setCopyMessage("");
    }
    loadedCaseId.current = item.id;
    loadedCaseVersion.current = item.version;
  }, [item?.id, item?.version]);

  useEffect(() => {
    const stage = lightboxStageRef.current;
    if (!largeImage || !stage) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setImageZoom((current) => Math.min(5, Math.max(.5, current * (event.deltaY < 0 ? 1.12 : .89))));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [largeImage]);

  if (!item) return <div className="run-empty"><h2>確認項目がありません</h2><p className="muted">実行準備へ戻り、対象テストを選択してください。</p></div>;

  const dirty = isEditing || status !== item.status || actualResult !== (item.actual_result ?? "") || notes !== (item.notes ?? "")
    || assigneeId !== (item.assignee_id ?? "") || executedAt !== localDateTimeValue(item.executed_at);
  const statusCounts = countRunStatuses(cases);
  const completedCount = statusCounts.pass + statusCounts.fail + statusCounts.blocked + statusCounts.skip;
  const incompleteCount = statusCounts.not_run + statusCounts.in_progress;
  const sourceCaseId = item.source_test_case_id ?? "";
  const commonData = dataSets.flatMap((dataSet) => dataSet.items.filter((entry) => !entry.memo.startsWith("__case__:")).map((entry) => ({ dataSet: dataSet.name, ...entry })));
  const caseData = dataSets.flatMap((dataSet) => dataSet.items.filter((entry) => entry.memo === `__case__:${sourceCaseId}`).map((entry) => ({ dataSet: dataSet.name, ...entry })));
  const serverConflictValues: ConflictValues = {
    status: item.status,
    actualResult: item.actual_result ?? "",
    notes: item.notes ?? "",
    assigneeId: item.assignee_id ?? "",
    executedAt: localDateTimeValue(item.executed_at),
  };
  const conflictRows = conflictValues ? [
    { label: "結果", local: resultLabels[conflictValues.status], server: resultLabels[serverConflictValues.status] },
    { label: "実績結果", local: conflictValues.actualResult, server: serverConflictValues.actualResult },
    { label: "備考", local: conflictValues.notes, server: serverConflictValues.notes },
    { label: "担当者ID", local: conflictValues.assigneeId, server: serverConflictValues.assigneeId },
    { label: "実行日時", local: conflictValues.executedAt, server: serverConflictValues.executedAt },
  ].filter((row) => row.local !== row.server) : [];

  function changeIndex(next: number) {
    if (dirty && !window.confirm("この確認項目には未保存の変更があります。保存せずに移動しますか？")) return;
    setIndex(Math.min(Math.max(next, 0), cases.length - 1));
  }
  function openLargeImage(source: string) {
    setImageZoom(1);
    setLargeImage(source);
  }
  function changeImageZoom(multiplier: number) {
    setImageZoom((current) => Math.min(5, Math.max(.5, current * multiplier)));
  }

  async function reloadConflict() {
    try {
      await onConflict();
      setError("サーバーの最新状態を再読み込みしました。控えと差分を確認して必要な内容を再適用してください。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "最新状態を再読み込みできませんでした。");
    }
  }

  async function copyConflictInput() {
    if (!conflictValues) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(conflictValues, null, 2));
      setCopyMessage("現在入力をクリップボードへコピーしました。");
    } catch {
      setCopyMessage("コピーできませんでした。下のテキストを選択してコピーしてください。");
    }
  }

  async function saveCurrent(move: "stay" | "nextPending" = "stay") {
    if (requiresActualResult(status) && !actualResult.trim()) {
      setSaveState("error"); setError("不合格・ブロック・スキップでは実績結果を入力してください。"); return;
    }
    const requestRevision = ++lastSubmittedRevision.current;
    const submittedEditRevision = editRevision.current;
    setSaveState("saving"); setError("");
    try {
      const saved = await onSave(item, { status, actualResult, notes, assigneeId, executedAt: toUtcIso(executedAt) });
      if (requestRevision < lastSubmittedRevision.current || requestRevision < lastResolvedRevision.current) return;
      lastResolvedRevision.current = requestRevision;
      if (editRevision.current === submittedEditRevision) {
        setStatus(saved.status); setActualResult(saved.actual_result ?? ""); setNotes(saved.notes ?? "");
        setAssigneeId(saved.assignee_id ?? ""); setExecutedAt(localDateTimeValue(saved.executed_at));
        setIsEditing(false); setSaveState("saved"); setConflictValues(null); setShowConflictDiff(false); setCopyMessage("");
        if (move === "nextPending") {
          const updatedCases = cases.map((entry) => entry.id === item.id ? { ...entry, status: saved.status } : entry);
          const nextIndex = nextPendingCaseIndex(updatedCases, index);
          if (nextIndex >= 0) setIndex(nextIndex);
        }
      } else {
        setSaveState("idle");
      }
    } catch (cause) {
      if (requestRevision < lastSubmittedRevision.current || requestRevision < lastResolvedRevision.current) return;
      lastResolvedRevision.current = requestRevision;
      setSaveState("error");
      if (cause instanceof ApiClientError && cause.status === 409) {
        setConflictValues({ status, actualResult, notes, assigneeId, executedAt });
        setShowConflictDiff(false); setCopyMessage("");
        await onConflict().catch(() => undefined);
        setError("他の利用者の更新を検出しました。サーバーの最新状態を読み込み、現在入力を控えとして保持しました。");
      } else {
        setError(cause instanceof Error ? cause.message : "保存できませんでした。再読み込みして、もう一度お試しください。");
      }
    }
  }
  function moveToStatus(statuses: RunCase["status"][]) {
    const target = cases.findIndex((entry) => statuses.includes(entry.status));
    if (target >= 0) changeIndex(target);
    setCompletionReviewOpen(false);
  }

  async function completeRun() {
    if (dirty || saveState === "saving" || evidenceUploading) {
      setError("未保存の変更または証跡アップロードが完了してから完了内容を確認してください。");
      return;
    }
    setCompletionReviewOpen(true);
  }

  return <div className="focused-run">
    <aside className="focused-run-list">
      <div className="focused-run-progress"><strong>進捗 {completedCount} / {cases.length}</strong><div><span style={{ width: `${cases.length ? (completedCount / cases.length) * 100 : 0}%` }} /></div></div>
      {cases.map((entry, caseIndex) => <button type="button" key={entry.id} className={caseIndex === index ? "active" : ""} onClick={() => changeIndex(caseIndex)}><span>{caseIndex + 1}. {entry.title}</span><small>{resultLabels[entry.status]}</small></button>)}
    </aside>
    <section className="focused-run-case">
      <div className="case-top"><div><p className="eyebrow">確認項目 {index + 1} / {cases.length}</p><h2>{item.title}</h2></div><span className={`save-state ${saveState}`}>{saveLabels[saveState] || (dirty ? "未保存" : "")}</span></div>
      {!!item.steps?.length && <div className="run-instructions">{item.steps.map((step) => <div key={step.stepNo}><strong>操作 {step.stepNo}</strong><p>{step.action}</p><strong>期待結果</strong><p>{step.expected}</p></div>)}</div>}
      {(caseData.length > 0 || commonData.length > 0) && <section className="run-test-data"><div className="section-heading"><div><h3>テストデータ</h3><p className="muted">実行開始時点の内容です。</p></div></div>{caseData.length > 0 && <div><h4>この確認項目</h4><dl>{caseData.map((entry, dataIndex) => <div key={`${entry.dataSet}-${entry.itemNo}-${dataIndex}`}><dt>{entry.label || entry.dataSet}</dt><dd>{entry.value || "（空）"}</dd></div>)}</dl></div>}{commonData.length > 0 && <details open><summary>共通データ {commonData.length}件</summary><dl>{commonData.map((entry, dataIndex) => <div key={`${entry.dataSet}-${entry.itemNo}-${dataIndex}`}><dt>{entry.label}<small>{entry.dataSet}</small></dt><dd>{entry.value || "（空）"}</dd></div>)}</dl></details>}</section>}
      <fieldset className="run-result-status"><legend>結果</legend><div>{(["not_run", "pass", "fail", "blocked", "skip"] as RunCase["status"][]).map((value) => <button type="button" disabled={!canEdit} className={status === value ? "selected" : ""} key={value} onClick={() => edit(setStatus, value)}>{resultLabels[value]}</button>)}</div></fieldset>
      <label>実績結果{requiresActualResult(status) && "（必須）"}<textarea disabled={!canEdit} aria-invalid={requiresActualResult(status) && !actualResult.trim()} value={actualResult} onChange={(event) => edit(setActualResult, event.target.value)} /></label>
      <label>備考<textarea disabled={!canEdit} value={notes} onChange={(event) => edit(setNotes, event.target.value)} /></label>
      <div className="field-grid"><label>担当者<AssigneeSelect disabled={!canEdit || runStatus === "completed"} value={assigneeId} assignees={assignees} onChange={(value) => edit(setAssigneeId, value)} /></label><label>実行日時<input disabled={!canEdit || runStatus === "completed"} type="datetime-local" value={executedAt} onChange={(event) => edit(setExecutedAt, event.target.value)} /></label></div>
      {!!runCaseImages(item).length && <section className="run-reference-images"><h3>見る場所の画像</h3><p className="muted">画像を選択すると拡大表示します。</p><div>{runCaseImages(item).map((source, imageIndex) => <figure key={imageIndex}><button type="button" className="run-reference-preview" onClick={() => openLargeImage(source)}><img src={source} alt={`参考画像 ${imageIndex + 1}`} /></button>{canEdit && <button type="button" className="small" onClick={() => setEditingViewImage(source)}>この実行用に編集</button>}</figure>)}</div></section>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {conflictValues && <section className="conflict-input" aria-label="競合の復旧">
        <h3>競合の復旧</h3>
        <p>現在入力は保持されています。最新状態を確認してから、必要な値だけ再適用してください。</p>
        <div className="button-row">
          <button type="button" onClick={() => void reloadConflict()}>最新状態を再読み込み</button>
          <button type="button" onClick={() => void copyConflictInput()}>現在入力をコピー</button>
          <button type="button" onClick={() => setShowConflictDiff((current) => !current)}>{showConflictDiff ? "差分を閉じる" : "差分を確認"}</button>
        </div>
        {copyMessage && <p role="status">{copyMessage}</p>}
        <label>競合時の現在入力<textarea readOnly value={JSON.stringify(conflictValues, null, 2)} aria-label="競合時の現在の入力" /></label>
        {showConflictDiff && <div aria-label="競合差分">
          <h4>現在入力とサーバー最新値の差分</h4>
          {conflictRows.length ? <dl>{conflictRows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>現在入力: {row.local || "（空）"}</dd><dd>サーバー最新: {row.server || "（空）"}</dd></div>)}</dl> : <p>差分はありません。</p>}
        </div>}
      </section>}
      <EvidencePanelV2 projectId={projectId} canEdit={canEdit} runCases={[item]} runId={runId} onRunUpdated={onRunUpdated} onUploadingChange={setEvidenceUploading} />
      {runStatus === "in_progress" && index === cases.length - 1 && incompleteCount > 0 && <p className="muted">完了まで残り {incompleteCount} 件です。未実行・実行中の確認項目を保存してください。</p>}
      <div className="focused-run-actions"><button type="button" disabled={index === 0} onClick={() => changeIndex(index - 1)}>← 前へ</button><div>{canEdit && <><button type="button" disabled={!dirty || saveState === "saving"} onClick={() => void saveCurrent("stay")}>保存</button>{incompleteCount > 0 && <button type="button" className="primary" disabled={saveState === "saving"} onClick={() => void saveCurrent("nextPending")}>保存して次の未実行へ →</button>}</>}{runStatus === "in_progress" && <button type="button" disabled={dirty || saveState === "saving" || evidenceUploading} onClick={() => void completeRun()}>完了内容を確認</button>}</div></div>
    </section>
    {largeImage && <div className="run-image-lightbox" role="dialog" aria-modal="true" aria-label="見る場所画像の拡大表示" onClick={(event) => { if (event.target === event.currentTarget) setLargeImage(null); }}><div><div className="run-image-lightbox-toolbar"><span className="run-image-lightbox-hint">Ctrl + スクロールでも拡大・縮小できます</span><button type="button" aria-label="縮小" onClick={() => changeImageZoom(.8)}>−</button><span className="run-image-zoom-value" aria-live="polite">{Math.round(imageZoom * 100)}%</span><button type="button" aria-label="拡大" onClick={() => changeImageZoom(1.25)}>＋</button><button type="button" onClick={() => setImageZoom(1)}>100%に戻す</button><button type="button" onClick={() => setLargeImage(null)}>閉じる</button></div><div className="run-image-lightbox-stage" ref={lightboxStageRef}><img src={largeImage} alt="見る場所の拡大画像" style={{ width: `${imageZoom * 100}%` }} /></div></div></div>}
    {editingViewImage && <ViewImageEditor projectId={projectId} sourceUrl={editingViewImage} scope="run" onClose={() => setEditingViewImage(null)} onSaved={async (newUrl) => { const result = await api<{ run?: RunUpdate | null }>(`/api/run-cases/${item.id}/view-image`, { method: "POST", body: JSON.stringify({ projectId, version: item.version, sourceUrl: editingViewImage, newUrl }) }); onRunUpdated(result.run); setEditingViewImage(null); await onConflict(); }} />}
    {completionReviewOpen && <div className="run-completion-backdrop" role="dialog" aria-modal="true" aria-label="完了前チェック"><section className="panel run-completion-dialog"><div className="section-heading"><div><p className="eyebrow">FINAL CHECK</p><h2>完了前チェック</h2></div><button type="button" onClick={() => setCompletionReviewOpen(false)}>閉じる</button></div><div className="run-completion-counts"><button type="button" onClick={() => moveToStatus(["pass"])}><span>合格</span><strong>{statusCounts.pass}</strong></button><button type="button" onClick={() => moveToStatus(["fail"])}><span>不合格</span><strong>{statusCounts.fail}</strong></button><button type="button" onClick={() => moveToStatus(["blocked"])}><span>ブロック</span><strong>{statusCounts.blocked}</strong></button><button type="button" onClick={() => moveToStatus(["skip"])}><span>スキップ</span><strong>{statusCounts.skip}</strong></button><button type="button" onClick={() => moveToStatus(["not_run", "in_progress"])}><span>未実行・実行中</span><strong>{incompleteCount}</strong></button></div>{incompleteCount > 0 ? <p className="warning-message">未実行または実行中の確認項目が残っています。件数カードから対象へ移動し、結果を保存してください。</p> : <p className="success-message">全確認項目の結果が保存されています。</p>}<div className="button-row"><button type="button" onClick={() => setCompletionReviewOpen(false)}>実行へ戻る</button><button type="button" className="primary" disabled={incompleteCount > 0} onClick={() => { setCompletionReviewOpen(false); void onComplete(); }}>テストを完了</button></div></section></div>}
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
  id: string; original_filename: string; content_type: string; byte_size: string; sha256: string;
  current_version: number; description?: string | null;
}

function formatByteSize(byteSize: string): string {
  try { return BigInt(byteSize).toLocaleString("ja-JP"); } catch { return byteSize; }
}

export function EvidencePanelV2({ projectId, canEdit, runCases, runId, onRunUpdated, onUploadingChange }: { projectId: string; canEdit: boolean; runCases: RunCase[]; runId: string; onRunUpdated?: (update: RunUpdate | null | undefined) => void; onUploadingChange?: (uploading: boolean) => void }) {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [editing, setEditing] = useState<EvidenceItem | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState(runCases[0]?.id ?? "");
  const activeCaseId = runCases.some((item) => item.id === selectedCaseId) ? selectedCaseId : runCases[0]?.id ?? "";
  const refreshSequence = useRef(0);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  useEffect(() => { onUploadingChange?.(uploading); return () => onUploadingChange?.(false); }, [uploading, onUploadingChange]);
  async function refresh() {
    const sequence = ++refreshSequence.current;
    if (!activeCaseId) {
      setEvidence([]);
      setLoadError("");
      return;
    }
    const scopeQuery = `testRunId=${encodeURIComponent(runId)}&runCaseSnapshotId=${encodeURIComponent(activeCaseId)}`;
    try {
      const data = await api<{ evidence: EvidenceItem[] }>(`/api/evidence?projectId=${encodeURIComponent(projectId)}&${scopeQuery}`);
      if (sequence !== refreshSequence.current) return;
      setEvidence(data.evidence);
      setLoadError("");
    } catch (cause) {
      if (sequence !== refreshSequence.current) return;
      setLoadError(cause instanceof Error ? cause.message : "読み込みに失敗しました。");
    }
  }
  useEffect(() => {
    if (selectedCaseId !== activeCaseId) setSelectedCaseId(activeCaseId);
  }, [activeCaseId, selectedCaseId]);
  useEffect(() => { void refresh(); }, [projectId, runId, activeCaseId]);
  function uploadEvidence(form: FormData, caseId: string): Promise<void> {
    if (!caseId) return Promise.reject(new Error("関連するテストケースを選択してください。"));
    setUploading(true);
    setUploadProgress(0);
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open("POST", `/api/evidence?projectId=${encodeURIComponent(projectId)}&testRunId=${encodeURIComponent(runId)}&runCaseSnapshotId=${encodeURIComponent(caseId)}`);
      request.setRequestHeader("X-The-Test-Request", "1");
      request.withCredentials = true;
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () => reject(new Error("ネットワークエラーによりアップロードできませんでした。"));
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          try {
            const payload = JSON.parse(request.responseText) as { run?: RunUpdate | null };
            onRunUpdated?.(payload.run);
          } catch { /* empty responses are allowed for backward compatibility */ }
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
    const caseId = activeCaseId;
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
      await uploadEvidence(form, activeCaseId);
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
      const result = await api<{ run?: RunUpdate | null }>(`/api/evidence/${item.id}`, { method: "DELETE", body: JSON.stringify({ reason: reason.trim() }) });
      onRunUpdated?.(result.run);
      setMessage("証跡をごみ箱へ移動しました。"); await refresh();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "削除に失敗しました。"); }
  }
  return <section className="panel">
    <h2>証跡</h2>
    <p className="muted">画像やファイルを証跡として追加できます。説明は任意です。</p>
    <details className="evidence-help"><summary>アップロード条件を確認</summary><p>1回につき1ファイル、最大100 MiBです。配備先のプロキシ、ストレージ容量、ブラウザ、タイムアウトによっては、さらに小さい上限が適用されます。画像編集では元の版を保持します。</p></details>
    {canEdit && <div className="evidence-entry"><form className="field-grid evidence-form" onSubmit={upload}>{runCases.length === 1 ? <p>関連する確認項目: <strong>{runCases[0].title}</strong></p> : <label>関連するテストケース<select name="runCaseSnapshotId" required value={activeCaseId} onChange={(event) => setSelectedCaseId(event.target.value)}>{runCases.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>}<label>ファイル<input name="file" type="file" required disabled={uploading || !activeCaseId} /></label><label>説明<input name="description" disabled={uploading || !activeCaseId} /></label><button className="primary" disabled={uploading || !activeCaseId}>{uploading ? "アップロード中…" : "ファイルを追加"}</button></form><button type="button" disabled={uploading || !activeCaseId} onClick={() => void pasteFromClipboard()}>クリップボードから貼り付け</button></div>}
    {uploadProgress !== null && <div className="evidence-progress" aria-live="polite"><progress max={100} value={uploadProgress} /><span>{uploadProgress}%</span></div>}
    <div className="evidence-grid">{evidence.map((item) => <article key={item.id}><a href={`/api/evidence/${item.id}/download`}><img src={`/api/evidence/${item.id}/thumbnail`} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /><strong>{item.original_filename}</strong></a>{item.description?.trim() && <details className="evidence-description"><summary>説明を見る</summary><p>{item.description}</p></details>}<details className="evidence-file-info"><summary>ファイル情報</summary><small>{formatByteSize(item.byte_size)} bytes / v{item.current_version} / SHA-256 {item.sha256.slice(0, 12)}…</small></details>{canEdit && <div className="evidence-actions">{item.content_type.startsWith("image/") && <button onClick={() => setEditing(item)}>画像編集</button>}<button className="danger" onClick={() => void remove(item)}>削除</button></div>}</article>)}</div>
    {editing && <EvidenceImageEditor projectId={projectId} evidenceId={editing.id} filename={editing.original_filename} onClose={() => setEditing(null)} onSaved={async (run) => { onRunUpdated?.(run); await refresh(); }} />}
    {loadError && <p className="error-message">{loadError}</p>}{message && <p className={message.includes("しました") ? "success-message" : "error-message"}>{message}</p>}
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
