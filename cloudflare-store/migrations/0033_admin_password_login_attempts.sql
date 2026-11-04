DROP TABLE IF EXISTS admin_email_otps;

CREATE TABLE IF NOT EXISTS admin_password_login_attempts (
  ip_hash TEXT PRIMARY KEY,
  window_start_ms INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_password_login_attempts_updated_idx
  ON admin_password_login_attempts(updated_at_ms);
