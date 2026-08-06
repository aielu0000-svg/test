-- Review 10 integrity and operations support.
-- This migration is intentionally idempotent because a failed MariaDB DDL migration
-- can leave earlier statements applied before the migration is retried.

ALTER TABLE test_case_view_images
  ADD COLUMN IF NOT EXISTS source_image_id CHAR(36) NULL AFTER test_case_id;

SET @view_image_source_fk_exists = (
  SELECT COUNT(*)
    FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'test_case_view_images'
     AND CONSTRAINT_NAME = 'fk_view_images_source'
);
SET @view_image_source_fk_sql = IF(
  @view_image_source_fk_exists = 0,
  'ALTER TABLE test_case_view_images ADD CONSTRAINT fk_view_images_source FOREIGN KEY (source_image_id) REFERENCES test_case_view_images (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE view_image_source_fk_statement FROM @view_image_source_fk_sql;
EXECUTE view_image_source_fk_statement;
DEALLOCATE PREPARE view_image_source_fk_statement;

CREATE INDEX IF NOT EXISTS idx_view_images_source
  ON test_case_view_images (project_id, source_image_id, created_at);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS active_name VARCHAR(200)
    GENERATED ALWAYS AS (CASE WHEN deleted_at IS NULL THEN name ELSE NULL END) PERSISTENT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_active_name
  ON projects (active_name);

CREATE TABLE IF NOT EXISTS file_cleanup_queue (
  id CHAR(36) NOT NULL PRIMARY KEY,
  stored_path VARCHAR(2000) NOT NULL,
  status ENUM('pending', 'failed') NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6) ON UPDATE UTC_TIMESTAMP(6),
  UNIQUE KEY uq_file_cleanup_path (stored_path),
  KEY ix_file_cleanup_status (status, updated_at, created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_state (
  state_key VARCHAR(100) NOT NULL PRIMARY KEY,
  state_value VARCHAR(1000) NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6) ON UPDATE UTC_TIMESTAMP(6)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

INSERT INTO system_state (state_key, state_value)
VALUES ('writes_paused', '0')
ON DUPLICATE KEY UPDATE state_key = VALUES(state_key);

CREATE TABLE IF NOT EXISTS operation_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  operation_type ENUM('backup', 'restore') NOT NULL,
  backup_id VARCHAR(100) NULL,
  status ENUM('pending', 'running', 'succeeded', 'failed') NOT NULL DEFAULT 'pending',
  requested_by CHAR(36) NOT NULL,
  requested_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  started_at DATETIME(6) NULL,
  completed_at DATETIME(6) NULL,
  output_json LONGTEXT NULL,
  error_message LONGTEXT NULL,
  CONSTRAINT fk_operation_requests_user FOREIGN KEY (requested_by) REFERENCES users (id),
  KEY ix_operation_requests_status (status, requested_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS active_write_requests (
  id CHAR(36) NOT NULL PRIMARY KEY,
  started_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  KEY ix_active_write_started (started_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_catalog (
  backup_id VARCHAR(100) NOT NULL PRIMARY KEY,
  status ENUM('running', 'succeeded', 'failed') NOT NULL DEFAULT 'running',
  manifest_json LONGTEXT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  completed_at DATETIME(6) NULL,
  created_by CHAR(36) NULL,
  KEY ix_backup_catalog_created (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
