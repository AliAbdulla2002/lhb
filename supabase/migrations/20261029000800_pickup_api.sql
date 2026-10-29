-- Lahab: car pickup API.
--
-- notify_arrival is bound to the JWT subject: only the customer who placed the order can
-- notify for it. Ownership, order state, 12-hour expiry, 60-second cooldown, 5-per-order
-- cap, per-customer rate limit and duplicate-request handling are enforced in
-- app.notify_arrival.

create function public.notify_arrival(p_order_id uuid, p_client_request_id uuid)
returns jsonb language sql volatile security definer set search_path = '' as $$
  select app.notify_arrival(auth.uid(), p_order_id, p_client_request_id)
$$;

revoke all on function public.notify_arrival(uuid, uuid) from public, anon;
grant execute on function public.notify_arrival(uuid, uuid) to authenticated, service_role;

-- The staff queue view gains the branch name and the latest arrival event so a
-- reconnecting dashboard can rebuild the full queue from the database.
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
  b.name_en as branch_name_en
from public.orders o
join public.pickup_details d on d.order_id = o.id
join public.branches b on b.id = o.branch_id
where o.status not in ('completed', 'cancelled');

grant select on public.staff_pickup_queue to authenticated;
