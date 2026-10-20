-- Group the existing color products under one editable Water-Based Pigment
-- parent. The child catalog rows retain each shade's price, stock and local
-- image while the storefront and admin present them as variants.
INSERT OR IGNORE INTO products (id,product_name,category,description,price,mrp,stock_quantity,image_url,emoji,variant_label,variants_json,status,sort_order,meta_json)
VALUES (
  'water-based-pigment',
  'Water-Based Pigment',
  'resin-moulds',
  'Water-based pigment for coloring cement and plaster craft projects. Choose from 18 shades: Black, Rose Red, Baby Blue, Purple, Pink, Red, Misty Rose, Caramel Brown, Misty Gray, Milk Coffee, Blue Purple, Blue, Brown, Lotus Green, Orange Red, Orange Yellow, Avocado Green and Blue Green. Each bottle contains 10 ml (0.35 oz). Shake before use. Each shade is ₹200 with 30 pieces available.',
  200,200,540,'/assets/resin-pigments/black.jpeg','🧪',NULL,NULL,'ACTIVE',800,
  '{"tags":["new"],"highlights":["18 color variants","10 ml water-based pigment for cement and plaster","₹200 per color · 30 pieces available per shade"],"specs":{"Product":"Water-based pigment","Contents":"10 ml (0.35 oz) per shade","Application":"Cement and plaster","Available shades":"Black, Rose Red, Baby Blue, Purple, Pink, Red, Misty Rose, Caramel Brown, Misty Gray, Milk Coffee, Blue Purple, Blue, Brown, Lotus Green, Orange Red, Orange Yellow, Avocado Green and Blue Green","Price":"₹200 per shade","Stock":"30 pieces per shade"},"bg":"#F3F5FF","ink":"#263E73"}'
);

UPDATE products
SET variant_label=replace(product_name,'Water-Based Pigment — ',''),
    meta_json=json_set(COALESCE(meta_json,'{}'),'$.tags',json_array('vc-hidden'),'$.parent','water-based-pigment'),
    sort_order=sort_order+1
WHERE id LIKE 'water-based-pigment-%';
