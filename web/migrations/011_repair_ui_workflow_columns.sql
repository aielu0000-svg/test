-- Repair databases where 008_ui_workflow.sql was recorded as applied before its later DDL was present.
-- Do not amend already-applied migrations; this migration is intentionally idempotent.

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

CREATE TABLE IF NOT EXISTS test_case_view_images (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  test_case_id CHAR(36) NULL,
  original_filename VARCHAR(1000) NOT NULL,
  stored_path VARCHAR(2000) NOT NULL,
  content_type VARCHAR(255) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  CONSTRAINT fk_view_images_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_view_images_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id),
  CONSTRAINT fk_view_images_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_view_images_case (project_id, test_case_id, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
