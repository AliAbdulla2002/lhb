-- Lahab: admin API.
--
-- Actor-bound wrappers let the signed-in user call the business functions directly
-- (JWT subject = actor). Every check — role, branch scope, allowed transition, rate
-- limit — happens inside app.*; nothing is trusted from the client.

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

create function public.transition_order_status(p_order_id uuid, p_to public.order_status, p_reason text default null)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app.transition_order_status(auth.uid(), p_order_id, p_to, p_reason)
$$;

create function public.acknowledge_arrival(p_order_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app.acknowledge_arrival(auth.uid(), p_order_id)
$$;

-- ---------------------------------------------------------------------------
-- Dashboard (branch-scoped for staff, all branches for managers)
-- ---------------------------------------------------------------------------

create function public.admin_dashboard(p_branch uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_day_start timestamptz := (date_trunc('day', now() at time zone app.tz())) at time zone app.tz();
  v_result jsonb;
begin
  if not app.actor_has_min_role(v_actor, 'staff') then
    perform app.fail('forbidden');
  end if;
  if p_branch is not null and not app.actor_can_access_branch(v_actor, p_branch) then
    perform app.fail('forbidden');
  end if;

  with scoped as (
    select o.* from public.orders o
    where (p_branch is null or o.branch_id = p_branch)
      and app.actor_can_access_branch(v_actor, o.branch_id)
  ),
  today as (
    select * from scoped where created_at >= v_day_start
  )
  select jsonb_build_object(
    'day_start', v_day_start,
    'orders_today', (select count(*) from today),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from today group by status) s), '{}'::jsonb),
    -- Revenue counts completed orders only: cash is recorded as paid at handover.
    'sales_today', coalesce((select sum(total) from today where status = 'completed'), 0),
    'open_value', coalesce((select sum(total) from scoped where status in ('pending', 'confirmed', 'preparing', 'ready')), 0),
    'active_orders', (select count(*) from scoped where status in ('pending', 'confirmed', 'preparing', 'ready')),
    'waiting_pickup', (
      select count(*) from scoped s join public.pickup_details d on d.order_id = s.id
      where s.status not in ('completed', 'cancelled') and d.arrival_status in ('arrived', 'acknowledged')
    ),
    'best_sellers', coalesce((
      select jsonb_agg(b order by b.quantity desc) from (
        select i.product_id, max(i.product_name_ar) as name_ar, max(i.product_name_en) as name_en, sum(i.quantity)::integer as quantity
        from public.order_items i join scoped s on s.id = i.order_id
        where s.status <> 'cancelled' and s.created_at >= now() - interval '7 days'
        group by i.product_id
        order by sum(i.quantity) desc
        limit 5
      ) b
    ), '[]'::jsonb),
    'inventory_tracking', false
  ) into v_result;

  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- Sales report (managers)
-- ---------------------------------------------------------------------------

create function public.admin_sales_report(p_from date, p_to date, p_branch uuid default null)
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

-- ---------------------------------------------------------------------------
-- Customers (managers see masked contact details; super admins see them in full)
-- ---------------------------------------------------------------------------

create function app.mask_email(p_email text) returns text
language sql immutable set search_path = '' as $$
  select case when p_email is null then null
    else left(split_part(p_email, '@', 1), 1) || '•••@' || split_part(p_email, '@', 2) end
$$;

create function app.mask_phone(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select case when p_phone is null then null else left(p_phone, 4) || '•••' || right(p_phone, 3) end
$$;

create function public.admin_list_customers(p_search text default null, p_limit integer default 25, p_offset integer default 0)
returns table (
  id uuid, full_name text, email text, phone text, created_at timestamptz,
  orders_count bigint, completed_total numeric, last_order_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_full boolean := app.actor_has_min_role(auth.uid(), 'super_admin');
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not app.actor_has_min_role(auth.uid(), 'manager') then
    perform app.fail('forbidden');
  end if;
  return query
    select p.id, p.full_name,
      case when v_full then u.email else app.mask_email(u.email) end,
      case when v_full then p.phone else app.mask_phone(p.phone) end,
      p.created_at,
      count(o.id),
      coalesce(sum(o.total) filter (where o.status = 'completed'), 0),
      max(o.created_at),
      count(*) over ()
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.orders o on o.customer_id = p.id
    where v_search is null
       or p.full_name ilike '%' || v_search || '%'
       or u.email ilike '%' || v_search || '%'
       or p.phone like '%' || regexp_replace(v_search, '[^0-9+]', '', 'g') || '%'
    group by p.id, u.email
    order by max(o.created_at) desc nulls last, p.created_at desc
    limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Staff & roles (super admins)
-- ---------------------------------------------------------------------------

create function public.admin_list_staff()
returns table (id uuid, email text, full_name text, roles public.app_role[], branch_ids uuid[])
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.actor_has_min_role(auth.uid(), 'super_admin') then
    perform app.fail('forbidden');
  end if;
  return query
    select u.id, u.email::text, p.full_name,
      array_agg(distinct r.role order by r.role),
      coalesce(array_agg(distinct a.branch_id) filter (where a.branch_id is not null), '{}')
    from auth.users u
    join public.user_roles r on r.user_id = u.id
    left join public.profiles p on p.id = u.id
    left join public.staff_branch_assignments a on a.user_id = u.id
    group by u.id, u.email, p.full_name
    having bool_or(r.role <> 'customer')
    order by p.full_name nulls last, u.email;
end $$;

-- Grant or revoke a role by email. The permission check runs before the lookup so the
-- function cannot be used to discover which emails have accounts.
create function public.admin_set_role(p_email text, p_role public.app_role, p_grant boolean)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare v_target uuid;
begin
  if not app.actor_has_min_role(auth.uid(), 'super_admin') then
    perform app.fail('forbidden');
  end if;
  select u.id into v_target from auth.users u where lower(u.email) = lower(btrim(p_email));
  if v_target is null then
    perform app.fail('user_not_found');
  end if;
  perform app.set_user_role(auth.uid(), v_target, p_role, p_grant);
  return v_target;
end $$;

-- ---------------------------------------------------------------------------
-- Ordering of menu rows (managers)
-- ---------------------------------------------------------------------------

create function public.admin_reorder(p_table text, p_ids uuid[])
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  perform set_config('app.actor_id', coalesce(auth.uid()::text, ''), true);
  if not app.actor_has_min_role(auth.uid(), 'manager') then
    perform app.fail('forbidden');
  end if;
  if p_table not in ('categories', 'products', 'product_options', 'product_option_values', 'product_images', 'promotions', 'branches') then
    perform app.fail('invalid_request', jsonb_build_object('field', 'table'));
  end if;
  if cardinality(p_ids) > 500 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'ids'));
  end if;
  execute format(
    'update public.%I t set sort_order = x.ord from unnest($1) with ordinality as x(id, ord) where t.id = x.id and t.sort_order is distinct from x.ord',
    p_table
  ) using p_ids;
end $$;

revoke all on function
  public.transition_order_status(uuid, public.order_status, text),
  public.acknowledge_arrival(uuid),
  public.admin_dashboard(uuid),
  public.admin_sales_report(date, date, uuid),
  public.admin_list_customers(text, integer, integer),
  public.admin_list_staff(),
  public.admin_set_role(text, public.app_role, boolean),
  public.admin_reorder(text, uuid[])
from public, anon;

grant execute on function
  public.transition_order_status(uuid, public.order_status, text),
  public.acknowledge_arrival(uuid),
  public.admin_dashboard(uuid),
  public.admin_sales_report(date, date, uuid),
  public.admin_list_customers(text, integer, integer),
  public.admin_list_staff(),
  public.admin_set_role(text, public.app_role, boolean),
  public.admin_reorder(text, uuid[])
to authenticated, service_role;
