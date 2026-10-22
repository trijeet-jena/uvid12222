-- Set the parent listing and every pigment shade to the requested sale price.
UPDATE products
SET price = 52,
    mrp = 75,
    description = replace(description, '₹200', '₹52 (MRP ₹75)'),
    meta_json = json_set(
      COALESCE(meta_json, '{}'),
      '$.specs.Price', '₹52 sale price per shade',
      '$.specs.MRP', '₹75 per shade'
    )
WHERE id = 'water-based-pigment'
   OR id LIKE 'water-based-pigment-%';

UPDATE products
SET meta_json = json_set(
      COALESCE(meta_json, '{}'),
      '$.highlights[2]', '₹52 sale price · MRP ₹75 per color · 30 pieces available per shade'
    )
WHERE id = 'water-based-pigment';
