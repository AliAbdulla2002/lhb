-- Lahab: customer ordering API.
--
-- place_order is bound to the JWT subject; all validation, pricing, idempotency and
-- rate limiting happen in app.place_order. Prices in the payload are never read.

create function public.place_order(p_payload jsonb)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app.place_order(auth.uid(), p_payload)
$$;

-- Bookable pickup slots for the next p_hours, honouring lead time, opening hours,
-- special days and per-slot capacity. Public: it exposes only availability.
create function public.get_pickup_slots(p_branch uuid, p_hours integer default 24)
returns table (slot_start timestamptz, available boolean)
language sql stable security definer set search_path = '' as $$
  with b as (
    select br.id, make_interval(mins => br.slot_minutes) as slot, make_interval(mins => br.pickup_lead_minutes) as lead,
           br.max_orders_per_slot, br.pickup_paused, br.is_active, br.accepts_pickup
    from public.branches br where br.id = p_branch
  ),
  slots as (
    select s, b.slot, b.max_orders_per_slot
    from b,
      generate_series(
        date_bin(b.slot, now() + b.lead + b.slot - interval '1 second', timestamptz '2000-01-01 00:00:00+00'),
        now() + make_interval(hours => least(greatest(p_hours, 1), 48)),
        b.slot
      ) s
    where b.is_active and b.accepts_pickup and not b.pickup_paused
      and app.is_branch_open_at(b.id, s)
  )
  select s.s,
    (
      select count(*) from public.orders o
      where o.branch_id = p_branch and o.status <> 'cancelled'
        and o.requested_pickup_at >= s.s and o.requested_pickup_at < s.s + s.slot
    ) < s.max_orders_per_slot
  from slots s
  order by s.s
$$;

revoke all on function public.place_order(jsonb), public.get_pickup_slots(uuid, integer) from public, anon;
grant execute on function public.place_order(jsonb) to authenticated, service_role;
grant execute on function public.get_pickup_slots(uuid, integer) to anon, authenticated, service_role;
