CREATE TABLE IF NOT EXISTS evidence_files (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  run_case_snapshot_id CHAR(36) NULL,
  current_version INT NOT NULL DEFAULT 1,
  description LONGTEXT NULL,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  CONSTRAINT fk_evidence_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_evidence_case FOREIGN KEY (run_case_snapshot_id) REFERENCES run_case_snapshots(id),
  CONSTRAINT fk_evidence_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_evidence_project (project_id, updated_at),
  INDEX idx_evidence_case (run_case_snapshot_id),
  INDEX idx_evidence_deleted (deleted_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS evidence_versions (
  id CHAR(36) PRIMARY KEY,
  evidence_file_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  original_filename VARCHAR(1000) NOT NULL,
  stored_path VARCHAR(2000) NOT NULL,
  thumbnail_path VARCHAR(2000) NULL,
  content_type VARCHAR(300) NULL,
  byte_size BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  edit_operation_json LONGTEXT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  CONSTRAINT fk_evidence_versions_file FOREIGN KEY (evidence_file_id) REFERENCES evidence_files(id),
  CONSTRAINT fk_evidence_versions_creator FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_evidence_version (evidence_file_id, version_no),
  INDEX idx_evidence_hash (sha256)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procedure_documents (
  id CHAR(36) PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  deleted_at DATETIME(6) NULL,
  deleted_by CHAR(36) NULL,
  delete_reason VARCHAR(500) NULL,
  CONSTRAINT fk_procedures_project FOREIGN KEY (project_id) REFERENCES projects(id),
  CONSTRAINT fk_procedures_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_procedures_project (project_id, updated_at),
  INDEX idx_procedures_deleted (deleted_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS procedure_versions (
  id CHAR(36) PRIMARY KEY,
  procedure_document_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  markdown_source LONGTEXT NOT NULL,
  source_filename VARCHAR(1000) NULL,
  sha256 CHAR(64) NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT UTC_TIMESTAMP(6),
  CONSTRAINT fk_procedure_versions_document FOREIGN KEY (procedure_document_id) REFERENCES procedure_documents(id),
  CONSTRAINT fk_procedure_versions_creator FOREIGN KEY (created_by) REFERENCES users(id),
  UNIQUE KEY uq_procedure_version (procedure_document_id, version_no)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
