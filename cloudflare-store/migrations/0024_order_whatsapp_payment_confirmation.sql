-- Record customer acknowledgement that payment proof and order ID were sent via WhatsApp.
ALTER TABLE orders ADD COLUMN payment_proof_sent_at TEXT;
