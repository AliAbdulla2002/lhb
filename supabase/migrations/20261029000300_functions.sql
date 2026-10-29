-- Lahab: authorization helpers, triggers and server-side business logic.
--
-- Convention: app.* functions are SECURITY DEFINER, pin search_path to '' and take the
-- acting user explicitly (p_actor). Only service_role may execute them; Edge Functions
-- verify the caller's JWT and pass its subject. Errors are raised via app.fail().

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

create function app.role_rank(p_role public.app_role) returns integer
language sql immutable set search_path = '' as $$
  select case p_role
    when 'customer' then 1
    when 'staff' then 2
    when 'manager' then 3
    when 'super_admin' then 4
  end
$$;

create function app.actor_has_min_role(p_actor uuid, p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_actor is not null and exists (
    select 1 from public.user_roles ur
    where ur.user_id = p_actor and app.role_rank(ur.role) >= app.role_rank(p_role)
  )
$$;

-- Managers and super admins see every branch; staff only their assigned branches.
create function app.actor_can_access_branch(p_actor uuid, p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.actor_has_min_role(p_actor, 'manager')
    or (
      app.actor_has_min_role(p_actor, 'staff')
      and exists (
        select 1 from public.staff_branch_assignments a
        where a.user_id = p_actor and a.branch_id = p_branch
      )
    )
$$;

-- RLS-facing wrappers bound to the JWT subject.
create function public.has_min_role(p_role public.app_role) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.actor_has_min_role(auth.uid(), p_role)
$$;

create function public.can_access_branch(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.actor_can_access_branch(auth.uid(), p_branch)
$$;

create function public.can_read_order(p_order uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order
      and (o.customer_id = auth.uid() or app.actor_can_access_branch(auth.uid(), o.branch_id))
  )
$$;

-- Roles of the current user, for the UI only (authorization is enforced server-side).
create function public.my_roles() returns setof public.app_role
language sql stable security definer set search_path = '' as $$
  select ur.role from public.user_roles ur where ur.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- New users: profile + customer role. Role is never read from user metadata.
-- ---------------------------------------------------------------------------

create function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := left(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120);
  v_phone text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'phone', ''), '[\s-]', '', 'g'), '');
begin
  if v_phone is not null and v_phone !~ '^\+?[0-9]{8,15}$' then
    v_phone := null;
  end if;

  insert into public.profiles (id, full_name, phone, preferred_language)
  values (
    new.id, v_name, v_phone,
    case when new.raw_user_meta_data ->> 'preferred_language' = 'en' then 'en' else 'ar' end
  );
  insert into public.user_roles (user_id, role) values (new.id, 'customer');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

-- tg_argv[0]: name of the key column used as entity_id (default "id").
create function app.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := coalesce(tg_argv[0], 'id');
  v_before jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_after jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and v_before = v_after then
    return new;
  end if;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (
    app.current_actor(), lower(tg_op), tg_table_name,
    coalesce(v_after, v_before) ->> v_key, v_before, v_after
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'branches', 'business_hours', 'business_hour_exceptions', 'categories', 'products', 'product_staff_notes',
    'product_images', 'product_options', 'product_option_values', 'coupons', 'promotions', 'site_content'
  ] loop
    execute format(
      'create trigger audit after insert or update or delete on public.%I for each row execute function app.audit_row()', t
    );
  end loop;
end $$;

create trigger audit after insert or update or delete on public.restaurant_settings
  for each row execute function app.audit_row('id');
create trigger audit after insert or update or delete on public.user_roles
  for each row execute function app.audit_row('user_id');
create trigger audit after insert or update or delete on public.staff_branch_assignments
  for each row execute function app.audit_row('user_id');

-- Managers may run branch operations (pause pickup, capacity, instructions); only super
-- admins may change a branch's identity or activation.
create function app.guard_branch_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := app.current_actor();
begin
  if v_actor is not null
     and not app.actor_has_min_role(v_actor, 'super_admin')
     and (new.slug, new.name_ar, new.name_en, new.address_ar, new.address_en, new.phone,
          new.maps_url, new.latitude, new.longitude, new.is_active, new.accepts_pickup)
       is distinct from
         (old.slug, old.name_ar, old.name_en, old.address_ar, old.address_en, old.phone,
          old.maps_url, old.latitude, old.longitude, old.is_active, old.accepts_pickup)
  then
    perform app.fail('forbidden');
  end if;
  return new;
end $$;

create trigger guard_branch_update before update on public.branches
  for each row execute function app.guard_branch_update();

-- ---------------------------------------------------------------------------
-- Rate limiting (fixed window, Postgres-backed)
-- ---------------------------------------------------------------------------

create function app.check_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_count integer;
begin
  insert into app.rate_limits as rl (bucket, window_start, count)
  values (p_bucket, v_window, 1)
  on conflict (bucket, window_start) do update set count = rl.count + 1
  returning rl.count into v_count;

  if v_count > p_limit then
    perform app.fail('rate_limited', jsonb_build_object(
      'retry_after_seconds',
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))
    ));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Opening hours
-- ---------------------------------------------------------------------------

create function app.is_branch_open_at(p_branch uuid, p_at timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  with local_time as (
    select (p_at at time zone app.tz()) as ts
  ),
  days as (
    select (lt.ts::date) as d from local_time lt
    union all
    select (lt.ts::date - 1) from local_time lt
  ),
  shifts as (
    select d.d, e.opens_at, e.closes_at, e.closes_next_day
    from days d
    join public.business_hour_exceptions e on e.branch_id = p_branch and e.date = d.d and not e.is_closed
    union all
    select d.d, h.opens_at, h.closes_at, h.closes_next_day
    from days d
    join public.business_hours h on h.branch_id = p_branch and h.weekday = extract(dow from d.d)
    where not exists (
      select 1 from public.business_hour_exceptions e where e.branch_id = p_branch and e.date = d.d
    )
  )
  select exists (
    select 1 from shifts s, local_time lt
    where lt.ts >= s.d + s.opens_at
      and lt.ts < s.d + s.closes_at + case when s.closes_next_day then interval '1 day' else interval '0' end
  )
$$;

create function public.is_branch_open(p_branch uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.is_branch_open_at(p_branch, now())
$$;

-- Daily availability window; supports windows that cross midnight.
create function app.in_daily_window(p_from time, p_until time, p_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select case
    when p_from is null then true
    when p_from <= p_until then (p_at at time zone app.tz())::time >= p_from and (p_at at time zone app.tz())::time < p_until
    else (p_at at time zone app.tz())::time >= p_from or (p_at at time zone app.tz())::time < p_until
  end
$$;

-- ---------------------------------------------------------------------------
-- Pricing — the only source of truth for totals. Browser prices are never read.
--
-- p_items: [{ "product_id": uuid, "quantity": 1-20, "option_value_ids": [uuid], "notes": text }]
-- Returns lines, issues (per-line availability problems), totals and coupon result.
-- Malformed input raises; availability problems are reported as issues so the cart
-- can explain them.
-- ---------------------------------------------------------------------------

create function app.price_cart(
  p_items jsonb,
  p_coupon_code text,
  p_user uuid,
  p_at timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_max_lines integer;
  v_item jsonb;
  v_idx integer := -1;
  v_product_id uuid;
  v_qty integer;
  v_value_ids uuid[];
  v_notes text;
  v_product record;
  v_bad_group record;
  v_unit_opts numeric(10, 3);
  v_opt_snap jsonb;
  v_issues jsonb := '[]'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_subtotal numeric(10, 3) := 0;
  v_options_total numeric(10, 3) := 0;
  v_gross numeric(10, 3);
  v_discount numeric(10, 3) := 0;
  v_coupon public.coupons;
  v_coupon_reason text;
  v_coupon_result jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform app.fail('cart_empty');
  end if;

  select s.max_lines_per_order into v_max_lines from public.restaurant_settings s;
  if jsonb_array_length(p_items) > v_max_lines then
    perform app.fail('cart_too_large', jsonb_build_object('max_lines', v_max_lines));
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;

    if jsonb_typeof(v_item) <> 'object' then
      perform app.fail('invalid_item', jsonb_build_object('index', v_idx));
    end if;

    begin
      v_product_id := (v_item ->> 'product_id')::uuid;
    exception when others then
      v_product_id := null;
    end;
    if v_product_id is null then
      perform app.fail('invalid_item', jsonb_build_object('index', v_idx));
    end if;

    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number'
       or (v_item ->> 'quantity')::numeric <> trunc((v_item ->> 'quantity')::numeric)
       or (v_item ->> 'quantity')::numeric not between 1 and 20 then
      perform app.fail('invalid_quantity', jsonb_build_object('index', v_idx));
    end if;
    v_qty := (v_item ->> 'quantity')::integer;

    v_value_ids := '{}';
    if v_item ? 'option_value_ids' and jsonb_typeof(v_item -> 'option_value_ids') <> 'null' then
      if jsonb_typeof(v_item -> 'option_value_ids') <> 'array'
         or jsonb_array_length(v_item -> 'option_value_ids') > 20 then
        perform app.fail('invalid_options', jsonb_build_object('index', v_idx));
      end if;
      begin
        select coalesce(array_agg(x::uuid), '{}') into v_value_ids
        from jsonb_array_elements_text(v_item -> 'option_value_ids') x;
      exception when others then
        perform app.fail('invalid_options', jsonb_build_object('index', v_idx));
      end;
      if cardinality(v_value_ids) <> (select count(distinct x) from unnest(v_value_ids) x) then
        perform app.fail('invalid_options', jsonb_build_object('index', v_idx));
      end if;
    end if;

    v_notes := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');
    if char_length(v_notes) > 200 then
      perform app.fail('notes_too_long', jsonb_build_object('index', v_idx));
    end if;

    select p.id, p.name_ar, p.name_en, p.base_price, p.is_available, p.available_from, p.available_until,
           p.archived_at, c.is_visible as category_visible, c.archived_at as category_archived_at
      into v_product
      from public.products p
      join public.categories c on c.id = p.category_id
     where p.id = v_product_id;

    if not found or v_product.archived_at is not null
       or v_product.category_archived_at is not null or not v_product.category_visible then
      v_issues := v_issues || jsonb_build_object('index', v_idx, 'product_id', v_product_id, 'code', 'product_not_found');
      continue;
    end if;

    if not v_product.is_available
       or not app.in_daily_window(v_product.available_from, v_product.available_until, p_at) then
      v_issues := v_issues || jsonb_build_object('index', v_idx, 'product_id', v_product_id, 'code', 'product_unavailable');
      continue;
    end if;

    if exists (
      select 1 from unnest(v_value_ids) vid
      where not exists (
        select 1 from public.product_option_values v
        join public.product_options o on o.id = v.option_id
        where v.id = vid and o.product_id = v_product_id and o.is_active
      )
    ) then
      v_issues := v_issues || jsonb_build_object('index', v_idx, 'product_id', v_product_id, 'code', 'option_invalid');
      continue;
    end if;

    if exists (
      select 1 from public.product_option_values v where v.id = any (v_value_ids) and not v.is_available
    ) then
      v_issues := v_issues || jsonb_build_object('index', v_idx, 'product_id', v_product_id, 'code', 'option_unavailable');
      continue;
    end if;

    select o.id, o.min_select, o.max_select into v_bad_group
      from public.product_options o
     where o.product_id = v_product_id and o.is_active
       and (
         select count(*) from public.product_option_values v
         where v.option_id = o.id and v.id = any (v_value_ids)
       ) not between o.min_select and o.max_select
     limit 1;
    if found then
      v_issues := v_issues || jsonb_build_object(
        'index', v_idx, 'product_id', v_product_id, 'code', 'option_selection_invalid',
        'option_id', v_bad_group.id, 'min', v_bad_group.min_select, 'max', v_bad_group.max_select
      );
      continue;
    end if;

    select coalesce(sum(v.price_delta), 0),
           coalesce(jsonb_agg(jsonb_build_object(
             'option_value_id', v.id,
             'option_name_ar', o.name_ar, 'option_name_en', o.name_en,
             'value_name_ar', v.name_ar, 'value_name_en', v.name_en,
             'price_delta', v.price_delta
           ) order by o.sort_order, v.sort_order), '[]'::jsonb)
      into v_unit_opts, v_opt_snap
      from public.product_option_values v
      join public.product_options o on o.id = v.option_id
     where v.id = any (v_value_ids);

    v_subtotal := v_subtotal + v_product.base_price * v_qty;
    v_options_total := v_options_total + v_unit_opts * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'index', v_idx,
      'product_id', v_product_id,
      'product_name_ar', v_product.name_ar,
      'product_name_en', v_product.name_en,
      'unit_base_price', v_product.base_price,
      'unit_options_price', v_unit_opts,
      'quantity', v_qty,
      'line_total', (v_product.base_price + v_unit_opts) * v_qty,
      'notes', v_notes,
      'options', v_opt_snap
    );
  end loop;

  v_gross := v_subtotal + v_options_total;

  if nullif(btrim(coalesce(p_coupon_code, '')), '') is not null then
    -- Explicit lower(): with an empty search_path the citext operators are not resolved.
    select * into v_coupon from public.coupons c where lower(c.code::text) = lower(btrim(p_coupon_code));
    if not found or not v_coupon.is_active then
      v_coupon_reason := 'not_found';
    elsif (v_coupon.starts_at is not null and v_coupon.starts_at > p_at)
       or (v_coupon.ends_at is not null and v_coupon.ends_at <= p_at) then
      v_coupon_reason := 'expired';
    elsif v_gross < v_coupon.min_subtotal then
      v_coupon_reason := 'min_subtotal';
    elsif v_coupon.usage_limit is not null
       and (select count(*) from public.coupon_redemptions r where r.coupon_id = v_coupon.id) >= v_coupon.usage_limit then
      v_coupon_reason := 'usage_limit';
    elsif v_coupon.per_user_limit is not null and p_user is null then
      v_coupon_reason := 'login_required';
    elsif v_coupon.per_user_limit is not null
       and (select count(*) from public.coupon_redemptions r
            where r.coupon_id = v_coupon.id and r.user_id = p_user) >= v_coupon.per_user_limit then
      v_coupon_reason := 'per_user_limit';
    end if;

    if v_coupon_reason is null then
      v_discount := case v_coupon.discount_type
        when 'percent' then round(v_gross * v_coupon.value / 100, 3)
        else v_coupon.value
      end;
      if v_coupon.max_discount is not null then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
      v_discount := least(v_discount, v_gross);
    end if;

    v_coupon_result := jsonb_build_object(
      'code', upper(btrim(p_coupon_code)),
      'coupon_id', case when v_coupon_reason is null then v_coupon.id end,
      'valid', v_coupon_reason is null,
      'reason', v_coupon_reason,
      'discount', v_discount
    );
  end if;

  return jsonb_build_object(
    'lines', v_lines,
    'issues', v_issues,
    'subtotal', v_subtotal,
    'options_total', v_options_total,
    'discount_total', v_discount,
    'delivery_fee', 0,
    'total', v_gross - v_discount,
    'coupon', v_coupon_result,
    'currency', 'BHD'
  );
end $$;

-- Public, read-only price quote for the cart and checkout screens.
create function public.quote_cart(p_items jsonb, p_coupon_code text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select app.price_cart(p_items, p_coupon_code, auth.uid(), now())
$$;

-- ---------------------------------------------------------------------------
-- Order creation
--
-- p_payload: {
--   idempotency_key: uuid, branch_id: uuid, fulfillment_type: "pickup",
--   payment_method: "cash_on_pickup", pickup_at: timestamptz | null (null = ASAP),
--   items: [...], coupon_code?: text, notes?: text,
--   vehicle?: { plate: text, color?: text }
-- }
-- ---------------------------------------------------------------------------

create function app.place_order(p_actor uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key uuid;
  v_hash text := md5(p_payload::text);
  v_existing public.orders;
  v_user record;
  v_profile public.profiles;
  v_settings public.restaurant_settings;
  v_branch public.branches;
  v_fulfillment public.fulfillment_type;
  v_method public.payment_method;
  v_pickup_at timestamptz;
  v_slot_start timestamptz;
  v_plate text;
  v_color text;
  v_notes text;
  v_quote jsonb;
  v_line jsonb;
  v_opt jsonb;
  v_order_id uuid;
  v_item_id uuid;
  v_day date := (now() at time zone app.tz())::date;
  v_seq integer;
  v_order_number text;
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);

  if p_actor is null then
    perform app.fail('auth_required');
  end if;

  select u.id, u.email_confirmed_at into v_user from auth.users u where u.id = p_actor;
  if not found then
    perform app.fail('auth_required');
  end if;
  if v_user.email_confirmed_at is null then
    perform app.fail('email_not_verified');
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    perform app.fail('invalid_request');
  end if;

  begin
    v_key := (p_payload ->> 'idempotency_key')::uuid;
  exception when others then
    v_key := null;
  end;
  if v_key is null then
    perform app.fail('invalid_request', jsonb_build_object('field', 'idempotency_key'));
  end if;

  -- Serialise retries of the same request, then replay if it already succeeded.
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || v_key::text, 0));
  select * into v_existing from public.orders o where o.customer_id = p_actor and o.idempotency_key = v_key;
  if found then
    if v_existing.request_hash <> v_hash then
      perform app.fail('idempotency_key_reused');
    end if;
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'status', v_existing.status, 'total', v_existing.total, 'replayed', true
    );
  end if;

  perform app.check_rate_limit('order:' || p_actor::text, 5, 600);

  select * into v_settings from public.restaurant_settings;
  if not v_settings.ordering_enabled then
    perform app.fail('ordering_disabled');
  end if;

  select * into v_profile from public.profiles p where p.id = p_actor;
  if v_profile.phone is null then
    perform app.fail('phone_required');
  end if;

  begin
    v_fulfillment := (p_payload ->> 'fulfillment_type')::public.fulfillment_type;
    v_method := (p_payload ->> 'payment_method')::public.payment_method;
  exception when others then
    perform app.fail('invalid_request', jsonb_build_object('field', 'fulfillment_or_payment'));
  end;
  if v_fulfillment is null or v_method is null then
    perform app.fail('invalid_request', jsonb_build_object('field', 'fulfillment_or_payment'));
  end if;

  if v_fulfillment = 'delivery' then
    -- Delivery is modelled but not offered until the owner configures zones and fees.
    perform app.fail('delivery_unavailable');
  end if;

  if (v_method = 'cash_on_pickup' and not v_settings.cash_on_pickup_enabled)
     or (v_method = 'online' and not v_settings.online_payment_enabled)
     or v_method = 'online' then
    -- Online payment is not integrated yet; see docs/PAYMENTS.md.
    perform app.fail('payment_method_unavailable');
  end if;

  begin
    select * into v_branch from public.branches b where b.id = (p_payload ->> 'branch_id')::uuid;
  exception when others then
    perform app.fail('invalid_request', jsonb_build_object('field', 'branch_id'));
  end;
  if v_branch.id is null or not v_branch.is_active or not v_branch.accepts_pickup then
    perform app.fail('branch_unavailable');
  end if;
  if v_branch.pickup_paused then
    perform app.fail('pickup_paused');
  end if;

  -- Pickup time: null = as soon as possible (now + lead time).
  if p_payload ? 'pickup_at' and jsonb_typeof(p_payload -> 'pickup_at') = 'string' then
    begin
      v_pickup_at := (p_payload ->> 'pickup_at')::timestamptz;
    exception when others then
      perform app.fail('pickup_time_invalid');
    end;
    if v_pickup_at < now() + make_interval(mins => v_branch.pickup_lead_minutes) - interval '2 minutes' then
      perform app.fail('pickup_time_too_soon', jsonb_build_object('lead_minutes', v_branch.pickup_lead_minutes));
    end if;
    if v_pickup_at > now() + interval '2 days' then
      perform app.fail('pickup_time_invalid');
    end if;
  else
    v_pickup_at := now() + make_interval(mins => v_branch.pickup_lead_minutes);
  end if;

  if not app.is_branch_open_at(v_branch.id, v_pickup_at) then
    perform app.fail('branch_closed');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('slot:' || v_branch.id::text, 0));
  v_slot_start := date_bin(make_interval(mins => v_branch.slot_minutes), v_pickup_at, timestamptz '2000-01-01 00:00:00+00');
  if (
    select count(*) from public.orders o
    where o.branch_id = v_branch.id and o.status <> 'cancelled'
      and o.requested_pickup_at >= v_slot_start
      and o.requested_pickup_at < v_slot_start + make_interval(mins => v_branch.slot_minutes)
  ) >= v_branch.max_orders_per_slot then
    perform app.fail('slot_full');
  end if;

  if jsonb_typeof(p_payload -> 'vehicle') = 'object' then
    v_plate := nullif(upper(regexp_replace(btrim(coalesce(p_payload -> 'vehicle' ->> 'plate', '')), '\s+', ' ', 'g')), '');
    v_color := nullif(lower(btrim(coalesce(p_payload -> 'vehicle' ->> 'color', ''))), '');
    if v_plate is not null and v_plate !~ '^[A-Z0-9][A-Z0-9 -]{0,10}[A-Z0-9]$' then
      perform app.fail('vehicle_plate_invalid');
    end if;
    if v_color is not null and v_color not in (
      'white', 'black', 'silver', 'grey', 'red', 'blue', 'green', 'beige', 'brown', 'gold', 'orange', 'yellow', 'other'
    ) then
      perform app.fail('vehicle_color_invalid');
    end if;
  end if;

  v_notes := nullif(btrim(coalesce(p_payload ->> 'notes', '')), '');
  if char_length(v_notes) > 500 then
    perform app.fail('notes_too_long');
  end if;

  v_quote := app.price_cart(p_payload -> 'items', p_payload ->> 'coupon_code', p_actor, now());
  if jsonb_array_length(v_quote -> 'issues') > 0 then
    perform app.fail('cart_invalid', jsonb_build_object('issues', v_quote -> 'issues'));
  end if;
  if v_quote -> 'coupon' is not null and jsonb_typeof(v_quote -> 'coupon') = 'object'
     and not (v_quote -> 'coupon' ->> 'valid')::boolean then
    perform app.fail('coupon_invalid', jsonb_build_object('reason', v_quote -> 'coupon' ->> 'reason'));
  end if;

  insert into app.order_number_counters as c (day, last_value) values (v_day, 1)
  on conflict (day) do update set last_value = c.last_value + 1
  returning c.last_value into v_seq;
  v_order_number := 'LH-' || to_char(v_day, 'YYMMDD') || '-' || lpad(v_seq::text, 4, '0');

  insert into public.orders (
    order_number, customer_id, branch_id, fulfillment_type, status, payment_method, payment_status,
    requested_pickup_at, subtotal, options_total, discount_total, delivery_fee, total,
    coupon_id, coupon_code, customer_name, customer_phone, notes, idempotency_key, request_hash
  ) values (
    v_order_number, p_actor, v_branch.id, v_fulfillment, 'pending', v_method, 'unpaid',
    v_pickup_at,
    (v_quote ->> 'subtotal')::numeric, (v_quote ->> 'options_total')::numeric,
    (v_quote ->> 'discount_total')::numeric, 0, (v_quote ->> 'total')::numeric,
    (v_quote -> 'coupon' ->> 'coupon_id')::uuid, v_quote -> 'coupon' ->> 'code',
    v_profile.full_name, v_profile.phone, v_notes, v_key, v_hash
  ) returning id into v_order_id;

  for v_line in select value from jsonb_array_elements(v_quote -> 'lines') loop
    insert into public.order_items (
      order_id, product_id, product_name_ar, product_name_en, unit_base_price, unit_options_price,
      quantity, line_total, notes
    ) values (
      v_order_id, (v_line ->> 'product_id')::uuid, v_line ->> 'product_name_ar', v_line ->> 'product_name_en',
      (v_line ->> 'unit_base_price')::numeric, (v_line ->> 'unit_options_price')::numeric,
      (v_line ->> 'quantity')::integer, (v_line ->> 'line_total')::numeric, v_line ->> 'notes'
    ) returning id into v_item_id;

    for v_opt in select value from jsonb_array_elements(v_line -> 'options') loop
      insert into public.order_item_options (
        order_item_id, option_value_id, option_name_ar, option_name_en, value_name_ar, value_name_en, price_delta
      ) values (
        v_item_id, (v_opt ->> 'option_value_id')::uuid, v_opt ->> 'option_name_ar', v_opt ->> 'option_name_en',
        v_opt ->> 'value_name_ar', v_opt ->> 'value_name_en', (v_opt ->> 'price_delta')::numeric
      );
    end loop;
  end loop;

  if v_fulfillment = 'pickup' then
    insert into public.pickup_details (order_id, branch_id, vehicle_plate, vehicle_color)
    values (v_order_id, v_branch.id, v_plate, v_color);
  end if;

  insert into public.payments (order_id, method, status, amount)
  values (v_order_id, v_method, 'unpaid', (v_quote ->> 'total')::numeric);

  if (v_quote -> 'coupon' ->> 'coupon_id') is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id)
    values ((v_quote -> 'coupon' ->> 'coupon_id')::uuid, v_order_id, p_actor);
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'pending', p_actor);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (p_actor, 'order.create', 'orders', v_order_id::text,
          jsonb_build_object('order_number', v_order_number, 'total', v_quote -> 'total'));

  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number,
    'status', 'pending', 'total', (v_quote ->> 'total')::numeric, 'replayed', false
  );
end $$;

-- ---------------------------------------------------------------------------
-- Order status workflow
--   pending → confirmed → preparing → ready → completed
--   pending | confirmed | preparing | ready → cancelled (reason required)
-- Staff (assigned branch): forward moves; cancel only before preparation.
-- Manager+: any allowed move. Customer: cancel own order while pending.
-- ---------------------------------------------------------------------------

create function app.transition_order_status(
  p_actor uuid,
  p_order_id uuid,
  p_to public.order_status,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_staff boolean;
  v_is_manager boolean;
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  if p_actor is null then
    perform app.fail('auth_required');
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found then
    perform app.fail('order_not_found');
  end if;

  v_is_staff := app.actor_can_access_branch(p_actor, v_order.branch_id);
  v_is_manager := app.actor_has_min_role(p_actor, 'manager');

  if not v_is_staff and not (
    v_order.customer_id = p_actor and v_order.status = 'pending' and p_to = 'cancelled'
  ) then
    -- Do not reveal whether someone else's order exists.
    perform app.fail('order_not_found');
  end if;

  if not (
    (v_order.status = 'pending' and p_to in ('confirmed', 'cancelled'))
    or (v_order.status = 'confirmed' and p_to in ('preparing', 'cancelled'))
    or (v_order.status = 'preparing' and p_to in ('ready', 'cancelled'))
    or (v_order.status = 'ready' and p_to in ('completed', 'cancelled'))
  ) then
    perform app.fail('invalid_transition', jsonb_build_object('from', v_order.status, 'to', p_to));
  end if;

  if p_to = 'cancelled' then
    if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 300 then
      perform app.fail('cancel_reason_required');
    end if;
    if v_order.status in ('preparing', 'ready') and not v_is_manager then
      perform app.fail('forbidden');
    end if;
  end if;

  update public.orders o set
    status = p_to,
    confirmed_at = case when p_to = 'confirmed' then now() else o.confirmed_at end,
    preparing_at = case when p_to = 'preparing' then now() else o.preparing_at end,
    ready_at = case when p_to = 'ready' then now() else o.ready_at end,
    completed_at = case when p_to = 'completed' then now() else o.completed_at end,
    cancelled_at = case when p_to = 'cancelled' then now() else o.cancelled_at end,
    cancel_reason = case when p_to = 'cancelled' then v_reason else o.cancel_reason end,
    cancelled_by = case when p_to = 'cancelled' then p_actor else o.cancelled_by end,
    payment_status = case
      when p_to = 'completed' and o.payment_method = 'cash_on_pickup' then 'paid'::public.payment_status
      else o.payment_status
    end
  where o.id = v_order.id;

  if p_to = 'completed' then
    if v_order.payment_method = 'cash_on_pickup' then
      update public.payments p set status = 'paid' where p.order_id = v_order.id and p.method = 'cash_on_pickup';
    end if;
    if v_order.fulfillment_type = 'pickup' then
      update public.pickup_details d set
        arrival_status = 'handed_over', handed_over_at = now(), handed_over_by = p_actor
      where d.order_id = v_order.id;
      insert into public.pickup_arrival_events (order_id, branch_id, event_type, actor_id)
      values (v_order.id, v_order.branch_id, 'handed_over', p_actor);
    end if;
  end if;

  if p_to = 'cancelled' then
    delete from public.coupon_redemptions r where r.order_id = v_order.id;
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  values (v_order.id, v_order.status, p_to, p_actor, v_reason);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (p_actor, 'order.status', 'orders', v_order.id::text,
          jsonb_build_object('status', v_order.status),
          jsonb_build_object('status', p_to, 'reason', v_reason));

  return jsonb_build_object('order_id', v_order.id, 'from', v_order.status, 'status', p_to);
end $$;

-- ---------------------------------------------------------------------------
-- Car pickup: "I'm here" (digital horn) and staff acknowledgement
-- ---------------------------------------------------------------------------

create function app.notify_arrival(p_actor uuid, p_order_id uuid, p_client_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_pickup public.pickup_details;
  v_cooldown constant interval := interval '60 seconds';
  v_max_notifications constant integer := 5;
  v_event_type text;
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  if p_actor is null then
    perform app.fail('auth_required');
  end if;
  if p_client_request_id is null then
    perform app.fail('invalid_request', jsonb_build_object('field', 'client_request_id'));
  end if;

  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.customer_id is distinct from p_actor or v_order.fulfillment_type <> 'pickup' then
    perform app.fail('order_not_found');
  end if;

  select * into v_pickup from public.pickup_details d where d.order_id = v_order.id for update;

  -- Same request retried (network retry, double tap): return the recorded state.
  if exists (
    select 1 from public.pickup_arrival_events e
    where e.order_id = v_order.id and e.client_request_id = p_client_request_id
  ) then
    return jsonb_build_object(
      'order_id', v_order.id, 'arrival_status', v_pickup.arrival_status,
      'arrived_at', v_pickup.arrived_at, 'notify_count', v_pickup.notify_count, 'replayed', true
    );
  end if;

  if v_order.status in ('completed', 'cancelled') or v_pickup.arrival_status = 'handed_over' then
    perform app.fail('order_closed');
  end if;
  if v_order.status = 'pending' then
    perform app.fail('order_not_confirmed');
  end if;
  if v_order.created_at < now() - interval '12 hours' then
    perform app.fail('order_expired');
  end if;

  if v_pickup.last_notified_at is not null and v_pickup.last_notified_at > now() - v_cooldown then
    perform app.fail('notify_cooldown', jsonb_build_object(
      'retry_after_seconds', ceil(extract(epoch from (v_pickup.last_notified_at + v_cooldown - now())))
    ));
  end if;
  if v_pickup.notify_count >= v_max_notifications then
    perform app.fail('notify_limit');
  end if;

  perform app.check_rate_limit('arrival:' || p_actor::text, 10, 600);

  v_event_type := case when v_pickup.notify_count = 0 then 'arrived' else 're_notified' end;

  update public.pickup_details d set
    arrival_status = case when d.arrival_status = 'not_arrived' then 'arrived'::public.arrival_status else d.arrival_status end,
    arrived_at = coalesce(d.arrived_at, now()),
    last_notified_at = now(),
    notify_count = d.notify_count + 1
  where d.order_id = v_order.id
  returning * into v_pickup;

  insert into public.pickup_arrival_events (order_id, branch_id, event_type, actor_id, client_request_id)
  values (v_order.id, v_order.branch_id, v_event_type, p_actor, p_client_request_id);

  return jsonb_build_object(
    'order_id', v_order.id, 'arrival_status', v_pickup.arrival_status,
    'arrived_at', v_pickup.arrived_at, 'notify_count', v_pickup.notify_count, 'replayed', false
  );
end $$;

create function app.acknowledge_arrival(p_actor uuid, p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_order public.orders;
  v_pickup public.pickup_details;
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or not app.actor_can_access_branch(p_actor, v_order.branch_id) then
    perform app.fail('order_not_found');
  end if;

  select * into v_pickup from public.pickup_details d where d.order_id = v_order.id for update;
  if not found then
    perform app.fail('order_not_found');
  end if;
  if v_pickup.arrival_status = 'acknowledged' then
    return jsonb_build_object('order_id', v_order.id, 'arrival_status', 'acknowledged', 'replayed', true);
  end if;
  if v_pickup.arrival_status <> 'arrived' then
    perform app.fail('invalid_transition', jsonb_build_object('from', v_pickup.arrival_status, 'to', 'acknowledged'));
  end if;

  update public.pickup_details d set
    arrival_status = 'acknowledged', acknowledged_at = now(), acknowledged_by = p_actor
  where d.order_id = v_order.id;

  insert into public.pickup_arrival_events (order_id, branch_id, event_type, actor_id)
  values (v_order.id, v_order.branch_id, 'acknowledged', p_actor);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (p_actor, 'pickup.acknowledge', 'orders', v_order.id::text);

  return jsonb_build_object('order_id', v_order.id, 'arrival_status', 'acknowledged', 'replayed', false);
end $$;

-- ---------------------------------------------------------------------------
-- Role management
-- ---------------------------------------------------------------------------

create function app.set_user_role(p_actor uuid, p_target uuid, p_role public.app_role, p_grant boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.actor_id', coalesce(p_actor::text, ''), true);
  if not app.actor_has_min_role(p_actor, 'super_admin') then
    perform app.fail('forbidden');
  end if;
  if p_role = 'customer' then
    perform app.fail('invalid_request', jsonb_build_object('field', 'role'));
  end if;
  if not exists (select 1 from auth.users u where u.id = p_target) then
    perform app.fail('user_not_found');
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (p_target, p_role, p_actor)
    on conflict do nothing;
  else
    if p_role = 'super_admin' and (
      select count(*) from public.user_roles ur where ur.role = 'super_admin' and ur.user_id <> p_target
    ) = 0 then
      perform app.fail('last_super_admin');
    end if;
    delete from public.user_roles ur where ur.user_id = p_target and ur.role = p_role;
  end if;
end $$;

-- First administrator. Run manually with database owner privileges
-- (see supabase/scripts/provision-super-admin.sql). Not executable through the API.
create function app.grant_super_admin_by_email(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid;
begin
  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_user is null then
    perform app.fail('user_not_found');
  end if;
  insert into public.user_roles (user_id, role) values (v_user, 'super_admin') on conflict do nothing;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id)
  values (null, 'role.provision_super_admin', 'user_roles', v_user::text);
  return v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Retention (see docs/DATA_RETENTION.md)
-- ---------------------------------------------------------------------------

create function app.purge_expired_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from app.rate_limits where window_start < now() - interval '1 day';
  delete from public.pickup_arrival_events where created_at < now() - interval '90 days';
  update public.pickup_details d set vehicle_plate = null, vehicle_color = null
    from public.orders o
   where o.id = d.order_id and d.vehicle_plate is not null
     and o.status in ('completed', 'cancelled')
     and coalesce(o.completed_at, o.cancelled_at) < now() - interval '30 days';
  delete from public.audit_logs where created_at < now() - interval '2 years';
  delete from app.order_number_counters where day < current_date - 7;
end $$;
