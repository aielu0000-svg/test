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
