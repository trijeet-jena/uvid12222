-- Make each bouquet-net colour a standalone product in the Bouquet Nets subcategory.
-- Retain the former bundle row as archived so historical order references remain valid.
UPDATE products
SET status='ARCHIVED',
    stock_quantity=0,
    variants_json=NULL,
    meta_json=json_set(
      meta_json,
      '$.tags',json('["archived"]'),
      '$.highlights',json('["Replaced by individual colour products."]')
    ),
    updated_at=datetime('now')
WHERE id='pearl-edged-bouquet-net';

UPDATE products
SET product_name=json_extract(meta_json,'$.specs.Model') || ' — Pearl-Edged Bouquet Net — ' || json_extract(meta_json,'$.specs.Colour'),
    variant_label=NULL,
    variants_json=NULL,
    meta_json=json_set(
      json_remove(meta_json,'$.parent','$.variantLabel'),
      '$.tags',json('["deal"]'),
      '$.highlights',json_array(
        'Decorative pearl-edged bouquet wrapping net',
        'Item code: ' || json_extract(meta_json,'$.specs.Model'),
        'Colour: ' || json_extract(meta_json,'$.specs.Colour'),
        '₹160 each · MRP ₹250 · 10 in stock'
      )
    ),
    updated_at=datetime('now')
WHERE id LIKE 'bouquet-net-mg2513%';
