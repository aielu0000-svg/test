import { useEffect, useState } from "react";

type Kind = "case" | "folder" | "scenario" | "data";
type Priority = "high" | "medium" | "low";
type Scope = "common" | "case" | "scenario" | "run";

interface FolderItem { id: string; parentId: string | null; name: string; sortOrder: number; version: number }
interface CaseListItem { id: string; title: string; version: number }
interface ScenarioListItem { id: string; title: string; version: number }
interface DataListItem { id: string; name: string; scope: Scope; version: number }
interface CaseDetail {
  id: string; title: string; objective: string; preconditions: string; viewLocation: string;
  priority: Priority; version: number; tags: string[]; folders: Array<{ id: string; name: string }>;
  steps: Array<{ action: string; expected: string }>;
}
interface ScenarioDetail {
  id: string; title: string; objective: string; preconditions: string; version: number;
  cases: Array<{ id: string; title: string }>;
}
interface DataDetail {
  id: string; name: string; scope: Scope; description: string; version: number;
  items: Array<{ label: string; value: string; memo: string }>;
  links: Array<{ entityType: "folder" | "case" | "scenario" | "run"; entityId: string; applyReason: string }>;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
  const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "通信に失敗しました。");
  return body as T;
}

function move<T>(items: T[], index: number, offset: number): T[] {
  const destination = index + offset;
  if (destination < 0 || destination >= items.length) return items;
  const next = [...items];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export function DefinitionAdminPanel({ projectId, canEdit, onChanged, initialKind = "case", initialId = "", onClose }: {
  projectId: string;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  initialKind?: Kind;
  initialId?: string;
  onClose?: () => void;
}) {
  const query = `projectId=${encodeURIComponent(projectId)}`;
  const [kind, setKind] = useState<Kind>("case");
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [dataSets, setDataSets] = useState<DataListItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [caseDraft, setCaseDraft] = useState<CaseDetail | null>(null);
  const [scenarioDraft, setScenarioDraft] = useState<ScenarioDetail | null>(null);
  const [dataDraft, setDataDraft] = useState<DataDetail | null>(null);
  const [folderDraft, setFolderDraft] = useState<FolderItem | null>(null);
  const [message, setMessage] = useState("");

  async function refreshLists() {
    const [caseResult, folderResult, scenarioResult, dataResult] = await Promise.all([
      api<{ cases: CaseListItem[] }>(`/api/test-cases?${query}`),
      api<{ folders: FolderItem[] }>(`/api/folders?${query}`),
      api<{ scenarios: ScenarioListItem[] }>(`/api/scenarios?${query}`),
      api<{ dataSets: DataListItem[] }>(`/api/data-sets?${query}`),
    ]);
    setCases(caseResult.cases);
    setFolders(folderResult.folders);
    setScenarios(scenarioResult.scenarios);
    setDataSets(dataResult.dataSets);
  }

  useEffect(() => {
    setKind(initialKind);
    setSelectedId(initialId);
    setCaseDraft(null);
    setScenarioDraft(null);
    setDataDraft(null);
    setFolderDraft(null);
    void refreshLists().catch((error) => setMessage(error instanceof Error ? error.message : "読み込みに失敗しました。"));
  }, [projectId]);

  useEffect(() => {
    if (!selectedId) return;
    setMessage("");
    if (kind === "folder") {
      setFolderDraft(folders.find((item) => item.id === selectedId) ?? null);
      return;
    }
    const path = kind === "case" ? "test-cases" : kind === "scenario" ? "scenarios" : "data-sets";
    void api<Record<string, unknown>>(`/api/${path}/${selectedId}?${query}`)
      .then((result) => {
        if (kind === "case") setCaseDraft(result.testCase as CaseDetail);
        if (kind === "scenario") setScenarioDraft(result.scenario as ScenarioDetail);
        if (kind === "data") setDataDraft(result.dataSet as DataDetail);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "詳細を読み込めませんでした。"));
  }, [kind, selectedId]);

  const options = kind === "case" ? cases.map((item) => ({ id: item.id, label: item.title }))
    : kind === "folder" ? folders.map((item) => ({ id: item.id, label: item.name }))
      : kind === "scenario" ? scenarios.map((item) => ({ id: item.id, label: item.title }))
        : dataSets.map((item) => ({ id: item.id, label: item.name }));

  async function complete(action: () => Promise<unknown>, success: string): Promise<boolean> {
    setMessage("保存中…");
    try {
      await action();
      setMessage(success);
      await Promise.all([refreshLists(), onChanged()]);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作に失敗しました。");
      return false;
    }
  }

  async function remove(path: string, id: string) {
    const reason = window.prompt("削除理由を入力してください。");
    if (!reason?.trim()) return;
    const deleted = await complete(() => api(`/api/${path}/${id}`, {
      method: "DELETE",
      body: JSON.stringify({ projectId, reason: reason.trim() }),
    }), "ごみ箱へ移動しました。");
    if (deleted) setSelectedId("");
  }

  return <div className="workspace-grid">
    <section className="panel">
      <h2>定義の編集</h2>
      <p className="muted">既存定義の変更、複製、論理削除を行います。競合時は409となり、再読み込み後に入力を比較できます。</p>
      <div className="segmented">
        {([["case", "ケース"], ["folder", "フォルダ"], ["scenario", "シナリオ"], ["data", "データセット"]] as Array<[Kind, string]>).map(([value, label]) =>
          <button key={value} className={kind === value ? "active" : ""} onClick={() => { setKind(value); setSelectedId(""); }}>{label}</button>)}
      </div>
      <label>編集対象
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
          <option value="">選択してください</option>
          {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      {!canEdit && <p className="muted">このプロジェクトは閲覧のみです。</p>}
    </section>

    <section className="panel">
      {!selectedId && <p className="muted">左側で定義を選択してください。</p>}

      {kind === "case" && caseDraft && <form className="definition-form" onSubmit={(event) => {
        event.preventDefault();
        void complete(() => api(`/api/test-cases/${caseDraft.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            projectId, version: caseDraft.version, title: caseDraft.title, objective: caseDraft.objective,
            preconditions: caseDraft.preconditions, viewLocation: caseDraft.viewLocation, priority: caseDraft.priority,
            tags: caseDraft.tags, folderIds: caseDraft.folders.map((item) => item.id), steps: caseDraft.steps,
          }),
        }), "ケースを更新しました。").then((saved) => { if (saved) { setSelectedId(""); onClose?.(); } });
      }}>
        <h2>ケース編集</h2>
        <div className="field-grid">
          <label>タイトル<input required value={caseDraft.title} onChange={(event) => setCaseDraft({ ...caseDraft, title: event.target.value })} /></label>
          <label>優先度<select value={caseDraft.priority} onChange={(event) => setCaseDraft({ ...caseDraft, priority: event.target.value as Priority })}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
          <label>見る場所<input value={caseDraft.viewLocation} onChange={(event) => setCaseDraft({ ...caseDraft, viewLocation: event.target.value })} /></label>
          <label>タグ<input value={caseDraft.tags.join(", ")} onChange={(event) => setCaseDraft({ ...caseDraft, tags: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} /></label>
        </div>
        <label>目的<textarea value={caseDraft.objective} onChange={(event) => setCaseDraft({ ...caseDraft, objective: event.target.value })} /></label>
        <label>前提条件（Markdown）<textarea value={caseDraft.preconditions} onChange={(event) => setCaseDraft({ ...caseDraft, preconditions: event.target.value })} /></label>
        <fieldset><legend>所属フォルダ</legend><div className="check-grid">{folders.map((folder) => {
          const checked = caseDraft.folders.some((item) => item.id === folder.id);
          return <label className="check-label" key={folder.id}><input type="checkbox" checked={checked} onChange={(event) => setCaseDraft({ ...caseDraft, folders: event.target.checked ? [...caseDraft.folders, { id: folder.id, name: folder.name }] : caseDraft.folders.filter((item) => item.id !== folder.id) })} />{folder.name}</label>;
        })}</div></fieldset>
        <h3>操作と期待結果</h3>
        {caseDraft.steps.map((step, index) => <div className="step-row" key={index}><span>{index + 1}</span><textarea required value={step.action} onChange={(event) => setCaseDraft({ ...caseDraft, steps: caseDraft.steps.map((item, i) => i === index ? { ...item, action: event.target.value } : item) })} /><textarea required value={step.expected} onChange={(event) => setCaseDraft({ ...caseDraft, steps: caseDraft.steps.map((item, i) => i === index ? { ...item, expected: event.target.value } : item) })} /><button type="button" className="danger small" disabled={caseDraft.steps.length === 1} onClick={() => setCaseDraft({ ...caseDraft, steps: caseDraft.steps.filter((_, i) => i !== index) })}>削除</button></div>)}
        <div className="button-row"><button type="button" onClick={() => setCaseDraft({ ...caseDraft, steps: [...caseDraft.steps, { action: "", expected: "" }] })}>手順追加</button><button type="button" onClick={() => void complete(() => api(`/api/test-cases/${caseDraft.id}/duplicate`, { method: "POST", body: JSON.stringify({ projectId }) }), "ケースを複製しました。")}>複製</button><button type="button" className="danger" onClick={() => void remove("test-cases", caseDraft.id)}>削除</button><button className="primary" disabled={!canEdit}>更新</button></div>
      </form>}

      {kind === "folder" && folderDraft && <form className="stack-form" onSubmit={(event) => {
        event.preventDefault();
        void complete(() => api(`/api/folders/${folderDraft.id}`, { method: "PATCH", body: JSON.stringify({ projectId, version: folderDraft.version, name: folderDraft.name, parentId: folderDraft.parentId, sortOrder: folderDraft.sortOrder }) }), "フォルダを更新しました。").then((saved) => { if (saved) { setSelectedId(""); onClose?.(); } });
      }}>
        <h2>フォルダ編集</h2>
        <label>名前<input required value={folderDraft.name} onChange={(event) => setFolderDraft({ ...folderDraft, name: event.target.value })} /></label>
        <label>親フォルダ<select value={folderDraft.parentId ?? ""} onChange={(event) => setFolderDraft({ ...folderDraft, parentId: event.target.value || null })}><option value="">ルート</option>{folders.filter((item) => item.id !== folderDraft.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>並び順<input type="number" value={folderDraft.sortOrder} onChange={(event) => setFolderDraft({ ...folderDraft, sortOrder: Number(event.target.value) })} /></label>
        <div className="button-row"><button type="button" className="danger" onClick={() => void remove("folders", folderDraft.id)}>削除</button><button className="primary" disabled={!canEdit}>更新</button></div>
      </form>}

      {kind === "scenario" && scenarioDraft && <form className="stack-form" onSubmit={(event) => {
        event.preventDefault();
        void complete(() => api(`/api/scenarios/${scenarioDraft.id}`, { method: "PATCH", body: JSON.stringify({ projectId, version: scenarioDraft.version, title: scenarioDraft.title, objective: scenarioDraft.objective, preconditions: scenarioDraft.preconditions, caseIds: scenarioDraft.cases.map((item) => item.id) }) }), "シナリオを更新しました。").then((saved) => { if (saved) { setSelectedId(""); onClose?.(); } });
      }}>
        <h2>シナリオ編集</h2>
        <label>タイトル<input required value={scenarioDraft.title} onChange={(event) => setScenarioDraft({ ...scenarioDraft, title: event.target.value })} /></label>
        <label>目的<textarea value={scenarioDraft.objective} onChange={(event) => setScenarioDraft({ ...scenarioDraft, objective: event.target.value })} /></label>
        <label>前提条件（Markdown）<textarea value={scenarioDraft.preconditions} onChange={(event) => setScenarioDraft({ ...scenarioDraft, preconditions: event.target.value })} /></label>
        <fieldset><legend>ケース順</legend>{scenarioDraft.cases.map((item, index) => <div className="ordered-row" key={item.id}><span>{index + 1}. {item.title}</span><button type="button" disabled={index === 0} onClick={() => setScenarioDraft({ ...scenarioDraft, cases: move(scenarioDraft.cases, index, -1) })}>↑</button><button type="button" disabled={index === scenarioDraft.cases.length - 1} onClick={() => setScenarioDraft({ ...scenarioDraft, cases: move(scenarioDraft.cases, index, 1) })}>↓</button><button type="button" className="danger" onClick={() => setScenarioDraft({ ...scenarioDraft, cases: scenarioDraft.cases.filter((entry) => entry.id !== item.id) })}>除外</button></div>)}<label>ケース追加<select value="" onChange={(event) => { const item = cases.find((entry) => entry.id === event.target.value); if (item && !scenarioDraft.cases.some((entry) => entry.id === item.id)) setScenarioDraft({ ...scenarioDraft, cases: [...scenarioDraft.cases, item] }); }}><option value="">選択してください</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></fieldset>
        <div className="button-row"><button type="button" className="danger" onClick={() => void remove("scenarios", scenarioDraft.id)}>削除</button><button type="button" onClick={() => void complete(() => api("/api/scenarios/" + scenarioDraft.id + "/duplicate", { method: "POST", body: JSON.stringify({ projectId }) }), "シナリオを複製しました。")}>複製して編集</button><button className="primary" disabled={!canEdit}>更新</button></div>
      </form>}

      {kind === "data" && dataDraft && <form className="stack-form" onSubmit={(event) => {
        event.preventDefault();
        void complete(() => api(`/api/data-sets/${dataDraft.id}`, { method: "PATCH", body: JSON.stringify({ projectId, version: dataDraft.version, name: dataDraft.name, scope: dataDraft.scope, description: dataDraft.description, items: dataDraft.items, links: dataDraft.links }) }), "データセットを更新しました。").then((saved) => { if (saved) { setSelectedId(""); onClose?.(); } });
      }}>
        <h2>データセット編集</h2>
        <div className="field-grid"><label>名前<input required value={dataDraft.name} onChange={(event) => setDataDraft({ ...dataDraft, name: event.target.value })} /></label><label>適用範囲<select value={dataDraft.scope} onChange={(event) => setDataDraft({ ...dataDraft, scope: event.target.value as Scope })}><option value="common">共通</option><option value="case">ケース</option><option value="scenario">シナリオ</option><option value="run">実行</option></select></label></div>
        <label>説明（Markdown）<textarea value={dataDraft.description} onChange={(event) => setDataDraft({ ...dataDraft, description: event.target.value })} /></label>
        <fieldset><legend>データ項目</legend>{dataDraft.items.map((item, index) => <div className="data-row" key={index}><input required placeholder="ラベル" value={item.label} onChange={(event) => setDataDraft({ ...dataDraft, items: dataDraft.items.map((entry, i) => i === index ? { ...entry, label: event.target.value } : entry) })} /><input placeholder="値" value={item.value} onChange={(event) => setDataDraft({ ...dataDraft, items: dataDraft.items.map((entry, i) => i === index ? { ...entry, value: event.target.value } : entry) })} /><input placeholder="メモ" value={item.memo} onChange={(event) => setDataDraft({ ...dataDraft, items: dataDraft.items.map((entry, i) => i === index ? { ...entry, memo: event.target.value } : entry) })} /></div>)}<button type="button" onClick={() => setDataDraft({ ...dataDraft, items: [...dataDraft.items, { label: "", value: "", memo: "" }] })}>項目追加</button></fieldset>
        <fieldset><legend>適用先</legend>{dataDraft.links.map((link, index) => <div className="data-link-row" key={index}><select value={link.entityType} onChange={(event) => setDataDraft({ ...dataDraft, links: dataDraft.links.map((entry, i) => i === index ? { ...entry, entityType: event.target.value as DataDetail["links"][number]["entityType"] } : entry) })}><option value="folder">フォルダ</option><option value="case">ケース</option><option value="scenario">シナリオ</option><option value="run">実行</option></select><input placeholder="対象ID" value={link.entityId} onChange={(event) => setDataDraft({ ...dataDraft, links: dataDraft.links.map((entry, i) => i === index ? { ...entry, entityId: event.target.value } : entry) })} /><input placeholder="適用理由" value={link.applyReason} onChange={(event) => setDataDraft({ ...dataDraft, links: dataDraft.links.map((entry, i) => i === index ? { ...entry, applyReason: event.target.value } : entry) })} /><button type="button" className="danger" onClick={() => setDataDraft({ ...dataDraft, links: dataDraft.links.filter((_, i) => i !== index) })}>削除</button></div>)}<button type="button" onClick={() => setDataDraft({ ...dataDraft, links: [...dataDraft.links, { entityType: "case", entityId: "", applyReason: "" }] })}>適用先追加</button></fieldset>
        <div className="button-row"><button type="button" className="danger" onClick={() => void remove("data-sets", dataDraft.id)}>削除</button><button className="primary" disabled={!canEdit}>更新</button></div>
      </form>}

      {message && <p className={message.includes("しました") ? "success-message" : message === "保存中…" ? "muted" : "error-message"}>{message}</p>}
    </section>
  </div>;
}
