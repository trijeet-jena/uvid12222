-- Persist admin price and available-stock edits for products defined in code.
-- stock_quantity stores the base plus active order reservations; the Worker
-- subtracts active order quantities when presenting available stock.
CREATE TABLE IF NOT EXISTS code_product_overrides (
  product_id TEXT PRIMARY KEY,
  price REAL NOT NULL CHECK (price >= 0),
  stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
