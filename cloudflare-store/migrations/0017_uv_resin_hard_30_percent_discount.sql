-- Apply a 30% discount to all six UV Resin Hard size options.
-- Prices for 50 g, 100 g and 500 g retain the previously approved ₹200 base price.

UPDATE products
SET mrp=200, price=140,
    meta_json=json_set(meta_json,'$.specs.MRP','₹200','$.specs.Price','₹140','$.specs.Discount','30%'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard-uvh50';

UPDATE products
SET mrp=240, price=168,
    meta_json=json_set(meta_json,'$.specs.MRP','₹240','$.specs.Price','₹168','$.specs.Discount','30%'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard-uvh60';

UPDATE products
SET mrp=200, price=140,
    meta_json=json_set(meta_json,'$.specs.MRP','₹200','$.specs.Price','₹140','$.specs.Discount','30%'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard-uvh100';

UPDATE products
SET mrp=600, price=420,
    meta_json=json_set(meta_json,'$.specs.MRP','₹600','$.specs.Price','₹420','$.specs.Discount','30%'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard-uvh200';

UPDATE products
SET mrp=750, price=525,
    meta_json=json_set(meta_json,'$.specs.MRP','₹750','$.specs.Price','₹525','$.specs.Discount','30%'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard-uvh250';

UPDATE products
SET mrp=200, price=140,
    meta_json=json_set(meta_json,'$.specs.MRP','₹200','$.specs.Price','₹140','$.specs.Discount','30%'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard-uvh500';

UPDATE products
SET mrp=200, price=140,
    meta_json=json_set(meta_json,'$.specs.Discount','30% off all size options'),
    updated_at=datetime('now')
WHERE id='uv-resin-hard';
