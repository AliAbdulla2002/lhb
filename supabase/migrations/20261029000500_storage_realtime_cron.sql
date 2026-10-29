-- Lahab: image storage, realtime publication and scheduled retention.

-- service_role (Edge Functions, bypasses RLS) keeps full access; Supabase grants this by
-- default, stated here explicitly so it does not depend on platform defaults.
grant execute on all functions in schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Menu and marketing images: publicly readable, written only by managers.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-media', 'menu-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy menu_media_manager_read on storage.objects for select to authenticated
  using (bucket_id = 'menu-media' and public.has_min_role('manager'));
create policy menu_media_manager_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'menu-media' and public.has_min_role('manager'));
create policy menu_media_manager_update on storage.objects for update to authenticated
  using (bucket_id = 'menu-media' and public.has_min_role('manager'))
  with check (bucket_id = 'menu-media' and public.has_min_role('manager'));
create policy menu_media_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'menu-media' and public.has_min_role('manager'));

-- Realtime: postgres_changes respects RLS, so each subscriber only receives rows it can read.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.orders, public.pickup_details, public.pickup_arrival_events, public.order_status_history,
      public.products, public.product_option_values;
  end if;
end $$;

-- Retention job (hourly). pg_cron is available on Supabase; skipped where it is not.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('lahab-purge-expired-data', '17 * * * *', 'select app.purge_expired_data()');
  end if;
end $$;
