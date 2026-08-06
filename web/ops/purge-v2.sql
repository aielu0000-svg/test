START TRANSACTION;

CREATE TEMPORARY TABLE purge_projects (id CHAR(36) PRIMARY KEY);
INSERT INTO purge_projects (id)
SELECT id FROM projects
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 90 DAY);

CREATE TEMPORARY TABLE purge_runs (id CHAR(36) PRIMARY KEY);
INSERT INTO purge_runs (id)
SELECT id FROM test_runs
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

CREATE TEMPORARY TABLE purge_cases (id CHAR(36) PRIMARY KEY);
INSERT INTO purge_cases (id)
SELECT id FROM test_cases
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

-- Queue filesystem removal in the same transaction as the metadata deletion.
INSERT IGNORE INTO file_cleanup_queue (id, stored_path, status)
SELECT UUID(), v.stored_path, 'pending'
  FROM evidence_versions v
  JOIN evidence_files e ON e.id = v.evidence_file_id
 WHERE e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
    OR e.run_case_snapshot_id IN (
      SELECT rc.id FROM run_case_snapshots rc WHERE rc.test_run_id IN (SELECT id FROM purge_runs)
    )
    OR e.project_id IN (SELECT id FROM purge_projects);
INSERT IGNORE INTO file_cleanup_queue (id, stored_path, status)
SELECT UUID(), v.thumbnail_path, 'pending'
  FROM evidence_versions v
  JOIN evidence_files e ON e.id = v.evidence_file_id
 WHERE v.thumbnail_path IS NOT NULL
   AND (e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
    OR e.run_case_snapshot_id IN (
      SELECT rc.id FROM run_case_snapshots rc WHERE rc.test_run_id IN (SELECT id FROM purge_runs)
    )
    OR e.project_id IN (SELECT id FROM purge_projects));
INSERT IGNORE INTO file_cleanup_queue (id, stored_path, status)
SELECT UUID(), vi.stored_path, 'pending'
  FROM test_case_view_images vi
 WHERE vi.project_id IN (SELECT id FROM purge_projects);

DELETE v FROM evidence_versions v
JOIN evidence_files e ON e.id = v.evidence_file_id
WHERE e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR e.run_case_snapshot_id IN (
     SELECT rc.id FROM run_case_snapshots rc WHERE rc.test_run_id IN (SELECT id FROM purge_runs)
   )
   OR e.project_id IN (SELECT id FROM purge_projects);
DELETE FROM evidence_files
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR run_case_snapshot_id IN (
     SELECT rc.id FROM run_case_snapshots rc WHERE rc.test_run_id IN (SELECT id FROM purge_runs)
   )
   OR project_id IN (SELECT id FROM purge_projects);

DELETE rs FROM run_step_snapshots rs
JOIN run_case_snapshots rc ON rc.id = rs.run_case_snapshot_id
WHERE rc.test_run_id IN (SELECT id FROM purge_runs);
DELETE ri FROM run_data_item_snapshots ri
JOIN run_data_set_snapshots rd ON rd.id = ri.run_data_set_snapshot_id
WHERE rd.test_run_id IN (SELECT id FROM purge_runs);
DELETE FROM run_data_set_snapshots WHERE test_run_id IN (SELECT id FROM purge_runs);
DELETE FROM run_case_snapshots WHERE test_run_id IN (SELECT id FROM purge_runs);
DELETE FROM run_scenario_snapshots WHERE test_run_id IN (SELECT id FROM purge_runs);
DELETE FROM run_revisions WHERE test_run_id IN (SELECT id FROM purge_runs);
DELETE dl FROM data_links dl JOIN test_runs r ON r.id = dl.entity_id
WHERE dl.entity_type = 'run' AND r.id IN (SELECT id FROM purge_runs);
DELETE FROM test_runs WHERE id IN (SELECT id FROM purge_runs);

DELETE pv FROM procedure_versions pv
JOIN procedure_documents p ON p.id = pv.procedure_document_id
WHERE p.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR p.project_id IN (SELECT id FROM purge_projects);
DELETE FROM procedure_documents
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

DELETE dl FROM data_links dl
JOIN data_sets d ON d.id = dl.data_set_id
WHERE d.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR d.project_id IN (SELECT id FROM purge_projects);
DELETE di FROM data_items di
JOIN data_sets d ON d.id = di.data_set_id
WHERE d.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR d.project_id IN (SELECT id FROM purge_projects);
DELETE FROM data_sets
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

DELETE dl FROM data_links dl JOIN scenarios s ON s.id = dl.entity_id
WHERE dl.entity_type = 'scenario'
  AND (s.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
       OR s.project_id IN (SELECT id FROM purge_projects));
DELETE sc FROM scenario_cases sc
JOIN scenarios s ON s.id = sc.scenario_id
WHERE s.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR s.project_id IN (SELECT id FROM purge_projects);
DELETE FROM scenarios
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

-- Definition deletion must not remove images still referenced by historical run
-- snapshots. Detach case ownership and let the reference-aware cleanup service
-- remove only truly unreferenced images. Full project purges remove all images.
UPDATE test_case_view_images
SET test_case_id = NULL
WHERE test_case_id IN (SELECT id FROM purge_cases)
  AND project_id NOT IN (SELECT id FROM purge_projects);
UPDATE test_case_view_images target
JOIN test_case_view_images source ON source.id = target.source_image_id
SET target.source_image_id = NULL
WHERE source.project_id IN (SELECT id FROM purge_projects);
DELETE FROM test_case_view_images
WHERE project_id IN (SELECT id FROM purge_projects);

DELETE dl FROM data_links dl JOIN test_cases c ON c.id = dl.entity_id
WHERE dl.entity_type = 'case' AND c.id IN (SELECT id FROM purge_cases);
DELETE cf FROM test_case_folders cf WHERE cf.test_case_id IN (SELECT id FROM purge_cases);
DELETE ct FROM test_case_tags ct WHERE ct.test_case_id IN (SELECT id FROM purge_cases);
DELETE ts FROM test_steps ts WHERE ts.test_case_id IN (SELECT id FROM purge_cases);
DELETE sc FROM scenario_cases sc WHERE sc.test_case_id IN (SELECT id FROM purge_cases);
DELETE FROM test_cases WHERE id IN (SELECT id FROM purge_cases);

DELETE dl FROM data_links dl JOIN folders f ON f.id = dl.entity_id
WHERE dl.entity_type = 'folder' AND f.project_id IN (SELECT id FROM purge_projects);
UPDATE folders SET parent_id = NULL WHERE project_id IN (SELECT id FROM purge_projects);
DELETE FROM folders WHERE project_id IN (SELECT id FROM purge_projects);
DELETE FROM import_previews
WHERE expires_at < UTC_TIMESTAMP(6)
   OR project_id IN (SELECT id FROM purge_projects);
DELETE FROM project_assignments WHERE project_id IN (SELECT id FROM purge_projects);
-- Audit rows deliberately survive project deletion; their project_id FK was removed by migration 002.
DELETE FROM projects WHERE id IN (SELECT id FROM purge_projects);
DELETE FROM user_sessions WHERE expires_at < UTC_TIMESTAMP(6);
DELETE FROM login_attempts WHERE attempted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 1 DAY);

DROP TEMPORARY TABLE purge_cases;
DROP TEMPORARY TABLE purge_runs;
DROP TEMPORARY TABLE purge_projects;
COMMIT;
