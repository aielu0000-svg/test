START TRANSACTION;

DELETE v FROM evidence_versions v
JOIN evidence_files e ON e.id = v.evidence_file_id
WHERE e.deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY);
DELETE FROM evidence_files
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY);

DELETE FROM procedure_versions
WHERE procedure_document_id IN (
  SELECT id FROM procedure_documents
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM procedure_documents
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY);

DELETE FROM data_links
WHERE data_set_id IN (
  SELECT id FROM data_sets
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM data_items
WHERE data_set_id IN (
  SELECT id FROM data_sets
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM data_sets
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY);

DELETE FROM scenario_cases
WHERE scenario_id IN (
  SELECT id FROM scenarios
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM scenarios
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY);

DELETE FROM test_case_folders
WHERE test_case_id IN (
  SELECT id FROM test_cases
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM test_case_tags
WHERE test_case_id IN (
  SELECT id FROM test_cases
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM test_steps
WHERE test_case_id IN (
  SELECT id FROM test_cases
  WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY)
);
DELETE FROM test_cases
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 30 DAY);

DELETE FROM import_previews
WHERE expires_at < UTC_TIMESTAMP(6);
DELETE FROM sessions
WHERE expires_at < UTC_TIMESTAMP(6);

DELETE FROM projects
WHERE deleted_at < DATE_SUB(UTC_TIMESTAMP(6), INTERVAL 90 DAY);

COMMIT;
