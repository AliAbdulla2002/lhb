-- Lahab: core relational schema.

-- ---------------------------------------------------------------------------
-- People & access
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 120),
  phone text check (phone ~ '^\+?[0-9]{8,15}$'),
  preferred_language text not null default 'ar' check (preferred_language in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------------------
-- Branches & hours
-- ---------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text not null check (char_length(name_en) between 1 and 120),
  address_ar text,
  address_en text,
  phone text,
  maps_url text check (maps_url is null or maps_url ~ '^https://'),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  is_active boolean not null default true,
  accepts_pickup boolean not null default true,
  pickup_paused boolean not null default false,
  pickup_paused_reason text check (char_length(pickup_paused_reason) <= 200),
  pickup_lead_minutes integer not null default 15 check (pickup_lead_minutes between 0 and 240),
  slot_minutes integer not null default 15 check (slot_minutes in (5, 10, 15, 20, 30, 60)),
  max_orders_per_slot integer not null default 10 check (max_orders_per_slot between 1 and 500),
  pickup_instructions_ar text check (char_length(pickup_instructions_ar) <= 500),
  pickup_instructions_en text check (char_length(pickup_instructions_en) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_branch_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id)
);
create index staff_branch_assignments_branch_idx on public.staff_branch_assignments (branch_id);

-- weekday follows extract(dow): 0 = Sunday … 6 = Saturday.
-- closes_next_day handles shifts such as 17:00 → 00:00 or 18:00 → 02:00.
-- opens_at = closes_at with closes_next_day = true means open 24 hours.
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time not null,
  closes_at time not null,
  closes_next_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, weekday, opens_at),
  check (closes_next_day or closes_at > opens_at)
);

create table public.business_hour_exceptions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  closes_next_day boolean not null default false,
  note_ar text,
  note_en text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, date),
  check (is_closed or (opens_at is not null and closes_at is not null))
);

-- ---------------------------------------------------------------------------
-- Menu
-- ---------------------------------------------------------------------------

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  description_ar text check (char_length(description_ar) <= 300),
  description_en text check (char_length(description_en) <= 300),
  image_path text,
  sort_order integer not null default 0,
  is_visible boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index categories_sort_idx on public.categories (sort_order) where archived_at is null;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_ar text not null check (char_length(name_ar) between 1 and 120),
  name_en text not null check (char_length(name_en) between 1 and 120),
  description_ar text check (char_length(description_ar) <= 600),
  description_en text check (char_length(description_en) <= 600),
  base_price numeric(10, 3) not null check (base_price >= 0 and base_price < 1000),
  is_available boolean not null default true,
  is_featured boolean not null default false,
  is_best_seller boolean not null default false,
  -- Optional daily availability window in Bahrain local time (e.g. a lunch-only item).
  available_from time,
  available_until time,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((available_from is null) = (available_until is null))
);
create index products_category_sort_idx on public.products (category_id, sort_order) where archived_at is null;
create index products_featured_idx on public.products (sort_order) where is_featured and archived_at is null;

-- Internal preparation notes live apart from products so the public menu can never read them.
create table public.product_staff_notes (
  product_id uuid primary key references public.products (id) on delete cascade,
  notes text not null check (char_length(notes) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  storage_path text not null check (char_length(storage_path) <= 300),
  alt_ar text check (char_length(alt_ar) <= 200),
  alt_en text check (char_length(alt_en) <= 200),
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, sort_order);
create unique index product_images_one_primary on public.product_images (product_id) where is_primary;

-- An option group on a product, e.g. "Size" (single, required) or "Extra sauces" (multiple).
-- Required = min_select >= 1.
create table public.product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  name_ar text not null check (char_length(name_ar) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null default 1 check (max_select >= 1 and max_select <= 20),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_select >= min_select)
);
create index product_options_product_idx on public.product_options (product_id, sort_order);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.product_options (id) on delete cascade,
  name_ar text not null check (char_length(name_ar) between 1 and 80),
  name_en text not null check (char_length(name_en) between 1 and 80),
  price_delta numeric(10, 3) not null default 0 check (price_delta >= 0 and price_delta < 100),
  is_default boolean not null default false,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index product_option_values_option_idx on public.product_option_values (option_id, sort_order);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------------

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code extensions.citext not null unique check (code ~ '^[A-Za-z0-9_-]{3,32}$'),
  description_ar text,
  description_en text,
  discount_type public.discount_type not null,
  value numeric(10, 3) not null check (value > 0),
  min_subtotal numeric(10, 3) not null default 0 check (min_subtotal >= 0),
  max_discount numeric(10, 3) check (max_discount > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit > 0),
  per_user_limit integer check (per_user_limit > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  title_ar text not null check (char_length(title_ar) between 1 and 120),
  title_en text not null check (char_length(title_en) between 1 and 120),
  body_ar text check (char_length(body_ar) <= 400),
  body_en text check (char_length(body_en) <= 400),
  image_path text,
  cta_label_ar text,
  cta_label_en text,
  -- Internal links only (e.g. /menu/item/x) so banners cannot point off-site.
  link_path text check (link_path ~ '^/[A-Za-z0-9/_?=&-]*$'),
  coupon_id uuid references public.coupons (id) on delete set null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index promotions_window_idx on public.promotions (starts_at, ends_at) where is_active;

-- ---------------------------------------------------------------------------
-- Orders (written only by app.* functions)
-- ---------------------------------------------------------------------------

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid references auth.users (id) on delete set null,
  branch_id uuid not null references public.branches (id) on delete restrict,
  fulfillment_type public.fulfillment_type not null,
  status public.order_status not null default 'pending',
  payment_method public.payment_method not null,
  payment_status public.payment_status not null default 'unpaid',
  requested_pickup_at timestamptz,
  subtotal numeric(10, 3) not null check (subtotal >= 0),
  options_total numeric(10, 3) not null default 0 check (options_total >= 0),
  discount_total numeric(10, 3) not null default 0 check (discount_total >= 0),
  delivery_fee numeric(10, 3) not null default 0 check (delivery_fee >= 0),
  total numeric(10, 3) not null check (total >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  coupon_code text,
  -- Snapshots taken at order time; the profile may change or be deleted later.
  customer_name text,
  customer_phone text,
  notes text check (char_length(notes) <= 500),
  idempotency_key uuid not null,
  -- md5 of the normalised request; a reused key with a different body is rejected.
  request_hash text not null,
  cancel_reason text check (char_length(cancel_reason) <= 300),
  cancelled_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  check (total = subtotal + options_total - discount_total + delivery_fee),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index orders_branch_status_idx on public.orders (branch_id, status, created_at desc);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name_ar text not null,
  product_name_en text not null,
  unit_base_price numeric(10, 3) not null check (unit_base_price >= 0),
  unit_options_price numeric(10, 3) not null default 0 check (unit_options_price >= 0),
  quantity integer not null check (quantity between 1 and 20),
  line_total numeric(10, 3) not null,
  notes text check (char_length(notes) <= 200),
  created_at timestamptz not null default now(),
  check (line_total = (unit_base_price + unit_options_price) * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  option_value_id uuid references public.product_option_values (id) on delete set null,
  option_name_ar text not null,
  option_name_en text not null,
  value_name_ar text not null,
  value_name_en text not null,
  price_delta numeric(10, 3) not null check (price_delta >= 0)
);
create index order_item_options_item_idx on public.order_item_options (order_item_id);

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  from_status public.order_status,
  to_status public.order_status not null,
  changed_by uuid references auth.users (id) on delete set null,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);

create table public.pickup_details (
  order_id uuid primary key references public.orders (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete restrict,
  vehicle_plate text check (vehicle_plate ~ '^[A-Z0-9][A-Z0-9 -]{0,10}[A-Z0-9]$'),
  vehicle_color text check (vehicle_color in (
    'white', 'black', 'silver', 'grey', 'red', 'blue', 'green', 'beige', 'brown', 'gold', 'orange', 'yellow', 'other'
  )),
  arrival_status public.arrival_status not null default 'not_arrived',
  arrived_at timestamptz,
  last_notified_at timestamptz,
  notify_count integer not null default 0 check (notify_count >= 0),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users (id) on delete set null,
  handed_over_at timestamptz,
  handed_over_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index pickup_details_queue_idx on public.pickup_details (branch_id, arrival_status, arrived_at);

-- Persistent arrival queue: staff dashboards rebuild from here after reconnecting.
create table public.pickup_arrival_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  event_type text not null check (event_type in ('arrived', 're_notified', 'acknowledged', 'handed_over')),
  actor_id uuid references auth.users (id) on delete set null,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  unique (order_id, client_request_id)
);
create index pickup_arrival_events_branch_idx on public.pickup_arrival_events (branch_id, created_at desc);

-- No card data is ever stored. Provider references only.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  method public.payment_method not null,
  status public.payment_status not null default 'unpaid',
  amount numeric(10, 3) not null check (amount >= 0),
  currency char(3) not null default 'BHD',
  provider text,
  provider_ref text unique,
  provider_event_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_user_idx on public.coupon_redemptions (coupon_id, user_id);

create table app.order_number_counters (
  day date primary key,
  last_value integer not null
);

-- ---------------------------------------------------------------------------
-- Operations, content & settings
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);

create table app.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

-- Single-row, owner-editable business settings. Ordering starts disabled until the
-- owner has confirmed menu, hours and payment options.
create table public.restaurant_settings (
  id boolean primary key default true check (id),
  display_name_ar text not null default 'لهب',
  display_name_en text not null default 'LAHAB',
  tagline_ar text,
  tagline_en text,
  phones text[] not null default '{}',
  whatsapp text,
  email text,
  instagram_url text check (instagram_url is null or instagram_url ~ '^https://'),
  ordering_enabled boolean not null default false,
  cash_on_pickup_enabled boolean not null default false,
  online_payment_enabled boolean not null default false,
  delivery_enabled boolean not null default false,
  max_lines_per_order integer not null default 30 check (max_lines_per_order between 1 and 100),
  updated_at timestamptz not null default now()
);
insert into public.restaurant_settings (id) values (true);

-- Editable copy (hero, about, policies). Keys are dotted identifiers, e.g. "home.hero.title".
create table public.site_content (
  key text primary key check (key ~ '^[a-z0-9_]+(\.[a-z0-9_]+)*$'),
  value_ar text,
  value_en text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'profiles', 'branches', 'business_hours', 'business_hour_exceptions', 'categories', 'products',
    'product_staff_notes', 'product_options', 'product_option_values', 'coupons', 'promotions',
    'orders', 'pickup_details', 'payments', 'restaurant_settings', 'site_content'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function app.set_updated_at()', t
    );
  end loop;
end $$;
