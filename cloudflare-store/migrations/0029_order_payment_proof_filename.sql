ALTER TABLE order_payment_proofs
ADD COLUMN file_name TEXT NOT NULL DEFAULT 'payment-proof';
