-- test_accounts_never_listed.test.sql — proves 20261017_44 (owner decision ١١٥).
--
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $R/prelude_test_accounts_emails.sql \
--     $M/20261017_44_test_accounts_never_listed.sql \
--     $M/20261017_44_test_accounts_never_listed.sql \
--     $R/test_accounts_never_listed.test.sql
--
-- NEGATIVE CONTROL: without the two 20261017_44 lines it fails at T1 (no
-- registry), and the six fixture lawyers — four of them test accounts — are
-- all listed to anon. Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

do $$
declare n int; ids text;
begin
  if to_regclass('public.test_accounts') is null then
    raise exception 'T1 FAIL: public.test_accounts does not exist — 20261017_44 not applied';
  end if;
  select string_agg(user_id::text, ',' order by user_id) into ids from public.test_accounts
   where user_id <> 'a0000000-0000-0000-0000-0000000000a3';  -- the provider arm, checked in T7
  if ids is distinct from 'a0000000-0000-0000-0000-000000000003,a0000000-0000-0000-0000-0000000000a1,a0000000-0000-0000-0000-0000000000a2' then
    raise exception 'T1 FAIL: registry is % (expect lawyer3, lawyer-solo, the @nzamy.test account — not lawyer11, not staff@, not the real lawyer)', ids;
  end if;
  raise notice 'T1 PASS: the backfill registered exactly the seed and UAT accounts (exact e-mails, case-insensitive)';

  select count(*) into n from public.lawyer_profiles where marketplace_visible;
  if n <> 3 then
    raise exception 'T2 FAIL: % lawyers still listed (expect 3: lawyer11, staff, the real lawyer)', n;
  end if;
  raise notice 'T2 PASS: the three registered test lawyers were un-listed; the others kept their listing';
end $$;

-- T3 the public read (anon REST "public read verified lawyers") lists no test account
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.lawyer_profiles;
  if n <> 3 then raise exception 'T3 FAIL: anon reads % lawyers (expect 3)', n; end if;
  select count(*) into n from public.lawyer_profiles
   where user_id in ('a0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a2');
  if n <> 0 then raise exception 'T3 FAIL: anon reads % test account(s)', n; end if;
  begin
    perform 1 from public.test_accounts limit 1;
    raise exception 'T3 FAIL: anon can read public.test_accounts';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: anon lists the 3 real lawyers only and cannot read the registry';
end $$;
reset role;

-- T4 a test lawyer re-listing themselves stays un-listed
set role authenticated;
select set_config('test.uid', 'a0000000-0000-0000-0000-000000000003', false);
do $$
declare n int; v boolean;
begin
  update public.lawyer_profiles set marketplace_visible = true, bio_ar = 'نبذة'
   where user_id = 'a0000000-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T4 setup: the own-row update matched % rows', n; end if;
  select marketplace_visible into v from public.lawyer_profiles where user_id = 'a0000000-0000-0000-0000-000000000003';
  if v then raise exception 'T4 FAIL: a test lawyer re-listed themselves'; end if;
  begin
    perform 1 from public.test_accounts limit 1;
    raise exception 'T4 FAIL: authenticated can read public.test_accounts';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 PASS: the test lawyer''s own update keeps it un-listed (other columns still save); the registry is unreadable';
end $$;
reset role;

-- T5 nor can the service role / an admin script list one
do $$
declare v boolean;
begin
  update public.lawyer_profiles set marketplace_visible = true where user_id = 'a0000000-0000-0000-0000-0000000000a2';
  select marketplace_visible into v from public.lawyer_profiles where user_id = 'a0000000-0000-0000-0000-0000000000a2';
  if v then raise exception 'T5 FAIL: a privileged write listed a test account'; end if;
  raise notice 'T5 PASS: the rule holds for privileged writers too';
end $$;

-- T6 registering an account later un-lists it on its next write; a real lawyer is untouched
do $$
declare v boolean;
begin
  insert into public.test_accounts (user_id, source) values ('a0000000-0000-0000-0000-000000000011', 'manual');
  update public.lawyer_profiles set years_experience = 3 where user_id = 'a0000000-0000-0000-0000-000000000011';
  select marketplace_visible into v from public.lawyer_profiles where user_id = 'a0000000-0000-0000-0000-000000000011';
  if v then raise exception 'T6 FAIL: a newly registered test account stayed listed'; end if;
  update public.lawyer_profiles set years_experience = 9 where user_id = 'a0000000-0000-0000-0000-0000000000b2';
  select marketplace_visible into v from public.lawyer_profiles where user_id = 'a0000000-0000-0000-0000-0000000000b2';
  if not v then raise exception 'T6 FAIL: a real lawyer was un-listed'; end if;
  raise notice 'T6 PASS: a later registration un-lists on the next write; a real lawyer keeps the listing';
end $$;

-- T7 the provider directory follows the same rule (when the chain has it)
do $$
declare v boolean; real_listed boolean;
begin
  if to_regclass('public.provider_profiles') is null then
    raise notice 'T7 skipped — chain without prelude_provider_profiles_live.sql';
    return;
  end if;
  select marketplace_visible into v from public.provider_profiles where user_id = 'a0000000-0000-0000-0000-0000000000a3';
  if v is distinct from false then raise exception 'T7 FAIL: the provider-notary test account is still listed (%)', v; end if;
  select marketplace_visible into real_listed from public.provider_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
  if real_listed is distinct from true then raise exception 'T7 FAIL: the real notary was un-listed'; end if;
  update public.provider_profiles set marketplace_visible = true where user_id = 'a0000000-0000-0000-0000-0000000000a3';
  select marketplace_visible into v from public.provider_profiles where user_id = 'a0000000-0000-0000-0000-0000000000a3';
  if v then raise exception 'T7 FAIL: the provider test account was re-listed'; end if;
  raise notice 'T7 PASS: the provider-notary test account is un-listed and stays so; the real notary keeps the listing';
end $$;

select 'test_accounts_never_listed: ALL PASS';
