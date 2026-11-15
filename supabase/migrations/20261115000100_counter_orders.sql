-- Lahab: orders taken by staff, at the counter or on a tablet at the customer's car.
--
-- A counter order goes through the same pricing (app.price_cart), numbering, items,
-- pickup and status workflow as an online order. Differences:
--   * placed by staff for their own branch, not by the customer;
--   * the customer's phone, name and car are optional (the queue should not wait);
--   * a phone that matches exactly one customer account links the order to it, so it
--     shows in their history and counts in invoice prize draws;
--   * it starts confirmed; paid straight away, or (paid=false) when it is handed over;
--   * slot capacity and lead time are skipped: the customer is already here.

alter type public.payment_method add value if not exists 'card';

alter table public.orders
  add column source text not null default 'online' check (source in ('online', 'counter')),
  add column created_by uuid references auth.users (id) on delete set null;

-- Online orders are idempotent per customer; counter orders per staff member.
create unique index orders_counter_idempotency_idx on public.orders (created_by, idempotency_key) where source = 'counter';
create index orders_source_idx on public.orders (source, created_at desc);

-- ---------------------------------------------------------------------------
-- p_payload: {
--   idempotency_key: uuid, branch_id: uuid, payment: "cash" | "card", paid?: boolean (default true),
--   items: [...], coupon_code?: text, notes?: text,
--   customer?: { phone?: text, name?: text },
--   vehicle?: { plate: text, color?: text }      (absent = served inside)
-- }
-- ---------------------------------------------------------------------------

create function app.place_counter_order(p_actor uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_key uuid;
  v_hash text := md5(p_payload::text);
  v_existing public.orders;
  v_branch public.branches;
  v_method public.payment_method;
  v_paid boolean := coalesce((p_payload ->> 'paid')::boolean, true);
  v_phone text;
  v_digits text;
  v_name text;
  v_customer uuid;
  v_profile_name text;
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

  begin
    select * into v_branch from public.branches b where b.id = (p_payload ->> 'branch_id')::uuid;
  exception when others then
    perform app.fail('invalid_request', jsonb_build_object('field', 'branch_id'));
  end;
  if v_branch.id is null or not app.actor_can_access_branch(p_actor, v_branch.id) then
    perform app.fail('forbidden');
  end if;
  if not v_branch.is_active then
    perform app.fail('branch_unavailable');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('counter:' || p_actor::text || ':' || v_key::text, 0));
  select * into v_existing from public.orders o
   where o.source = 'counter' and o.created_by = p_actor and o.idempotency_key = v_key;
  if found then
    if v_existing.request_hash <> v_hash then
      perform app.fail('idempotency_key_reused');
    end if;
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'status', v_existing.status, 'total', v_existing.total, 'replayed', true
    );
  end if;

  v_method := case p_payload ->> 'payment'
    when 'cash' then 'cash_on_pickup'::public.payment_method
    when 'card' then 'card'::public.payment_method
  end;
  if v_method is null then
    perform app.fail('invalid_request', jsonb_build_object('field', 'payment'));
  end if;

  -- Customer: everything optional. Bahrain numbers may be typed with or without +973.
  v_digits := nullif(regexp_replace(coalesce(p_payload -> 'customer' ->> 'phone', ''), '[^0-9]', '', 'g'), '');
  if v_digits is not null then
    if char_length(v_digits) = 8 then
      v_phone := '+973' || v_digits;
    elsif v_digits ~ '^[0-9]{8,15}$' then
      v_phone := '+' || v_digits;
    else
      perform app.fail('phone_invalid');
    end if;
    -- Link to the account only when exactly one customer has this number.
    select min(p.id::text)::uuid, min(p.full_name) into v_customer, v_profile_name
      from public.profiles p
     where right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 8) = right(v_digits, 8)
    having count(*) = 1;
  end if;
  v_name := nullif(btrim(coalesce(p_payload -> 'customer' ->> 'name', '')), '');
  if char_length(v_name) > 120 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'name'));
  end if;
  v_name := coalesce(v_name, v_profile_name);

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

  v_quote := app.price_cart(p_payload -> 'items', p_payload ->> 'coupon_code', v_customer, now());
  if jsonb_array_length(v_quote -> 'lines') = 0 then
    perform app.fail('cart_invalid');
  end if;
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
    coupon_id, coupon_code, customer_name, customer_phone, notes, idempotency_key, request_hash,
    source, created_by, confirmed_at
  ) values (
    v_order_number, v_customer, v_branch.id, 'pickup', 'confirmed', v_method,
    case when v_paid then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,
    now(),
    (v_quote ->> 'subtotal')::numeric, (v_quote ->> 'options_total')::numeric,
    (v_quote ->> 'discount_total')::numeric, 0, (v_quote ->> 'total')::numeric,
    (v_quote -> 'coupon' ->> 'coupon_id')::uuid, v_quote -> 'coupon' ->> 'code',
    v_name, v_phone, v_notes, v_key, v_hash,
    'counter', p_actor, now()
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

  -- A car given at the counter is already outside: it goes on the board as waiting.
  insert into public.pickup_details (order_id, branch_id, vehicle_plate, vehicle_color, arrival_status, arrived_at, acknowledged_at, acknowledged_by)
  values (
    v_order_id, v_branch.id, v_plate, v_color,
    case when v_plate is not null then 'acknowledged'::public.arrival_status else 'not_arrived'::public.arrival_status end,
    case when v_plate is not null then now() end,
    case when v_plate is not null then now() end,
    case when v_plate is not null then p_actor end
  );

  insert into public.payments (order_id, method, status, amount)
  values (v_order_id, v_method, case when v_paid then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,
          (v_quote ->> 'total')::numeric);

  if (v_quote -> 'coupon' ->> 'coupon_id') is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id)
    values ((v_quote -> 'coupon' ->> 'coupon_id')::uuid, v_order_id, v_customer);
  end if;

  insert into public.order_status_history (order_id, from_status, to_status, changed_by)
  values (v_order_id, null, 'confirmed', p_actor);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (p_actor, 'order.counter_create', 'orders', v_order_id::text,
          jsonb_build_object('order_number', v_order_number, 'total', v_quote -> 'total',
                             'payment', p_payload ->> 'payment', 'paid', v_paid, 'linked_customer', v_customer is not null));

  return jsonb_build_object(
    'order_id', v_order_id, 'order_number', v_order_number,
    'status', 'confirmed', 'total', (v_quote ->> 'total')::numeric, 'replayed', false,
    'linked_customer', v_customer is not null
  );
end $$;

-- Counter orders left to pay on handover (cash or card at the car) are settled when completed.
create function app.settle_counter_order_on_completion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.source = 'counter' and new.status = 'completed' and old.status <> 'completed' and new.payment_status = 'unpaid' then
    new.payment_status := 'paid';
    update public.payments p set status = 'paid' where p.order_id = new.id and p.status = 'unpaid';
  end if;
  return new;
end $$;

create trigger orders_settle_counter_payment
before update of status on public.orders
for each row execute function app.settle_counter_order_on_completion();

create function public.staff_place_counter_order(p_payload jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app.place_counter_order(auth.uid(), p_payload)
$$;

revoke all on function app.place_counter_order(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.staff_place_counter_order(jsonb) from public, anon;
grant execute on function app.place_counter_order(uuid, jsonb) to service_role;
grant execute on function public.staff_place_counter_order(jsonb) to authenticated, service_role;

-- The pickup board shows where each order came from.
create or replace view public.staff_pickup_queue with (security_invoker = true) as
select
  o.id as order_id,
  o.order_number,
  o.branch_id,
  o.status,
  split_part(coalesce(o.customer_name, ''), ' ', 1) as customer_first_name,
  o.requested_pickup_at,
  o.created_at,
  d.vehicle_plate,
  d.vehicle_color,
  d.arrival_status,
  d.arrived_at,
  d.last_notified_at,
  d.notify_count,
  d.acknowledged_at,
  b.name_ar as branch_name_ar,
  b.name_en as branch_name_en,
  o.source
from public.orders o
join public.pickup_details d on d.order_id = o.id
join public.branches b on b.id = o.branch_id
where o.status not in ('completed', 'cancelled');

-- Sales report: same as before plus a split between online and counter orders.
create or replace function public.admin_sales_report(p_from date, p_to date, p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_start timestamptz := p_from::timestamp at time zone app.tz();
  v_end timestamptz := (p_to + 1)::timestamp at time zone app.tz();
begin
  if not app.actor_has_min_role(auth.uid(), 'manager') then
    perform app.fail('forbidden');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'range'));
  end if;

  return (
    with scoped as (
      select o.*, (o.created_at at time zone app.tz())::date as day
      from public.orders o
      where o.created_at >= v_start and o.created_at < v_end
        and (p_branch is null or o.branch_id = p_branch)
    ),
    days as (
      select d::date as day from generate_series(p_from, p_to, interval '1 day') d
    )
    select jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'totals', jsonb_build_object(
        'orders', (select count(*) from scoped where status <> 'cancelled'),
        'completed', (select count(*) from scoped where status = 'completed'),
        'cancelled', (select count(*) from scoped where status = 'cancelled'),
        'revenue', coalesce((select sum(total) from scoped where status = 'completed'), 0),
        'discounts', coalesce((select sum(discount_total) from scoped where status = 'completed'), 0)
      ),
      'by_source', (
        select jsonb_object_agg(src, jsonb_build_object(
          'orders', (select count(*) from scoped s where s.source = src and s.status <> 'cancelled'),
          'revenue', coalesce((select sum(total) from scoped s where s.source = src and s.status = 'completed'), 0)
        ))
        from unnest(array['online', 'counter']) src
      ),
      'daily', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'day', d.day,
          'orders', (select count(*) from scoped s where s.day = d.day and s.status <> 'cancelled'),
          'revenue', coalesce((select sum(total) from scoped s where s.day = d.day and s.status = 'completed'), 0)
        ) order by d.day), '[]'::jsonb)
        from days d
      ),
      'top_products', coalesce((
        select jsonb_agg(t order by t.quantity desc) from (
          select i.product_id, max(i.product_name_ar) as name_ar, max(i.product_name_en) as name_en,
                 sum(i.quantity)::integer as quantity, sum(i.line_total) as revenue
          from public.order_items i join scoped s on s.id = i.order_id
          where s.status = 'completed'
          group by i.product_id
          order by sum(i.quantity) desc
          limit 10
        ) t
      ), '[]'::jsonb)
    )
  );
end $$;

-- Invoice draws: walk-in orders with a phone number count too (keyed by the number).
create or replace function app.giveaway_order_entries(
  p_from date, p_to date, p_branch uuid, p_min_total numeric, p_per_customer boolean
) returns table (entry_key text, order_id uuid, customer_id uuid, label text)
language sql stable set search_path = '' as $$
  with eligible as (
    select o.id, o.order_number, o.customer_id, o.customer_name, o.created_at,
           coalesce(o.customer_id::text, 'tel:' || right(regexp_replace(o.customer_phone, '[^0-9]', '', 'g'), 8)) as who
    from public.orders o
    where o.status = 'completed'
      and (o.customer_id is not null or o.customer_phone is not null)
      and o.created_at >= p_from::timestamp at time zone app.tz()
      and o.created_at < (p_to + 1)::timestamp at time zone app.tz()
      and (p_branch is null or o.branch_id = p_branch)
      and o.total >= coalesce(p_min_total, 0)
  ),
  picked as (
    -- One entry per customer: their first qualifying order stands for them.
    select distinct on (case when p_per_customer then e.who else e.id::text end) e.*
    from eligible e
    order by case when p_per_customer then e.who else e.id::text end, e.created_at
  )
  select case when p_per_customer then p.who else p.order_number end,
         p.id, p.customer_id,
         p.order_number || ' · ' || coalesce(nullif(split_part(trim(p.customer_name), ' ', 1), ''), '—')
  from picked p
$$;
