ALTER TABLE orders ADD COLUMN checkout_token TEXT;
ALTER TABLE orders ADD COLUMN payment_reference_id TEXT;
ALTER TABLE orders ADD COLUMN payment_verified_at TEXT;
ALTER TABLE orders ADD COLUMN payment_rejection_reason TEXT;
ALTER TABLE customer_addresses ADD COLUMN state TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_customer_checkout_token
  ON orders(customer_id, checkout_token)
  WHERE checkout_token IS NOT NULL;
