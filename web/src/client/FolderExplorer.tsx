import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { folderAncestors, invalidMoveTargetIds } from "./folderExplorerModel.js";

export interface ExplorerFolder { id: string; parentId: string | null; name: string; version: number }
export interface ExplorerScenario { id: string; folderId?: string | null; title: string; version: number; caseCount: number; updatedAt: string }
export interface ExplorerSelection { folders: ExplorerFolder[]; scenarios: ExplorerScenario[] }

type Key = `folder:${string}` | `scenario:${string}`;
type Item = { key: Key; kind: "folder" | "scenario"; id: string; depth: number; parentId: string | null };
type Menu = { x: number; y: number; key: Key | null };
const fkey = (id: string): Key => `folder:${id}`;
const skey = (id: string): Key => `scenario:${id}`;
const idOf = (key: Key) => key.slice(key.indexOf(":") + 1);

function selection(keys: Iterable<Key>, folders: ExplorerFolder[], scenarios: ExplorerScenario[]): ExplorerSelection {
  const chosen = new Set(keys);
  return {
    folders: folders.filter((item) => chosen.has(fkey(item.id))),
    scenarios: scenarios.filter((item) => chosen.has(skey(item.id))),
  };
}

export function FolderExplorer({ canEdit, busy, folders, scenarios, selectedScenarioId, onNewScenario, onOpenScenario,
  onCreateFolder, onRenameFolder, onRenameScenario, onDuplicateScenario, onDeleteSelection, onMoveSelection, onRunScenario }: {
  canEdit: boolean; busy: boolean; folders: ExplorerFolder[]; scenarios: ExplorerScenario[]; selectedScenarioId: string;
  onNewScenario: (folderId: string | null) => void; onOpenScenario: (id: string) => void | Promise<void>;
  onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
  onRenameFolder: (folder: ExplorerFolder, name: string) => Promise<void>;
  onRenameScenario: (scenario: ExplorerScenario, title: string) => Promise<void>;
  onDuplicateScenario: (scenario: ExplorerScenario) => Promise<void>;
  onDeleteSelection: (items: ExplorerSelection, reason: string) => Promise<void>;
  onMoveSelection: (items: ExplorerSelection, targetFolderId: string | null) => Promise<void>;
  onRunScenario: (scenarioId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(() => new Set(folders.map((item) => item.id)));
  const [selected, setSelected] = useState<Set<Key>>(() => selectedScenarioId ? new Set([skey(selectedScenarioId)]) : new Set());
  const [active, setActive] = useState<Key | null>(() => selectedScenarioId ? skey(selectedScenarioId) : null);
  const [anchor, setAnchor] = useState<Key | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [rename, setRename] = useState<{ key: Key; value: string } | null>(null);
  const [creating, setCreating] = useState<{ parentId: string | null; value: string } | null>(null);
  const [deleting, setDeleting] = useState<{ keys: Key[]; reason: string } | null>(null);
  const [dragging, setDragging] = useState<Key[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>();
  const [working, setWorking] = useState(false);
  const refs = useRef(new Map<Key, HTMLDivElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const renameKey = useRef<Key | null>(null);

  useEffect(() => setExpanded((current) => new Set([...current, ...folders.map((item) => item.id)])), [folders]);
  useEffect(() => {
    if (!selectedScenarioId) return;
    const key = skey(selectedScenarioId); setSelected(new Set([key])); setActive(key);
    const folderId = scenarios.find((item) => item.id === selectedScenarioId)?.folderId;
    if (folderId) setExpanded((current) => new Set([...current, ...folderAncestors(folders, folderId).map((item) => item.id)]));
  }, [selectedScenarioId, scenarios, folders]);
  useEffect(() => {
    const close = () => setMenu(null); window.addEventListener("click", close); window.addEventListener("resize", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("resize", close); };
  }, []);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const margin = 8;
    const rect = menuRef.current.getBoundingClientRect();
    const left = Math.min(Math.max(menu.x, margin), Math.max(margin, window.innerWidth - rect.width - margin));
    const top = Math.min(Math.max(menu.y, margin), Math.max(margin, window.innerHeight - rect.height - margin));
    menuRef.current.style.left = `${left}px`;
    menuRef.current.style.top = `${top}px`;
  }, [menu]);

  const byParent = useMemo(() => {
    const map = new Map<string | null, ExplorerFolder[]>();
    for (const item of folders) map.set(item.parentId ?? null, [...(map.get(item.parentId ?? null) ?? []), item]);
    return map;
  }, [folders]);
  const testsByFolder = useMemo(() => {
    const map = new Map<string | null, ExplorerScenario[]>();
    for (const item of scenarios) map.set(item.folderId ?? null, [...(map.get(item.folderId ?? null) ?? []), item]);
    return map;
  }, [scenarios]);
  const term = search.trim().toLocaleLowerCase("ja");
  const visible = useMemo(() => {
    const items: Item[] = [];
    const folderMatches = (folder: ExplorerFolder, visited = new Set<string>()): boolean => {
      if (!term) return true; if (visited.has(folder.id)) return false; visited.add(folder.id);
      return folder.name.toLocaleLowerCase("ja").includes(term)
        || (testsByFolder.get(folder.id) ?? []).some((item) => item.title.toLocaleLowerCase("ja").includes(term))
        || (byParent.get(folder.id) ?? []).some((child) => folderMatches(child, new Set(visited)));
    };
    const append = (folder: ExplorerFolder, depth: number, visited: Set<string>) => {
      if (visited.has(folder.id) || !folderMatches(folder)) return;
      items.push({ key: fkey(folder.id), kind: "folder", id: folder.id, depth, parentId: folder.parentId ?? null });
      if (!term && !expanded.has(folder.id)) return;
      const next = new Set(visited).add(folder.id);
      for (const test of testsByFolder.get(folder.id) ?? []) if (!term || test.title.toLocaleLowerCase("ja").includes(term))
        items.push({ key: skey(test.id), kind: "scenario", id: test.id, depth: depth + 1, parentId: folder.id });
      for (const child of byParent.get(folder.id) ?? []) append(child, depth + 1, next);
    };
    for (const test of testsByFolder.get(null) ?? []) if (!term || test.title.toLocaleLowerCase("ja").includes(term))
      items.push({ key: skey(test.id), kind: "scenario", id: test.id, depth: 0, parentId: null });
    for (const folder of byParent.get(null) ?? []) append(folder, 0, new Set());
    return items;
  }, [byParent, testsByFolder, expanded, term]);

  const breadcrumbFolderId = active?.startsWith("folder:") ? idOf(active)
    : active?.startsWith("scenario:") ? scenarios.find((item) => item.id === idOf(active))?.folderId
    : scenarios.find((item) => item.id === selectedScenarioId)?.folderId;
  const breadcrumbs = folderAncestors(folders, breadcrumbFolderId);

  function focus(key: Key | null) { setActive(key); requestAnimationFrame(() => key && refs.current.get(key)?.focus()); }
  function choose(key: Key, event: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } = {}) {
    const additive = event.ctrlKey || event.metaKey;
    if (event.shiftKey && anchor) {
      const a = visible.findIndex((item) => item.key === anchor), b = visible.findIndex((item) => item.key === key);
      if (a >= 0 && b >= 0) setSelected(new Set(visible.slice(Math.min(a, b), Math.max(a, b) + 1).map((item) => item.key)));
    } else if (additive) {
      setSelected((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; }); setAnchor(key);
    } else { setSelected(new Set([key])); setAnchor(key); }
    focus(key);
  }
  function toggle(id: string) { setExpanded((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function actionKeys(key: Key | null) { return key && selected.has(key) ? [...selected] : key ? [key] : [...selected]; }
  function openMenu(event: React.MouseEvent, key: Key | null) { event.preventDefault(); event.stopPropagation(); if (key && !selected.has(key)) choose(key); setMenu({ x: event.clientX, y: event.clientY, key }); }

  function startRename(key: Key) {
    const value = key.startsWith("folder:") ? folders.find((item) => item.id === idOf(key))?.name : scenarios.find((item) => item.id === idOf(key))?.title;
    if (!canEdit || !value) return; renameKey.current = key; setRename({ key, value }); setMenu(null);
  }
  async function saveRename(key: Key, value: string) {
    if (renameKey.current !== key) return; renameKey.current = null; setRename(null); const name = value.trim(); if (!name) return;
    setWorking(true); try {
      if (key.startsWith("folder:")) { const item = folders.find((folder) => folder.id === idOf(key)); if (item && item.name !== name) await onRenameFolder(item, name); }
      else { const item = scenarios.find((test) => test.id === idOf(key)); if (item && item.title !== name) await onRenameScenario(item, name); }
    } catch { /* parent reports error */ } finally { setWorking(false); }
  }
  async function saveCreate() {
    if (!creating?.value.trim()) return; const item = creating; setCreating(null); setWorking(true);
    try { await onCreateFolder(item.value.trim(), item.parentId); if (item.parentId) setExpanded((current) => new Set([...current, item.parentId!])); }
    catch { /* parent reports error */ } finally { setWorking(false); }
  }
  async function remove() {
    if (!deleting?.reason.trim()) return; setWorking(true);
    try { await onDeleteSelection(selection(deleting.keys, folders, scenarios), deleting.reason.trim()); setDeleting(null); setSelected(new Set()); setActive(null); }
    catch { /* parent reports error */ } finally { setWorking(false); }
  }
  async function move(keys: Key[], target: string | null) {
    const items = selection(keys, folders, scenarios); if (target && invalidMoveTargetIds(folders, items.folders.map((item) => item.id)).has(target)) return;
    setWorking(true); try { await onMoveSelection(items, target); if (target) setExpanded((current) => new Set([...current, target])); }
    catch { /* parent reports error */ } finally { setWorking(false); setDropTarget(undefined); setDragging([]); }
  }
  function dragStart(event: React.DragEvent, key: Key) {
    const keys = selected.has(key) ? [...selected] : [key]; if (!selected.has(key)) choose(key); setDragging(keys);
    event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-the-test-explorer", JSON.stringify(keys));
  }
  function dragKeys(event: React.DragEvent): Key[] { try { return JSON.parse(event.dataTransfer.getData("application/x-the-test-explorer")) as Key[]; } catch { return dragging; } }
  function canDrop(target: string | null, keys = dragging) { const items = selection(keys, folders, scenarios); return !target || !invalidMoveTargetIds(folders, items.folders.map((item) => item.id)).has(target); }

  function keyboard(event: React.KeyboardEvent<HTMLDivElement>, item: Item) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    const index = visible.findIndex((entry) => entry.key === item.key);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); const next = visible[Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), visible.length - 1)]; if (next) choose(next.key, event); }
    else if (event.key === "ArrowRight" && item.kind === "folder") { event.preventDefault(); if (!expanded.has(item.id)) toggle(item.id); else if (visible[index + 1]?.depth > item.depth) choose(visible[index + 1]!.key); }
    else if (event.key === "ArrowLeft" && item.kind === "folder") { event.preventDefault(); if (expanded.has(item.id)) toggle(item.id); else if (item.parentId) choose(fkey(item.parentId)); }
    else if (event.key === "Enter") { event.preventDefault(); item.kind === "folder" ? toggle(item.id) : void onOpenScenario(item.id); }
    else if (event.key === "F2") { event.preventDefault(); startRename(item.key); }
    else if (event.key === "Delete") { event.preventDefault(); setDeleting({ keys: actionKeys(item.key), reason: "" }); }
    else if (event.key === "Escape") { renameKey.current = null; setRename(null); setCreating(null); setMenu(null); setDeleting(null); }
  }

  function createRow(parentId: string | null, depth: number) { return creating?.parentId === parentId ? <div className="design-inline-create" style={{ paddingLeft: `${8 + depth * 18}px` }}>
    <span>📁</span><input autoFocus aria-label="作成するフォルダ名" value={creating.value} onChange={(event) => setCreating({ ...creating, value: event.target.value })}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void saveCreate(); } if (event.key === "Escape") setCreating(null); }} />
    <button type="button" className="small" disabled={!creating.value.trim() || working} onClick={() => void saveCreate()}>作成</button><button type="button" className="small" onClick={() => setCreating(null)}>取消</button>
  </div> : null; }

  function row(item: Item) {
    const isSelected = selected.has(item.key), isActive = active === item.key;
    if (item.kind === "folder") {
      const folder = folders.find((entry) => entry.id === item.id)!;
      return <div ref={(node) => { if (node) refs.current.set(item.key, node); else refs.current.delete(item.key); }} role="treeitem" aria-label={`フォルダ ${folder.name}`}
        data-item-type="folder" data-item-id={folder.id} data-parent-id={folder.parentId ?? ""} data-version={folder.version}
        aria-expanded={expanded.has(folder.id)} aria-selected={isSelected} tabIndex={isActive ? 0 : -1}
        className={`design-folder-row explorer-row${isSelected ? " selected" : ""}${isActive ? " active" : ""}${dropTarget === folder.id ? " drop-target" : ""}`}
        style={{ paddingLeft: `${8 + item.depth * 18}px` }} draggable={canEdit && !rename && !working}
        onClick={(event) => choose(item.key, event)} onDoubleClick={() => toggle(folder.id)} onContextMenu={(event) => openMenu(event, item.key)} onKeyDown={(event) => keyboard(event, item)}
        onDragStart={(event) => dragStart(event, item.key)} onDragEnd={() => { setDragging([]); setDropTarget(undefined); }}
        onDragOver={(event) => { if (canEdit && canDrop(folder.id)) { event.preventDefault(); setDropTarget(folder.id); } }}
        onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const keys = dragKeys(event); if (canDrop(folder.id, keys)) void move(keys, folder.id); }}>
        <button type="button" className="design-folder-toggle" aria-label={`${folder.name}を${expanded.has(folder.id) ? "折りたたむ" : "展開する"}`} onClick={(event) => { event.stopPropagation(); toggle(folder.id); }}>{expanded.has(folder.id) ? "▾" : "▸"}</button>
        <span>📁</span>{rename?.key === item.key ? <input autoFocus className="design-inline-name" aria-label="フォルダ名を変更" value={rename.value}
          onChange={(event) => setRename({ key: item.key, value: event.target.value })} onBlur={() => void saveRename(item.key, rename.value)}
          onKeyDown={(event) => { if (event.key === "Enter") void saveRename(item.key, rename.value); if (event.key === "Escape") { renameKey.current = null; setRename(null); focus(item.key); } }} /> : <strong>{folder.name}</strong>}
        {canEdit && <button type="button" className="design-row-menu" aria-label={`${folder.name}の操作`} onClick={(event) => openMenu(event, item.key)}>…</button>}
      </div>;
    }
    const test = scenarios.find((entry) => entry.id === item.id)!;
    return <div ref={(node) => { if (node) refs.current.set(item.key, node); else refs.current.delete(item.key); }} role="treeitem" aria-label={`テスト ${test.title}`}
      data-item-type="scenario" data-item-id={test.id} data-parent-id={test.folderId ?? ""} data-version={test.version} aria-selected={isSelected} tabIndex={isActive ? 0 : -1}
      className={`design-test-row explorer-row${isSelected ? " selected" : ""}${isActive ? " active" : ""}${selectedScenarioId === test.id ? " opened" : ""}`}
      style={{ paddingLeft: `${30 + item.depth * 18}px` }} draggable={canEdit && !rename && !working}
      onClick={(event) => { choose(item.key, event); if (!event.ctrlKey && !event.metaKey && !event.shiftKey) void onOpenScenario(test.id); }}
      onContextMenu={(event) => openMenu(event, item.key)} onKeyDown={(event) => keyboard(event, item)} onDragStart={(event) => dragStart(event, item.key)} onDragEnd={() => { setDragging([]); setDropTarget(undefined); }}>
      <span>▤</span><span className="design-test-label">{rename?.key === item.key ? <input autoFocus className="design-inline-name" aria-label="テスト名を変更" value={rename.value}
        onChange={(event) => setRename({ key: item.key, value: event.target.value })} onBlur={() => void saveRename(item.key, rename.value)}
        onKeyDown={(event) => { if (event.key === "Enter") void saveRename(item.key, rename.value); if (event.key === "Escape") { renameKey.current = null; setRename(null); focus(item.key); } }} /> : <strong>{test.title}</strong>}<small>{test.caseCount}件の確認項目</small></span>
      {canEdit && <button type="button" className="design-row-menu" aria-label={`${test.title}の操作`} onClick={(event) => openMenu(event, item.key)}>…</button>}
    </div>;
  }

  return <>
    <div className="design-panel-head"><div><p className="eyebrow">TESTS</p><h2>テスト一覧</h2></div>{canEdit && <button type="button" className="primary small" disabled={busy || working} onClick={() => onNewScenario(breadcrumbFolderId ?? null)}>＋ 新規</button>}</div>
    <div className="design-browser-tools"><input className="design-search" type="search" placeholder="テスト・フォルダを検索" value={search} onChange={(event) => setSearch(event.target.value)} />
      {canEdit && <button type="button" className="small" disabled={working} onClick={() => setCreating({ parentId: breadcrumbFolderId ?? null, value: "" })}>＋ フォルダ</button>}</div>
    <nav className="design-breadcrumb" aria-label="フォルダのパンくず"><button type="button" onClick={() => { setSelected(new Set()); focus(visible[0]?.key ?? null); }}>プロジェクト直下</button>
      {breadcrumbs.map((folder) => <span key={folder.id}><span>›</span><button type="button" onClick={() => { setExpanded((current) => new Set([...current, folder.id])); choose(fkey(folder.id)); }}>{folder.name}</button></span>)}</nav>
    <div className={`design-tree-root${dropTarget === null ? " drop-target" : ""}`} role="tree" aria-label="テストとフォルダ"
      onContextMenu={(event) => { if (event.target === event.currentTarget) openMenu(event, null); }} onDragOver={(event) => { if (canEdit) { event.preventDefault(); setDropTarget(null); } }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const keys = dragKeys(event); if (canDrop(null, keys)) void move(keys, null); }}>
      <div className="design-root-label" onContextMenu={(event) => openMenu(event, null)}>プロジェクト直下</div>{createRow(null, 0)}
      {visible.map((item) => <div key={item.key}>{row(item)}{item.kind === "folder" && createRow(item.id, item.depth + 1)}</div>)}
      {!visible.length && <p className="muted">該当するテストまたはフォルダはありません。</p>}
    </div>
    {menu && <div ref={menuRef} className="design-context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
      {menu.key === null && <>{canEdit && <button role="menuitem" type="button" onClick={() => { setCreating({ parentId: null, value: "" }); setMenu(null); }}>新しいフォルダ</button>}{selected.size > 0 && canEdit && <button role="menuitem" type="button" onClick={() => { void move([...selected], null); setMenu(null); }}>選択項目をここへ移動</button>}</>}
      {menu.key?.startsWith("folder:") && (() => { const item = folders.find((folder) => folder.id === idOf(menu.key!)); return item ? <><button role="menuitem" type="button" onClick={() => { toggle(item.id); setMenu(null); }}>{expanded.has(item.id) ? "折りたたむ" : "展開する"}</button>
        {canEdit && <button role="menuitem" type="button" onClick={() => { setCreating({ parentId: item.id, value: "" }); setExpanded((current) => new Set([...current, item.id])); setMenu(null); }}>新しいサブフォルダ</button>}{canEdit && selected.size > 0 && !selected.has(fkey(item.id)) && <button role="menuitem" type="button" onClick={() => { void move([...selected], item.id); setMenu(null); }}>選択項目をこのフォルダへ移動</button>}{canEdit && selected.size === 1 && <button role="menuitem" type="button" onClick={() => startRename(fkey(item.id))}>名前変更（F2）</button>}{canEdit && <button role="menuitem" type="button" className="danger" onClick={() => { setDeleting({ keys: actionKeys(fkey(item.id)), reason: "" }); setMenu(null); }}>削除</button>}</> : null; })()}
      {menu.key?.startsWith("scenario:") && (() => { const item = scenarios.find((test) => test.id === idOf(menu.key!)); return item ? <><button role="menuitem" type="button" onClick={() => { void onOpenScenario(item.id); setMenu(null); }}>開く</button>
        {canEdit && selected.size === 1 && <button role="menuitem" type="button" onClick={() => startRename(skey(item.id))}>名前変更（F2）</button>}{canEdit && selected.size === 1 && <button role="menuitem" type="button" onClick={() => { void onDuplicateScenario(item).catch(() => undefined); setMenu(null); }}>複製</button>}<button role="menuitem" type="button" onClick={() => { onRunScenario(item.id); setMenu(null); }}>テスト実行を開始</button>{canEdit && <button role="menuitem" type="button" className="danger" onClick={() => { setDeleting({ keys: actionKeys(skey(item.id)), reason: "" }); setMenu(null); }}>削除</button>}</> : null; })()}
    </div>}
    {deleting && <div className="design-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleting(null); }}><section className="design-delete-dialog" role="dialog" aria-modal="true" aria-label="選択項目を削除"><h3>選択項目を削除</h3><p>{deleting.keys.length}件を削除します。内容があるフォルダは削除できません。</p>
      <label>削除理由<input autoFocus aria-label="削除理由" value={deleting.reason} onChange={(event) => setDeleting({ ...deleting, reason: event.target.value })} onKeyDown={(event) => { if (event.key === "Escape") setDeleting(null); if (event.key === "Enter" && deleting.reason.trim()) void remove(); }} /></label>
      <div className="button-row"><button type="button" onClick={() => setDeleting(null)}>取消</button><button type="button" className="danger" disabled={!deleting.reason.trim() || working} onClick={() => void remove()}>削除する</button></div></section></div>}
  </>;
}
