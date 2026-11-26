-- =============================================================================
-- Migration: 20261206_95_l16_review_fixes.sql   (batch l16 review, verify id: l16_review)
-- =============================================================================
-- PURPOSE (independent review of batch l16, item 1)
--
--   public.platform_settings is the platform's configuration: the payment
--   gateway mode, prices, the library rules, the AI switches. Every write to it
--   in the application goes through a server admin route with the service
--   role (src/app/api/v1/admin/**: settings, library, library-access,
--   marketplace/settings, marketplace/priority, community/settings,
--   founder/sale), where the staff permission and the extra checks of each
--   setting are applied. This file tightens the session-side policies to
--   match: sessions read, the admin routes write.
--
--   This file makes the table READ-ONLY for every session:
--     1. drops the FOR ALL policy and puts a SELECT-only admin policy in its
--        place («Admins can read platform settings»). The public read policy
--        «Anyone can read platform settings» (20260627) is left as it is.
--     2. revokes INSERT, UPDATE, DELETE and TRUNCATE on the table from PUBLIC,
--        anon and authenticated. This is the part that lasts: re-running
--        20260627_platform_settings.sql or 20261016_09_admin_policies_is_admin.sql
--        (or supabase/tests/rls/rehearse-staging-order.sh) re-creates the old
--        FOR ALL policy, but without the privilege it admits nothing. Re-run
--        THIS file after either of them anyway, so the catalogue is clean.
--     3. service_role keeps every privilege (the admin routes).
--   SQL functions that write the table are migrations' DO blocks or
--   SECURITY DEFINER functions owned by postgres — unaffected.
--
-- HOW TO RUN (any time — before or after the deploy; no code depends on it):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_95_l16_review_fixes.sql
--   Expect: NOTICE  l16_review verify: OK …  and a row with `t`.
--   Then run the `-- >>> verify:l16_review` block of supabase/migrations/_verify.sql.
--
-- RUN ORDER: after 20260627_platform_settings.sql (and 20261016_09). Idempotent.
--
-- Docker: supabase/tests/rls/l16_review_platform_settings.test.sql
--
-- ROLLBACK (restores the old, writable posture — not recommended):
--   grant insert, update, delete on public.platform_settings to authenticated;
--   drop policy if exists "Admins can read platform settings" on public.platform_settings;
--   create policy "Admins can modify platform settings" on public.platform_settings
--     for all to authenticated using (public.is_admin());
-- =============================================================================

set lock_timeout = '10s';

begin;

do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261206_95: public.platform_settings is missing — run 20260627_platform_settings.sql first';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '20261206_95: public.is_admin() is missing';
  end if;
end
$pre$;

-- ── 1. the session-side policy: SELECT only ─────────────────────────────────
drop policy if exists "Admins can modify platform settings" on public.platform_settings;
drop policy if exists "Admins can read platform settings" on public.platform_settings;
create policy "Admins can read platform settings" on public.platform_settings
  for select to authenticated
  using (public.is_admin());

-- ── 2. no session writes the table ───────────────────────────────────────────
revoke insert, update, delete, truncate on table public.platform_settings from public;
do $g$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke insert, update, delete, truncate on table public.platform_settings from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke insert, update, delete, truncate on table public.platform_settings from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on table public.platform_settings to service_role;
  end if;
end
$g$;

comment on policy "Admins can read platform settings" on public.platform_settings is
  'l16 review (20261206_95): an admin session reads every setting; no session writes the table (INSERT/UPDATE/DELETE revoked from anon and authenticated) — writes go through the service-role admin routes.';

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  r text;
  c text;
begin
  if exists (select 1 from pg_catalog.pg_policy
              where polrelid = 'public.platform_settings'::regclass and polcmd <> 'r') then
    missing := missing || ' platform_settings still has a policy that admits a write;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      foreach c in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(r, 'public.platform_settings', c) then
          missing := missing || pg_catalog.format(' %s holds %s on platform_settings;', r, c);
        end if;
      end loop;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_table_privilege('service_role', 'public.platform_settings', 'UPDATE') then
    missing := missing || ' service_role cannot update platform_settings;';
  end if;
  if missing <> '' then
    raise exception 'l16_review verify:%', missing;
  end if;
  raise notice 'l16_review verify: OK — platform_settings is read-only for every session (writes only through the service-role admin routes)';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261206_95 l16 review: platform_settings read-only for sessions' as migration,
       not exists (select 1 from pg_catalog.pg_policy
                    where polrelid = 'public.platform_settings'::regclass and polcmd <> 'r') as ok;
