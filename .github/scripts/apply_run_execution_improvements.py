from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    return text.replace(old, new, 1)


# Run snapshot/data/view-image API
path = Path("web/src/server/routes/runs.ts")
text = path.read_text(encoding="utf-8-sig")
old = '''  const standaloneCaseIds = withoutScenarioCases(caseIds, scenarioCaseRows.map((row) => String(row.test_case_id)));
  for (const [position, caseId] of standaloneCaseIds.entries()) await copyCase(connection, projectId, runId, null, caseId, revisionNo, position);
  await copyLinkedDataSets(connection, projectId, runId, revisionNo, dataSetIds);
'''
new = '''  const scenarioCaseIds = scenarioCaseRows.map((row) => String(row.test_case_id));
  const standaloneCaseIds = withoutScenarioCases(caseIds, scenarioCaseIds);
  for (const [position, caseId] of standaloneCaseIds.entries()) await copyCase(connection, projectId, runId, null, caseId, revisionNo, position);
  const linkedDataSetIds: string[] = [];
  if (scenarioIds.length) {
    const rows = await connection.query<Array<{ data_set_id: string }>>(
      `SELECT DISTINCT l.data_set_id FROM data_links l JOIN data_sets d ON d.id = l.data_set_id
        WHERE d.project_id = ? AND d.deleted_at IS NULL AND l.entity_type = 'scenario' AND l.entity_id IN (?)`,
      [projectId, scenarioIds],
    );
    linkedDataSetIds.push(...rows.map((row) => String(row.data_set_id)));
  }
  const effectiveCaseIds = [...new Set([...scenarioCaseIds, ...standaloneCaseIds])];
  if (effectiveCaseIds.length) {
    const rows = await connection.query<Array<{ data_set_id: string }>>(
      `SELECT DISTINCT l.data_set_id FROM data_links l JOIN data_sets d ON d.id = l.data_set_id
        WHERE d.project_id = ? AND d.deleted_at IS NULL AND l.entity_type = 'case' AND l.entity_id IN (?)`,
      [projectId, effectiveCaseIds],
    );
    linkedDataSetIds.push(...rows.map((row) => String(row.data_set_id)));
  }
  await copyLinkedDataSets(connection, projectId, runId, revisionNo, [...new Set([...dataSetIds, ...linkedDataSetIds])]);
'''
text = replace_once(text, old, new, "automatic data snapshots")
old = '''    const [scenarios, cases, dataSets, revisions, counts, steps] = await Promise.all([
'''
new = '''    const [scenarios, cases, dataSets, revisions, counts, steps, dataItems] = await Promise.all([
'''
text = replace_once(text, old, new, "data item promise")
old = '''      db.query<Record<string, unknown>>("SELECT run_case_snapshot_id, step_no, action_text, expected_result FROM run_step_snapshots WHERE run_case_snapshot_id IN (SELECT id FROM run_case_snapshots WHERE test_run_id = ?) ORDER BY run_case_snapshot_id, step_no", [run.id]),
    ]);
'''
new = '''      db.query<Record<string, unknown>>("SELECT run_case_snapshot_id, step_no, action_text, expected_result FROM run_step_snapshots WHERE run_case_snapshot_id IN (SELECT id FROM run_case_snapshots WHERE test_run_id = ?) ORDER BY run_case_snapshot_id, step_no", [run.id]),
      db.query<Record<string, unknown>>("SELECT run_data_set_snapshot_id, item_no, label, value_text, memo FROM run_data_item_snapshots WHERE run_data_set_snapshot_id IN (SELECT id FROM run_data_set_snapshots WHERE test_run_id = ?) ORDER BY run_data_set_snapshot_id, item_no", [run.id]),
    ]);
'''
text = replace_once(text, old, new, "data item query")
old = '''      scenarios, cases: cases.map((item) => ({ ...item, steps: steps.filter((step) => step.run_case_snapshot_id === item.id).map((step) => ({ stepNo: Number(step.step_no), action: step.action_text, expected: step.expected_result })) })), dataSets, revisions,
'''
new = '''      scenarios,
      cases: cases.map((item) => ({ ...item, steps: steps.filter((step) => step.run_case_snapshot_id === item.id).map((step) => ({ stepNo: Number(step.step_no), action: step.action_text, expected: step.expected_result })) })),
      dataSets: dataSets.map((item) => ({ ...item, items: dataItems.filter((dataItem) => dataItem.run_data_set_snapshot_id === item.id).map((dataItem) => ({ itemNo: Number(dataItem.item_no), label: dataItem.label, value: dataItem.value_text ?? "", memo: dataItem.memo ?? "" })) })),
      revisions,
'''
text = replace_once(text, old, new, "data items response")
marker = '  app.patch("/api/run-scenarios/:id", async (request) => {\n'
route = '''  app.post("/api/run-cases/:id/view-image", async (request) => {
    const input = objectBody(request);
    const projectId = projectIdFrom(request, input);
    const actor = await authenticatedProject(request, db, config, projectId, true);
    const id = routeParam(request);
    const parentStatus = await ensureSnapshotProject(db, "run_case_snapshots", id, projectId);
    const version = versionValue(input.version);
    const sourceUrl = stringValue(input.sourceUrl, "sourceUrl", 1000, true);
    const newUrl = stringValue(input.newUrl, "newUrl", 1000, true);
    const imageId = (value: string) => value.match(/^\/api\/test-case-images\/([0-9a-f-]{36})\/content$/i)?.[1] ?? "";
    const sourceImageId = imageId(sourceUrl); const newImageId = imageId(newUrl);
    if (!sourceImageId || !newImageId) throw badRequest("見る場所画像URLが不正です。");
    const images = await db.query<{ id: string }>(
      "SELECT id FROM test_case_view_images WHERE project_id = ? AND cleanup_status = 'active' AND id IN (?, ?)",
      [projectId, sourceImageId, newImageId],
    );
    if (images.length !== 2) throw badRequest("編集元または編集後の画像が見つかりません。");
    const rows = await db.query<{ view_images_json: string | null }>("SELECT view_images_json FROM run_case_snapshots WHERE id = ? LIMIT 1", [id]);
    const current = (() => { try { const value = JSON.parse(rows[0]?.view_images_json ?? "[]"); return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; } catch { return []; } })();
    if (!current.includes(sourceUrl)) throw badRequest("編集元画像は現在の実行スナップショットに含まれていません。");
    const next = current.map((value) => value === sourceUrl ? newUrl : value);
    await db.withTransaction(async (connection) => {
      const result = await connection.query(
        "UPDATE run_case_snapshots c JOIN test_runs r ON r.id = c.test_run_id SET c.view_images_json = ?, c.version = c.version + 1 WHERE c.id = ? AND c.version = ? AND c.excluded_at IS NULL AND r.project_id = ? AND r.deleted_at IS NULL",
        [JSON.stringify(next), id, version, projectId],
      );
      if (Number(result.affectedRows) !== 1) throw conflict();
      if (parentStatus === "completed") {
        await connection.query(
          "UPDATE test_runs r JOIN run_case_snapshots c ON c.test_run_id = r.id SET r.post_completion_updated_at = UTC_TIMESTAMP(6), r.post_completion_updated_by = ?, r.updated_at = UTC_TIMESTAMP(6), r.version = r.version + 1 WHERE c.id = ? AND r.status = 'completed'",
          [actor.id, id],
        );
      }
    });
    await writeAudit(db, request, actor, { action: "run_case_view_image_updated", entityType: "run_case_snapshot", entityId: id, projectId, before: { sourceUrl }, after: { newUrl } });
    const updatedRows = await db.query<{ version: number; view_images_json: string }>("SELECT version, view_images_json FROM run_case_snapshots WHERE id = ? LIMIT 1", [id]);
    const runRows = await db.query<Pick<RunRow, "id" | "version" | "post_completion_updated_at" | "post_completion_updated_by">>(
      "SELECT r.id, r.version, r.post_completion_updated_at, r.post_completion_updated_by FROM test_runs r JOIN run_case_snapshots c ON c.test_run_id = r.id WHERE c.id = ? LIMIT 1", [id],
    );
    return { ok: true, runCase: { id, version: Number(updatedRows[0]?.version), view_images_json: updatedRows[0]?.view_images_json }, run: runRows[0] ? { id: runRows[0].id, version: Number(runRows[0].version), postCompletionUpdatedAt: runRows[0].post_completion_updated_at, postCompletionUpdatedBy: runRows[0].post_completion_updated_by } : null };
  });

'''
if route not in text:
    text = replace_once(text, marker, route + marker, "run view image update")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# Allow run-scope derived images
path = Path("web/src/server/routes/scenarioEditor.ts")
text = path.read_text(encoding="utf-8-sig")
old = '    const source = sourceRows[0];\n    if (!source) throw notFound();\n    const id = randomUUID();\n'
new = '    const source = sourceRows[0];\n    if (!source) throw notFound();\n    const runScope = (request.query as Record<string, unknown>).scope === "run";\n    const id = randomUUID();\n'
text = replace_once(text, old, new, "run scoped image")
old = '[id, projectId, source.test_case_id, `${source.original_filename}.edited.png`, storedPath, verified.contentType, info.size, digest, actor.id],'
new = '[id, projectId, runScope ? null : source.test_case_id, `${source.original_filename}.edited.png`, storedPath, verified.contentType, info.size, digest, actor.id],'
text = replace_once(text, old, new, "run image ownership")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# View editor scope prop
path = Path("web/src/client/ViewImageEditor.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(text, 'export function ViewImageEditor({ projectId, sourceUrl, onClose, onSaved }: { projectId: string; sourceUrl: string; onClose: () => void; onSaved: (url: string) => Promise<void> | void }) {', 'export function ViewImageEditor({ projectId, sourceUrl, scope = "definition", onClose, onSaved }: { projectId: string; sourceUrl: string; scope?: "definition" | "run"; onClose: () => void; onSaved: (url: string) => Promise<void> | void }) {', "scope prop")
text = replace_once(text, 'const response = await fetch(`/api/test-case-images/${imageId}/derived?projectId=${encodeURIComponent(projectId)}`, { method: "POST", body: form, credentials: "same-origin" });', 'const response = await fetch(`/api/test-case-images/${imageId}/derived?projectId=${encodeURIComponent(projectId)}${scope === "run" ? "&scope=run" : ""}`, { method: "POST", body: form, credentials: "same-origin" });', "scope query")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# Run UI
path = Path("web/src/client/OperationsWorkspaceV2.tsx")
text = path.read_text(encoding="utf-8")
text = replace_once(text, 'import { EvidenceImageEditor } from "./EvidenceImageEditor.js";\n', 'import { EvidenceImageEditor } from "./EvidenceImageEditor.js";\nimport { ViewImageEditor } from "./ViewImageEditor.js";\n', "run image editor import")
text = replace_once(text, '  view_images_json?: string | null;\n', '  view_images_json?: string | null;\n  source_test_case_id?: string | null;\n', "source case type")
text = replace_once(text, '  dataSets: Array<{ id: string; name: string; revision_no: number; scope: string }>;\n', '  dataSets: Array<{ id: string; name: string; revision_no: number; scope: string; items: Array<{ itemNo: number; label: string; value: string; memo: string }> }>;\n', "data item type")
text = replace_once(text, 'runStatus={detail.run.status} cases={activeCases} canEdit={canEdit}', 'runStatus={detail.run.status} cases={activeCases} dataSets={detail.dataSets} canEdit={canEdit}', "active run data")
text = replace_once(text, 'runId={detail.run.id} cases={activeCases} canEdit={canEdit}', 'runId={detail.run.id} cases={activeCases} dataSets={detail.dataSets} canEdit={canEdit}', "completed run data")
text = replace_once(text, 'function FocusedRunPanel({ projectId, runId, runStatus, cases, canEdit, assignees, onSave, onRunUpdated, onConflict, onComplete }: {\n  projectId: string; runId: string; runStatus: RunSummary["status"]; cases: RunCase[]; canEdit: boolean; assignees: Assignee[];\n', 'function FocusedRunPanel({ projectId, runId, runStatus, cases, dataSets, canEdit, assignees, onSave, onRunUpdated, onConflict, onComplete }: {\n  projectId: string; runId: string; runStatus: RunSummary["status"]; cases: RunCase[]; dataSets: RunDetail["dataSets"]; canEdit: boolean; assignees: Assignee[];\n', "focused data props")
text = replace_once(text, '  const [completionReviewOpen, setCompletionReviewOpen] = useState(false);\n', '  const [completionReviewOpen, setCompletionReviewOpen] = useState(false);\n  const [largeImage, setLargeImage] = useState<string | null>(null);\n  const [editingViewImage, setEditingViewImage] = useState<string | null>(null);\n', "run image states")
old = '''  const incompleteCount = statusCounts.not_run + statusCounts.in_progress;
  const serverConflictValues: ConflictValues = {
'''
new = '''  const incompleteCount = statusCounts.not_run + statusCounts.in_progress;
  const sourceCaseId = item.source_test_case_id ?? "";
  const commonData = dataSets.flatMap((dataSet) => dataSet.items.filter((entry) => !entry.memo.startsWith("__case__:")).map((entry) => ({ dataSet: dataSet.name, ...entry })));
  const caseData = dataSets.flatMap((dataSet) => dataSet.items.filter((entry) => entry.memo === `__case__:${sourceCaseId}`).map((entry) => ({ dataSet: dataSet.name, ...entry })));
  const serverConflictValues: ConflictValues = {
'''
text = replace_once(text, old, new, "derive run data")
old = '      {!!item.steps?.length && <div className="run-instructions">{item.steps.map((step) => <div key={step.stepNo}><strong>操作 {step.stepNo}</strong><p>{step.action}</p><strong>期待結果</strong><p>{step.expected}</p></div>)}</div>}\n'
new = old + '      {(caseData.length > 0 || commonData.length > 0) && <section className="run-test-data"><div className="section-heading"><div><h3>テストデータ</h3><p className="muted">実行開始時点の内容です。</p></div></div>{caseData.length > 0 && <div><h4>この確認項目</h4><dl>{caseData.map((entry, dataIndex) => <div key={`${entry.dataSet}-${entry.itemNo}-${dataIndex}`}><dt>{entry.label || entry.dataSet}</dt><dd>{entry.value || "（空）"}</dd></div>)}</dl></div>}{commonData.length > 0 && <details open><summary>共通データ {commonData.length}件</summary><dl>{commonData.map((entry, dataIndex) => <div key={`${entry.dataSet}-${entry.itemNo}-${dataIndex}`}><dt>{entry.label}<small>{entry.dataSet}</small></dt><dd>{entry.value || "（空）"}</dd></div>)}</dl></details>}</section>}\n'
text = replace_once(text, old, new, "run test data UI")
old_images = '      {!!runCaseImages(item).length && <section className="run-reference-images"><h3>見る場所の画像</h3><div>{runCaseImages(item).map((source, imageIndex) => <img key={imageIndex} src={source} alt={`参考画像 ${imageIndex + 1}`} />)}</div></section>}\n'
new_images = '      {!!runCaseImages(item).length && <section className="run-reference-images"><h3>見る場所の画像</h3><p className="muted">画像を選択すると拡大表示します。</p><div>{runCaseImages(item).map((source, imageIndex) => <figure key={imageIndex}><button type="button" className="run-reference-preview" onClick={() => setLargeImage(source)}><img src={source} alt={`参考画像 ${imageIndex + 1}`} /></button>{canEdit && <button type="button" className="small" onClick={() => setEditingViewImage(source)}>この実行用に編集</button>}</figure>)}</div></section>}\n'
text = replace_once(text, old_images, new_images, "run image UI")
text = replace_once(text, 'disabled={saveState === "saving"} onClick={() => void saveCurrent("nextPending")}>保存して次の未実行へ →</button>', 'disabled={saveState === "saving" || incompleteCount === 0} onClick={() => void saveCurrent("nextPending")}>保存して次の未実行へ →</button>', "disable completed next")
marker = '    {completionReviewOpen && <div className="run-completion-backdrop"'
modals = '''    {largeImage && <div className="run-image-lightbox" role="dialog" aria-modal="true" aria-label="見る場所画像の拡大表示" onClick={(event) => { if (event.target === event.currentTarget) setLargeImage(null); }}><div><button type="button" onClick={() => setLargeImage(null)}>閉じる</button><img src={largeImage} alt="見る場所の拡大画像" /></div></div>}
    {editingViewImage && <ViewImageEditor projectId={projectId} sourceUrl={editingViewImage} scope="run" onClose={() => setEditingViewImage(null)} onSaved={async (newUrl) => { const result = await api<{ run?: RunUpdate | null }>(`/api/run-cases/${item.id}/view-image`, { method: "POST", body: JSON.stringify({ projectId, version: item.version, sourceUrl: editingViewImage, newUrl }) }); onRunUpdated(result.run); setEditingViewImage(null); await onConflict(); }} />}
'''
text = replace_once(text, marker, modals + marker, "run image modals")
path.write_text(text.rstrip() + "\n", encoding="utf-8")


# CSS
path = Path("web/src/client/operations.css")
text = path.read_text(encoding="utf-8")
styles = r'''
.run-test-data { display: grid; gap: .8rem; padding: 1rem; border: 1px solid #dbe5f4; border-radius: 12px; background: #f8faff; }
.run-test-data h3, .run-test-data h4 { margin: 0; }
.run-test-data summary { cursor: pointer; font-weight: 750; }
.run-test-data dl { display: grid; gap: .35rem; margin: .6rem 0 0; }
.run-test-data dl > div { display: grid; grid-template-columns: minmax(140px, .45fr) 1fr; gap: .75rem; padding: .5rem .6rem; border-radius: 7px; background: #fff; }
.run-test-data dt { font-weight: 700; }
.run-test-data dt small { display: block; color: #6b7689; font-weight: 400; }
.run-test-data dd { margin: 0; white-space: pre-wrap; }
.run-reference-images figure { display: grid; gap: .4rem; margin: 0; }
.run-reference-preview { padding: 0; overflow: hidden; background: #eef2f8; }
.run-reference-preview img { display: block; width: 100%; height: 180px; object-fit: contain; }
.run-image-lightbox { position: fixed; z-index: 1300; inset: 0; display: grid; place-items: center; padding: 1rem; background: rgba(9, 16, 29, .88); }
.run-image-lightbox > div { width: min(1200px, 96vw); max-height: 94vh; display: grid; gap: .6rem; justify-items: end; }
.run-image-lightbox img { width: 100%; max-height: calc(94vh - 4rem); object-fit: contain; border-radius: 8px; background: #fff; }
@media (max-width: 650px) { .run-test-data dl > div { grid-template-columns: 1fr; } }
'''
if ".run-test-data" not in text:
    text = text.rstrip() + "\n" + styles
path.write_text(text.rstrip() + "\n", encoding="utf-8")
