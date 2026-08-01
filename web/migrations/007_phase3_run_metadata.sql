ALTER TABLE test_runs
  ADD COLUMN environment_name VARCHAR(300) NULL AFTER name,
  ADD COLUMN build_name VARCHAR(300) NULL AFTER environment_name,
  ADD COLUMN assignee_id CHAR(36) NULL AFTER build_name,
  ADD COLUMN memo LONGTEXT NULL AFTER assignee_id,
  ADD CONSTRAINT fk_runs_assignee FOREIGN KEY (assignee_id) REFERENCES users(id);

CREATE INDEX idx_runs_assignee ON test_runs (project_id, assignee_id, status);
