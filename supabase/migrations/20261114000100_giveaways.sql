-- Prize draws (giveaways) for managers: from completed orders ("invoices"), or from a list
-- of Instagram accounts (commenters or followers) pasted by the manager.
--
-- Fairness: every draw gets a fresh random seed. Each entry's rank is
-- sha256(seed || ':' || entry key); the lowest ranks win, the next ones are alternates.
-- The seed and the full entry list are stored, so anyone can re-run the draw and get the
-- same winners, and nobody can pick the result in advance.

create type public.giveaway_source as enum ('orders', 'instagram_comments', 'instagram_followers', 'list');

create table public.giveaways (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  source public.giveaway_source not null,
  -- The rules the entries were selected with (dates, branch, minimum total, mentions...).
  rules jsonb not null default '{}'::jsonb,
  -- Entry keys only (order numbers, customer ids or Instagram usernames), sorted.
  entries jsonb not null,
  entry_count integer not null check (entry_count > 0),
  winners_count integer not null check (winners_count between 1 and 50),
  alternates_count integer not null default 0 check (alternates_count between 0 and 20),
  seed text not null,
  drawn_by uuid references auth.users (id) on delete set null,
  drawn_at timestamptz not null default now()
);
create index giveaways_drawn_idx on public.giveaways (drawn_at desc);

create table public.giveaway_winners (
  giveaway_id uuid not null references public.giveaways (id) on delete cascade,
  position integer not null check (position >= 1),
  is_alternate boolean not null default false,
  entry_key text not null,
  label text not null,
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid references auth.users (id) on delete set null,
  primary key (giveaway_id, position)
);

alter table public.giveaways enable row level security;
alter table public.giveaway_winners enable row level security;
revoke all on public.giveaways, public.giveaway_winners from public, anon, authenticated;
grant select on public.giveaways, public.giveaway_winners to authenticated;
grant all on public.giveaways, public.giveaway_winners to service_role;
create policy giveaways_read on public.giveaways for select to authenticated using (public.has_min_role('manager'));
create policy giveaway_winners_read on public.giveaway_winners for select to authenticated using (public.has_min_role('manager'));

/** Rank of an entry in a draw: lower wins. Public so a draw can be re-checked. */
create function public.giveaway_rank(p_seed text, p_key text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_seed || ':' || p_key, 'UTF8')), 'hex')
$$;

/** Orders that qualify for an order draw, one row per entry. */
create function app.giveaway_order_entries(
  p_from date, p_to date, p_branch uuid, p_min_total numeric, p_per_customer boolean
) returns table (entry_key text, order_id uuid, customer_id uuid, label text)
language sql stable set search_path = '' as $$
  with eligible as (
    select o.id, o.order_number, o.customer_id, o.customer_name, o.created_at
    from public.orders o
    where o.status = 'completed'
      and o.customer_id is not null
      and o.created_at >= p_from::timestamp at time zone app.tz()
      and o.created_at < (p_to + 1)::timestamp at time zone app.tz()
      and (p_branch is null or o.branch_id = p_branch)
      and o.total >= coalesce(p_min_total, 0)
  ),
  picked as (
    -- One entry per customer: their first qualifying order stands for them.
    select distinct on (case when p_per_customer then e.customer_id::text else e.id::text end) e.*
    from eligible e
    order by case when p_per_customer then e.customer_id::text else e.id::text end, e.created_at
  )
  select case when p_per_customer then p.customer_id::text else p.order_number end,
         p.id, p.customer_id,
         p.order_number || ' · ' || coalesce(nullif(split_part(trim(p.customer_name), ' ', 1), ''), '—')
  from picked p
$$;

create function app.giveaway_check(p_title text, p_winners integer, p_alternates integer) returns void
language plpgsql set search_path = '' as $$
begin
  if not app.actor_has_min_role(auth.uid(), 'manager') then
    perform app.fail('forbidden');
  end if;
  if p_title is null or char_length(trim(p_title)) not between 1 and 120 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'title'));
  end if;
  if p_winners is null or p_winners not between 1 and 50 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'winners'));
  end if;
  if coalesce(p_alternates, 0) not between 0 and 20 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'alternates'));
  end if;
end $$;

/** The stored draw with its winners, as the admin page shows it. */
create function app.giveaway_json(p_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', g.id, 'title', g.title, 'source', g.source, 'rules', g.rules, 'entry_count', g.entry_count,
    'winners_count', g.winners_count, 'alternates_count', g.alternates_count, 'seed', g.seed, 'drawn_at', g.drawn_at,
    'winners', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', w.position, 'is_alternate', w.is_alternate, 'entry_key', w.entry_key, 'label', w.label,
        'order_id', w.order_id, 'order_number', o.order_number, 'phone', o.customer_phone
      ) order by w.position)
      from public.giveaway_winners w left join public.orders o on o.id = w.order_id
      where w.giveaway_id = g.id
    ), '[]'::jsonb)
  )
  from public.giveaways g where g.id = p_id
$$;

/** How many entries an order draw would have, before drawing. */
create function public.admin_giveaway_order_count(
  p_from date, p_to date, p_branch uuid default null, p_min_total numeric default 0, p_per_customer boolean default true
) returns integer
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.actor_has_min_role(auth.uid(), 'manager') then
    perform app.fail('forbidden');
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'range'));
  end if;
  return (select count(*)::integer from app.giveaway_order_entries(p_from, p_to, p_branch, p_min_total, p_per_customer));
end $$;

/** Draws winners from completed orders. */
create function public.admin_draw_orders(
  p_title text, p_from date, p_to date, p_branch uuid default null, p_min_total numeric default 0,
  p_per_customer boolean default true, p_winners integer default 1, p_alternates integer default 0
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_seed text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_entries jsonb;
  v_count integer;
begin
  perform app.giveaway_check(p_title, p_winners, p_alternates);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'range'));
  end if;
  if coalesce(p_min_total, 0) < 0 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'min_total'));
  end if;

  select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) into v_entries
  from app.giveaway_order_entries(p_from, p_to, p_branch, p_min_total, p_per_customer) e;
  v_count := jsonb_array_length(v_entries);
  if v_count < p_winners then
    perform app.fail('not_enough_entries', jsonb_build_object('entries', v_count));
  end if;

  insert into public.giveaways (title, source, rules, entries, entry_count, winners_count, alternates_count, seed, drawn_by)
  values (
    trim(p_title), 'orders',
    jsonb_build_object('from', p_from, 'to', p_to, 'branch', p_branch, 'min_total', coalesce(p_min_total, 0), 'per_customer', p_per_customer),
    (select jsonb_agg(e.entry_key order by e.entry_key) from jsonb_to_recordset(v_entries) e(entry_key text)),
    v_count, p_winners, coalesce(p_alternates, 0), v_seed, auth.uid()
  )
  returning id into v_id;

  insert into public.giveaway_winners (giveaway_id, position, is_alternate, entry_key, label, order_id, customer_id)
  select v_id, r.position, r.position > p_winners, r.entry_key, r.label, r.order_id, r.customer_id
  from (
    select e.*, row_number() over (order by public.giveaway_rank(v_seed, e.entry_key)) as position
    from jsonb_to_recordset(v_entries) e(entry_key text, order_id uuid, customer_id uuid, label text)
  ) r
  where r.position <= p_winners + coalesce(p_alternates, 0);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'giveaway.draw', 'giveaways', v_id::text, jsonb_build_object('source', 'orders', 'entries', v_count, 'seed', v_seed));
  return app.giveaway_json(v_id);
end $$;

/**
 * Draws winners from a list of Instagram accounts. The page parses the pasted comments or
 * followers and applies the rules (such as "tag 2 friends"); the server cleans the names,
 * removes duplicates and draws.
 */
create function public.admin_draw_list(
  p_title text, p_source public.giveaway_source, p_entries text[], p_winners integer default 1,
  p_alternates integer default 0, p_rules jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_seed text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  v_keys text[];
  v_count integer;
begin
  perform app.giveaway_check(p_title, p_winners, p_alternates);
  if p_source is null or p_source = 'orders' then
    perform app.fail('invalid_request', jsonb_build_object('field', 'source'));
  end if;
  if p_entries is null or cardinality(p_entries) > 20000 then
    perform app.fail('invalid_request', jsonb_build_object('field', 'entries'));
  end if;

  select coalesce(array_agg(k order by k), '{}') into v_keys
  from (
    select distinct lower(regexp_replace(trim(e), '^@', '')) as k from unnest(p_entries) e
  ) s
  where k ~ '^[a-z0-9._]{1,30}$';
  v_count := cardinality(v_keys);
  if v_count < p_winners then
    perform app.fail('not_enough_entries', jsonb_build_object('entries', v_count));
  end if;

  insert into public.giveaways (title, source, rules, entries, entry_count, winners_count, alternates_count, seed, drawn_by)
  values (trim(p_title), p_source, coalesce(p_rules, '{}'::jsonb), to_jsonb(v_keys), v_count, p_winners, coalesce(p_alternates, 0), v_seed, auth.uid())
  returning id into v_id;

  insert into public.giveaway_winners (giveaway_id, position, is_alternate, entry_key, label)
  select v_id, r.position, r.position > p_winners, r.k, '@' || r.k
  from (
    select k, row_number() over (order by public.giveaway_rank(v_seed, k)) as position from unnest(v_keys) k
  ) r
  where r.position <= p_winners + coalesce(p_alternates, 0);

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, after)
  values (auth.uid(), 'giveaway.draw', 'giveaways', v_id::text, jsonb_build_object('source', p_source, 'entries', v_count, 'seed', v_seed));
  return app.giveaway_json(v_id);
end $$;

/** Past draws, newest first, with their winners. */
create function public.admin_list_giveaways(p_limit integer default 20) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.actor_has_min_role(auth.uid(), 'manager') then
    perform app.fail('forbidden');
  end if;
  return coalesce((
    select jsonb_agg(app.giveaway_json(g.id) order by g.drawn_at desc)
    from (select id, drawn_at from public.giveaways order by drawn_at desc limit least(greatest(coalesce(p_limit, 20), 1), 100)) g
  ), '[]'::jsonb);
end $$;

revoke all on function
  public.admin_giveaway_order_count(date, date, uuid, numeric, boolean),
  public.admin_draw_orders(text, date, date, uuid, numeric, boolean, integer, integer),
  public.admin_draw_list(text, public.giveaway_source, text[], integer, integer, jsonb),
  public.admin_list_giveaways(integer)
from public, anon;
grant execute on function
  public.admin_giveaway_order_count(date, date, uuid, numeric, boolean),
  public.admin_draw_orders(text, date, date, uuid, numeric, boolean, integer, integer),
  public.admin_draw_list(text, public.giveaway_source, text[], integer, integer, jsonb),
  public.admin_list_giveaways(integer)
to authenticated, service_role;
revoke all on function public.giveaway_rank(text, text) from public, anon;
grant execute on function public.giveaway_rank(text, text) to authenticated, service_role;

-- Draws are kept two years, like the audit log: add them to the hourly retention job.
create or replace function app.purge_expired_data() returns void
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
  delete from public.giveaways where drawn_at < now() - interval '2 years';
  delete from app.order_number_counters where day < current_date - 7;
end $$;
