-- grant_plan_atomic.test.sql — proves 20261025_10 (owner-free P2, N4.1: a
-- paid plan's cancel + insert in ONE transaction) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE, with stray EXECUTE grants between the runs (the
-- self-host restore's shape) that the second run must take back. The _verify
-- section is extracted from _verify.sql between its markers and runs before
-- the migration (it must only NOTICE) and after the second run (it must
-- pass). 20261022_32 is in the chain so T6 can refund a grant made by the new
-- function and prove the previous period is restored. From the repo root, in
-- Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_grant_plan_atomic_block.sql
--   sed -n '/^-- >>> verify:grant_plan_atomic/,/^-- <<< verify:grant_plan_atomic/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $R/prelude_payment_refunds.sql \
--     $M/20261022_32_payment_refunds.sql \
--     "$B" \
--     $M/20261025_10_grant_plan_atomic.sql \
--     $R/prelude_grant_plan_atomic_between_runs.sql \
--     $M/20261025_10_grant_plan_atomic.sql \
--     "$B" \
--     $R/grant_plan_atomic.test.sql
-- Why each link: 20260603_phase1_003 … 20261022_30 are the payments chain of
-- payment_refunds.test.sql (subscriptions, the sold plans, the order_id
-- UNIQUE index); prelude_points_lots_fixture.sql also creates the users
-- …e000–e004; prelude_payment_refunds.sql + 20261022_32 the refund functions
-- and the super admin …f001.
--
-- NEGATIVE CONTROL (must FAIL) — the same chain without the two 20261025_10
-- files, the between-runs prelude and the verify blocks:
--   → "T0 FAIL: public.grant_plan_subscription(...) does not exist (20261025_10 not applied)".
--
-- Single session: two concurrent grants cannot be raced here. What serialises
-- them is the per-user pg_advisory_xact_lock taken first in the body (pinned
-- by the migration's verify and the _verify block); T4 proves the stale check
-- that makes a grant computed from an outdated read refuse instead of
-- cancelling what it did not see.
--
-- Actors (from prelude_points_lots_fixture.sql):
--   …e001  T1 same-tier renewal (+ a lapsed row), T2 retry, T6 refund restore
--   …e002  T3 higher tier
--   …e003  T4 stale refusals, then a grant with millisecond ends
--   …e004  T5 forced error after the cancel
-- Every assertion RAISES on failure, except T5's call, which must error and
-- is followed by assertions that do.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)') is null then
    raise exception 'T0 FAIL: public.grant_plan_subscription(...) does not exist (20261025_10 not applied)';
  end if;
  raise notice 'T0 PASS: grant_plan_subscription exists';
end $$;

-- ── fixtures (postgres, RLS bypassed on purpose) ────────────────────────────
insert into public.subscriptions (id, user_id, plan_id, tier, billing_cycle, status, started_at, current_period_start, current_period_end, auto_renew, metadata) values
  -- e001: a running pro (20 days left) and a LAPSED max (status still active)
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000e001', 'lawyer-pro',     'pro', 'monthly', 'active', now() - interval '10 days', now() - interval '10 days', now() + interval '20 days', false, '{}'),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000e001', 'ind-litigation', 'max', 'monthly', 'active', now() - interval '33 days', now() - interval '33 days', now() - interval '3 days',  false, '{}'),
  -- e002: a running ai
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000e002', 'ind-ai',         'ai',  'monthly', 'active', now() - interval '10 days', now() - interval '10 days', now() + interval '20 days', false, '{}'),
  -- e003: a running pro (5 days left)
  ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-00000000e003', 'ind-preventive', 'pro', 'monthly', 'active', now() - interval '25 days', now() - interval '25 days', now() + interval '5 days',  false, '{}'),
  -- e004: a running pro (10 days left)
  ('00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000e004', 'ind-preventive', 'pro', 'monthly', 'active', now() - interval '20 days', now() - interval '20 days', now() + interval '10 days', false, '{}');

-- ── T1 same-tier renewal: the remaining days carry over (as service_role) ───
set role service_role;
do $$
declare
  t      timestamptz := now();
  p1_end timestamptz;
  res    jsonb;
  s      public.subscriptions%rowtype;
begin
  select current_period_end into p1_end from public.subscriptions where id = '00000000-0000-0000-0000-00000000c101';
  -- what grantPlan sends: window.start = the running pro's end (same rank),
  -- window.end = start + 1 month, p_running = window.running (the lapsed max
  -- is not running, so it is not listed)
  res := public.grant_plan_subscription(
    '00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000e001',
    'lawyer-pro', 'pro', 'monthly', p1_end, p1_end + interval '1 month', 'pm-1', t,
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c101', 'tier', 'pro', 'current_period_end', p1_end)));
  if (res ->> 'inserted')::boolean is not true then
    raise exception 'T1 FAIL: expected inserted = true, got %', res;
  end if;
  select * into s from public.subscriptions where id = (res ->> 'subscription_id')::uuid;
  if s.id is null or s.user_id <> '00000000-0000-0000-0000-00000000e001' or s.plan_id <> 'lawyer-pro' or s.tier <> 'pro'
     or s.billing_cycle <> 'monthly' or s.status <> 'active' or s.started_at <> t
     or s.current_period_start <> p1_end or s.current_period_end <> p1_end + interval '1 month'
     or s.auto_renew or s.payment_method_id is distinct from 'pm-1' or s.cancelled_at is not null then
    raise exception 'T1 FAIL: the paid row is not what grantPlan used to insert: %', row_to_json(s);
  end if;
  if s.metadata <> jsonb_build_object('order_id', '00000000-0000-0000-0000-00000000d101', 'method', 'moyasar',
                                      'replaced_ids', jsonb_build_array('00000000-0000-0000-0000-00000000c101')) then
    raise exception 'T1 FAIL: metadata %', s.metadata;
  end if;
  if (res ->> 'current_period_end')::timestamptz <> p1_end + interval '1 month' then
    raise exception 'T1 FAIL: returned period end %', res;
  end if;
  if exists (select 1 from public.subscriptions where id in ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102')
                and (status <> 'cancelled' or cancelled_at <> t or updated_at <> t)) then
    raise exception 'T1 FAIL: the running and the lapsed rows must both be cancelled at p_now';
  end if;
  raise notice 'T1 PASS: same-tier renewal starts at the old end (days carried over), old + lapsed rows cancelled at p_now, replaced_ids = the running row only';
end $$;

-- ── T2 a retry of the same order touches nothing ────────────────────────────
do $$
declare
  res   jsonb;
  first uuid;
  n     int;
begin
  select id into first from public.subscriptions where metadata ->> 'order_id' = '00000000-0000-0000-0000-00000000d101';
  -- even with an outdated p_running: the order's row is found first
  res := public.grant_plan_subscription(
    '00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000e001',
    'lawyer-pro', 'pro', 'monthly', now(), now() + interval '1 month', null, now(), '[]'::jsonb);
  if (res ->> 'inserted')::boolean is not false or (res ->> 'subscription_id')::uuid <> first then
    raise exception 'T2 FAIL: a retry must answer inserted = false with the existing row, got %', res;
  end if;
  select count(*) into n from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000e001';
  if n <> 3 then raise exception 'T2 FAIL: % rows for e001 (expected 3)', n; end if;
  if (select status from public.subscriptions where id = first) <> 'active'
     or (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000c101') <> 'cancelled' then
    raise exception 'T2 FAIL: a retry changed a status';
  end if;
  raise notice 'T2 PASS: a retry of the order answers inserted = false and writes nothing';
end $$;

-- ── T3 a higher tier starts now ─────────────────────────────────────────────
do $$
declare
  t   timestamptz := now();
  a1_end timestamptz;
  res jsonb;
  s   public.subscriptions%rowtype;
begin
  select current_period_end into a1_end from public.subscriptions where id = '00000000-0000-0000-0000-00000000c201';
  res := public.grant_plan_subscription(
    '00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000e002',
    'ind-preventive', 'pro', 'yearly', t, t + interval '1 year', null, t,
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c201', 'tier', 'ai', 'current_period_end', a1_end)));
  select * into s from public.subscriptions where id = (res ->> 'subscription_id')::uuid;
  if (res ->> 'inserted')::boolean is not true or s.current_period_start <> t or s.current_period_end <> t + interval '1 year'
     or s.billing_cycle <> 'yearly' or s.tier <> 'pro' then
    raise exception 'T3 FAIL: %', row_to_json(s);
  end if;
  if (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000c201') <> 'cancelled' then
    raise exception 'T3 FAIL: the replaced ai row is still active';
  end if;
  raise notice 'T3 PASS: an upgrade starts at p_now and cancels the lower tier';
end $$;

-- ── T4 a grant computed from an outdated read refuses (40001) ───────────────
do $$
declare
  s1_end timestamptz;
  cases  jsonb[];
  c      jsonb;
  res    jsonb;
begin
  select current_period_end into s1_end from public.subscriptions where id = '00000000-0000-0000-0000-00000000c301';
  cases := array[
    '[]'::jsonb,                                                                                  -- the row was not seen
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c301', 'tier', 'pro', 'current_period_end', s1_end + interval '1 day')), -- its end moved
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c301', 'tier', 'ai',  'current_period_end', s1_end)),                    -- its tier changed
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c301', 'tier', 'pro', 'current_period_end', s1_end),
                      jsonb_build_object('id', '00000000-0000-0000-0000-00000000c3ff', 'tier', 'pro', 'current_period_end', s1_end))                     -- a row that is gone
  ];
  foreach c in array cases loop
    begin
      perform public.grant_plan_subscription(
        '00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000e003',
        'ind-preventive', 'pro', 'monthly', s1_end, s1_end + interval '1 month', null, now(), c);
      raise exception 'T4 FAIL: a stale p_running was accepted: %', c;
    exception when serialization_failure then
      null;
    end;
  end loop;
  if (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000c301') <> 'active'
     or exists (select 1 from public.subscriptions where metadata ->> 'order_id' = '00000000-0000-0000-0000-00000000d301') then
    raise exception 'T4 FAIL: a refused grant wrote something';
  end if;
  -- JavaScript reads the end at millisecond precision: that must NOT be stale
  res := public.grant_plan_subscription(
    '00000000-0000-0000-0000-00000000d301', '00000000-0000-0000-0000-00000000e003',
    'ind-preventive', 'pro', 'monthly', s1_end, s1_end + interval '1 month', null, now(),
    jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-00000000c301', 'tier', 'pro',
                                         'current_period_end', to_char(s1_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))));
  if (res ->> 'inserted')::boolean is not true then
    raise exception 'T4 FAIL: a millisecond-precision end was treated as stale: %', res;
  end if;
  raise notice 'T4 PASS: unseen / moved / re-tiered / vanished running rows → 40001, nothing written; millisecond ends match';
end $$;
reset role;

-- ── T5 a forced error AFTER the cancel rolls the cancel back ────────────────
-- The insert of order …d401 is made to fail (a NOT VALID CHECK applies to new
-- rows only) and a row trigger shows the cancel did run first. The call is a
-- TOP-LEVEL statement, not wrapped in an exception block (which would roll
-- back on its own and prove nothing about the function).
alter table public.subscriptions add constraint test_grant_insert_failure
  check (metadata ->> 'order_id' is distinct from '00000000-0000-0000-0000-00000000d401') not valid;
create function public.test_trace_cancel() returns trigger language plpgsql as $$
begin
  raise notice 'T5 trace: the cancel ran on % (% → %) before the insert', old.id, old.status, new.status;
  return new;
end $$;
create trigger test_trace_cancel after update on public.subscriptions
  for each row when (old.user_id = '00000000-0000-0000-0000-00000000e004') execute function public.test_trace_cancel();

\echo 'T5: the ERROR below (test_grant_insert_failure) is EXPECTED'
\set ON_ERROR_STOP 0
set role service_role;
select public.grant_plan_subscription(
  '00000000-0000-0000-0000-00000000d401', '00000000-0000-0000-0000-00000000e004',
  'ind-preventive', 'pro', 'monthly',
  (select current_period_end from public.subscriptions where id = '00000000-0000-0000-0000-00000000c401'),
  (select current_period_end + interval '1 month' from public.subscriptions where id = '00000000-0000-0000-0000-00000000c401'),
  null, now(),
  (select jsonb_build_array(jsonb_build_object('id', id, 'tier', tier, 'current_period_end', current_period_end))
     from public.subscriptions where id = '00000000-0000-0000-0000-00000000c401'));
\set ON_ERROR_STOP 1
reset role;

do $$
begin
  if (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000c401') <> 'active'
     or (select cancelled_at from public.subscriptions where id = '00000000-0000-0000-0000-00000000c401') is not null then
    raise exception 'T5 FAIL: the previous plan was left cancelled after the failed insert';
  end if;
  if exists (select 1 from public.subscriptions where metadata ->> 'order_id' = '00000000-0000-0000-0000-00000000d401') then
    raise exception 'T5 FAIL: the failed order has a row';
  end if;
  raise notice 'T5 PASS: an error after the cancel rolled everything back — the previous plan is still active';
end $$;
drop trigger test_trace_cancel on public.subscriptions;
drop function public.test_trace_cancel();
alter table public.subscriptions drop constraint test_grant_insert_failure;

-- ── T6 refunding a renewal made by the new function restores the old period ─
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, live, fulfilled_at) values
  ('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000e001', 'plan', 'lawyer-pro', 'monthly', 39900, 5985, 45885, 'exclusive', 'paid', false, now());
set role service_role;
do $$
declare
  job jsonb;
  res jsonb;
begin
  job := public.claim_payment_refund('00000000-0000-0000-0000-00000000d101', '00000000-0000-0000-0000-00000000f001', 'refund');
  if job is null then raise exception 'T6 FAIL: the refund could not be claimed'; end if;
  res := public.finish_payment_refund('00000000-0000-0000-0000-00000000d101', job ->> 'token', 'refund');
  if (select status from public.subscriptions where metadata ->> 'order_id' = '00000000-0000-0000-0000-00000000d101') <> 'cancelled' then
    raise exception 'T6 FAIL: the refunded row is still active';
  end if;
  if (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000c101') <> 'active'
     or (select cancelled_at from public.subscriptions where id = '00000000-0000-0000-0000-00000000c101') is not null then
    raise exception 'T6 FAIL: the previous paid period was not restored (cancelled_at must equal the refunded row''s started_at)';
  end if;
  if (select status from public.subscriptions where id = '00000000-0000-0000-0000-00000000c102') <> 'cancelled' then
    raise exception 'T6 FAIL: the lapsed row came back';
  end if;
  if res ->> 'tier' <> 'pro' then raise exception 'T6 FAIL: tier after refund %', res; end if;
  raise notice 'T6 PASS: refunding the renewal restores the previous pro period (replaced_ids + cancelled_at = started_at), not the lapsed row';
end $$;
reset role;

-- ── T7 sessions cannot EXECUTE (the second run took the stray grants back) ──
do $$
declare
  fn constant text := 'public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)';
  r  text;
begin
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception 'T7 FAIL: % can EXECUTE the grant after the second run', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'T7 FAIL: service_role cannot EXECUTE the grant';
  end if;
end $$;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000e000', false);
do $$
begin
  perform public.grant_plan_subscription(
    '00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000e000',
    'firm-enterprise', 'enterprise', 'yearly', now(), now() + interval '1 year', null, now(), '[]'::jsonb);
  raise exception 'T7 FAIL: authenticated executed the grant';
exception when insufficient_privilege then
  null;
end $$;
reset role;
set role anon;
do $$
begin
  perform public.grant_plan_subscription(
    '00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000e000',
    'firm-enterprise', 'enterprise', 'yearly', now(), now() + interval '1 year', null, now(), '[]'::jsonb);
  raise exception 'T7 FAIL: anon executed the grant';
exception when insufficient_privilege then
  null;
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000e000') then
    raise exception 'T7 FAIL: a session call wrote a subscription';
  end if;
  raise notice 'T7 PASS: anon / authenticated / PUBLIC cannot EXECUTE (stray grants revoked by the re-run); service_role can';
end $$;

do $$ begin raise notice 'grant_plan_atomic: T0-T7 PASS'; end $$;
