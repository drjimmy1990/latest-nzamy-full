-- firm_member_points_1108.test.sql — proves 20261108_30
-- (public.firm_member_points_usage, owner answer ٤٤٤ part 2).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_30_firm_member_points_usage.sql \
--     $M/20261108_30_firm_member_points_usage.sql \
--     $R/firm_member_points_1108.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261108_30
-- files → "T0 FAIL: firm_member_points_usage does not exist".
--
-- Actors: O …f001 firm owner (firm F1), P …f002 active managing_partner of F1,
--         L …f003 active lawyer of F1, R …f004 REMOVED lawyer of F1,
--         X …f005 outsider, Q …f006 owner of another firm F2.
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regprocedure('public.firm_member_points_usage(uuid)') is null then
    raise exception 'T0 FAIL: firm_member_points_usage does not exist (20261108_30 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000f001'), ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003'), ('00000000-0000-0000-0000-00000000f004'),
  ('00000000-0000-0000-0000-00000000f005'), ('00000000-0000-0000-0000-00000000f006');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000f001', 'firm', 'مكتب الاختبار'),
  ('00000000-0000-0000-0000-00000000f002', 'lawyer', 'الشريك'),
  ('00000000-0000-0000-0000-00000000f003', 'lawyer', 'المحامي'),
  ('00000000-0000-0000-0000-00000000f004', 'lawyer', 'المغادر'),
  ('00000000-0000-0000-0000-00000000f005', 'lawyer', 'الغريب'),
  ('00000000-0000-0000-0000-00000000f006', 'firm', 'مكتب آخر');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('00000000-0000-0000-0000-0000000ff001', '00000000-0000-0000-0000-00000000f001', 'F1'),
  ('00000000-0000-0000-0000-0000000ff002', '00000000-0000-0000-0000-00000000f006', 'F2');
-- joined 60 days ago, except L who joined 20 days ago (rows before that are pre-join)
insert into public.firm_members (firm_id, user_id, role, status, accepted_at, created_at) values
  ('00000000-0000-0000-0000-0000000ff001', '00000000-0000-0000-0000-00000000f001', 'managing_partner', 'active',  now() - interval '60 days', now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000ff001', '00000000-0000-0000-0000-00000000f002', 'managing_partner', 'active',  now() - interval '60 days', now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000ff001', '00000000-0000-0000-0000-00000000f003', 'lawyer',           'active',  now() - interval '20 days', now() - interval '25 days'),
  ('00000000-0000-0000-0000-0000000ff001', '00000000-0000-0000-0000-00000000f004', 'lawyer',           'removed', now() - interval '60 days', now() - interval '60 days'),
  ('00000000-0000-0000-0000-0000000ff002', '00000000-0000-0000-0000-00000000f006', 'managing_partner', 'active',  now() - interval '60 days', now() - interval '60 days');

-- one lot per user, plenty of points (balances are not under test)
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000f001', 'grant', 1000, 1000, now() + interval '1 year'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-00000000f002', 'grant', 1000, 1000, now() + interval '1 year'),
  ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-00000000f003', 'grant', 1000, 1000, now() + interval '1 year'),
  ('00000000-0000-0000-0000-0000000c0004', '00000000-0000-0000-0000-00000000f004', 'grant', 1000, 1000, now() + interval '1 year');

-- The month boundary: "this month" = since the start of the Riyadh month.
-- A row stamped one second after it is this month; one second before it is not.
create temp table t_bounds as
  select (date_trunc('month', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh' as m0;
grant select on t_bounds to app_user;

insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref, created_at)
select u, lot, d, r, 'quick-answer', 'ai_run:x', ts from (values
  -- O (owner): 20 this month, 30 last month (before m0 but after joining), refund +5 this month
  ('00000000-0000-0000-0000-00000000f001'::uuid, '00000000-0000-0000-0000-0000000c0001'::uuid, -20, 'usage',        (select m0 from t_bounds) + interval '1 second'),
  ('00000000-0000-0000-0000-00000000f001'::uuid, '00000000-0000-0000-0000-0000000c0001'::uuid, -30, 'usage',        (select m0 from t_bounds) - interval '1 second'),
  ('00000000-0000-0000-0000-00000000f001'::uuid, '00000000-0000-0000-0000-0000000c0001'::uuid,   5, 'usage_refund', (select m0 from t_bounds) + interval '2 seconds'),
  -- O: NOT consumption — expiry, admin adjustment, credit
  ('00000000-0000-0000-0000-00000000f001'::uuid, '00000000-0000-0000-0000-0000000c0001'::uuid, -99, 'expiry',           now()),
  ('00000000-0000-0000-0000-00000000f001'::uuid, '00000000-0000-0000-0000-0000000c0001'::uuid, -77, 'admin_adjustment', now()),
  ('00000000-0000-0000-0000-00000000f001'::uuid, '00000000-0000-0000-0000-0000000c0001'::uuid, 500, 'credit',           now()),
  -- P: 7 now
  ('00000000-0000-0000-0000-00000000f002'::uuid, '00000000-0000-0000-0000-0000000c0002'::uuid,  -7, 'usage', now()),
  -- L: 40 BEFORE joining (21 days ago), 11 after joining (now)
  ('00000000-0000-0000-0000-00000000f003'::uuid, '00000000-0000-0000-0000-0000000c0003'::uuid, -40, 'usage', now() - interval '21 days'),
  ('00000000-0000-0000-0000-00000000f003'::uuid, '00000000-0000-0000-0000-0000000c0003'::uuid, -11, 'usage', now()),
  -- R (removed): 50 — must never appear
  ('00000000-0000-0000-0000-00000000f004'::uuid, '00000000-0000-0000-0000-0000000c0004'::uuid, -50, 'usage', now())
) v(u, lot, d, r, ts);

-- T1 anon cannot execute; authenticated can
do $$
begin
  if has_function_privilege('anon', 'public.firm_member_points_usage(uuid)', 'EXECUTE') then
    raise exception 'T1 FAIL: anon can EXECUTE firm_member_points_usage';
  end if;
  if not has_function_privilege('authenticated', 'public.firm_member_points_usage(uuid)', 'EXECUTE') then
    raise exception 'T1 FAIL: authenticated cannot EXECUTE firm_member_points_usage';
  end if;
end $$;

-- T2 the owner sees the aggregates of ACTIVE members only, netted, since joining
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000f001', false);
do $$
declare
  r record;
  n int;
  this_month_has_prev boolean;
begin
  select count(*) into n from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  if n <> 3 then
    raise exception 'T2 FAIL: owner expected 3 active members (O, P, L), got %', n;
  end if;
  if exists (select 1 from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001')
              where user_id = '00000000-0000-0000-0000-00000000f004') then
    raise exception 'T2 FAIL: the removed member is listed';
  end if;

  -- the owner row comes first and is marked
  select * into r from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001') limit 1;
  if r.user_id <> '00000000-0000-0000-0000-00000000f001' or not r.is_owner then
    raise exception 'T2 FAIL: expected the owner row first with is_owner, got %', r;
  end if;
  -- O: total = 20 + 30 − 5 = 45 (expiry / admin / credit ignored); month = 20 − 5 = 15
  if r.points_total <> 45 or r.points_month <> 15 then
    raise exception 'T2 FAIL: owner totals expected month 15 / total 45, got % / %', r.points_month, r.points_total;
  end if;

  select * into r from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001')
   where user_id = '00000000-0000-0000-0000-00000000f002';
  if r.points_total <> 7 or r.points_month <> 7 or r.is_owner or r.display_name <> 'الشريك' or r.role <> 'managing_partner' then
    raise exception 'T2 FAIL: partner row wrong: %', r;
  end if;

  -- L: the 40 spent before joining is not counted
  select * into r from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001')
   where user_id = '00000000-0000-0000-0000-00000000f003';
  if r.points_total <> 11 or r.points_month <> 11 then
    raise exception 'T2 FAIL: lawyer expected 11 / 11 (pre-join 40 excluded), got % / %', r.points_month, r.points_total;
  end if;
end $$;

-- T3 an active managing partner (not the owner) sees the same aggregates
select set_config('test.uid', '00000000-0000-0000-0000-00000000f002', false);
do $$
declare n int;
begin
  select count(*) into n from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  if n <> 3 then
    raise exception 'T3 FAIL: managing partner expected 3 rows, got %', n;
  end if;
end $$;

-- T4 a plain member gets nothing (42501)
select set_config('test.uid', '00000000-0000-0000-0000-00000000f003', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  raise exception 'T4 FAIL: a plain lawyer member read the aggregates';
exception when insufficient_privilege then
  null;
end $$;

-- T5 the removed member gets nothing
select set_config('test.uid', '00000000-0000-0000-0000-00000000f004', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  raise exception 'T5 FAIL: a removed member read the aggregates';
exception when insufficient_privilege then
  null;
end $$;

-- T6 an outsider, and the owner of ANOTHER firm, get nothing
select set_config('test.uid', '00000000-0000-0000-0000-00000000f005', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  raise exception 'T6 FAIL: an outsider read the aggregates';
exception when insufficient_privilege then
  null;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000f006', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  raise exception 'T6 FAIL: another firm''s owner read F1''s aggregates';
exception when insufficient_privilege then
  null;
end $$;

-- T7 no session, and an unknown firm, get nothing
select set_config('test.uid', '', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  raise exception 'T7 FAIL: no session read the aggregates';
exception when insufficient_privilege then
  null;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000f001', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000fffff');
  raise exception 'T7 FAIL: an unknown firm did not refuse';
exception when insufficient_privilege then
  null;
end $$;

-- T8 a managing partner who was REMOVED loses access
reset role;
update public.firm_members set status = 'removed'
 where firm_id = '00000000-0000-0000-0000-0000000ff001' and user_id = '00000000-0000-0000-0000-00000000f002';
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000f002', false);
do $$
begin
  perform * from public.firm_member_points_usage('00000000-0000-0000-0000-0000000ff001');
  raise exception 'T8 FAIL: a removed managing partner read the aggregates';
exception when insufficient_privilege then
  null;
end $$;
reset role;

do $$ begin raise notice 'firm_member_points_1108: ALL PASS (T1–T8)'; end $$;
