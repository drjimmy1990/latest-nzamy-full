-- =============================================================================
-- Migration: 20260921_01_profiles_rls_lockdown.sql
-- =============================================================================
-- PURPOSE
--   Any authenticated user can read any other user's `public.profiles` row on
--   the live database. No migration in this repository creates a permissive
--   policy on that table (audit 01 §1 enumerates all six statements that ever
--   touched its policies), and the 2026-09-20 read-only probe (audit 06, probe
--   B) shows `anon` receives `[]` — so RLS IS enabled and the offending policy
--   is scoped to the `authenticated` role and was created outside the migration
--   chain (Dashboard / psql). Its name is therefore unknown here.
--
--   This file does not guess the name. It removes EVERY policy on
--   `public.profiles` whose name is not one of the three sanctioned ones, then
--   drops and recreates those three explicitly, scoped `to authenticated`, and
--   takes the table-level DML grants away from `anon`.
--
-- CLOSES (UAT ids)
--   UAT-SEC-001  — evidence/uat-20260915/auth-and-profile-rls.json:
--                  "foreignProfileHidden": 0 for all 47 actors.
--
-- PREREQUISITES (all already live — audit 06 probe A)
--   * public.profiles            — 20260603_phase1_001_profiles.sql:30
--   * public.is_admin()          — 20260625_fix_rls_recursion.sql:16-26
--                                  (security definer, set search_path = '')
--   * roles `anon` / `authenticated` — always present on a Supabase project.
--
-- WHAT IT REPLACES
--   * "users read own profile"    — 20260603_phase1_001_profiles.sql:66-68
--                                   `using (id = auth.uid())`  (unchanged
--                                   expression; re-created `to authenticated`)
--   * "admins read all profiles"  — created self-referentially at
--                                   20260603_phase1_001_profiles.sql:70-77,
--                                   already replaced by the non-recursive
--                                   `public.is_admin()` form at
--                                   20260625_fix_rls_recursion.sql:34-36.
--                                   That expression is carried over verbatim.
--   * "users update own profile"  — 20260603_phase1_001_profiles.sql:79-82
--                                   `using/with check (id = auth.uid())`
--   * ANY other policy on public.profiles, whatever its name, including the
--     out-of-band permissive one that causes UAT-SEC-001. The names dropped are
--     reported with `raise notice` so the removal is recorded in the apply log.
--
--   Nothing else on `public.profiles` is touched: the `trg_lock_user_type`
--   BEFORE UPDATE trigger (20260716_security_hardening.sql:152-155) and
--   `set_profiles_updated_at` (20260603_phase1_001_profiles.sql:85-87) stay.
--
-- ANON GRANT — GREP EVIDENCE BEFORE SHIPPING THE `revoke`
--   `grep -rn 'from("profiles")' src/` → 52 files. Every server-side read that
--   can run without a session uses the service-role client, so none of them
--   loses anything when `anon` loses its grant:
--     * src/app/api/v1/lawyers/route.ts:54,68            createServiceClient()
--     * src/app/api/v1/lawyers/[id]/route.ts:182,189,135 createServiceClient()
--     * src/app/lawyers/[slug]/layout.tsx:123,126        createServiceClient()
--     * src/app/api/v1/invite/[code]/route.ts:60,95      createServiceClient()
--     * src/lib/broadcastFanout.ts:47,50                 createServiceClient()
--   The two reads that use an anon-key client both run with a session, i.e. as
--   `authenticated`, never as `anon`:
--     * src/proxy.ts:306-310  — inside `if (user)`, on the request's own cookie
--     * src/app/login/page.tsx:190-203 — after `signInWithPassword` returned a
--       user, on the browser client
--   RESULT: no anon-key read of `public.profiles` exists. The revoke is safe.
--   (src/app/api/v1/lawyers/[id]/route.ts:14 states the same in its own header.)
--
-- ROLLBACK
--   `grant select, insert, update, delete on public.profiles to anon;` plus
--   re-creating whatever policy is dropped below — but the dropped policy is
--   the defect, so a rollback re-opens UAT-SEC-001.
-- =============================================================================

begin;

alter table public.profiles enable row level security;

-- ── 1. Remove every policy that is not one of the sanctioned three ──────────
do $$
declare
  p record;
begin
  for p in
    select polname
      from pg_policy
     where polrelid = 'public.profiles'::regclass
       and polname not in (
             'users read own profile',
             'admins read all profiles',
             'users update own profile'
           )
     order by polname
  loop
    raise notice '20260921_01: dropping unsanctioned policy on public.profiles: %', p.polname;
    execute format('drop policy %I on public.profiles', p.polname);
  end loop;
end $$;

-- ── 2. Re-create the sanctioned three, scoped to `authenticated` ────────────
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── 3. `anon` has no business reading or writing profiles at all ────────────
revoke select, insert, update, delete on public.profiles from anon;

comment on table public.profiles is
  'Extended user profile. One row per auth.users entry. Readable only by its owner and by admins (public.is_admin()); the anon role has no DML grant. See supabase/migrations/20260921_01_profiles_rls_lockdown.sql.';

-- ── 4. Read-only verification — raises, so the transaction rolls back ───────
do $$
declare
  n_policies      int;
  n_unexpected    int;
  n_always_true   int;
  rls_on          boolean;
  n_anon_grants   int;
begin
  select count(*) into n_policies
    from pg_policy where polrelid = 'public.profiles'::regclass;
  if n_policies <> 3 then
    raise exception '20260921_01 verify: expected exactly 3 policies on public.profiles, found %', n_policies;
  end if;

  select count(*) into n_unexpected
    from pg_policy
   where polrelid = 'public.profiles'::regclass
     and polname not in (
           'users read own profile',
           'admins read all profiles',
           'users update own profile'
         );
  if n_unexpected <> 0 then
    raise exception '20260921_01 verify: % unexpected policy name(s) survived on public.profiles', n_unexpected;
  end if;

  select relrowsecurity into rls_on
    from pg_class where oid = 'public.profiles'::regclass;
  if not coalesce(rls_on, false) then
    raise exception '20260921_01 verify: row level security is not enabled on public.profiles';
  end if;

  select count(*) into n_always_true
    from pg_policy
   where polrelid = 'public.profiles'::regclass
     and (
           btrim(coalesce(pg_get_expr(polqual, polrelid), '')) in ('true', '(true)')
        or btrim(coalesce(pg_get_expr(polwithcheck, polrelid), '')) in ('true', '(true)')
         );
  if n_always_true <> 0 then
    raise exception '20260921_01 verify: % policy on public.profiles still evaluates to TRUE unconditionally', n_always_true;
  end if;

  select count(*) into n_anon_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name   = 'profiles'
     and grantee      = 'anon'
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  if n_anon_grants <> 0 then
    raise exception '20260921_01 verify: anon still holds % DML grant(s) on public.profiles', n_anon_grants;
  end if;

  raise notice '20260921_01 verify: OK — 3 sanctioned policies, RLS on, no anon DML grant';
end $$;

commit;

-- Read-only re-check after applying in staging:
--   select polname, polcmd, polroles::regrole[],
--          pg_get_expr(polqual, polrelid) as using_expr,
--          pg_get_expr(polwithcheck, polrelid) as check_expr
--     from pg_policy where polrelid = 'public.profiles'::regclass order by polname;
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'profiles' order by 1, 2;
