ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS post_completion_updated_at DATETIME(6) NULL AFTER completed_at;

ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS post_completion_updated_by CHAR(36) NULL AFTER post_completion_updated_at;

CREATE INDEX IF NOT EXISTS idx_runs_post_completion_update
  ON test_runs (project_id, post_completion_updated_at);
