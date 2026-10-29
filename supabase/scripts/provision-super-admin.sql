-- Provision the first Lahab super administrator.
--
-- 1. The person signs up normally on the website and confirms their email.
-- 2. The project owner runs this script with database-owner privileges:
--      - Supabase Dashboard → SQL Editor: paste, replace :'email' with the quoted address, run; or
--      - psql "$DATABASE_URL" -v email='owner@example.com' -f supabase/scripts/provision-super-admin.sql
-- 3. The new super admin then manages all other roles from /admin/staff.
--
-- No credentials are stored in source control. app.grant_super_admin_by_email is not
-- executable through the API (anon/authenticated/service_role have no EXECUTE on it).

select app.grant_super_admin_by_email(:'email');
