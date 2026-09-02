CREATE TABLE IF NOT EXISTS test_runs (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  name VARCHAR(500) NOT NULL,
  status ENUM('draft', 'in_progress', 'completed') NOT NULL DEFAULT 'draft',
  planned_start_at DATETIME(6) NULL,
  planned_end_at DATETIME(6) NULL,
  started_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  current_revision INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  CONSTRAINT fk_runs_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_runs_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_runs_project_status (project_id, status, updated_at),
  INDEX idx_runs_deleted (deleted_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_revisions (
  id CHAR(36) PRIMARY KEY,
  test_run_id CHAR(36) NOT NULL,
  revision_no INT NOT NULL,
  change_reason VARCHAR(1000) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  CONSTRAINT fk_run_revisions_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id),
  CONSTRAINT fk_run_revisions_creator FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_run_revision (test_run_id, revision_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_scenario_snapshots (
  id CHAR(36) PRIMARY KEY,
  test_run_id CHAR(36) NOT NULL,
  revision_no INT NOT NULL,
  source_scenario_id CHAR(36) NULL,
  source_updated_at DATETIME(6) NULL,
  title VARCHAR(500) NOT NULL,
  objective LONGTEXT NULL,
  preconditions LONGTEXT NULL,
  position INT NOT NULL,
  status ENUM('not_run', 'in_progress', 'pass', 'fail', 'blocked', 'skip') NOT NULL DEFAULT 'not_run',
  assignee_id CHAR(36) NULL,
  started_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  excluded_at DATETIME(6) NULL,
  exclusion_reason VARCHAR(1000) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  CONSTRAINT fk_run_scenarios_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id),
  CONSTRAINT fk_run_scenarios_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  INDEX idx_run_scenarios_order (test_run_id, position),
  INDEX idx_run_scenarios_source (source_scenario_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_case_snapshots (
  id CHAR(36) PRIMARY KEY,
  test_run_id CHAR(36) NOT NULL,
  run_scenario_snapshot_id CHAR(36) NULL,
  revision_no INT NOT NULL,
  source_test_case_id CHAR(36) NULL,
  source_updated_at DATETIME(6) NULL,
  title VARCHAR(500) NOT NULL,
  objective LONGTEXT NULL,
  preconditions LONGTEXT NULL,
  view_location LONGTEXT NULL,
  priority ENUM('high', 'medium', 'low') NOT NULL,
  position INT NOT NULL,
  status ENUM('not_run', 'in_progress', 'pass', 'fail', 'blocked', 'skip') NOT NULL DEFAULT 'not_run',
  actual_result LONGTEXT NULL,
  assignee_id CHAR(36) NULL,
  executed_at DATETIME(6) NULL,
  excluded_at DATETIME(6) NULL,
  exclusion_reason VARCHAR(1000) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  CONSTRAINT fk_run_cases_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id),
  CONSTRAINT fk_run_cases_scenario FOREIGN KEY (run_scenario_snapshot_id) REFERENCES run_scenario_snapshots(id),
  CONSTRAINT fk_run_cases_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
  INDEX idx_run_cases_order (test_run_id, run_scenario_snapshot_id, position),
  INDEX idx_run_cases_source (source_test_case_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_step_snapshots (
  id CHAR(36) PRIMARY KEY,
  run_case_snapshot_id CHAR(36) NOT NULL,
  source_test_step_id CHAR(36) NULL,
  step_no INT NOT NULL,
  action_text LONGTEXT NOT NULL,
  expected_result LONGTEXT NOT NULL,
  CONSTRAINT fk_run_steps_case FOREIGN KEY (run_case_snapshot_id) REFERENCES run_case_snapshots(id),
  UNIQUE KEY uq_run_step_no (run_case_snapshot_id, step_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_data_set_snapshots (
  id CHAR(36) PRIMARY KEY,
  test_run_id CHAR(36) NOT NULL,
  revision_no INT NOT NULL,
  source_data_set_id CHAR(36) NULL,
  source_updated_at DATETIME(6) NULL,
  name VARCHAR(300) NOT NULL,
  scope ENUM('common', 'case', 'scenario', 'run') NOT NULL,
  description LONGTEXT NULL,
  apply_reason VARCHAR(1000) NULL,
  CONSTRAINT fk_run_data_sets_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id),
  INDEX idx_run_data_sets_run (test_run_id, revision_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS run_data_item_snapshots (
  id CHAR(36) PRIMARY KEY,
  run_data_set_snapshot_id CHAR(36) NOT NULL,
  item_no INT NOT NULL,
  label VARCHAR(300) NOT NULL,
  value_text LONGTEXT NULL,
  memo LONGTEXT NULL,
  CONSTRAINT fk_run_data_items_set FOREIGN KEY (run_data_set_snapshot_id) REFERENCES run_data_set_snapshots(id),
  UNIQUE KEY uq_run_data_item_no (run_data_set_snapshot_id, item_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
