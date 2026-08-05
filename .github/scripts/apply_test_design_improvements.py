from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    return text.replace(old, new, 1)


# Folder explorer
path = Path("web/src/client/FolderExplorer.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(text, '  onNewScenario: () => void; onOpenScenario: (id: string) => void | Promise<void>;\n', '  onNewScenario: (folderId: string | null) => void; onOpenScenario: (id: string) => void | Promise<void>;\n', "new scenario callback")
text = replace_once(text, 'onClick={onNewScenario}>＋ 新規</button>', 'onClick={() => onNewScenario(breadcrumbFolderId ?? null)}>＋ 新規</button>', "new scenario folder")
old_drop = '      onDrop={(event) => { if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains("design-root-label")) return; event.preventDefault(); void move(dragKeys(event), null); }}>'
new_drop = '      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const keys = dragKeys(event); if (canDrop(null, keys)) void move(keys, null); }}>'
text = replace_once(text, old_drop, new_drop, "root drop")
text = text.replace('    <p className="design-keyboard-help">↑↓で移動、Enterで開く、Ctrl/⌘またはShiftで複数選択、F2で名前変更、Deleteで削除、Escで取消</p>\n\n', '', 1)
old_menu = '{canEdit && <button role="menuitem" type="button" onClick={() => { setCreating({ parentId: item.id, value: "" }); setExpanded((current) => new Set([...current, item.id])); setMenu(null); }}>新しいサブフォルダ</button>}{canEdit && selected.size === 1 && <button role="menuitem" type="button" onClick={() => startRename(fkey(item.id))}>名前変更（F2）</button>}'
new_menu = '{canEdit && <button role="menuitem" type="button" onClick={() => { setCreating({ parentId: item.id, value: "" }); setExpanded((current) => new Set([...current, item.id])); setMenu(null); }}>新しいサブフォルダ</button>}{canEdit && selected.size > 0 && !selected.has(fkey(item.id)) && <button role="menuitem" type="button" onClick={() => { void move([...selected], item.id); setMenu(null); }}>選択項目をこのフォルダへ移動</button>}{canEdit && selected.size === 1 && <button role="menuitem" type="button" onClick={() => startRename(fkey(item.id))}>名前変更（F2）</button>}'
text = replace_once(text, old_menu, new_menu, "folder move menu")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# Test design editor
path = Path("web/src/client/TestDesignEditor.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(text, 'import { folderDepth } from "./folderExplorerModel.js";\n', 'import { folderDepth } from "./folderExplorerModel.js";\nimport { ViewImageEditor } from "./ViewImageEditor.js";\n', "view editor import")
text = replace_once(text, '  const [imageUploading, setImageUploading] = useState(false);\n', '  const [imageUploading, setImageUploading] = useState(false);\n  const [editingImage, setEditingImage] = useState<{ rowKey: string; source: string } | null>(null);\n', "view image state")
text = replace_once(text, '  function resetEditor() {\n', '  function resetEditor(folderId = "") {\n', "reset parameter")
text = replace_once(text, '    setSelectedScenarioId(""); setScenarioVersion(null); setScenarioFolderId(""); setTitle(""); setObjective(""); setPreconditions("");\n', '    setSelectedScenarioId(""); setScenarioVersion(null); setScenarioFolderId(folderId); setTitle(""); setObjective(""); setPreconditions("");\n', "reset folder")
old_move = '''  async function moveExplorerSelection(selection: ExplorerSelection, targetFolderId: string | null) {
    try {
      for (const folder of selection.folders) {
        if ((folder.parentId ?? null) === targetFolderId) continue;
        await request(`/api/folders/${folder.id}`, {
          method: "PATCH", body: JSON.stringify({ projectId, version: folder.version, parentId: targetFolderId }),
        });
      }
      for (const item of selection.scenarios) {
        if ((item.folderId ?? null) === targetFolderId) continue;
        const result = await request<{ scenario: { version: number; folderId: string | null } }>(`/api/scenarios/${item.id}`, {
          method: "PATCH", body: JSON.stringify({ projectId, version: item.version, folderId: targetFolderId }),
        });
        if (selectedScenarioId === item.id) { setScenarioFolderId(result.scenario.folderId ?? ""); setScenarioVersion(result.scenario.version); }
      }
      await onChanged();
      setMessage(`${selection.folders.length + selection.scenarios.length}件を移動しました。`);
    } catch (error) {
      await onChanged().catch(() => undefined);
      setMessage(errorText(error, "選択項目を移動できませんでした。最新状態を再読み込みしました。"));
      throw error;
    }
  }
'''
new_move = '''  async function moveExplorerSelection(selection: ExplorerSelection, targetFolderId: string | null) {
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
'''
text = replace_once(text, old_move, new_move, "robust folder move")
text = replace_once(text, '          onNewScenario={() => { if (confirmDiscard()) resetEditor(); }}\n', '          onNewScenario={(folderId) => { if (confirmDiscard()) resetEditor(folderId ?? ""); }}\n', "folder aware scenario")
folder_fieldset = '          <fieldset className="design-folder-memberships"><legend>所属フォルダ（複数選択可）</legend>{folders.map((folder) => <label className="check-label" key={folder.id}><input type="checkbox" disabled={!canEdit} checked={selectedRow.folderIds.includes(folder.id)} onChange={(event) => updateRow(selectedIndex, { folderIds: event.target.checked ? [...selectedRow.folderIds, folder.id] : selectedRow.folderIds.filter((id) => id !== folder.id) })} />{folder.name}</label>)}{!folders.length && <span className="muted">フォルダはありません。</span>}</fieldset>\n'
text = replace_once(text, folder_fieldset, '', "remove case folder selector")
old_cells = '''            <td><textarea disabled={!canEdit} aria-label={`操作 ${index + 1}`} value={row.steps[0]?.action ?? ""} onPaste={(event) => pasteGrid(event, index, 1)} onInput={(event) => grow(event.currentTarget)} onChange={(event) => updateRow(index, { steps: [{ ...(row.steps[0] ?? { action: "", expected: "" }), action: event.target.value }, ...row.steps.slice(1)] })} /></td>
            <td><textarea disabled={!canEdit} aria-label={`期待結果 ${index + 1}`} value={row.steps[0]?.expected ?? ""} onPaste={(event) => pasteGrid(event, index, 2)} onInput={(event) => grow(event.currentTarget)} onChange={(event) => updateRow(index, { steps: [{ ...(row.steps[0] ?? { action: "", expected: "" }), expected: event.target.value }, ...row.steps.slice(1)] })} /></td>
'''
new_cells = '''            <td><div className="design-step-summary" aria-label={`操作手順 ${index + 1}`}><strong>{row.steps.length}手順</strong>{row.steps.map((step, stepIndex) => <span key={stepIndex}><b>{stepIndex + 1}.</b> {step.action || "（未入力）"}</span>)}<small>右側の確認項目詳細で編集</small></div></td>
            <td><div className="design-step-summary expected" aria-label={`期待結果一覧 ${index + 1}`}>{row.steps.map((step, stepIndex) => <span key={stepIndex}><b>{stepIndex + 1}.</b> {step.expected || "（未入力）"}</span>)}</div></td>
'''
text = replace_once(text, old_cells, new_cells, "all step summaries")
old_images = '<div className="design-image-grid">{(images[selectedRow.key] ?? []).map((source, imageIndex) => <figure key={imageIndex}><img src={source} alt={`参考画像 ${imageIndex + 1}`} />{canEdit && <button type="button" className="danger small" onClick={() => { setImages((current) => ({ ...current, [selectedRow.key]: (current[selectedRow.key] ?? []).filter((_, index) => index !== imageIndex) })); markDirty(); }}>削除</button>}</figure>)}</div>'
new_images = '<div className="design-image-grid">{(images[selectedRow.key] ?? []).map((source, imageIndex) => <figure key={imageIndex}><button type="button" className="design-image-preview" onClick={() => setEditingImage({ rowKey: selectedRow.key, source })}><img src={source} alt={`参考画像 ${imageIndex + 1}`} /></button>{canEdit && <div className="button-row"><button type="button" className="small" onClick={() => setEditingImage({ rowKey: selectedRow.key, source })}>編集</button><button type="button" className="danger small" onClick={() => { setImages((current) => ({ ...current, [selectedRow.key]: (current[selectedRow.key] ?? []).filter((_, index) => index !== imageIndex) })); markDirty(); }}>削除</button></div>}</figure>)}</div>'
text = replace_once(text, old_images, new_images, "image edit buttons")
marker = '    <div className="design-savebar"><span className={`design-save-state ${saveState}`}>{stateLabel[saveState]}</span>'
editor = '''    {editingImage && <ViewImageEditor projectId={projectId} sourceUrl={editingImage.source} onClose={() => setEditingImage(null)} onSaved={async (url) => { setImages((current) => ({ ...current, [editingImage.rowKey]: (current[editingImage.rowKey] ?? []).map((item) => item === editingImage.source ? url : item) })); setEditingImage(null); markDirty(); }} />}
'''
text = replace_once(text, marker, editor + marker, "view editor render")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# Derived view-image endpoint
path = Path("web/src/server/routes/scenarioEditor.ts")
text = path.read_text(encoding="utf-8-sig")
marker = '  app.get("/api/test-case-images/:id/content", async (request, reply) => {\n'
route = '''  app.post("/api/test-case-images/:id/derived", async (request) => {
    const projectId = projectIdFrom(request);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const sourceId = routeParam(request);
    const sourceRows = await db.query<{ id: string; test_case_id: string | null; original_filename: string }>(
      "SELECT id, test_case_id, original_filename FROM test_case_view_images WHERE id = ? AND project_id = ? AND cleanup_status = 'active' LIMIT 1",
      [sourceId, projectId],
    );
    const source = sourceRows[0];
    if (!source) throw notFound();
    const id = randomUUID();
    const directory = path.join(config.evidenceStoragePath, "view-images", safeSegment(projectId), safeSegment(id));
    const temporaryPath = path.join(directory, "uploading");
    await mkdir(directory, { recursive: true });
    try {
      let received = false;
      const hash = createHash("sha256");
      for await (const part of request.parts()) {
        if (part.type !== "file") continue;
        if (received) throw badRequest("1回の登録につきファイルは1件です。");
        received = true;
        await pipeline(part.file, hashingTransform(hash), createWriteStream(temporaryPath, { flags: "wx" }));
      }
      if (!received) throw badRequest("編集済み画像がありません。");
      const digest = hash.digest("hex");
      const verified = await validatedImage(temporaryPath);
      const storedPath = path.join(directory, `edited-${digest}${verified.extension}`);
      await rename(temporaryPath, storedPath);
      const info = await stat(storedPath);
      await db.execute(
        "INSERT INTO test_case_view_images (id, project_id, test_case_id, original_filename, stored_path, content_type, byte_size, sha256, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [id, projectId, source.test_case_id, `${source.original_filename}.edited.png`, storedPath, verified.contentType, info.size, digest, actor.id],
      );
      await writeAudit(db, request, actor, { action: "test_case_view_image_derived", entityType: "test_case_view_image", entityId: id, projectId, before: { sourceId }, after: { byteSize: info.size, sha256: digest } });
      return { id, url: `/api/test-case-images/${id}/content`, byteSize: info.size, sha256: digest };
    } catch (error) {
      await rm(directory, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
  });

'''
if route not in text:
    text = replace_once(text, marker, route + marker, "derived view image route")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# View image editor component
Path("web/src/client/ViewImageEditor.tsx").write_text(r'''import { useEffect, useRef, useState } from "react";

type Tool = "pen" | "frame" | "crop";
type Point = { x: number; y: number };

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("画像を読み込めませんでした。")); image.src = url;
  });
}
function point(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement): Point {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
}

export function ViewImageEditor({ projectId, sourceUrl, onClose, onSaved }: { projectId: string; sourceUrl: string; onClose: () => void; onSaved: (url: string) => Promise<void> | void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef("");
  const undoRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const startRef = useRef<Point | null>(null);
  const baseRef = useRef<ImageData | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#e1261c");
  const [lineWidth, setLineWidth] = useState(6);
  const [historyTick, setHistoryTick] = useState(0);
  const [message, setMessage] = useState("画像を読み込み中…");
  const imageId = sourceUrl.match(/^\/api\/test-case-images\/([0-9a-f-]{36})\/content$/i)?.[1] ?? "";
  function snapshot() { const canvas = canvasRef.current; if (!canvas) return; undoRef.current.push(canvas.toDataURL("image/png")); if (undoRef.current.length > 30) undoRef.current.shift(); redoRef.current = []; setHistoryTick((value) => value + 1); }
  async function restore(url: string) { const canvas = canvasRef.current; if (!canvas) return; const image = await loadImage(url); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); }
  useEffect(() => { void loadImage(sourceUrl).then((image) => { const canvas = canvasRef.current; if (!canvas) return; canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; canvas.getContext("2d")?.drawImage(image, 0, 0); originalRef.current = canvas.toDataURL("image/png"); setMessage(""); }).catch((error) => setMessage(error.message)); }, [sourceUrl]);
  function rotate() { const canvas = canvasRef.current; if (!canvas) return; snapshot(); const copy = document.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height; copy.getContext("2d")?.drawImage(canvas, 0, 0); canvas.width = copy.height; canvas.height = copy.width; const context = canvas.getContext("2d"); if (!context) return; context.translate(canvas.width, 0); context.rotate(Math.PI / 2); context.drawImage(copy, 0, 0); }
  function flip(horizontal: boolean) { const canvas = canvasRef.current; if (!canvas) return; snapshot(); const copy = document.createElement("canvas"); copy.width = canvas.width; copy.height = canvas.height; copy.getContext("2d")?.drawImage(canvas, 0, 0); const context = canvas.getContext("2d"); if (!context) return; context.clearRect(0, 0, canvas.width, canvas.height); context.save(); context.translate(horizontal ? canvas.width : 0, horizontal ? 0 : canvas.height); context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1); context.drawImage(copy, 0, 0); context.restore(); }
  async function undo() { const canvas = canvasRef.current; const previous = undoRef.current.pop(); if (!canvas || !previous) return; redoRef.current.push(canvas.toDataURL("image/png")); await restore(previous); setHistoryTick((value) => value + 1); }
  async function redo() { const canvas = canvasRef.current; const next = redoRef.current.pop(); if (!canvas || !next) return; undoRef.current.push(canvas.toDataURL("image/png")); await restore(next); setHistoryTick((value) => value + 1); }
  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) { const canvas = canvasRef.current; if (!canvas) return; canvas.setPointerCapture(event.pointerId); snapshot(); startRef.current = point(event, canvas); baseRef.current = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height) ?? null; }
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) { const canvas = canvasRef.current; const start = startRef.current; if (!canvas || !start) return; const current = point(event, canvas); const context = canvas.getContext("2d"); if (!context) return; if (tool === "pen") { context.strokeStyle = color; context.lineWidth = lineWidth; context.lineCap = "round"; context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(current.x, current.y); context.stroke(); startRef.current = current; return; } if (baseRef.current) context.putImageData(baseRef.current, 0, 0); context.strokeStyle = tool === "crop" ? "#1668e3" : color; context.lineWidth = Math.max(2, lineWidth); context.setLineDash(tool === "crop" ? [12, 8] : []); context.strokeRect(start.x, start.y, current.x - start.x, current.y - start.y); context.setLineDash([]); }
  function pointerUp(event: React.PointerEvent<HTMLCanvasElement>) { const canvas = canvasRef.current; const start = startRef.current; if (!canvas || !start) return; const current = point(event, canvas); if (tool === "crop") { if (baseRef.current) canvas.getContext("2d")?.putImageData(baseRef.current, 0, 0); const x = Math.max(0, Math.floor(Math.min(start.x, current.x))); const y = Math.max(0, Math.floor(Math.min(start.y, current.y))); const width = Math.min(canvas.width - x, Math.floor(Math.abs(current.x - start.x))); const height = Math.min(canvas.height - y, Math.floor(Math.abs(current.y - start.y))); if (width > 4 && height > 4) { const cropped = canvas.getContext("2d")?.getImageData(x, y, width, height); if (cropped) { canvas.width = width; canvas.height = height; canvas.getContext("2d")?.putImageData(cropped, 0, 0); } } } startRef.current = null; baseRef.current = null; }
  async function save() { const canvas = canvasRef.current; if (!canvas || !imageId) return setMessage("この画像は編集形式に対応していません。"); setMessage("編集済み画像を保存中…"); const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png")); if (!blob) return setMessage("画像を生成できませんでした。"); const form = new FormData(); form.append("file", blob, "view-image.edited.png"); const response = await fetch(`/api/test-case-images/${imageId}/derived?projectId=${encodeURIComponent(projectId)}`, { method: "POST", body: form, credentials: "same-origin" }); const payload = await response.json().catch(() => ({})) as { url?: string; error?: { message?: string } }; if (!response.ok || !payload.url) return setMessage(payload.error?.message ?? "保存に失敗しました。"); await onSaved(payload.url); }
  return <div className="image-editor-backdrop" role="dialog" aria-modal="true" aria-label="見る場所画像編集"><div className="image-editor"><div className="section-heading"><div><h2>見る場所の画像を編集</h2><p className="muted">元画像を残し、編集後の画像を新しく保存します。</p></div><button type="button" onClick={onClose}>閉じる</button></div><div className="image-toolbar"><button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}>ペン</button><button className={tool === "frame" ? "active" : ""} onClick={() => setTool("frame")}>枠線</button><button className={tool === "crop" ? "active" : ""} onClick={() => setTool("crop")}>トリミング</button><label>色<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label><label>太さ<input type="range" min="1" max="30" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} /></label><button onClick={rotate}>90°回転</button><button onClick={() => flip(true)}>左右反転</button><button onClick={() => flip(false)}>上下反転</button><button disabled={!undoRef.current.length} onClick={() => void undo()}>元に戻す</button><button disabled={!redoRef.current.length} onClick={() => void redo()}>やり直す</button><button onClick={() => { if (originalRef.current) { snapshot(); void restore(originalRef.current); } }}>元画像へ戻す</button><span hidden>{historyTick}</span></div><div className="canvas-stage"><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} /></div><div className="button-row"><button className="primary" onClick={() => void save()}>編集後の画像を保存</button></div>{message && <p className="muted" role="status">{message}</p>}</div></div>;
}
''', encoding="utf-8")


# CSS
path = Path("web/src/client/test-design.css")
text = path.read_text(encoding="utf-8")
styles = r'''
.design-step-summary { display: grid; gap: .35rem; min-width: 220px; max-height: 12rem; overflow: auto; padding: .55rem .65rem; border: 1px solid #dfe5ee; border-radius: 8px; background: #f8faff; text-align: left; }
.design-step-summary > strong { color: #17498e; font-size: .78rem; }
.design-step-summary > span { display: grid; grid-template-columns: 1.5rem 1fr; gap: .2rem; color: #344157; font-size: .82rem; white-space: pre-wrap; }
.design-step-summary > small { color: #6b7689; }
.design-step-summary.expected { background: #fbfcfe; }
.design-image-preview { display: block; width: 100%; padding: 0; border: 0; background: transparent; }
.design-image-preview img { display: block; width: 100%; }
'''
if ".design-step-summary" not in text:
    text = text.rstrip() + "\n" + styles
path.write_text(text.rstrip() + "\n", encoding="utf-8")
