ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at DATETIME(6) NULL AFTER must_change_password;
