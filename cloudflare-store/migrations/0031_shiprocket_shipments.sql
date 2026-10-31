-- Track one Shiprocket booking per UVID order and prevent duplicate bookings.
CREATE TABLE IF NOT EXISTS shiprocket_shipments (
  order_id TEXT PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'CREATING',
  pickup_location TEXT NOT NULL,
  delivery_state TEXT NOT NULL,
  courier_id INTEGER,
  courier_name TEXT,
  courier_rate REAL,
  shiprocket_order_id INTEGER,
  shipment_id INTEGER,
  awb_code TEXT,
  tracking_url TEXT,
  label_url TEXT,
  pickup_status TEXT,
  manifest_url TEXT,
  weight REAL NOT NULL,
  length REAL NOT NULL,
  breadth REAL NOT NULL,
  height REAL NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
