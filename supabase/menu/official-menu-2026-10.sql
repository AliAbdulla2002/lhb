-- Lahab official menu, transcribed from the owner-supplied menu images (2026-10-29).
--
-- * Arabic names, descriptions and BHD prices are exactly as printed on the menu.
-- * English names/descriptions are DRAFT translations for owner approval
--   (see docs/OWNER_CHECKLIST.md). Brand names (Kinza) are kept as-is.
-- * Featured flags are provisional; best-seller badges are left off (not stated).
-- * Product photos are not set: the menu images are too small (~150 px) to use.
--
-- Idempotent: safe to re-run. Upserts by slug; it never deletes items that are not
-- listed here. Load into production with the SQL editor (as database owner) after review.
-- Local development loads it automatically after seed.sql (supabase/config.toml).

begin;

insert into public.categories (slug, name_ar, name_en, sort_order, is_visible) values
  ('shawarma',         'الشاورما',          'Shawarma',          1, true),
  ('special-shawarma', 'السبيشال شاورما',   'Special shawarma',  2, true),
  ('shawarma-burger',  'برجر الشاورما',     'Shawarma burger',   3, true),
  ('shawarma-plates',  'صحن الشاورما',      'Shawarma plates',   4, true),
  ('fries-bowls',      'صحن البطاطس',       'Fries bowls',       5, true),
  ('salads',           'السلطات',           'Salads',            6, true),
  ('appetizers',       'المقبلات',          'Sides',             7, true),
  ('kids-meals',       'وجبات الأطفال',     'Kids'' meals',      8, true),
  ('sauces',           'السوسات',           'Sauces',            9, true),
  ('drinks',           'المشروبات',         'Drinks',           10, true)
on conflict (slug) do update set
  name_ar = excluded.name_ar, name_en = excluded.name_en, sort_order = excluded.sort_order,
  is_visible = excluded.is_visible, archived_at = null;

with items (category, slug, name_ar, name_en, description_ar, description_en, price, featured, sort) as (values
  -- الشاورما
  ('shawarma', 'classic-chicken-shawarma', 'كلاسيك شاورما دجاج', 'Classic chicken shawarma',
   'شاورما دجاج بالخبز اللبناني، ثومية، مخلل، بطاطس', 'Chicken shawarma in Lebanese bread, garlic sauce, pickles, fries', 0.700, false, 1),
  ('shawarma', 'saj-chicken-shawarma', 'صاج شاورما دجاج', 'Saj chicken shawarma',
   'شاورما دجاج بالصاج، ثومية، مخلل، بطاطس', 'Chicken shawarma in saj bread, garlic sauce, pickles, fries', 0.800, false, 2),

  -- السبيشال شاورما
  ('special-shawarma', 'smoky-chicken-shawarma', 'شاورما دجاج سموكي', 'Smoky chicken shawarma',
   'شاورما دجاج بخبز التورتيلا، خس، سوس السموكي، بطاطس، بصل مقرمش', 'Chicken shawarma in tortilla, lettuce, smoky sauce, fries, crispy onion', 1.700, false, 1),
  ('special-shawarma', 'signature-chicken-shawarma', 'شاورما دجاج سقنشر', 'Signature chicken shawarma',
   'شاورما دجاج بخبز التورتيلا، خس، سوس السقنشر، بطاطس، بصل مقرمش', 'Chicken shawarma in tortilla, lettuce, signature sauce, fries, crispy onion', 1.700, false, 2),
  ('special-shawarma', 'dynamite-chicken-shawarma', 'شاورما دجاج داينمايت', 'Dynamite chicken shawarma',
   'شاورما دجاج بخبز التورتيلا، خس، سوس الدايناميت، بطاطس، بصل مقرمش', 'Chicken shawarma in tortilla, lettuce, dynamite sauce, fries, crispy onion', 1.700, false, 3),
  ('special-shawarma', 'granata-chicken-shawarma', 'شاورما دجاج جراناتا', 'Granata chicken shawarma',
   'شاورما دجاج بخبز التورتيلا، جرجير، بصل أبيض، رمان فريش، دبس الرمان، سوس الجراناتا', 'Chicken shawarma in tortilla, rocket, white onion, fresh pomegranate, pomegranate molasses, granata sauce', 1.700, false, 4),
  ('special-shawarma', 'parmesan-chicken-shawarma', 'شاورما دجاج بارميزان', 'Parmesan chicken shawarma',
   'شاورما دجاج بخبز التورتيلا، خس، شاورما دجاج، سوس البارميزان، بطاطس، بصل مقرمش', 'Chicken shawarma in tortilla, lettuce, parmesan sauce, fries, crispy onion', 1.700, false, 5),

  -- برجر الشاورما
  ('shawarma-burger', 'chicken-shawarma-burger', 'برجر شاورما دجاج', 'Chicken shawarma burger',
   'خبز البرجر، سوس البرجر، خس، شاورما دجاج، ٣ أنواع جبنة، بصل مقرمش', 'Burger bun, burger sauce, lettuce, chicken shawarma, 3 kinds of cheese, crispy onion', 1.700, true, 1),

  -- صحن الشاورما
  ('shawarma-plates', 'chicken-shawarma-plate', 'صحن شاورما دجاج', 'Chicken shawarma plate',
   'شاورما دجاج، سوس الدايناميت، سوس الثومية، مخلل الفلفل، خبز لبناني', 'Chicken shawarma, dynamite sauce, garlic sauce, pickled peppers, Lebanese bread', 3.000, true, 1),
  ('shawarma-plates', 'arabic-chicken-shawarma-box', 'بكس شاورما عربي دجاج', 'Arabic chicken shawarma box',
   '٨ قطع شاورما دجاج بخبز الصاج، ثومية، مخلل (السوسات تُقدَّم في علب منفصلة: ثومية، دايناميت، مخلل فلفل)',
   '8 pieces of chicken shawarma in saj bread, garlic sauce, pickles (sauces served in separate tubs: garlic, dynamite, pickled peppers)', 2.800, true, 2),

  -- صحن البطاطس
  ('fries-bowls', 'cheesy-fries', 'بطاطس تشيزي', 'Cheesy fries',
   'بطاطس مقلية، ٣ أنواع من سوسات لهب الخاصة، ٣ أنواع جبنة مختلفة، هالبينو', 'Fries, 3 Lahab signature sauces, 3 kinds of cheese, jalapeño', 1.800, false, 1),
  ('fries-bowls', 'signature-fries', 'بطاطس سقنشر', 'Signature fries',
   'بطاطس مقلية، ٣ أنواع من سوسات لهب الخاصة، ٣ أنواع جبنة مختلفة، شاورما دجاج، سوس السقنشر، هالبينو، بصل مقرمش',
   'Fries, 3 Lahab signature sauces, 3 kinds of cheese, chicken shawarma, signature sauce, jalapeño, crispy onion', 2.200, false, 2),

  -- السلطات
  ('salads', 'lahab-salad', 'سلطة لهب', 'Lahab salad',
   'خس، جرجير، افوكادو، رمان، جوز، جبن فيتا، تمر، شاورما دجاج', 'Lettuce, rocket, avocado, pomegranate, walnuts, feta, dates, chicken shawarma', 2.500, true, 1),
  ('salads', 'signature-salad', 'سلطة سقنشر', 'Signature salad',
   'خس، جرجير، ملفوف أحمر، كزبرة، بقدونس، طماط كرزي، جبن شيدر، بطاطس عمان، شاورما دجاج',
   'Lettuce, rocket, red cabbage, coriander, parsley, cherry tomatoes, cheddar, Oman chips, chicken shawarma', 2.500, false, 2),
  ('salads', 'caesar-salad', 'سلطة سيزر', 'Caesar salad',
   'خس، فتوش، بصل مقرمش، جبن بارميزان، شاورما دجاج', 'Lettuce, fattoush, crispy onion, parmesan, chicken shawarma', 2.000, false, 3),

  -- المقبلات
  ('appetizers', 'fries', 'بطاطس مقلية', 'French fries', null, null, 0.700, false, 1),
  ('appetizers', 'seasoned-fries', 'بطاطس مقلية مبهرة', 'Seasoned fries', null, null, 0.800, false, 2),
  ('appetizers', 'chicken-shawarma-samosa', 'سمبوسة شاورما دجاج', 'Chicken shawarma samosa', '٥ قطع', '5 pieces', 1.500, false, 3),
  ('appetizers', 'mozzarella-sticks', 'أصابع جبن الموزاريلا', 'Mozzarella sticks', '٥ قطع', '5 pieces', 1.500, false, 4),

  -- وجبات الأطفال
  ('kids-meals', 'kids-popcorn-chicken', 'وجبة قطع الدجاج بوب كورن', 'Popcorn chicken kids'' meal',
   'قطع الدجاج بوب كورن، بطاطس مقلية، عصير، كاتشب', 'Popcorn chicken, fries, juice, ketchup', 1.600, false, 1),
  ('kids-meals', 'kids-chicken-nuggets', 'وجبة قطع الدجاج ناجتس', 'Chicken nuggets kids'' meal',
   'قطع الدجاج ناجتس، بطاطس مقلية، عصير، كاتشب', 'Chicken nuggets, fries, juice, ketchup', 1.600, false, 2),

  -- السوسات
  ('sauces', 'lahab-signature-sauce', 'سوسات لهب الخاصة', 'Lahab signature sauce',
   'سوس سقنشر، سوس دايناميت، سوس ثومية، سوس طحينة، سوس جراناتا، سوس بارميزان، سوس سموكي',
   'Signature, dynamite, garlic, tahini, granata, parmesan or smoky', 0.300, false, 1),

  -- المشروبات
  ('drinks', 'water', 'ماء', 'Water', null, null, 0.100, false, 1),
  ('drinks', 'juice', 'عصير', 'Juice', null, null, 0.200, false, 2),
  ('drinks', 'kinza', 'كينزا', 'Kinza', null, null, 0.300, false, 3)
)
insert into public.products (category_id, slug, name_ar, name_en, description_ar, description_en, base_price, is_featured, sort_order, is_available)
select c.id, i.slug, i.name_ar, i.name_en, i.description_ar, i.description_en, i.price::numeric(10, 3), i.featured, i.sort, true
from items i join public.categories c on c.slug = i.category
on conflict (slug) do update set
  category_id = excluded.category_id, name_ar = excluded.name_ar, name_en = excluded.name_en,
  description_ar = excluded.description_ar, description_en = excluded.description_en,
  base_price = excluded.base_price, is_featured = excluded.is_featured, sort_order = excluded.sort_order,
  archived_at = null;

-- Each Lahab sauce is sold individually: the customer picks one.
delete from public.product_options o using public.products p
 where o.product_id = p.id and p.slug = 'lahab-signature-sauce';

with opt as (
  insert into public.product_options (product_id, name_ar, name_en, min_select, max_select, sort_order)
  select p.id, 'اختر السوس', 'Choose a sauce', 1, 1, 1 from public.products p where p.slug = 'lahab-signature-sauce'
  returning id
)
insert into public.product_option_values (option_id, name_ar, name_en, price_delta, sort_order)
select opt.id, v.name_ar, v.name_en, 0, v.sort
from opt, (values
  ('سوس سقنشر', 'Signature sauce', 1),
  ('سوس دايناميت', 'Dynamite sauce', 2),
  ('سوس ثومية', 'Garlic sauce', 3),
  ('سوس طحينة', 'Tahini sauce', 4),
  ('سوس جراناتا', 'Granata sauce', 5),
  ('سوس بارميزان', 'Parmesan sauce', 6),
  ('سوس سموكي', 'Smoky sauce', 7)
) as v(name_ar, name_en, sort);

-- Contact details printed on the menu: 17232805 (phone) and 33447433 (WhatsApp).
update public.restaurant_settings set whatsapp = '+97333447433';

commit;
