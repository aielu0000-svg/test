ALTER TABLE scenarios
  ADD COLUMN IF NOT EXISTS folder_id CHAR(36) NULL AFTER project_id;

SET @scenario_folder_fk_exists = (
  SELECT COUNT(*)
    FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'scenarios'
     AND CONSTRAINT_NAME = 'fk_scenarios_folder'
);

SET @scenario_folder_fk_sql = IF(
  @scenario_folder_fk_exists = 0,
  'ALTER TABLE scenarios ADD CONSTRAINT fk_scenarios_folder FOREIGN KEY (folder_id) REFERENCES folders (id)',
  'SELECT 1'
);
PREPARE scenario_folder_fk_statement FROM @scenario_folder_fk_sql;
EXECUTE scenario_folder_fk_statement;
DEALLOCATE PREPARE scenario_folder_fk_statement;

CREATE INDEX IF NOT EXISTS ix_scenarios_project_folder
  ON scenarios (project_id, folder_id, deleted_at, updated_at);

ALTER TABLE run_case_snapshots
  ADD COLUMN IF NOT EXISTS notes LONGTEXT NULL AFTER actual_result;

ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS view_images_json LONGTEXT NULL AFTER view_location;

ALTER TABLE run_case_snapshots
  ADD COLUMN IF NOT EXISTS view_images_json LONGTEXT NULL AFTER view_location;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS draft_scenario_ids_json LONGTEXT NULL AFTER memo;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS draft_case_ids_json LONGTEXT NULL AFTER draft_scenario_ids_json;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS draft_data_set_ids_json LONGTEXT NULL AFTER draft_case_ids_json;
