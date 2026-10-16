-- =============================================================================
-- Migration: 20261016_08_reassert_profiles_subscriptions_revokes.sql
-- =============================================================================
-- PURPOSE
--   The self-host restore (cutover 2026-09-25) recreated the schema under
--   Supabase's default privileges and replayed only GRANTs, never REVOKEs. The
--   production schema of 2026-10-10 shows `GRANT ALL … TO anon, authenticated`
--   on three tables whose migrations had taken privileges away:
--
--     public.profiles             20260921_01: anon held no SELECT/INSERT/UPDATE/DELETE
--     public.subscriptions        20260921_02: no INSERT/UPDATE/DELETE for anon, authenticated
--     public.credit_transactions  20260921_02: no INSERT/UPDATE/DELETE for anon, authenticated
--
--   _verify.sql stopped on live (2026-10-16) with
--     "_verify: anon still holds 1 DML grant(s) on public.profiles — 20260921_01
--      was not applied" — the one left is SELECT; 20261016_02 had already taken
--   INSERT/UPDATE/DELETE away from anon.
--
-- WHAT IT DOES (idempotent)
--   1. subscriptions / credit_transactions: re-runs the REVOKEs of 20260921_02,
--      plus TRUNCATE / REFERENCES / TRIGGER, which the restore's GRANT ALL also
--      handed out and which no API path uses. SELECT is untouched (each user
--      still reads their own rows through RLS). Every write in the app goes
--      through the service role (the admin routes and src/lib/entitlements.ts,
--      checked 2026-10-16).
--   2. profiles: anon KEEPS table-level SELECT, on purpose. About fifteen
--      policies on live read public.profiles inline with no TO clause, so they
--      apply to anon too — "admins read all lawyer profiles",
--      articles_admin_read_all, "Admins can modify platform settings",
--      blog_sections_admin_write, contact_admin_read, … Postgres checks the
--      caller's SELECT privilege on every table a policy reads, so without it
--      every guest read of those tables fails with 42501 "permission denied
--      for table profiles" (proven in
--      supabase/tests/rls/profiles_anon_policy_subquery.test.sql). The guest
--      still reads ZERO profile rows: every profiles policy is `to
--      authenticated`, which this file verifies. Taking the grant away is safe
--      only after those policies call public.is_admin() instead (next batch).
--      INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER stay revoked
--      (20261016_02).
--
-- DEPLOY ORDER — INDEPENDENT (no code change)
--
-- ROLLBACK — none needed (it only removes privileges the migrations never gave).
-- =============================================================================

begin;

revoke insert, update, delete, truncate, references, trigger
  on public.subscriptions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.credit_transactions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.profiles from anon;

grant all on public.subscriptions       to service_role;
grant all on public.credit_transactions to service_role;
grant all on public.profiles            to service_role;

-- Verify: the counts _verify.sql gates on, plus what must keep working.
do $$
declare
  n       int;
  missing text := '';
begin
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('subscriptions', 'credit_transactions')
     and grantee in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then
    missing := missing || format(' %s write grant(s) for authenticated/anon survive on subscriptions/credit_transactions;', n);
  end if;

  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'profiles' and grantee = 'anon'
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then
    missing := missing || format(' anon holds %s write grant(s) on public.profiles;', n);
  end if;

  -- The guest reads zero profile rows: no profiles policy may reach anon.
  select count(*) into n from pg_policy
   where polrelid = 'public.profiles'::regclass
     and (polroles = '{0}'::oid[]                        -- no TO clause = PUBLIC
          or 'anon'::regrole::oid = any (polroles));
  if n <> 0 then
    missing := missing || format(' %s policy/policies on public.profiles apply to anon or PUBLIC;', n);
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    missing := missing || ' row level security is OFF on public.profiles;';
  end if;

  -- What the app still needs.
  if not has_table_privilege('authenticated', 'public.subscriptions', 'SELECT') then
    missing := missing || ' authenticated lost SELECT on public.subscriptions (the plan check would fail);';
  end if;
  if not has_table_privilege('authenticated', 'public.profiles', 'SELECT') then
    missing := missing || ' authenticated lost SELECT on public.profiles;';
  end if;
  if not has_table_privilege('anon', 'public.profiles', 'SELECT') then
    missing := missing || ' anon lost SELECT on public.profiles (guest reads of tables whose admin policy reads profiles would fail with 42501);';
  end if;
  if not has_table_privilege('service_role', 'public.subscriptions', 'INSERT')
     or not has_table_privilege('service_role', 'public.credit_transactions', 'INSERT')
     or not has_table_privilege('service_role', 'public.profiles', 'UPDATE') then
    missing := missing || ' service_role lost a write privilege;';
  end if;

  if missing <> '' then
    raise exception '20261016_08 verify:%', missing;
  end if;
  raise notice '20261016_08 verify: OK — subscriptions and credit_transactions written by the service role only; guests read zero profile rows';
end $$;

commit;

notify pgrst, 'reload schema';
