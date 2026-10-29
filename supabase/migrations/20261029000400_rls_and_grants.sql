-- Lahab: Row-Level Security and privileges.
--
-- Defence in depth: table privileges are granted explicitly (nothing by default), and
-- every table in public has RLS enabled. Orders, payments, roles, pickup events and
-- audit logs have no client write policies at all — they are written only by app.*
-- functions running as the table owner.

-- Start from zero for API roles.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema app from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;
alter default privileges in schema app revoke all on functions from public;

grant usage on schema public to anon, authenticated;

-- Functions callable through the API.
grant execute on function public.has_min_role(public.app_role) to anon, authenticated;
grant execute on function public.can_access_branch(uuid) to anon, authenticated;
grant execute on function public.can_read_order(uuid) to anon, authenticated;
grant execute on function public.my_roles() to authenticated;
grant execute on function public.quote_cart(jsonb, text) to anon, authenticated;
grant execute on function public.is_branch_open(uuid) to anon, authenticated;

-- Privileged business functions: Edge Functions only.
grant execute on function app.place_order(uuid, jsonb) to service_role;
grant execute on function app.transition_order_status(uuid, uuid, public.order_status, text) to service_role;
grant execute on function app.notify_arrival(uuid, uuid, uuid) to service_role;
grant execute on function app.acknowledge_arrival(uuid, uuid) to service_role;
grant execute on function app.set_user_role(uuid, uuid, public.app_role, boolean) to service_role;
grant execute on function app.price_cart(jsonb, text, uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Public menu & content (read by everyone, written by managers)
-- ---------------------------------------------------------------------------

grant select on public.categories, public.products, public.product_images, public.product_options,
  public.product_option_values, public.promotions, public.branches, public.business_hours,
  public.business_hour_exceptions, public.restaurant_settings, public.site_content
  to anon, authenticated;

grant insert, update, delete on public.categories, public.products, public.product_images,
  public.product_options, public.product_option_values, public.promotions, public.business_hours,
  public.business_hour_exceptions, public.site_content, public.product_staff_notes, public.coupons
  to authenticated;
grant select on public.product_staff_notes, public.coupons, public.coupon_redemptions to authenticated;
grant insert, update, delete on public.branches to authenticated;
grant update on public.restaurant_settings to authenticated;

create policy categories_read on public.categories for select to anon, authenticated
  using ((is_visible and archived_at is null) or public.has_min_role('staff'));
create policy categories_write on public.categories for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

create policy products_read on public.products for select to anon, authenticated
  using (
    (
      archived_at is null
      and exists (
        select 1 from public.categories c
        where c.id = category_id and c.is_visible and c.archived_at is null
      )
    )
    or public.has_min_role('staff')
  );
create policy products_write on public.products for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

create policy product_staff_notes_read on public.product_staff_notes for select to authenticated
  using (public.has_min_role('staff'));
create policy product_staff_notes_write on public.product_staff_notes for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

-- Child rows are visible exactly when the parent product is visible to the caller
-- (the subquery runs under the caller's own products policy).
create policy product_images_read on public.product_images for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id));
create policy product_images_write on public.product_images for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

create policy product_options_read on public.product_options for select to anon, authenticated
  using ((is_active or public.has_min_role('staff')) and exists (select 1 from public.products p where p.id = product_id));
create policy product_options_write on public.product_options for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

create policy product_option_values_read on public.product_option_values for select to anon, authenticated
  using (exists (select 1 from public.product_options o where o.id = option_id));
create policy product_option_values_write on public.product_option_values for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

-- Expired, future and inactive offers are hidden from the public automatically.
create policy promotions_read on public.promotions for select to anon, authenticated
  using (
    (is_active and starts_at <= now() and (ends_at is null or ends_at > now()))
    or public.has_min_role('staff')
  );
create policy promotions_write on public.promotions for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

-- Coupons are validated server-side; codes are never listable by customers.
create policy coupons_read on public.coupons for select to authenticated
  using (public.has_min_role('manager'));
create policy coupons_write on public.coupons for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));
create policy coupon_redemptions_read on public.coupon_redemptions for select to authenticated
  using (public.has_min_role('manager'));

create policy branches_read on public.branches for select to anon, authenticated
  using (is_active or public.has_min_role('staff'));
create policy branches_update on public.branches for update to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));
create policy branches_insert on public.branches for insert to authenticated
  with check (public.has_min_role('super_admin'));
create policy branches_delete on public.branches for delete to authenticated
  using (public.has_min_role('super_admin'));

create policy business_hours_read on public.business_hours for select to anon, authenticated using (true);
create policy business_hours_write on public.business_hours for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));
create policy business_hour_exceptions_read on public.business_hour_exceptions for select to anon, authenticated using (true);
create policy business_hour_exceptions_write on public.business_hour_exceptions for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

create policy restaurant_settings_read on public.restaurant_settings for select to anon, authenticated using (true);
create policy restaurant_settings_update on public.restaurant_settings for update to authenticated
  using (public.has_min_role('super_admin')) with check (public.has_min_role('super_admin'));

create policy site_content_read on public.site_content for select to anon, authenticated using (true);
create policy site_content_write on public.site_content for all to authenticated
  using (public.has_min_role('manager')) with check (public.has_min_role('manager'));

-- ---------------------------------------------------------------------------
-- Customers' own data
-- ---------------------------------------------------------------------------

grant select on public.profiles to authenticated;
grant update (full_name, phone, preferred_language) on public.profiles to authenticated;

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_min_role('manager'));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

grant select, insert, delete on public.favorites to authenticated;
create policy favorites_own on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Roles & staff assignments (read-only for clients except super admins' assignments)
-- ---------------------------------------------------------------------------

grant select on public.user_roles to authenticated;
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_min_role('super_admin'));

grant select, insert, delete on public.staff_branch_assignments to authenticated;
create policy staff_assignments_read on public.staff_branch_assignments for select to authenticated
  using (user_id = auth.uid() or public.has_min_role('manager'));
create policy staff_assignments_write on public.staff_branch_assignments for insert to authenticated
  with check (public.has_min_role('super_admin'));
create policy staff_assignments_delete on public.staff_branch_assignments for delete to authenticated
  using (public.has_min_role('super_admin'));

-- ---------------------------------------------------------------------------
-- Orders and everything hanging off them: read-only through the API
-- ---------------------------------------------------------------------------

grant select on public.orders, public.order_items, public.order_item_options, public.order_status_history,
  public.pickup_details, public.pickup_arrival_events, public.payments
  to authenticated;

create policy orders_read on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.can_access_branch(branch_id));

create policy order_items_read on public.order_items for select to authenticated
  using (public.can_read_order(order_id));
create policy order_item_options_read on public.order_item_options for select to authenticated
  using (exists (select 1 from public.order_items i where i.id = order_item_id));
create policy order_status_history_read on public.order_status_history for select to authenticated
  using (public.can_read_order(order_id));
create policy pickup_details_read on public.pickup_details for select to authenticated
  using (public.can_read_order(order_id));
create policy pickup_arrival_events_read on public.pickup_arrival_events for select to authenticated
  using (public.can_read_order(order_id));
create policy payments_read on public.payments for select to authenticated
  using (public.can_read_order(order_id));

grant select on public.audit_logs to authenticated;
create policy audit_logs_read on public.audit_logs for select to authenticated
  using (public.has_min_role('manager'));

-- Staff pickup queue: only what the pickup team needs. security_invoker keeps the
-- caller's RLS in force, so staff see only their branches.
create view public.staff_pickup_queue with (security_invoker = true) as
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
  d.acknowledged_at
from public.orders o
join public.pickup_details d on d.order_id = o.id
where o.status not in ('completed', 'cancelled');

grant select on public.staff_pickup_queue to authenticated;
