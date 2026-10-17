CREATE TABLE IF NOT EXISTS order_delivery_quotes (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  finalized INTEGER NOT NULL DEFAULT 0 CHECK (finalized IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
