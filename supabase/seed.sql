-- LOCAL DEVELOPMENT SEED ONLY — applied by `supabase db reset`. Never run against production.
--
-- Branch details below are taken from Lahab's public Instagram bio and Google Business
-- listing (2026-10-29). Opening hours are UNCONFIRMED (sources disagree: 5 pm–12 am vs
-- 12 pm–12 am). Every menu item is a clearly labelled SAMPLE with placeholder prices —
-- replace with the official menu through /admin before launch.

update public.restaurant_settings set
  tagline_ar = 'شاورما أصلية 🔥',
  tagline_en = 'Authentic Shawarma 🔥',
  phones = array['+97333447433', '+97317232805'],
  instagram_url = 'https://www.instagram.com/lahab.bh/',
  ordering_enabled = true,
  cash_on_pickup_enabled = true;

insert into public.branches (id, slug, name_ar, name_en, address_ar, address_en, phone, pickup_lead_minutes, slot_minutes, max_orders_per_slot, pickup_instructions_ar, pickup_instructions_en)
values (
  '00000000-0000-4000-8000-000000000001', 'aali', 'عالي', 'A''ali',
  'مبنى 2542، طريق 4270، عالي', 'Building 2542, Road 4270, A''ali',
  '+97333447433', 15, 15, 12,
  'تعليمات موقف الاستلام بانتظار تأكيد المطعم.', 'Pickup parking instructions pending confirmation from the restaurant.'
);

-- UNCONFIRMED: 17:00 → 00:00 every day.
insert into public.business_hours (branch_id, weekday, opens_at, closes_at, closes_next_day)
select '00000000-0000-4000-8000-000000000001', d, '17:00', '00:00', true from generate_series(0, 6) d;

insert into public.categories (id, slug, name_ar, name_en, sort_order) values
  ('00000000-0000-4000-8000-0000000000c1', 'shawarma', 'شاورما (نموذج)', 'Shawarma (sample)', 1),
  ('00000000-0000-4000-8000-0000000000c2', 'boxes', 'بوكسات (نموذج)', 'Boxes (sample)', 2),
  ('00000000-0000-4000-8000-0000000000c3', 'salads', 'سلطات (نموذج)', 'Salads (sample)', 3),
  ('00000000-0000-4000-8000-0000000000c4', 'sides', 'إضافات جانبية (نموذج)', 'Sides (sample)', 4);

insert into public.products (id, category_id, slug, name_ar, name_en, description_ar, description_en, base_price, is_featured, is_best_seller, sort_order) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'sample-chicken-shawarma',
   'شاورما دجاج — نموذج', 'Chicken shawarma — SAMPLE',
   'عنصر تجريبي. السعر والوصف للاختبار فقط.', 'Placeholder item. Price and description are for testing only.',
   1.000, true, true, 1),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', 'sample-arabic-shawarma',
   'شاورما عربي — نموذج', 'Arabic shawarma — SAMPLE',
   'عنصر تجريبي. السعر والوصف للاختبار فقط.', 'Placeholder item. Price and description are for testing only.',
   2.000, true, false, 2),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000c2', 'sample-family-box',
   'بوكس العائلة — نموذج', 'Family box — SAMPLE',
   'عنصر تجريبي. السعر والوصف للاختبار فقط.', 'Placeholder item. Price and description are for testing only.',
   5.000, true, false, 1),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000c3', 'sample-house-salad',
   'سلطة — نموذج', 'House salad — SAMPLE',
   'عنصر تجريبي. السعر والوصف للاختبار فقط.', 'Placeholder item. Price and description are for testing only.',
   1.500, false, false, 1),
  ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000c4', 'sample-cheese-fries',
   'بطاطس بالجبن — نموذج', 'Cheese fries — SAMPLE',
   'عنصر تجريبي غير متوفر لاختبار حالة عدم التوفر.', 'Placeholder item, marked unavailable to test that state.',
   0.800, false, false, 1);
update public.products set is_available = false where slug = 'sample-cheese-fries';

insert into public.product_options (id, product_id, name_ar, name_en, min_select, max_select, sort_order) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'الحجم', 'Size', 1, 1, 1),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', 'صوصات إضافية', 'Extra sauces', 0, 3, 2);

insert into public.product_option_values (option_id, name_ar, name_en, price_delta, is_default, sort_order) values
  ('00000000-0000-4000-8000-0000000000b1', 'عادي', 'Regular', 0, true, 1),
  ('00000000-0000-4000-8000-0000000000b1', 'كبير', 'Large', 0.500, false, 2),
  ('00000000-0000-4000-8000-0000000000b2', 'صوص نموذج ١', 'Sample sauce 1', 0.200, false, 1),
  ('00000000-0000-4000-8000-0000000000b2', 'صوص نموذج ٢', 'Sample sauce 2', 0.200, false, 2);

insert into public.promotions (title_ar, title_en, body_ar, body_en, link_path, starts_at, ends_at) values
  ('عرض تجريبي', 'Sample offer', 'بانر تجريبي لاختبار العروض. ليس عرضاً حقيقياً.', 'Placeholder banner to test offers. Not a real promotion.',
   '/menu', now() - interval '1 day', now() + interval '30 days');

insert into public.site_content (key, value_ar, value_en) values
  ('home.hero.title', 'شاورما على اللهب', 'Shawarma, fired up'),
  ('home.hero.subtitle', 'اطلب الحين واستلم طلبك من سيارتك في عالي.', 'Order now and pick up from your car in A''ali.'),
  ('about.body', 'نص "عن لهب" بانتظار اعتماد صاحب المطعم.', 'About Lahab copy is awaiting owner approval.'),
  ('policy.privacy', 'مسودة سياسة الخصوصية — بانتظار المراجعة القانونية.', 'Privacy policy draft — pending legal review.'),
  ('policy.terms', 'مسودة الشروط والأحكام — بانتظار المراجعة القانونية.', 'Terms and conditions draft — pending legal review.');
