CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  username_normalized VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until DATETIME(6) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_users_username_normalized (username_normalized),
  KEY ix_users_enabled (enabled),
  CONSTRAINT chk_users_role CHECK (role IN ('admin', 'executor'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME(6) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_seen_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_sessions_token_hash (token_hash),
  KEY ix_sessions_user_expiry (user_id, expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1,
  KEY ix_projects_status (status, deleted_at),
  CONSTRAINT chk_projects_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES users (id),
  CONSTRAINT fk_projects_deleted_by FOREIGN KEY (deleted_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_assignments (
  project_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  assigned_by CHAR(36) NOT NULL,
  assigned_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (project_id, user_id),
  KEY ix_assignments_user (user_id),
  CONSTRAINT fk_assignments_project FOREIGN KEY (project_id) REFERENCES projects (id),
  CONSTRAINT fk_assignments_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_assignments_assigned_by FOREIGN KEY (assigned_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  user_id CHAR(36) NULL,
  username VARCHAR(100) NULL,
  project_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id CHAR(36) NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  request_id VARCHAR(100) NULL,
  client_ip VARCHAR(100) NULL,
  user_agent VARCHAR(500) NULL,
  success TINYINT(1) NOT NULL DEFAULT 1,
  error_code VARCHAR(100) NULL,
  KEY ix_audit_project_time (project_id, occurred_at),
  KEY ix_audit_user_time (user_id, occurred_at),
  KEY ix_audit_action_time (action, occurred_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_audit_project FOREIGN KEY (project_id) REFERENCES projects (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
