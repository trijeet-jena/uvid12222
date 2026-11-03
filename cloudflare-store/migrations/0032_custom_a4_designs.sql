-- Save customer-created A4 text design instructions and a matching PNG with each order item.
ALTER TABLE order_items ADD COLUMN custom_design_json TEXT;
ALTER TABLE order_items ADD COLUMN custom_design_image BLOB;
