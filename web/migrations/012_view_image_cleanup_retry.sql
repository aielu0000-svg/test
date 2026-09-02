-- Detached "view location" images are cleaned by a retryable filesystem job.
-- Existing migrations are never amended; this migration is idempotent.
ALTER TABLE test_case_view_images
  ADD COLUMN IF NOT EXISTS cleanup_status ENUM('active', 'pending', 'failed') NOT NULL DEFAULT 'active' AFTER test_case_id,
  ADD COLUMN IF NOT EXISTS cleanup_attempts INT NOT NULL DEFAULT 0 AFTER cleanup_status,
  ADD COLUMN IF NOT EXISTS cleanup_last_error LONGTEXT NULL AFTER cleanup_attempts;

CREATE INDEX IF NOT EXISTS idx_view_images_cleanup
  ON test_case_view_images (cleanup_status, test_case_id, created_at);