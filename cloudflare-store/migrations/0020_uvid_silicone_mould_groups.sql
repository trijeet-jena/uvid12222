-- Split the 22 UVID silicone mould options into four shorter product selectors.
-- Keep all 22 child product rows (and their existing image URLs and prices).

UPDATE products
SET status='ARCHIVED', updated_at=datetime('now')
WHERE id='uvid-silicone-moulds';

UPDATE products
SET meta_json=json_set(COALESCE(meta_json,'{}'), '$.parent', 'uvidsm-earring-moulds'), updated_at=datetime('now')
WHERE id IN ('uvidsm-123','uvidsm-124','uvidsm-125');

UPDATE products
SET meta_json=json_set(COALESCE(meta_json,'{}'), '$.parent', 'uvidsm-flower-moulds-set-1'), updated_at=datetime('now')
WHERE id IN ('uvidsm-126','uvidsm-127','uvidsm-128','uvidsm-129','uvidsm-130','uvidsm-131','uvidsm-132','uvidsm-133');

UPDATE products
SET meta_json=json_set(COALESCE(meta_json,'{}'), '$.parent', 'uvidsm-flower-moulds-set-2'), updated_at=datetime('now')
WHERE id IN ('uvidsm-134','uvidsm-135','uvidsm-136','uvidsm-137','uvidsm-138','uvidsm-139','uvidsm-140','uvidsm-141');

UPDATE products
SET meta_json=json_set(COALESCE(meta_json,'{}'), '$.parent', 'uvidsm-decorative-moulds'), updated_at=datetime('now')
WHERE id IN ('uvidsm-147','uvidsm-148','uvidsm-149');

INSERT OR IGNORE INTO products
  (id,product_name,category,description,price,mrp,stock_quantity,image_url,emoji,variant_label,variants_json,status,sort_order,meta_json)
VALUES
  ('uvidsm-earring-moulds','Silicone Earring Moulds — Choose a Design','candle-making',
   'Choose from 3 silicone mould designs. Each design has its own photo, UVID item code and catalogue SKU. Every design is priced at 30% off its catalogue MRP.',
   154,220,75,'/assets/uvidsm-123.jpg','🕯️',NULL,
   (SELECT json_group_array(json_object('id',id,'size',substr(variant_label,1,instr(variant_label,' · ')-1),'label',variant_label,'name',product_name,'price',price,'mrp',mrp,'stock',stock_quantity))
    FROM (SELECT id,variant_label,product_name,price,mrp,stock_quantity FROM products WHERE id IN ('uvidsm-123','uvidsm-124','uvidsm-125') ORDER BY sort_order)),
   'ACTIVE',1450,
   '{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["new","deal"],"specs":{"Category":"Candle Making","Available designs":"3","Discount":"30% off each catalogue MRP"},"highlights":["Choose from 3 catalogue designs","Every design has its own photo, item code and SKU","30% off each design''s catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}');

INSERT OR IGNORE INTO products
  (id,product_name,category,description,price,mrp,stock_quantity,image_url,emoji,variant_label,variants_json,status,sort_order,meta_json)
VALUES
  ('uvidsm-flower-moulds-set-1','Flower Candle Moulds — Set 1','candle-making',
   'Choose from 8 silicone mould designs. Each design has its own photo, UVID item code and catalogue SKU. Every design is priced at 30% off its catalogue MRP.',
   154,220,200,'/assets/uvidsm-126.jpg','🕯️',NULL,
   (SELECT json_group_array(json_object('id',id,'size',substr(variant_label,1,instr(variant_label,' · ')-1),'label',variant_label,'name',product_name,'price',price,'mrp',mrp,'stock',stock_quantity))
    FROM (SELECT id,variant_label,product_name,price,mrp,stock_quantity FROM products WHERE id IN ('uvidsm-126','uvidsm-127','uvidsm-128','uvidsm-129','uvidsm-130','uvidsm-131','uvidsm-132','uvidsm-133') ORDER BY sort_order)),
   'ACTIVE',1451,
   '{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["new","deal"],"specs":{"Category":"Candle Making","Available designs":"8","Discount":"30% off each catalogue MRP"},"highlights":["Choose from 8 catalogue designs","Every design has its own photo, item code and SKU","30% off each design''s catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}');

INSERT OR IGNORE INTO products
  (id,product_name,category,description,price,mrp,stock_quantity,image_url,emoji,variant_label,variants_json,status,sort_order,meta_json)
VALUES
  ('uvidsm-flower-moulds-set-2','Flower Candle Moulds — Set 2','candle-making',
   'Choose from 8 silicone mould designs. Each design has its own photo, UVID item code and catalogue SKU. Every design is priced at 30% off its catalogue MRP.',
   154,220,200,'/assets/uvidsm-134.jpg','🕯️',NULL,
   (SELECT json_group_array(json_object('id',id,'size',substr(variant_label,1,instr(variant_label,' · ')-1),'label',variant_label,'name',product_name,'price',price,'mrp',mrp,'stock',stock_quantity))
    FROM (SELECT id,variant_label,product_name,price,mrp,stock_quantity FROM products WHERE id IN ('uvidsm-134','uvidsm-135','uvidsm-136','uvidsm-137','uvidsm-138','uvidsm-139','uvidsm-140','uvidsm-141') ORDER BY sort_order)),
   'ACTIVE',1452,
   '{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["new","deal"],"specs":{"Category":"Candle Making","Available designs":"8","Discount":"30% off each catalogue MRP"},"highlights":["Choose from 8 catalogue designs","Every design has its own photo, item code and SKU","30% off each design''s catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}');

INSERT OR IGNORE INTO products
  (id,product_name,category,description,price,mrp,stock_quantity,image_url,emoji,variant_label,variants_json,status,sort_order,meta_json)
VALUES
  ('uvidsm-decorative-moulds','Decorative Candle Moulds — Choose a Design','candle-making',
   'Choose from 3 decorative silicone mould designs. Each design has its own photo, UVID item code and catalogue SKU. Every design is priced at 30% off its catalogue MRP.',
   462,660,75,'/assets/uvidsm-147.jpg','🕯️',NULL,
   (SELECT json_group_array(json_object('id',id,'size',substr(variant_label,1,instr(variant_label,' · ')-1),'label',variant_label,'name',product_name,'price',price,'mrp',mrp,'stock',stock_quantity))
    FROM (SELECT id,variant_label,product_name,price,mrp,stock_quantity FROM products WHERE id IN ('uvidsm-147','uvidsm-148','uvidsm-149') ORDER BY sort_order)),
   'ACTIVE',1453,
   '{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["new","deal"],"specs":{"Category":"Candle Making","Available designs":"3","Discount":"30% off each catalogue MRP"},"highlights":["Choose from 3 catalogue designs","Every design has its own photo, item code and SKU","30% off each design''s catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}');
