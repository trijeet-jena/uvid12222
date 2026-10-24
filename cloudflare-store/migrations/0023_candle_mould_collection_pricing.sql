-- Set the mould design retail price to ₹380 against an MRP of ₹420.
-- Apply to the five server-backed collections and every selectable design.
UPDATE products
SET price = 380,
    mrp = 420,
    description = replace(description, '₹200', '₹380'),
    meta_json = replace(meta_json, '₹200', '₹380')
WHERE category = 'candle-making'
  AND (
    id IN (
      'candle-rose-moulds',
      'candle-flower-moulds',
      'candle-lotus-floral-moulds',
      'candle-twist-moulds',
      'candle-ornate-pillar-moulds'
    )
    OR json_extract(meta_json, '$.parent') IN (
      'candle-rose-moulds',
      'candle-flower-moulds',
      'candle-lotus-floral-moulds',
      'candle-twist-moulds',
      'candle-ornate-pillar-moulds'
    )
  );
