import { useEffect, useRef, useState } from "react";
import { FolderExplorer, type ExplorerSelection } from "./FolderExplorer.js";
import { folderDepth } from "./folderExplorerModel.js";
import { ViewImageEditor } from "./ViewImageEditor.js";
import "./test-design.css";

type Priority = "high" | "medium" | "low";
export type DesignFolder = { id: string; parentId: string | null; name: string; version: number };
export type DesignScenario = { id: string; folderId?: string | null; title: string; version: number; caseCount: number; updatedAt: string };
export type DesignCaseSummary = { id: string; title: string };

type EditorCase = {
  key: string; id: string | null; version: number | null; title: string; objective: string; preconditions: string;
  viewLocation: string; priority: Priority; tags: string[]; folderIds: string[]; data: string;
  steps: Array<{ action: string; expected: string }>;
};
type CommonData = {
  id: string | null; version: number | null; name: string; description: string;
  items: Array<{ label: string; value: string; memo: string }>;
};
type EditorResponse = {
  scenario: { id: string; folderId: string | null; title: string; objective: string; preconditions: string; version: number; updatedAt: string };
  cases: Array<Omit<EditorCase, "key"> & { images?: string[]; clientKey?: string }>;
  commonData: CommonData | null;
};
type SaveState = "clean" | "dirty" | "saving" | "saved" | "error";

let draftCounter = 0;
const newKey = () => `draft-${Date.now()}-${draftCounter++}`;
const emptyCase = (): EditorCase => ({
  key: newKey(), id: null, version: null, title: "", objective: "", preconditions: "", viewLocation: "",
  priority: "medium", tags: [], folderIds: [], data: "", steps: [{ action: "", expected: "" }],
});
const emptyCommonData = (): CommonData => ({ id: null, version: null, name: "", description: "", items: [] });

class UiRequestError extends Error {
  constructor(message: string, public readonly requestId?: string) { super(message); }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-The-Test-Request", "1");
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string; requestId?: string } };
  if (!response.ok) {
    const message = response.status === 400 || response.status === 409
      ? payload.error?.message ?? "入力内容を確認してください。"
      : "処理を完了できませんでした。画面を再読み込みして、もう一度お試しください。";
    throw new UiRequestError(message, payload.error?.requestId);
  }
  return payload as T;
}
function errorText(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return error instanceof UiRequestError && error.requestId ? `${error.message}（エラーID: ${error.requestId}）` : error.message;
}
function grow(target: HTMLTextAreaElement) {
  target.style.height = "auto";
  target.style.height = `${target.scrollHeight}px`;
}

export function TestDesignEditor({ projectId, canEdit, scenarios, folders, cases, onChanged, onRun, onOpenExcel }: {
  projectId: string; canEdit: boolean; scenarios: DesignScenario[]; folders: DesignFolder[]; cases: DesignCaseSummary[];
  onChanged: () => Promise<void>; onRun: (scenarioId: string) => void; onOpenExcel: () => void;
}) {
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [scenarioVersion, setScenarioVersion] = useState<number | null>(null);
  const [scenarioFolderId, setScenarioFolderId] = useState("");
  const [title, setTitle] = useState("");
  const [objective, setObjective] = useState("");
  const [preconditions, setPreconditions] = useState("");
  const [rows, setRows] = useState<EditorCase[]>([emptyCase()]);
  const [selectedRowKey, setSelectedRowKey] = useState("");
  const [commonData, setCommonData] = useState<CommonData>(emptyCommonData);
  const [commonEnabled, setCommonEnabled] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [savedAt, setSavedAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState<Record<string, string[]>>({});
  const [imageUploading, setImageUploading] = useState(false);
  const [editingImage, setEditingImage] = useState<{ rowKey: string; source: string } | null>(null);
  const loadSequence = useRef(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const dirty = saveState === "dirty" || saveState === "error";
  const selectedIndex = Math.max(0, rows.findIndex((item) => item.key === selectedRowKey));
  const selectedRow = rows[selectedIndex] ?? rows[0];

  function markDirty() {
    if (canEdit && saveState !== "saving") setSaveState("dirty");
    setMessage("");
  }
  function updateRow(index: number, change: Partial<EditorCase>) {
    setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ...change } : row));
    markDirty();
  }
  function resetEditor(folderId = "") {
    loadSequence.current += 1;
    setBusy(false);
    const row = emptyCase();
    setSelectedScenarioId(""); setScenarioVersion(null); setScenarioFolderId(folderId); setTitle(""); setObjective(""); setPreconditions("");
    setRows([row]); setSelectedRowKey(row.key); setCommonData(emptyCommonData()); setCommonEnabled(false);
    setSaveState("clean"); setSavedAt(""); setMessage(""); setImages({});
  }
  function confirmDiscard() {
    return !dirty || window.confirm("変更内容が保存されていません。保存せずに別のテストへ移動しますか？");
  }
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.querySelectorAll("textarea").forEach((element) => grow(element));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [rows, objective, preconditions, selectedRowKey, commonData]);

  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [dirty]);

  async function selectScenario(id: string) {
    if (id === selectedScenarioId || !confirmDiscard()) return;
    setBusy(true); setMessage("");
    const loadId = ++loadSequence.current;
    try {
      const loaded = await request<EditorResponse>(`/api/scenario-editor/${id}?projectId=${encodeURIComponent(projectId)}`);
      const restored: Record<string, string[]> = {};
      if (loadId !== loadSequence.current) return;
      const loadedRows = loaded.cases.map(({ images: savedImages, clientKey, ...item }) => {
        const key = clientKey ?? item.id ?? newKey();
        restored[key] = savedImages ?? [];
        return { ...item, key };
      });
      setSelectedScenarioId(loaded.scenario.id); setScenarioVersion(loaded.scenario.version);
      setScenarioFolderId(loaded.scenario.folderId ?? ""); setTitle(loaded.scenario.title);
      setObjective(loaded.scenario.objective); setPreconditions(loaded.scenario.preconditions);
      setRows(loadedRows.length ? loadedRows : [emptyCase()]); setSelectedRowKey(loadedRows[0]?.key ?? "");
      setCommonData(loaded.commonData ?? emptyCommonData()); setCommonEnabled(Boolean(loaded.commonData));
      setSavedAt(new Date(loaded.scenario.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
      setSaveState("clean");
      setImages(restored);
    } catch (error) {
      if (loadId !== loadSequence.current) return;
      setMessage(errorText(error, "テストを読み込めませんでした。")); setSaveState("error");
    } finally {
      if (loadId === loadSequence.current) setBusy(false);
    }
  }

  async function save(runAfterSave = false) {
    if (!canEdit || busy) return;
    if (!title.trim()) return setMessage("テスト名を入力してください。");
    if (!rows.length || rows.some((row) => !row.title.trim() || !row.steps.length || row.steps.some((step) => !step.action.trim() || !step.expected.trim()))) {
      return setMessage("各確認項目の名前・操作・期待結果を入力してください。");
    }
    const selectedCaseId = selectedRow?.id ?? null;
    const selectedCaseKey = selectedRow?.key ?? "";
    const selectedIndexAtSave = selectedIndex;
    setBusy(true); setSaveState("saving"); setMessage("");
    try {
      const loaded = await request<EditorResponse>("/api/scenario-editor/save", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          scenario: { id: selectedScenarioId || null, version: scenarioVersion, folderId: scenarioFolderId || null, title, objective, preconditions },
          cases: rows.map(({ key, ...row }) => ({ ...row, clientKey: key, images: images[key] ?? [] })),
          commonData: commonEnabled ? {
            ...commonData,
            name: commonData.name.trim() || `${title}の共通テストデータ`,
            items: commonData.items.filter((item) => item.label.trim()),
          } : null,
        }),
      });
      const savedImages: Record<string, string[]> = {};
      const savedRows = loaded.cases.map(({ images: storedImages, clientKey, ...item }) => {
        const key = clientKey ?? item.id ?? newKey();
        savedImages[key] = storedImages ?? [];
        return { ...item, key };
      });
      setSelectedScenarioId(loaded.scenario.id); setScenarioVersion(loaded.scenario.version); setScenarioFolderId(loaded.scenario.folderId ?? "");
      const preservedSelection = savedRows.find((row) => selectedCaseId ? row.id === selectedCaseId : row.key === selectedCaseKey)
        ?? savedRows[Math.min(selectedIndexAtSave, savedRows.length - 1)];
      setRows(savedRows);
      setSelectedRowKey(preservedSelection?.key ?? "");
      setImages(savedImages);
      setCommonData(loaded.commonData ?? emptyCommonData()); setCommonEnabled(Boolean(loaded.commonData));
      setSavedAt(new Date(loaded.scenario.updatedAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }));
      setSaveState("saved"); setMessage("テスト全体を保存しました。");
      await onChanged();
      if (runAfterSave) onRun(loaded.scenario.id);
    } catch (error) { setSaveState("error"); setMessage(errorText(error, "保存に失敗しました。")); }
    finally { setBusy(false); }
  }

  function pasteGrid(event: React.ClipboardEvent<HTMLTextAreaElement>, startRow: number, startColumn: number) {
    const matrix = event.clipboardData.getData("text").trimEnd().split(/\r?\n/).map((line) => line.split("\t"));
    if (matrix.length === 1 && matrix[0].length === 1) return;
    event.preventDefault();
    const keys = ["title", "action", "expected", "data"] as const;
    setRows((current) => {
      const next = current.map((item) => ({ ...item, steps: item.steps.map((step) => ({ ...step })) }));
      while (next.length < startRow + matrix.length) next.push(emptyCase());
      matrix.forEach((cells, rowOffset) => cells.forEach((value, columnOffset) => {
        const key = keys[startColumn + columnOffset]; if (!key) return;
        const target = next[startRow + rowOffset];
        if (key === "action" || key === "expected") target.steps[0] = { ...target.steps[0], [key]: value };
        else target[key] = value;
      }));
      return next;
    });
    markDirty();
  }

  async function copyExisting(caseId: string) {
    try {
      const loaded = await request<{ testCase: Omit<EditorCase, "key" | "data"> }>(`/api/test-cases/${caseId}?projectId=${encodeURIComponent(projectId)}`);
      const clone: EditorCase = { ...loaded.testCase, key: newKey(), id: null, version: null, data: "" };
      setRows((current) => [...current, clone]); setSelectedRowKey(clone.key); markDirty();
    } catch (error) { setMessage(errorText(error, "確認項目をコピーできませんでした。")); }
  }

  async function createFolder(name: string, parentId: string | null) {
    try {
      await request("/api/folders", { method: "POST", body: JSON.stringify({ projectId, name, parentId }) });
      await onChanged();
    } catch (error) { setMessage(errorText(error, "フォルダを作成できませんでした。")); throw error; }
  }
  async function renameFolder(folder: DesignFolder, name: string) {
    try {
      await request(`/api/folders/${folder.id}`, { method: "PATCH", body: JSON.stringify({ projectId, version: folder.version, name }) });
      await onChanged();
    } catch (error) { setMessage(errorText(error, "フォルダ名を変更できませんでした。")); throw error; }
  }
  async function renameScenario(item: DesignScenario, nextTitle: string) {
    try {
      const result = await request<{ scenario: { version: number; title: string } }>(`/api/scenarios/${item.id}`, {
        method: "PATCH", body: JSON.stringify({ projectId, version: item.version, title: nextTitle }),
      });
      if (selectedScenarioId === item.id) { setTitle(result.scenario.title); setScenarioVersion(result.scenario.version); }
      await onChanged();
    } catch (error) { setMessage(errorText(error, "テスト名を変更できませんでした。")); throw error; }
  }
  async function duplicateScenario(item: DesignScenario) {
    try {
      const result = await request<{ id: string }>(`/api/scenarios/${item.id}/duplicate`, {
        method: "POST", body: JSON.stringify({ projectId, title: `${item.title} のコピー` }),
      });
      await onChanged(); await selectScenario(result.id);
    } catch (error) { setMessage(errorText(error, "テストを複製できませんでした。")); throw error; }
  }
  async function moveExplorerSelection(selection: ExplorerSelection, targetFolderId: string | null) {
    const selectedFolderIds = new Set(selection.folders.map((item) => item.id));
    const parentById = new Map(folders.map((item) => [item.id, item.parentId ?? null]));
    const hasSelectedAncestor = (folderId: string | null | undefined) => {
      let current = folderId ?? null;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        if (selectedFolderIds.has(current)) return true;
        visited.add(current); current = parentById.get(current) ?? null;
      }
      return false;
    };
    const movableFolders = selection.folders.filter((folder) => !hasSelectedAncestor(folder.parentId));
    const movableScenarios = selection.scenarios.filter((item) => !hasSelectedAncestor(item.folderId));
    try {
      for (const folder of movableFolders) {
        if ((folder.parentId ?? null) === targetFolderId) continue;
        await request(`/api/folders/${folder.id}`, {
          method: "PATCH", body: JSON.stringify({ projectId, version: folder.version, parentId: targetFolderId }),
        });
      }
      for (const item of movableScenarios) {
        if ((item.folderId ?? null) === targetFolderId) continue;
        const result = await request<{ scenario: { version: number; folderId: string | null } }>(`/api/scenarios/${item.id}`, {
          method: "PATCH", body: JSON.stringify({ projectId, version: item.version, folderId: targetFolderId }),
        });
        if (selectedScenarioId === item.id) { setScenarioFolderId(result.scenario.folderId ?? ""); setScenarioVersion(result.scenario.version); }
      }
      await onChanged();
      setMessage(`${movableFolders.length + movableScenarios.length}件を移動しました。`);
    } catch (error) {
      await onChanged().catch(() => undefined);
      setMessage(errorText(error, "選択項目を移動できませんでした。最新状態を再読み込みしました。"));
      throw error;
    }
  }
  async function deleteExplorerSelection(selection: ExplorerSelection, reason: string) {
    try {
      for (const item of selection.scenarios) {
        await request(`/api/scenarios/${item.id}`, { method: "DELETE", body: JSON.stringify({ projectId, reason }) });
        if (selectedScenarioId === item.id) resetEditor();
      }
      const foldersByDepth = [...selection.folders].sort((left, right) => folderDepth(folders, right.id) - folderDepth(folders, left.id));
      for (const folder of foldersByDepth) {
        await request(`/api/folders/${folder.id}`, { method: "DELETE", body: JSON.stringify({ projectId, reason }) });
      }
      await onChanged();
      setMessage(`${selection.folders.length + selection.scenarios.length}件を削除しました。`);
    } catch (error) {
      await onChanged().catch(() => undefined);
      setMessage(errorText(error, "選択項目を削除できませんでした。最新状態を再読み込みしました。"));
      throw error;
    }
  }
  async function addImages(files: FileList | File[]) {
    if (!selectedRow || !files.length) return;
    const rowKey = selectedRow.key;
    setImageUploading(true); setMessage("");
    try {
      const uploaded = await Promise.all(Array.from(files).map(async (file) => {
        const form = new FormData();
        form.append("file", file, file.name || "view-image");
        return request<{ id: string; url: string }>(`/api/test-case-images?projectId=${encodeURIComponent(projectId)}`, { method: "POST", body: form });
      }));
      setImages((current) => ({ ...current, [rowKey]: [...(current[rowKey] ?? []), ...uploaded.map((item) => item.url)] }));
      markDirty();
    } catch (error) {
      setMessage(errorText(error, "画像をアップロードできませんでした。"));
    } finally { setImageUploading(false); }
  }
  function pasteImage(event: React.ClipboardEvent<HTMLElement>) {
    const files = Array.from(event.clipboardData.items).filter((item) => item.type.startsWith("image/")).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
    if (!files.length) return;
    event.preventDefault(); void addImages(files);
  }

  function moveRow(index: number, offset: number) {
    const target = index + offset; if (target < 0 || target >= rows.length) return;
    const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; setRows(next); markDirty();
  }
  function removeRow(index: number) {
    if (rows.length === 1) return;
    const next = rows.filter((_, rowIndex) => rowIndex !== index); setRows(next);
    if (selectedRowKey === rows[index].key) setSelectedRowKey(next[Math.max(0, index - 1)].key);
    markDirty();
  }
  function addRow(after = rows.length - 1, source?: EditorCase) {
    const row = source ? { ...source, key: newKey(), id: null, version: null, steps: source.steps.map((step) => ({ ...step })) } : emptyCase();
    setRows((current) => [...current.slice(0, after + 1), row, ...current.slice(after + 1)]);
    setSelectedRowKey(row.key); markDirty();
  }

  const stateLabel: Record<SaveState, string> = {
    clean: "変更なし", dirty: "未保存", saving: "保存中…", saved: savedAt ? `保存済み ${savedAt}` : "保存済み", error: "保存失敗",
  };

  return <div className="test-design-shell" ref={editorRef}>
    {!canEdit && <div className="readonly-banner" role="status">このプロジェクトは閲覧のみです。編集するには管理者へプロジェクト割り当てを依頼してください。</div>}
    {!selectedScenarioId && scenarios.length === 0 && <section className="design-welcome panel">
      <div><p className="eyebrow">はじめに</p><h2>このプロジェクトで行うこと</h2><p>1. テストを作成する　→　2. テストを実行する　→　3. 結果と証跡を残す</p></div>
      <div className="button-row"><button type="button" className="primary" disabled={!canEdit} onClick={() => resetEditor()}>＋ 新しいテストを作る</button><button type="button" onClick={onOpenExcel}>Excelから取り込む</button></div>
    </section>}
    <div className="test-design-grid">
      <aside className="panel design-browser">
        <FolderExplorer
          canEdit={canEdit}
          busy={busy}
          folders={folders}
          scenarios={scenarios}
          selectedScenarioId={selectedScenarioId}
          onNewScenario={(folderId) => { if (confirmDiscard()) resetEditor(folderId ?? ""); }}
          onOpenScenario={(id) => selectScenario(id)}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onRenameScenario={renameScenario}
          onDuplicateScenario={duplicateScenario}
          onDeleteSelection={deleteExplorerSelection}
          onMoveSelection={moveExplorerSelection}
          onRunScenario={onRun}
        />
      </aside>

      <section className="panel design-editor">
        <div className="design-panel-head"><div><p className="eyebrow">TEST DESIGN</p><h2>{selectedScenarioId ? "テストを編集" : "新しいテスト"}</h2></div><span className={`design-save-state ${saveState}`}>{stateLabel[saveState]}</span></div>
        <div className="design-scenario-fields">
          <label>テスト名<input disabled={!canEdit} required value={title} onChange={(event) => { setTitle(event.target.value); markDirty(); }} placeholder="例：ログイン機能の確認" /></label>
          <label>フォルダ<select disabled={!canEdit} value={scenarioFolderId} onChange={(event) => { setScenarioFolderId(event.target.value); markDirty(); }}><option value="">プロジェクト直下</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <label className="design-wide-field">目的<textarea disabled={!canEdit} value={objective} onInput={(event) => grow(event.currentTarget)} onChange={(event) => { setObjective(event.target.value); markDirty(); }} /></label>
          <label className="design-wide-field">テスト全体の前提条件<textarea disabled={!canEdit} value={preconditions} onInput={(event) => grow(event.currentTarget)} onChange={(event) => { setPreconditions(event.target.value); markDirty(); }} /></label>
        </div>
        <div className="design-help">1行＝1確認項目です。複数の操作手順、優先度、タグ、画像は右側の「確認項目詳細」で設定します。</div>
        <div className="design-table-wrap"><table className="design-case-table"><thead><tr><th>No.</th><th>確認項目名</th><th>操作</th><th>期待結果</th><th>テストデータ</th><th>操作</th></tr></thead><tbody>
          {rows.map((row, index) => <tr key={row.key} className={selectedRow?.key === row.key ? "selected" : ""} onClick={() => setSelectedRowKey(row.key)}>
            <td>{index + 1}</td>
            <td><textarea disabled={!canEdit} aria-label={`確認項目名 ${index + 1}`} value={row.title} onPaste={(event) => pasteGrid(event, index, 0)} onInput={(event) => grow(event.currentTarget)} onChange={(event) => updateRow(index, { title: event.target.value })} /></td>
            <td><div className="design-step-summary" aria-label={`操作手順 ${index + 1}`}><strong>{row.steps.length}手順</strong>{row.steps.map((step, stepIndex) => <span key={stepIndex}><b>{stepIndex + 1}.</b> {step.action || "（未入力）"}</span>)}<small>右側の確認項目詳細で編集</small></div></td>
            <td><div className="design-step-summary expected" aria-label={`期待結果一覧 ${index + 1}`}>{row.steps.map((step, stepIndex) => <span key={stepIndex}><b>{stepIndex + 1}.</b> {step.expected || "（未入力）"}</span>)}</div></td>
            <td><textarea disabled={!canEdit} aria-label={`テストデータ ${index + 1}`} value={row.data} onPaste={(event) => pasteGrid(event, index, 3)} onInput={(event) => grow(event.currentTarget)} onChange={(event) => updateRow(index, { data: event.target.value })} /></td>
            <td><div className="design-row-actions"><button type="button" disabled={!canEdit || index === 0} onClick={(event) => { event.stopPropagation(); moveRow(index, -1); }}>↑</button><button type="button" disabled={!canEdit || index === rows.length - 1} onClick={(event) => { event.stopPropagation(); moveRow(index, 1); }}>↓</button><button type="button" disabled={!canEdit} onClick={(event) => { event.stopPropagation(); addRow(index, row); }}>複製</button><button type="button" className="danger" disabled={!canEdit || rows.length === 1} onClick={(event) => { event.stopPropagation(); removeRow(index); }}>削除</button></div></td>
          </tr>)}
        </tbody></table></div>
        {canEdit && <div className="design-add-actions"><button type="button" onClick={() => addRow()}>＋ 新しい確認項目</button><details><summary className="link-button">既存の確認項目からコピー</summary><div className="design-copy-menu">{cases.map((item) => <button type="button" key={item.id} onClick={() => void copyExisting(item.id)}>{item.title}</button>)}{!cases.length && <span className="muted">コピー元はありません。</span>}</div></details><button type="button" onClick={onOpenExcel}>Excelから取り込む</button></div>}
        <details className="design-common-data" open={commonEnabled} onToggle={(event) => { const open = event.currentTarget.open; if (open !== commonEnabled) { setCommonEnabled(open); markDirty(); } }}>
          <summary>テスト共通データを設定する（任意）</summary>
          <div className="design-common-body"><label>名前<input disabled={!canEdit} value={commonData.name} onChange={(event) => { setCommonData({ ...commonData, name: event.target.value }); markDirty(); }} /></label><label>説明<textarea disabled={!canEdit} value={commonData.description} onChange={(event) => { setCommonData({ ...commonData, description: event.target.value }); markDirty(); }} /></label>
            {commonData.items.map((item, index) => <div className="design-data-row" key={index}><input disabled={!canEdit} aria-label={`共通データ名 ${index + 1}`} placeholder="項目名" value={item.label} onChange={(event) => { setCommonData({ ...commonData, items: commonData.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, label: event.target.value } : entry) }); markDirty(); }} /><textarea disabled={!canEdit} aria-label={`共通データ値 ${index + 1}`} placeholder="値" value={item.value} onChange={(event) => { setCommonData({ ...commonData, items: commonData.items.map((entry, itemIndex) => itemIndex === index ? { ...entry, value: event.target.value } : entry) }); markDirty(); }} /><button type="button" className="danger" disabled={!canEdit} onClick={() => { setCommonData({ ...commonData, items: commonData.items.filter((_, itemIndex) => itemIndex !== index) }); markDirty(); }}>削除</button></div>)}
            {canEdit && <button type="button" onClick={() => { setCommonData({ ...commonData, items: [...commonData.items, { label: "", value: "", memo: "" }] }); markDirty(); }}>＋ データ項目</button>}
          </div>
        </details>
      </section>

      <aside className="panel design-detail" onPaste={pasteImage}>
        <div className="design-panel-head"><div><p className="eyebrow">DETAIL</p><h2>確認項目詳細</h2></div><span className="muted">No.{selectedIndex + 1}</span></div>
        {selectedRow && <div className="design-detail-fields">
          <label>確認項目名<input disabled={!canEdit} value={selectedRow.title} onChange={(event) => updateRow(selectedIndex, { title: event.target.value })} /></label>
          <label>目的<textarea disabled={!canEdit} value={selectedRow.objective} onInput={(event) => grow(event.currentTarget)} onChange={(event) => updateRow(selectedIndex, { objective: event.target.value })} /></label>
          <label>前提条件<textarea disabled={!canEdit} value={selectedRow.preconditions} onInput={(event) => grow(event.currentTarget)} onChange={(event) => updateRow(selectedIndex, { preconditions: event.target.value })} /></label>
          <div className="design-detail-columns"><label>優先度<select disabled={!canEdit} value={selectedRow.priority} onChange={(event) => updateRow(selectedIndex, { priority: event.target.value as Priority })}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label></div>
          <label>タグ（カンマ区切り）<input disabled={!canEdit} value={selectedRow.tags.join(", ")} onChange={(event) => updateRow(selectedIndex, { tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} /></label>
          <label>見る場所<textarea disabled={!canEdit} value={selectedRow.viewLocation} onChange={(event) => updateRow(selectedIndex, { viewLocation: event.target.value })} /></label>
          <fieldset><legend>操作手順</legend>{selectedRow.steps.map((step, stepIndex) => <div className="design-step" key={stepIndex}><span>{stepIndex + 1}</span><textarea disabled={!canEdit} aria-label={`詳細操作 ${stepIndex + 1}`} placeholder="操作" value={step.action} onChange={(event) => updateRow(selectedIndex, { steps: selectedRow.steps.map((entry, index) => index === stepIndex ? { ...entry, action: event.target.value } : entry) })} /><textarea disabled={!canEdit} aria-label={`詳細期待結果 ${stepIndex + 1}`} placeholder="期待結果" value={step.expected} onChange={(event) => updateRow(selectedIndex, { steps: selectedRow.steps.map((entry, index) => index === stepIndex ? { ...entry, expected: event.target.value } : entry) })} /><button type="button" className="danger" disabled={!canEdit || selectedRow.steps.length === 1} onClick={() => updateRow(selectedIndex, { steps: selectedRow.steps.filter((_, index) => index !== stepIndex) })}>削除</button></div>)}{canEdit && <button type="button" onClick={() => updateRow(selectedIndex, { steps: [...selectedRow.steps, { action: "", expected: "" }] })}>＋ 操作手順</button>}</fieldset>
          <fieldset><legend>見る場所の画像</legend><div className="design-image-actions"><label className="link-button">画像を追加<input hidden type="file" accept="image/*" multiple disabled={!canEdit || imageUploading} onChange={(event) => { if (event.target.files) void addImages(event.target.files); event.currentTarget.value = ""; }} /></label><span className="muted">{imageUploading ? "アップロード中…" : "または画像をこの欄へ貼り付け"}</span></div><div className="design-image-grid">{(images[selectedRow.key] ?? []).map((source, imageIndex) => <figure key={imageIndex}><button type="button" className="design-image-preview" onClick={() => setEditingImage({ rowKey: selectedRow.key, source })}><img src={source} alt={`参考画像 ${imageIndex + 1}`} /></button>{canEdit && <div className="button-row"><button type="button" className="small" onClick={() => setEditingImage({ rowKey: selectedRow.key, source })}>編集</button><button type="button" className="danger small" onClick={() => { setImages((current) => ({ ...current, [selectedRow.key]: (current[selectedRow.key] ?? []).filter((_, index) => index !== imageIndex) })); markDirty(); }}>削除</button></div>}</figure>)}</div></fieldset>
        </div>}
      </aside>
    </div>
    {message && <p className={saveState === "error" || message.includes("入力") ? "error-message design-message" : "success-message design-message"} role="status">{message}</p>}
    {editingImage && <ViewImageEditor projectId={projectId} sourceUrl={editingImage.source} onClose={() => setEditingImage(null)} onSaved={async (url) => { setImages((current) => ({ ...current, [editingImage.rowKey]: (current[editingImage.rowKey] ?? []).map((item) => item === editingImage.source ? url : item) })); setEditingImage(null); markDirty(); }} />}
    <div className="design-savebar"><span className={`design-save-state ${saveState}`}>{stateLabel[saveState]}</span><button type="button" disabled={!canEdit || busy || imageUploading} onClick={() => void save(false)} className="primary">{saveState === "saving" ? "保存中…" : "テスト全体を保存"}</button><button type="button" disabled={!canEdit || busy || imageUploading} onClick={() => { if (selectedScenarioId && !dirty) onRun(selectedScenarioId); else void save(true); }}>{selectedScenarioId && !dirty ? "このテストで実行を作成" : "保存して実行を作成"}</button></div>
  </div>;
}
