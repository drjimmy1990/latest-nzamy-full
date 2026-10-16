-- =============================================================================
-- Migration: 20261017_44_test_accounts_never_listed.sql
-- Owner decision ١١٥ (answers of 2026-10-06): «وضع الديمو: استقلاله التام عن
-- بيئة الإنتاج لمنع تسرب بيانات الاختبار للجمهور».
-- Plan: docs/plans/2026-10-16-fix-and-build-plan.md §3 row ١١٥.
-- =============================================================================
--
-- THE LEAK THIS CLOSES
--   The production database carries test accounts on purpose — the owner and
--   the team test the live site with them:
--     * scripts/seed-test-lawyers.mjs        lawyer1…lawyer10@nezamy.sa, written
--       `verification_status = 'verified'` AND `marketplace_visible = true`
--       (scripts/seed-test-lawyers.mjs:287-296), with realistic Arabic names;
--     * scripts/seed-clean-test-accounts.mjs the 12 role accounts …@nezamy.sa,
--       two of them `marketplace_visible = true` (lawyer-solo, provider-notary);
--     * the UAT kit (scripts/uat/*)          …@nzamy.test.
--   Every public lawyer surface is keyed on exactly those two columns: the
--   public directory API (api/v1/lawyers/route.ts:83), a lawyer's public page
--   (lawyers/[slug]/layout.tsx:179, api/v1/lawyers/[id]/route.ts:205), the
--   community «أكثر المجيبين» widget (api/v1/community/contributors/route.ts:72),
--   the answer badges (community/posts/[id]/route.ts:105), public reviews
--   (api/v1/reviews/route.ts:185), and anon REST through "public read verified
--   lawyers". So ten fabricated lawyers were one request away from the public,
--   and became visible the day the beta flag lifts.
--
-- WHAT THIS FILE DOES
--   1. public.test_accounts — a server-only registry of the accounts that exist
--      for testing. RLS on with NO policy, no privilege for anon/authenticated:
--      only the service role (the seed scripts, admin tooling) reads or writes it.
--   2. Backfill from the exact e-mails the two seed scripts create, plus every
--      …@nzamy.test account. Exact addresses, not the @nezamy.sa domain: staff
--      mail lives on that domain too.
--   3. A BEFORE INSERT OR UPDATE trigger on lawyer_profiles / provider_profiles
--      that forces `marketplace_visible = false` for a registered account. One
--      rule at the source, so every surface above — present and future — stops
--      listing a test account without a code change in any of them. A test
--      account keeps everything else (sign-in, dashboards, orders, verification).
--   4. A one-time UPDATE that un-lists the registered accounts already listed.
--
-- NOT CHANGED: no policy, no column, no account is deleted (the 146-account UAT
-- teardown stays the separate scripts/uat/teardown-actors.ps1 decision).
--
-- IDEMPOTENT: create … if not exists / on conflict do nothing / create or
-- replace / drop trigger if exists. Docker proof:
-- supabase/tests/rls/test_accounts_never_listed.test.sql.
--
-- ROLLBACK (manual): drop the two triggers and the function; the registry can
-- stay (it grants nothing). Re-listing a test account is then a manual UPDATE.
-- =============================================================================

begin;

-- ── 1. The registry ──────────────────────────────────────────────────────────
create table if not exists public.test_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  source     text not null default 'manual',
  created_at timestamptz not null default now()
);

comment on table public.test_accounts is
  'حسابات الاختبار (قرار المالك ١١٥): لا تُعرض في أي قائمة عامة. يُكتب ويُقرأ بمفتاح الخدمة فقط.';

alter table public.test_accounts enable row level security;

revoke all on public.test_accounts from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.test_accounts from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.test_accounts from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.test_accounts to service_role;
  end if;
end $$;


-- ── 2. Backfill (only where auth.users carries e-mail — always on Supabase) ──
do $$
declare
  n int;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    raise notice '20261017_44: auth.users has no email column here — backfill skipped';
    return;
  end if;

  insert into public.test_accounts (user_id, source)
  select u.id,
         case when lower(u.email) like '%@nzamy.test' then 'uat'
              when lower(u.email) ~ '^lawyer([1-9]|10)@nezamy\.sa$' then 'seed-test-lawyers'
              else 'seed-clean-test-accounts' end
    from auth.users u
   where lower(u.email) like '%@nzamy.test'
      or lower(u.email) ~ '^lawyer([1-9]|10)@nezamy\.sa$'
      or lower(u.email) in (
           'admin@nezamy.sa', 'client-free@nezamy.sa', 'client-pro@nezamy.sa',
           'lawyer-solo@nezamy.sa', 'firm-owner@nezamy.sa', 'firm-lawyer@nezamy.sa',
           'corp-owner@nezamy.sa', 'corp-legal@nezamy.sa', 'micro-owner@nezamy.sa',
           'provider-notary@nezamy.sa', 'gov-counsel@nezamy.sa', 'ngo-director@nezamy.sa')
  on conflict (user_id) do nothing;
  get diagnostics n = row_count;
  raise notice '20261017_44: % test account(s) newly registered', n;
end $$;


-- ── 3. The rule at the source ────────────────────────────────────────────────
create or replace function public.test_account_never_listed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if new.marketplace_visible is true
     and exists (select 1 from public.test_accounts t where t.user_id = new.user_id) then
    new.marketplace_visible := false;
  end if;
  return new;
end
$fn$;

comment on function public.test_account_never_listed() is
  'Owner ١١٥: a registered test account (public.test_accounts) is never marketplace-visible, whoever writes the row.';

revoke all on function public.test_account_never_listed() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.test_account_never_listed() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.test_account_never_listed() from authenticated;
  end if;
end $$;

do $$
declare
  t text;
  n int;
begin
  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    if to_regclass('public.' || t) is null
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'marketplace_visible')
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = t and column_name = 'user_id') then
      raise notice '20261017_44: public.% has no (user_id, marketplace_visible) here — skipped', t;
      continue;
    end if;
    execute format('drop trigger if exists trg_%s_test_account_never_listed on public.%I', t, t);
    execute format(
      'create trigger trg_%s_test_account_never_listed before insert or update on public.%I '
      'for each row execute function public.test_account_never_listed()', t, t);

    -- ── 4. Un-list the ones already listed (the trigger does the work) ──────
    execute format(
      'update public.%I p set marketplace_visible = false
        where p.marketplace_visible is true
          and exists (select 1 from public.test_accounts ta where ta.user_id = p.user_id)', t);
    get diagnostics n = row_count;
    raise notice '20261017_44: % registered test account(s) un-listed on public.%', n, t;
  end loop;
end $$;


-- ── 5. Verify (raises) ───────────────────────────────────────────────────────
do $$
declare
  t    text;
  n    int;
  priv text;
begin
  if to_regclass('public.test_accounts') is null then
    raise exception '20261017_44 verify: public.test_accounts was not created';
  end if;
  if not exists (select 1 from pg_class where oid = 'public.test_accounts'::regclass and relrowsecurity) then
    raise exception '20261017_44 verify: RLS is off on public.test_accounts';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.test_accounts'::regclass) then
    raise exception '20261017_44 verify: public.test_accounts has a policy — it must be service-role only';
  end if;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
    if (exists (select 1 from pg_roles where rolname = 'anon') and has_table_privilege('anon', 'public.test_accounts', priv))
       or (exists (select 1 from pg_roles where rolname = 'authenticated') and has_table_privilege('authenticated', 'public.test_accounts', priv)) then
      raise exception '20261017_44 verify: an API role holds % on public.test_accounts', priv;
    end if;
  end loop;

  foreach t in array array['lawyer_profiles', 'provider_profiles'] loop
    continue when to_regclass('public.' || t) is null
              or not exists (select 1 from information_schema.columns
                              where table_schema = 'public' and table_name = t and column_name = 'marketplace_visible');
    if not exists (select 1 from pg_trigger
                    where tgrelid = ('public.' || t)::regclass
                      and tgname = 'trg_' || t || '_test_account_never_listed' and not tgisinternal) then
      raise exception '20261017_44 verify: public.% has no test-account trigger', t;
    end if;
    execute format(
      'select count(*) from public.%I p where p.marketplace_visible is true
          and exists (select 1 from public.test_accounts ta where ta.user_id = p.user_id)', t) into n;
    if n <> 0 then
      raise exception '20261017_44 verify: % registered test account(s) still listed on public.%', n, t;
    end if;
  end loop;

  raise notice '20261017_44 verify: OK — test accounts registered server-only and never marketplace-visible';
end $$;

commit;
