-- Prelude for platform_staff_roles.test.sql (20261019_30, owner ٢١٠). Loads
-- AFTER prelude_admin_policies_live.sql + 20261016_09 (those give
-- public.profiles' live policies, the live "users read own audit events"
-- policy — TO authenticated, actor_id = auth.uid() OR public.is_admin() — and
-- the rows a1 admin / c1 client / b1 lawyer / d1 provider plus one audit row
-- each for a1 and c1).
--
-- What this adds, from the production schema dump (latest_schema_20261010.sql):
--   * public.admin_audit_events' live columns: stubs.sql has a reduced shape.
--     Live (dump ~5940): actor_type text NOT NULL DEFAULT 'user' with the
--     5-value CHECK, before_state / after_state jsonb, ip_address inet,
--     user_agent text, and action / target_type NOT NULL with NO default.
--     actor_id → profiles(id) ON DELETE SET NULL is already in stubs.sql
--     (dump ~14683).
--   * The live grants (dump ~21250 / ~21259): GRANT ALL on the table AND on
--     its sequence to anon, authenticated, service_role. stubs.sql's blanket
--     grants already give this; restated so the starting point is explicit.
--   * Supabase's default privileges for FUNCTIONS: live grants EXECUTE on
--     every new function in public to anon, authenticated and service_role
--     explicitly (dump: `GRANT ALL ON FUNCTION public.is_admin() TO anon`).
--     stubs.sql sets default privileges for tables and sequences only, so
--     without this a migration that revokes EXECUTE from PUBLIC alone would
--     pass here and leave anon able to call its functions on live.
--   * A second admin a2 and audit rows for a2 and b1 (the deletion tests).

alter table public.admin_audit_events
  add column if not exists actor_type text not null default 'user',
  add column if not exists before_state jsonb,
  add column if not exists after_state jsonb,
  add column if not exists ip_address inet,
  add column if not exists user_agent text;
alter table public.admin_audit_events
  add constraint admin_audit_events_actor_type_check
  check (actor_type = any (array['user'::text, 'admin'::text, 'system'::text, 'n8n'::text, 'api'::text]));
alter table public.admin_audit_events
  alter column action drop default,
  alter column target_type drop default;

grant all on table public.admin_audit_events to anon, authenticated, service_role;
grant all on sequence public.admin_audit_events_id_seq to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

--   …a2 a second admin (downgraded to auditor between the two migration runs
--       by prelude_platform_staff_between_runs.sql; deleted by GoTrue in T10)
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a2');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a2', 'admin', 'مشرف ثانٍ');
insert into public.admin_audit_events (actor_id, actor_type, action, target_type, target_id) values
  ('00000000-0000-0000-0000-0000000000a2', 'admin', 'verification.approve', 'lawyer_profile', '00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b1', 'user',  'profile.update',       'profile',        '00000000-0000-0000-0000-0000000000b1');
