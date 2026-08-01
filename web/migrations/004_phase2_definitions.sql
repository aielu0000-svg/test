CREATE TABLE IF NOT EXISTS folders (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  KEY ix_folders_project_parent (project_id, parent_id, deleted_at, sort_order),
  CONSTRAINT fk_folders_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_folders_parent FOREIGN KEY (parent_id) REFERENCES folders (id),
  CONSTRAINT fk_folders_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_folders_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_cases (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  objective LONGTEXT NULL,
  preconditions LONGTEXT NULL,
  view_location LONGTEXT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  KEY ix_cases_project_updated (project_id, deleted_at, updated_at),
  KEY ix_cases_project_priority (project_id, priority, deleted_at),
  FULLTEXT KEY ft_cases_text (title, objective, preconditions, view_location),
  CONSTRAINT chk_cases_priority CHECK (priority IN ('high', 'medium', 'low')),
  CONSTRAINT fk_cases_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_cases_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_cases_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_steps (
  id CHAR(36) NOT NULL PRIMARY KEY,
  test_case_id CHAR(36) NOT NULL,
  step_no INT NOT NULL,
  action_text LONGTEXT NOT NULL,
  expected_result LONGTEXT NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  UNIQUE KEY uq_steps_case_number (test_case_id, step_no),
  KEY ix_steps_case_order (test_case_id, deleted_at, step_no),
  CONSTRAINT fk_steps_case FOREIGN KEY (test_case_id) REFERENCES test_cases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_case_tags (
  test_case_id CHAR(36) NOT NULL,
  tag VARCHAR(100) NOT NULL,
  PRIMARY KEY (test_case_id, tag),
  KEY ix_case_tags_tag (tag, test_case_id),
  CONSTRAINT fk_case_tags_case FOREIGN KEY (test_case_id) REFERENCES test_cases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS test_case_folders (
  test_case_id CHAR(36) NOT NULL,
  folder_id CHAR(36) NOT NULL,
  PRIMARY KEY (test_case_id, folder_id),
  KEY ix_case_folders_folder (folder_id, test_case_id),
  CONSTRAINT fk_case_folders_case FOREIGN KEY (test_case_id) REFERENCES test_cases (id),
  CONSTRAINT fk_case_folders_folder FOREIGN KEY (folder_id) REFERENCES folders (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scenarios (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  objective LONGTEXT NULL,
  preconditions LONGTEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  KEY ix_scenarios_project_updated (project_id, deleted_at, updated_at),
  FULLTEXT KEY ft_scenarios_text (title, objective, preconditions),
  CONSTRAINT fk_scenarios_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_scenarios_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_scenarios_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scenario_cases (
  scenario_id CHAR(36) NOT NULL,
  test_case_id CHAR(36) NOT NULL,
  sort_order INT NOT NULL,
  added_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (scenario_id, test_case_id),
  UNIQUE KEY uq_scenario_case_order (scenario_id, sort_order),
  KEY ix_scenario_cases_case (test_case_id),
  CONSTRAINT fk_scenario_cases_scenario FOREIGN KEY (scenario_id) REFERENCES scenarios (id),
  CONSTRAINT fk_scenario_cases_case FOREIGN KEY (test_case_id) REFERENCES test_cases (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_sets (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  name VARCHAR(300) NOT NULL,
  scope VARCHAR(20) NOT NULL,
  description LONGTEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  KEY ix_data_sets_project_scope (project_id, scope, deleted_at),
  CONSTRAINT chk_data_sets_scope CHECK (scope IN ('common', 'case', 'scenario', 'run')),
  CONSTRAINT fk_data_sets_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_data_sets_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_data_sets_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  data_set_id CHAR(36) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  label VARCHAR(300) NOT NULL,
  item_value LONGTEXT NULL,
  memo LONGTEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_data_items_set_order (data_set_id, sort_order),
  CONSTRAINT fk_data_items_set FOREIGN KEY (data_set_id) REFERENCES data_sets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS data_links (
  data_set_id CHAR(36) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  apply_reason VARCHAR(100) NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (data_set_id, entity_type, entity_id),
  KEY ix_data_links_entity (entity_type, entity_id),
  CONSTRAINT chk_data_links_type CHECK (entity_type IN ('folder', 'case', 'scenario', 'run')),
  CONSTRAINT fk_data_links_set FOREIGN KEY (data_set_id) REFERENCES data_sets (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS import_previews (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  import_type VARCHAR(30) NOT NULL,
  payload_json LONGTEXT NOT NULL,
  errors_json LONGTEXT NOT NULL,
  warnings_json LONGTEXT NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at DATETIME(6) NOT NULL,
  confirmed_at DATETIME(6) NULL,
  KEY ix_import_previews_project_expiry (project_id, expires_at),
  CONSTRAINT fk_import_previews_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_import_previews_user FOREIGN KEY (created_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
