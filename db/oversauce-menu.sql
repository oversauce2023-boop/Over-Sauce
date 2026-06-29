-- ============================================================
-- Over Sauce Lounge — REAL MENU (categories + dishes) — COMPLETE
-- Run in Supabase SQL Editor to replace the demo menu.
-- Run AFTER the calories/allergens migration.
-- ============================================================

begin;
delete from public.products;
delete from public.categories;

insert into public.categories (id, icon, name_ar, name_en, sort_order) values
  ('breakfast', '🍳', 'الفطار', 'Breakfast', 1),
  ('manakish', '🫓', 'مناقيش', 'Manakish', 2),
  ('pizza', '🍕', 'بيتزا', 'Pizza', 3),
  ('pasta', '🍝', 'الباستا', 'Pasta', 4),
  ('soup', '🍲', 'شوربة', 'Soups', 5),
  ('drinks', '🥤', 'مشروبات', 'Drinks', 6);

insert into public.products (id, category_id, name_ar, name_en, description_ar, description_en, price, image_url, sort_order) values
  ('bf1', 'breakfast', 'قطعتين فطير قشدة عسل مربى', 'Two Fteer with Cream, Honey & Jam', 'قطعتين فطير مشلتت طازج محشي قشطة، يُقدّم مع عسل ومربى.', 'Two pieces of fresh flaky fteer filled with cream, served with honey and jam.', 30, '/assets/images/fteer-cream-honey.jpg', 1),
  ('bf2', 'breakfast', 'بيض أومليت', 'Omelette', 'أومليت بيض طازج مع الخضار، يُقدّم ساخناً مع الخبز.', 'Fresh egg omelette with vegetables, served hot with bread.', 12, '/assets/images/omelette.jpg', 2),
  ('mn1', 'manakish', 'مناقيش جبنة بالعسل', 'Cheese & Honey Manakish', 'عجينة طازجة بجبنة موزاريلا ولمسة عسل، مخبوزة في الفرن.', 'Fresh dough with mozzarella cheese and a touch of honey, oven-baked.', 20, '/assets/images/manakish-cheese-honey.jpg', 1),
  ('pz1', 'pizza', 'بيتزا خضار', 'Vegetable Pizza', 'بيتزا بعجينة طازجة وخضار ملوّنة وجبنة موزاريلا.', 'Pizza with fresh dough, colorful vegetables and mozzarella cheese.', 32, '/assets/images/pizza-veg.jpg', 1),
  ('pa1', 'pasta', 'فرايد شرمب', 'Fried Shrimp', 'جمبري مقرمش مقلي بتتبيلة خاصة، يُقدّم مع صوص جانبي.', 'Crispy fried shrimp with a special seasoning, served with a side sauce.', 50, '/assets/images/fried-shrimp.jpg', 1),
  ('sp1', 'soup', 'شوربة عدس', 'Lentil Soup', 'شوربة عدس كريمية ساخنة بنكهة غنية، تُقدّم مع الليمون.', 'Warm creamy lentil soup with a rich flavor, served with lemon.', 18, '/assets/images/lentil-soup.jpg', 1),
  ('dr1', 'drinks', 'موهيتو كود ريد', 'Mojito Code Red', 'موهيتو كود ريد المنعش بالنعناع والليمون ولمسة من التوت الأحمر.', 'Refreshing Code Red mojito with mint, lime and a hint of red berries.', 27, '/assets/images/mojito.jpg', 1);

commit;
