CREATE TABLE IF NOT EXISTS order_payment_proofs (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1400000),
  data BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
