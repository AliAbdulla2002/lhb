-- Lahab: extensions, enums, private schema and shared trigger helpers.
-- All money is numeric(10,3): BHD has 3 decimal places (1 BHD = 1000 fils).
-- All timestamps are timestamptz (UTC); business rules use Asia/Bahrain local time.

create extension if not exists citext with schema extensions;

-- Private schema for privileged business logic. Not exposed through the Data API to
-- anon/authenticated: only service_role (Edge Functions) may execute these functions.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to service_role;

create type public.app_role as enum ('customer', 'staff', 'manager', 'super_admin');
create type public.order_status as enum ('pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled');
create type public.fulfillment_type as enum ('pickup', 'delivery');
create type public.arrival_status as enum ('not_arrived', 'arrived', 'acknowledged', 'handed_over');
create type public.payment_method as enum ('cash_on_pickup', 'online');
create type public.payment_status as enum ('unpaid', 'pending', 'paid', 'failed', 'refunded');
create type public.discount_type as enum ('percent', 'fixed');

-- Business timezone, single source of truth for SQL.
create function app.tz() returns text
language sql immutable set search_path = '' as $$ select 'Asia/Bahrain' $$;

create function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Raise a coded, client-safe error. Edge Functions only forward messages that start
-- with "lahab." — anything else is replaced with a generic error.
create function app.fail(p_code text, p_detail jsonb default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'lahab.' || p_code,
    detail = coalesce(p_detail::text, '');
end $$;

-- The acting user: the JWT subject for direct API calls, or the actor an app.* function
-- declared with set_config('app.actor_id', ...) when called from an Edge Function.
create function app.current_actor() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(
    auth.uid(),
    nullif(current_setting('app.actor_id', true), '')::uuid
  )
$$;
