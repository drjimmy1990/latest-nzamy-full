-- RLS acceptance test for 20260921_02_subscriptions_write_revoke.sql — UAT-SUB-001.
--
-- CHAIN (run.sh / run-local.sh, in this order):
--   supabase/migrations/20260603_phase1_003_subscriptions_billing.sql  ← the mint/upgrade primitives
--   supabase/migrations/20260906_fix_subscriptions_rls_security.sql    ← drops the two write policies
--   supabase/migrations/20260921_02_subscriptions_write_revoke.sql     ← + the missing REVOKEs
--   supabase/tests/rls/subscriptions_write_guard.test.sql              ← this file
-- (stubs.sql supplies auth.users, public.profiles and public.service_requests.)
--
-- Actors: A aaaaaaaa-…001, B bbbbbbbb-…002 — each with one `free` subscription.
--
-- WHY app_user's DIRECT grants are revoked below: stubs.sql gives app_user
-- `grant all on all tables`, but on the live database a signed-in PostgREST
-- request holds privileges only through the `authenticated` role. Removing the
-- direct grant makes app_user's privilege set the live one, so the REVOKE half
-- of the migration is what is actually under test (the policy half is proven
-- anyway: with no INSERT/UPDATE policy the write fails even when granted).
--
-- No `\set ON_ERROR_STOP 0`: every `raise exception` below fails the run.
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (RLS bypassed on purpose) ─────────────────────────
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','individual','B');
insert into public.subscription_plans (id, tier, audience, name_ar) values
  ('plan-free','free','lawyer','الباقة المجانية'),
  ('plan-max','max','lawyer','الباقة القصوى');
insert into public.subscriptions (id, user_id, plan_id, tier) values
  ('11111111-0000-0000-0000-0000000000a1','aaaaaaaa-0000-0000-0000-000000000001','plan-free','free'),
  ('22222222-0000-0000-0000-0000000000b2','bbbbbbbb-0000-0000-0000-000000000002','plan-free','free');
insert into public.credit_transactions (user_id, amount, kind, balance_after) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 10, 'purchase', 10);

-- Make app_user's privileges on these two tables come ONLY through
-- `authenticated`, exactly as they do for a signed-in PostgREST request.
revoke all on public.subscriptions       from app_user;
revoke all on public.credit_transactions from app_user;

select 'T0 SELECT grants for authenticated+anon on subscriptions+credit_transactions (expect 4 — reads survive): '
       || count(*)
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('subscriptions','credit_transactions')
   and grantee in ('authenticated','anon')
   and privilege_type = 'SELECT';

-- ── from here on: app_user (a member of `authenticated`), RLS enforced ─────
set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- T1 — A cannot mint a subscription
do $$
begin
  insert into public.subscriptions (user_id, plan_id, tier)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'plan-max', 'max');
  raise exception 'T1 FAIL: A minted a subscription row — UAT-SUB-001 is open';
exception
  when insufficient_privilege then
    raise notice 'T1 PASS: A''s INSERT into public.subscriptions refused (42501)';
end $$;

-- T2 — A cannot upgrade their own tier (the exact UAT-SUB-001 PATCH)
do $$
declare n int;
begin
  update public.subscriptions set tier = 'max', plan_id = 'plan-max'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'T2 FAIL: A upgraded % subscription row(s) to max', n;
  end if;
  raise notice 'T2 PASS: A''s UPDATE … set tier=''max'' touched 0 rows';
exception
  when insufficient_privilege then
    raise notice 'T2 PASS: A''s UPDATE … set tier=''max'' refused (42501)';
end $$;

-- T3 — A cannot delete it either
do $$
declare n int;
begin
  delete from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'T3 FAIL: A deleted % subscription row(s)', n;
  end if;
  raise notice 'T3 PASS: A''s DELETE touched 0 rows';
exception
  when insufficient_privilege then
    raise notice 'T3 PASS: A''s DELETE refused (42501)';
end $$;

-- T4 — reading own is untouched; reading B's is still impossible
select 'T4 A reads own subscription (expect 1): ' || count(*) from public.subscriptions;
select 'T4 A''s tier is unchanged (expect free): ' || tier
  from public.subscriptions where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T4 B reads own subscription (expect 1): ' || count(*) from public.subscriptions;
do $$
declare n int;
begin
  select count(*) into n from public.subscriptions
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if n <> 0 then
    raise exception 'T4 FAIL: B sees % of A''s subscription rows', n;
  end if;
  raise notice 'T4 PASS: B sees none of A''s subscriptions';
end $$;

-- T5 — the credit ledger carries the same primitive and is closed the same way
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
begin
  insert into public.credit_transactions (user_id, amount, kind, balance_after)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 1000, 'promo', 1010);
  raise exception 'T5 FAIL: A minted credits in public.credit_transactions';
exception
  when insufficient_privilege then
    raise notice 'T5 PASS: A''s INSERT into public.credit_transactions refused (42501)';
end $$;
select 'T5 A still reads own ledger (expect 1): ' || count(*) from public.credit_transactions;

-- ── footer ─────────────────────────────────────────────────────────────────
reset role;
select 'subscriptions policies: ' || coalesce(string_agg(polname || '[' || polcmd::text || ']', ' · ' order by polname), '(none)')
  from pg_policy where polrelid = 'public.subscriptions'::regclass;
select 'credit_transactions policies: ' || coalesce(string_agg(polname || '[' || polcmd::text || ']', ' · ' order by polname), '(none)')
  from pg_policy where polrelid = 'public.credit_transactions'::regclass;
select 'INSERT/UPDATE/DELETE grants for authenticated+anon (expect 0): ' || count(*)
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('subscriptions','credit_transactions')
   and grantee in ('authenticated','anon')
   and privilege_type in ('INSERT','UPDATE','DELETE');
