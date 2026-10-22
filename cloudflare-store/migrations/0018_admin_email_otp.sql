CREATE TABLE IF NOT EXISTS admin_email_otps (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  code_hash TEXT NOT NULL,
  sent_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  request_window_start_ms INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);
