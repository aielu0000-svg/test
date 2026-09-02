import { randomUUID } from "node:crypto";
import type { PoolConnection } from "mariadb";

type Row = Record<string, unknown>;

function list(payload: Row, field: string): Row[] {
  const value = payload[field];
  return Array.isArray(value) ? value.filter((item): item is Row => !!item && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function nullable(value: unknown): unknown {
  return value === "" || value === undefined ? null : value;
}

export async function importFormalPayload(
  connection: PoolConnection,
  projectId: string,
  actorId: string,
  payload: Row,
): Promise<{ imported: number; skippedEvidence: number }> {
  const ids = new Map<string, string>();
  let imported = 0;
  const make = (type: string, oldId: unknown): string => {
    const id = randomUUID();
    ids.set(`${type}:${text(oldId)}`, id);
    imported += 1;
    return id;
  };
  const mapped = (type: string, oldId: unknown): string | null => ids.get(`${type}:${text(oldId)}`) ?? null;

  const folders = list(payload, "folders");
  for (const item of folders) {
    const id = make("folder", item.id);
    await connection.query(
      "INSERT INTO folders (id, project_id, parent_id, name, sort_order, created_by) VALUES (?, ?, NULL, ?, ?, ?)",
      [id, projectId, text(item.name, "Imported folder"), Number(item.sort_order ?? 0), actorId],
    );
  }
  for (const item of folders) {
    const id = mapped("folder", item.id);
    const parentId = mapped("folder", item.parent_id);
    if (id && parentId) await connection.query("UPDATE folders SET parent_id = ? WHERE id = ?", [parentId, id]);
  }

  for (const item of list(payload, "test_cases")) {
    const id = make("case", item.id);
    await connection.query(
      "INSERT INTO test_cases (id, project_id, title, objective, preconditions, view_location, priority, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, projectId, text(item.title, "Imported case"), nullable(item.objective), nullable(item.preconditions), nullable(item.view_location), text(item.priority, "medium"), actorId],
    );
  }
  for (const item of list(payload, "test_steps")) {
    const caseId = mapped("case", item.test_case_id);
    if (caseId) await connection.query(
      "INSERT INTO test_steps (id, test_case_id, step_no, action_text, expected_result) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), caseId, Number(item.step_no ?? 1), text(item.action_text), text(item.expected_result)],
    );
  }
  for (const item of list(payload, "test_case_tags")) {
    const caseId = mapped("case", item.test_case_id);
    if (caseId) await connection.query("INSERT IGNORE INTO test_case_tags (test_case_id, tag) VALUES (?, ?)", [caseId, text(item.tag)]);
  }
  for (const item of list(payload, "test_case_folders")) {
    const caseId = mapped("case", item.test_case_id);
    const folderId = mapped("folder", item.folder_id);
    if (caseId && folderId) await connection.query("INSERT IGNORE INTO test_case_folders (test_case_id, folder_id) VALUES (?, ?)", [caseId, folderId]);
  }

  for (const item of list(payload, "scenarios")) {
    const id = make("scenario", item.id);
    await connection.query(
      "INSERT INTO scenarios (id, project_id, title, objective, preconditions, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [id, projectId, text(item.title, "Imported scenario"), nullable(item.objective), nullable(item.preconditions), actorId],
    );
  }
  for (const item of list(payload, "scenario_cases")) {
    const scenarioId = mapped("scenario", item.scenario_id);
    const caseId = mapped("case", item.test_case_id);
    if (scenarioId && caseId) await connection.query(
      "INSERT IGNORE INTO scenario_cases (scenario_id, test_case_id, sort_order) VALUES (?, ?, ?)",
      [scenarioId, caseId, Number(item.sort_order ?? item.position ?? 0)],
    );
  }

  for (const item of list(payload, "data_sets")) {
    const id = make("data", item.id);
    await connection.query(
      "INSERT INTO data_sets (id, project_id, name, scope, description, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      [id, projectId, text(item.name, "Imported data"), text(item.scope, "common"), nullable(item.description), actorId],
    );
  }
  for (const item of list(payload, "data_items")) {
    const dataSetId = mapped("data", item.data_set_id);
    if (dataSetId) await connection.query(
      "INSERT INTO data_items (id, data_set_id, sort_order, label, item_value, memo) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), dataSetId, Number(item.sort_order ?? item.item_no ?? 0), text(item.label), nullable(item.item_value ?? item.value_text), nullable(item.memo)],
    );
  }
  // Data-set links may reference runs, so reserve all run IDs before links are imported.
  for (const item of list(payload, "test_runs")) make("run", item.id);

  for (const item of list(payload, "data_links")) {
    const dataSetId = mapped("data", item.data_set_id);
    const entityType = text(item.entity_type);
    const entityId = mapped(entityType === "case" ? "case" : entityType, item.entity_id);
    if (dataSetId && entityId) await connection.query(
      "INSERT IGNORE INTO data_links (data_set_id, entity_type, entity_id, apply_reason) VALUES (?, ?, ?, ?)",
      [dataSetId, entityType, entityId, nullable(item.apply_reason)],
    );
  }

  for (const item of list(payload, "procedures")) {
    const id = make("procedure", item.id);
    await connection.query(
      "INSERT INTO procedure_documents (id, project_id, title, current_version, created_by) VALUES (?, ?, ?, ?, ?)",
      [id, projectId, text(item.title, "Imported procedure"), Number(item.current_version ?? 1), actorId],
    );
  }
  for (const item of list(payload, "procedure_versions")) {
    const documentId = mapped("procedure", item.procedure_document_id);
    if (documentId) await connection.query(
      "INSERT INTO procedure_versions (id, procedure_document_id, version_no, markdown_source, source_filename, sha256, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [randomUUID(), documentId, Number(item.version_no ?? 1), text(item.markdown_source), nullable(item.source_filename), text(item.sha256), actorId],
    );
  }

  for (const item of list(payload, "test_runs")) {
    const id = mapped("run", item.id)!;
    await connection.query(
      `INSERT INTO test_runs
       (id, project_id, name, environment_name, build_name, memo, status, planned_start_at, planned_end_at, started_at, completed_at, current_revision, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, projectId, text(item.name, "Imported run"), nullable(item.environment_name), nullable(item.build_name), nullable(item.memo), text(item.status, "draft"), nullable(item.planned_start_at), nullable(item.planned_end_at), nullable(item.started_at), nullable(item.completed_at), Number(item.current_revision ?? 0), actorId],
    );
  }
  for (const item of list(payload, "run_revisions")) {
    const runId = mapped("run", item.test_run_id);
    if (runId) await connection.query(
      "INSERT INTO run_revisions (id, test_run_id, revision_no, change_reason, created_by) VALUES (?, ?, ?, ?, ?)",
      [randomUUID(), runId, Number(item.revision_no ?? 1), text(item.change_reason, "Imported revision"), actorId],
    );
  }
  for (const item of list(payload, "run_scenarios")) {
    const runId = mapped("run", item.test_run_id);
    if (!runId) continue;
    const id = make("runScenario", item.id);
    await connection.query(
      `INSERT INTO run_scenario_snapshots
       (id, test_run_id, revision_no, source_scenario_id, source_updated_at, title, objective, preconditions, position, status, started_at, completed_at, excluded_at, exclusion_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, runId, Number(item.revision_no ?? 1), mapped("scenario", item.source_scenario_id), nullable(item.source_updated_at), text(item.title), nullable(item.objective), nullable(item.preconditions), Number(item.sort_order ?? item.position ?? 0), text(item.status, "not_run"), nullable(item.started_at), nullable(item.completed_at), nullable(item.excluded_at), nullable(item.exclusion_reason)],
    );
  }
  for (const item of list(payload, "run_cases")) {
    const runId = mapped("run", item.test_run_id);
    if (!runId) continue;
    const id = make("runCase", item.id);
    await connection.query(
      `INSERT INTO run_case_snapshots
       (id, test_run_id, run_scenario_snapshot_id, revision_no, source_test_case_id, source_updated_at,
        title, objective, preconditions, view_location, priority, position, status, actual_result, executed_at, excluded_at, exclusion_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, runId, mapped("runScenario", item.run_scenario_snapshot_id), Number(item.revision_no ?? 1), mapped("case", item.source_test_case_id), nullable(item.source_updated_at), text(item.title), nullable(item.objective), nullable(item.preconditions), nullable(item.view_location), text(item.priority, "medium"), Number(item.sort_order ?? item.position ?? 0), text(item.status, "not_run"), nullable(item.actual_result), nullable(item.executed_at), nullable(item.excluded_at), nullable(item.exclusion_reason)],
    );
  }
  for (const item of list(payload, "run_steps")) {
    const runCaseId = mapped("runCase", item.run_case_snapshot_id);
    if (runCaseId) await connection.query(
      "INSERT INTO run_step_snapshots (id, run_case_snapshot_id, source_test_step_id, step_no, action_text, expected_result) VALUES (?, ?, NULL, ?, ?, ?)",
      [randomUUID(), runCaseId, Number(item.step_no ?? 1), text(item.action_text), text(item.expected_result)],
    );
  }
  for (const item of list(payload, "run_data_sets")) {
    const runId = mapped("run", item.test_run_id);
    if (!runId) continue;
    const id = make("runData", item.id);
    await connection.query(
      "INSERT INTO run_data_set_snapshots (id, test_run_id, revision_no, source_data_set_id, source_updated_at, name, scope, description, apply_reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [id, runId, Number(item.revision_no ?? 1), mapped("data", item.source_data_set_id), nullable(item.source_updated_at), text(item.name), text(item.scope, "common"), nullable(item.description), nullable(item.apply_reason)],
    );
  }
  for (const item of list(payload, "run_data_items")) {
    const runDataSetId = mapped("runData", item.run_data_set_snapshot_id);
    if (runDataSetId) await connection.query(
      "INSERT INTO run_data_item_snapshots (id, run_data_set_snapshot_id, item_no, label, value_text, memo) VALUES (?, ?, ?, ?, ?, ?)",
      [randomUUID(), runDataSetId, Number(item.item_no ?? 0), text(item.label), nullable(item.value_text), nullable(item.memo)],
    );
  }

  return { imported, skippedEvidence: list(payload, "evidence_manifest").length };
}
