import type { Database } from "./db.js";
import { notFound } from "./errors.js";

export interface ProjectDeletionResult {
  queuedFiles: number;
}

async function queueProjectFiles(db: Database, projectId: string): Promise<number> {
  let queued = 0;
  const stored = await db.execute(
    `INSERT IGNORE INTO file_cleanup_queue (id, stored_path, status)
     SELECT UUID(), v.stored_path, 'pending'
       FROM evidence_versions v
       JOIN evidence_files e ON e.id = v.evidence_file_id
      WHERE e.project_id = ?`,
    [projectId],
  );
  queued += Number(stored.affectedRows);

  const thumbnails = await db.execute(
    `INSERT IGNORE INTO file_cleanup_queue (id, stored_path, status)
     SELECT UUID(), v.thumbnail_path, 'pending'
       FROM evidence_versions v
       JOIN evidence_files e ON e.id = v.evidence_file_id
      WHERE e.project_id = ? AND v.thumbnail_path IS NOT NULL`,
    [projectId],
  );
  queued += Number(thumbnails.affectedRows);

  const viewImages = await db.execute(
    `INSERT IGNORE INTO file_cleanup_queue (id, stored_path, status)
     SELECT UUID(), stored_path, 'pending'
       FROM test_case_view_images
      WHERE project_id = ?`,
    [projectId],
  );
  queued += Number(viewImages.affectedRows);
  return queued;
}

export async function deleteProjectPermanently(db: Database, projectId: string): Promise<ProjectDeletionResult> {
  const queuedFiles = await queueProjectFiles(db, projectId);

  await db.execute(
    `DELETE v FROM evidence_versions v
       JOIN evidence_files e ON e.id = v.evidence_file_id
      WHERE e.project_id = ?`,
    [projectId],
  );
  await db.execute("DELETE FROM evidence_files WHERE project_id = ?", [projectId]);

  await db.execute(
    `DELETE s FROM run_step_snapshots s
       JOIN run_case_snapshots c ON c.id = s.run_case_snapshot_id
       JOIN test_runs r ON r.id = c.test_run_id
      WHERE r.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE i FROM run_data_item_snapshots i
       JOIN run_data_set_snapshots d ON d.id = i.run_data_set_snapshot_id
       JOIN test_runs r ON r.id = d.test_run_id
      WHERE r.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE d FROM run_data_set_snapshots d
       JOIN test_runs r ON r.id = d.test_run_id
      WHERE r.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE c FROM run_case_snapshots c
       JOIN test_runs r ON r.id = c.test_run_id
      WHERE r.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE s FROM run_scenario_snapshots s
       JOIN test_runs r ON r.id = s.test_run_id
      WHERE r.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE v FROM run_revisions v
       JOIN test_runs r ON r.id = v.test_run_id
      WHERE r.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE l FROM data_links l
       JOIN test_runs r ON r.id = l.entity_id
      WHERE l.entity_type = 'run' AND r.project_id = ?`,
    [projectId],
  );
  await db.execute("DELETE FROM test_runs WHERE project_id = ?", [projectId]);

  await db.execute(
    `DELETE v FROM procedure_versions v
       JOIN procedure_documents d ON d.id = v.procedure_document_id
      WHERE d.project_id = ?`,
    [projectId],
  );
  await db.execute("DELETE FROM procedure_documents WHERE project_id = ?", [projectId]);

  await db.execute(
    `DELETE l FROM data_links l
       JOIN data_sets d ON d.id = l.data_set_id
      WHERE d.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE i FROM data_items i
       JOIN data_sets d ON d.id = i.data_set_id
      WHERE d.project_id = ?`,
    [projectId],
  );
  await db.execute("DELETE FROM data_sets WHERE project_id = ?", [projectId]);

  await db.execute(
    `DELETE l FROM data_links l
       JOIN scenarios s ON s.id = l.entity_id
      WHERE l.entity_type = 'scenario' AND s.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE sc FROM scenario_cases sc
       JOIN scenarios s ON s.id = sc.scenario_id
      WHERE s.project_id = ?`,
    [projectId],
  );
  await db.execute("DELETE FROM scenarios WHERE project_id = ?", [projectId]);

  await db.execute("UPDATE test_case_view_images SET source_image_id = NULL WHERE project_id = ?", [projectId]);
  await db.execute("DELETE FROM test_case_view_images WHERE project_id = ?", [projectId]);

  await db.execute(
    `DELETE l FROM data_links l
       JOIN test_cases c ON c.id = l.entity_id
      WHERE l.entity_type = 'case' AND c.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE f FROM test_case_folders f
       JOIN test_cases c ON c.id = f.test_case_id
      WHERE c.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE t FROM test_case_tags t
       JOIN test_cases c ON c.id = t.test_case_id
      WHERE c.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE s FROM test_steps s
       JOIN test_cases c ON c.id = s.test_case_id
      WHERE c.project_id = ?`,
    [projectId],
  );
  await db.execute(
    `DELETE sc FROM scenario_cases sc
       JOIN test_cases c ON c.id = sc.test_case_id
      WHERE c.project_id = ?`,
    [projectId],
  );
  await db.execute("DELETE FROM test_cases WHERE project_id = ?", [projectId]);

  await db.execute(
    `DELETE l FROM data_links l
       JOIN folders f ON f.id = l.entity_id
      WHERE l.entity_type = 'folder' AND f.project_id = ?`,
    [projectId],
  );
  await db.execute("UPDATE folders SET parent_id = NULL WHERE project_id = ?", [projectId]);
  await db.execute("DELETE FROM folders WHERE project_id = ?", [projectId]);
  await db.execute("DELETE FROM import_previews WHERE project_id = ?", [projectId]);
  await db.execute("DELETE FROM project_assignments WHERE project_id = ?", [projectId]);

  const deleted = await db.execute("DELETE FROM projects WHERE id = ?", [projectId]);
  if (Number(deleted.affectedRows) !== 1) throw notFound();
  return { queuedFiles };
}
