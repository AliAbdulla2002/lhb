-- LOCAL DEVELOPMENT SEED ONLY — applied by `supabase db reset`. Never run against production.
--
-- Branch details are from Lahab's Instagram bio, Google Business listing and the official
-- menu (2026-10-29). Opening hours are UNCONFIRMED (sources disagree: 5 pm–12 am vs
-- 12 pm–12 am). The official menu itself is loaded next from supabase/menu/ (config.toml).

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

insert into public.site_content (key, value_ar, value_en) values
  ('home.hero.title', 'شاورما على اللهب', 'Shawarma, fired up'),
  ('home.hero.subtitle', 'اطلب الحين واستلم طلبك من سيارتك في عالي.', 'Order now and pick up from your car in A''ali.'),
  ('about.body', 'نص "عن لهب" بانتظار اعتماد صاحب المطعم.', 'About Lahab copy is awaiting owner approval.'),
  ('policy.privacy', 'مسودة سياسة الخصوصية — بانتظار المراجعة القانونية.', 'Privacy policy draft — pending legal review.'),
  ('policy.terms', 'مسودة الشروط والأحكام — بانتظار المراجعة القانونية.', 'Terms and conditions draft — pending legal review.');
