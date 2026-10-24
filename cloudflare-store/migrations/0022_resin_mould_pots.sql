INSERT OR IGNORE INTO products
  (id,product_name,category,description,price,mrp,stock_quantity,image_url,emoji,variant_label,variants_json,status,sort_order,meta_json)
VALUES
  ('uvidsm-145','Striped Storage Pot Mold','resin-moulds','Striped storage pot silicone mould. Finished pot dimensions: 9.1 cm diameter × 6.1 cm high. Item code UVIDSM145; catalogue SKU DI-RM-0282. Catalogue MRP ₹560 with 30% off.',392,560,25,'/assets/resin-moulds/uvidsm-145.png','🏺',NULL,NULL,'ACTIVE',1157,'{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["deal"],"specs":{"Item Code":"UVIDSM145","Catalogue SKU":"DI-RM-0282","Dimensions":"9.1 cm diameter × 6.1 cm high","MRP":"₹560","Discount":"30%","Price":"₹392"},"highlights":["Striped storage pot silicone mould","Finished pot dimensions: 9.1 cm diameter × 6.1 cm high","30% off the catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}'),
  ('uvidsm-146','Striped Origami Vase Mold','resin-moulds','Striped origami vase silicone mould. Finished vase dimensions: 7.3 cm diameter × 8.9 cm high. Item code UVIDSM146; catalogue SKU DI-RM-0293. Catalogue MRP ₹880 with 30% off.',616,880,25,'/assets/resin-moulds/uvidsm-146.png','🏺',NULL,NULL,'ACTIVE',1158,'{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["deal"],"specs":{"Item Code":"UVIDSM146","Catalogue SKU":"DI-RM-0293","Dimensions":"7.3 cm diameter × 8.9 cm high","MRP":"₹880","Discount":"30%","Price":"₹616"},"highlights":["Striped origami vase silicone mould","Finished vase dimensions: 7.3 cm diameter × 8.9 cm high","30% off the catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}');

-- UVIDSM147 already existed as an option in the candle mould group. Make it a
-- standalone Resin Moulds product and leave the two other candle designs grouped.
UPDATE products
SET category='resin-moulds',
    description='Lace-edged candle holder silicone mould. Finished holder dimensions: 6.48 cm diameter × 7 cm high. Item code UVIDSM147; catalogue SKU DI-RM-0397. Catalogue MRP ₹660 with 30% off.',
    image_url='/assets/resin-moulds/uvidsm-147.png',
    variant_label=NULL,
    variants_json=NULL,
    sort_order=1159,
    meta_json='{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["deal"],"specs":{"Item Code":"UVIDSM147","Catalogue SKU":"DI-RM-0397","Dimensions":"6.48 cm diameter × 7 cm high","MRP":"₹660","Discount":"30%","Price":"₹462"},"highlights":["Lace-edged candle holder silicone mould","Finished holder dimensions: 6.48 cm diameter × 7 cm high","30% off the catalogue MRP"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}'
WHERE id='uvidsm-147';

UPDATE products
SET product_name='Decorative Candle Moulds — Choose a Design',
    description='Choose from the two remaining decorative silicone mould designs for candle making. Each design has its own photo, item code and catalogue SKU, with 30% off its catalogue MRP.',
    price=322,
    mrp=460,
    stock_quantity=50,
    image_url='/assets/uvidsm-149.jpg',
    variants_json='[{"id":"uvidsm-148","size":"UVIDSM148","label":"UVIDSM148 · Arabic Prayer Mold","name":"Arabic Prayer Mold","price":392.0,"mrp":560.0,"stock":25},{"id":"uvidsm-149","size":"UVIDSM149","label":"UVIDSM149 · Cross Mold","name":"Cross Mold","price":322.0,"mrp":460.0,"stock":25}]',
    meta_json='{"brand":"UVID Art and Craft Supplies","rating":null,"ratingCount":0,"tags":["new","deal"],"specs":{"Category":"Candle Making","Available designs":"2","Discount":"30% off each catalogue MRP"},"highlights":["Choose from 2 catalogue designs","Each remaining design has its own photo, item code and SKU","30% off the catalogue MRP on each design"],"bg":"#F7F1E8","ink":"#A66B3F","parent":null}'
WHERE id='uvidsm-decorative-moulds';
