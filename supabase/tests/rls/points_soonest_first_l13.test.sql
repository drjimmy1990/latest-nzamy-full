-- points_soonest_first_l13.test.sql — proves 20261203_10 (batch l13, owner
-- ١٦٥ ب): debit_points spends the soonest-expiring ELIGIBLE lot first whatever
-- its type (plan / purchase / gift / library wallet), a library_agent lot is
-- still spent by the library assistant only, and points_available_for_tool
-- («المتاح لهذه العملية») counts exactly what the tool may spend, own user
-- only. The migration runs TWICE (re-runnable), then the l7_points and
-- l13_points blocks of _verify.sql.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   sed -n '/^-- >>> verify:l7_points/,/^-- <<< verify:l7_points/p' $M/_verify.sql > "$D/v7.sql"
--   sed -n '/^-- >>> verify:l13_points/,/^-- <<< verify:l13_points/p' $M/_verify.sql > "$D/v13.sql"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261127_40_points_wallets.sql \
--     $M/20261203_10_points_soonest_first.sql \
--     $M/20261203_10_points_soonest_first.sql \
--     "$D/v7.sql" "$D/v13.sql" \
--     $R/points_soonest_first_l13.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261203_10
-- files and v13.sql → "T1 FAIL: … not the soonest-expiring lot first".
--
-- Actors: L …f101 lawyer; O …f102 another user. Every assertion RAISES.

insert into auth.users values
  ('00000000-0000-0000-0000-00000000f101'), ('00000000-0000-0000-0000-00000000f102');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000f101', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-00000000f102', 'lawyer', 'O');
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- L's lots, soonest first: a top-up (10 days), a library-assistant plan lot
-- (20 days), a gift (40 days), a general plan lot (300 days). The old order
-- spent the plan lot first for every tool and the library lot first for the
-- library assistant.
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at, wallet_scope) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-00000000f101', 'purchase', 30, 30, now() + interval '10 days',  'general'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-00000000f101', 'plan',     40, 40, now() + interval '20 days',  'library_agent'),
  ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-00000000f101', 'gift',     50, 50, now() + interval '40 days',  'general'),
  ('00000000-0000-0000-0000-0000000b0004', '00000000-0000-0000-0000-00000000f101', 'plan',    100, 100, now() + interval '300 days', 'general'),
  -- an expired lot never counts, never spent
  ('00000000-0000-0000-0000-0000000b0005', '00000000-0000-0000-0000-00000000f101', 'purchase', 70, 70, now() - interval '1 day',    'general'),
  -- another user's lot
  ('00000000-0000-0000-0000-0000000b0009', '00000000-0000-0000-0000-00000000f102', 'purchase', 25, 25, now() + interval '5 days',   'general');

create or replace function pg_temp.left_of(p uuid) returns int language sql as $$
  select points_left from public.points_lots where id = p $$;

-- T1 a general tool: the top-up that ends soonest, then the gift (40 days)
--    BEFORE the plan lot (300 days); the library lot is skipped
do $$
begin
  perform public.debit_points('00000000-0000-0000-0000-00000000f101', 45, 'legal-drafter', 'l13-t1');
  if pg_temp.left_of('00000000-0000-0000-0000-0000000b0001') <> 0
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0003') <> 35
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0004') <> 100
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0002') <> 40
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0005') <> 70 then
    raise exception 'T1 FAIL: a general tool did not take the soonest-expiring lot first (top-up %, gift %, plan %, library %, expired %)',
      pg_temp.left_of('00000000-0000-0000-0000-0000000b0001'), pg_temp.left_of('00000000-0000-0000-0000-0000000b0003'),
      pg_temp.left_of('00000000-0000-0000-0000-0000000b0004'), pg_temp.left_of('00000000-0000-0000-0000-0000000b0002'),
      pg_temp.left_of('00000000-0000-0000-0000-0000000b0005');
  end if;
  if (select count(*) from public.points_ledger where ref = 'l13-t1' and reason = 'usage') <> 2 then
    raise exception 'T1 FAIL: expected one usage row per lot touched';
  end if;
  raise notice 'T1 PASS: general tool — soonest first (top-up, then gift before plan), library lot untouched';
end $$;

-- T2 the library assistant: a general gift that ends sooner than its own
--    wallet is spent FIRST (no wallet preference any more)
do $$
begin
  insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at, wallet_scope) values
    ('00000000-0000-0000-0000-0000000b0006', '00000000-0000-0000-0000-00000000f101', 'gift', 10, 10, now() + interval '15 days', 'general');
  perform public.debit_points('00000000-0000-0000-0000-00000000f101', 25, 'library-assistant', 'l13-t2');
  if pg_temp.left_of('00000000-0000-0000-0000-0000000b0006') <> 0
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0002') <> 25
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0003') <> 35 then
    raise exception 'T2 FAIL: the library assistant did not take the soonest-expiring eligible lot first (gift15 %, library %, gift40 %)',
      pg_temp.left_of('00000000-0000-0000-0000-0000000b0006'), pg_temp.left_of('00000000-0000-0000-0000-0000000b0002'),
      pg_temp.left_of('00000000-0000-0000-0000-0000000b0003');
  end if;
  raise notice 'T2 PASS: library assistant — soonest first across both wallets';
end $$;

-- T3 points_available_for_tool: general = gift 35 + plan 100; library = + 25;
--    the expired lot never counts
do $$
begin
  if public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', 'legal-drafter') <> 135 then
    raise exception 'T3 FAIL: general available = % (want 135)',
      public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', 'legal-drafter');
  end if;
  if public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', 'library-assistant') <> 160 then
    raise exception 'T3 FAIL: library available = % (want 160)',
      public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', 'library-assistant');
  end if;
  if public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', null) <> 135 then
    raise exception 'T3 FAIL: a null tool must count the general wallet only';
  end if;
  begin
    perform public.points_available_for_tool(null, 'legal-drafter');
    raise exception 'T3 FAIL: a null user was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'T3 PASS: available per tool follows the wallet rule; expired lots excluded';
end $$;

-- T4 a general tool still cannot reach the library wallet: 136 > 135 →
--    insufficient_points and nothing changes
do $$
begin
  begin
    perform public.debit_points('00000000-0000-0000-0000-00000000f101', 136, 'legal-drafter', 'l13-t4');
    raise exception 'T4 FAIL: a general tool spent library points';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'insufficient_points' then raise; end if;
  end;
  if pg_temp.left_of('00000000-0000-0000-0000-0000000b0002') <> 25 or pg_temp.left_of('00000000-0000-0000-0000-0000000b0003') <> 35
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0004') <> 100
     or exists (select 1 from public.points_ledger where ref = 'l13-t4') then
    raise exception 'T4 FAIL: a refused debit changed something';
  end if;
  raise notice 'T4 PASS: library lots stay the library assistant''s only; a short debit changes nothing';
end $$;

-- T5 a charged run through ai_start_run uses the same order (gift 40 days
--    before the plan lot)
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000f101', 'contract-drafter', null, 'fast', 20, 60,
    'l13-charged-0001', now() + interval '90 seconds', false, '{"message":"x"}'::jsonb);
  if not r.charged or r.charged_points <> 20
     or pg_temp.left_of('00000000-0000-0000-0000-0000000b0003') <> 15 or pg_temp.left_of('00000000-0000-0000-0000-0000000b0004') <> 100 then
    raise exception 'T5 FAIL: the charged run did not spend the soonest lot: %', r;
  end if;
  raise notice 'T5 PASS: ai_start_run → debit_points, soonest first';
end $$;

-- T6 grants
do $$
begin
  if has_function_privilege('anon', 'public.points_available_for_tool(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.points_available_for_tool(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.debit_points(uuid,int,text,text)', 'EXECUTE') then
    raise exception 'T6 FAIL: grants';
  end if;
  raise notice 'T6 PASS: grants';
end $$;

-- T7 a signed-in user reads only their own figure
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000f101', false);
do $$
begin
  if public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', 'library-assistant') <> 140 then
    raise exception 'T7 FAIL: own figure = %', public.points_available_for_tool('00000000-0000-0000-0000-00000000f101', 'library-assistant');
  end if;
  begin
    perform public.points_available_for_tool('00000000-0000-0000-0000-00000000f102', 'legal-drafter');
    raise exception 'T7 FAIL: another user''s points were readable';
  exception when sqlstate '42501' then null;
  end;
  raise notice 'T7 PASS: own figure only';
end $$;
reset role;

do $$ begin raise notice 'points_soonest_first_l13: ALL PASS'; end $$;
