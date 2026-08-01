START TRANSACTION;

CREATE TEMPORARY TABLE purge_projects (id CHAR(36) PRIMARY KEY);
INSERT INTO purge_projects (id)
SELECT id FROM projects
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 90 DAY);

DELETE v FROM evidence_versions v
JOIN evidence_files e ON e.id = v.evidence_file_id
WHERE e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR e.run_case_snapshot_id IN (SELECT rc.id FROM run_case_snapshots rc JOIN test_runs r ON r.id = rc.test_run_id WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY))
   OR e.project_id IN (SELECT id FROM purge_projects);
DELETE FROM evidence_files
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR run_case_snapshot_id IN (SELECT rc.id FROM run_case_snapshots rc JOIN test_runs r ON r.id = rc.test_run_id WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY))
   OR project_id IN (SELECT id FROM purge_projects);

DELETE rs FROM run_step_snapshots rs
JOIN run_case_snapshots rc ON rc.id = rs.run_case_snapshot_id
JOIN test_runs r ON r.id = rc.test_run_id
WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR r.project_id IN (SELECT id FROM purge_projects);
DELETE ri FROM run_data_item_snapshots ri
JOIN run_data_set_snapshots rd ON rd.id = ri.run_data_set_snapshot_id
JOIN test_runs r ON r.id = rd.test_run_id
WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR r.project_id IN (SELECT id FROM purge_projects);
DELETE rd FROM run_data_set_snapshots rd
JOIN test_runs r ON r.id = rd.test_run_id
WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR r.project_id IN (SELECT id FROM purge_projects);
DELETE rc FROM run_case_snapshots rc
JOIN test_runs r ON r.id = rc.test_run_id
WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR r.project_id IN (SELECT id FROM purge_projects);
DELETE rs FROM run_scenario_snapshots rs
JOIN test_runs r ON r.id = rs.test_run_id
WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR r.project_id IN (SELECT id FROM purge_projects);
DELETE rr FROM run_revisions rr
JOIN test_runs r ON r.id = rr.test_run_id
WHERE r.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR r.project_id IN (SELECT id FROM purge_projects);
DELETE FROM test_runs
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

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

DELETE sc FROM scenario_cases sc
JOIN scenarios s ON s.id = sc.scenario_id
WHERE s.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR s.project_id IN (SELECT id FROM purge_projects);
DELETE FROM scenarios
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

DELETE cf FROM test_case_folders cf
JOIN test_cases c ON c.id = cf.test_case_id
WHERE c.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR c.project_id IN (SELECT id FROM purge_projects);
DELETE ct FROM test_case_tags ct
JOIN test_cases c ON c.id = ct.test_case_id
WHERE c.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR c.project_id IN (SELECT id FROM purge_projects);
DELETE ts FROM test_steps ts
JOIN test_cases c ON c.id = ts.test_case_id
WHERE c.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR c.project_id IN (SELECT id FROM purge_projects);
DELETE sc FROM scenario_cases sc
JOIN test_cases c ON c.id = sc.test_case_id
WHERE c.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR c.project_id IN (SELECT id FROM purge_projects);
DELETE FROM test_cases
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
   OR project_id IN (SELECT id FROM purge_projects);

DELETE FROM folders
WHERE project_id IN (SELECT id FROM purge_projects);
DELETE FROM import_previews
WHERE expires_at < UTC_TIMESTAMP(6)
   OR project_id IN (SELECT id FROM purge_projects);
DELETE FROM audit_logs
WHERE project_id IN (SELECT id FROM purge_projects);
DELETE FROM project_assignments
WHERE project_id IN (SELECT id FROM purge_projects);
DELETE FROM projects
WHERE id IN (SELECT id FROM purge_projects);
DELETE FROM user_sessions
WHERE expires_at < UTC_TIMESTAMP(6);

DROP TEMPORARY TABLE purge_projects;
COMMIT;


