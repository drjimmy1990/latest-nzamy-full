-- ai_runs.test.sql — proves 20261027_10 (AI services wave 0: ai_runs,
-- ai_start_run / ai_fail_run / ai_sweep_runs / ai_runs_retention) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). The _verify block runs before it (must
-- only NOTICE) and after (must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_ai_runs_block.sql
--   sed -n '/^-- >>> verify:ai_runs/,/^-- <<< verify:ai_runs/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     "$B" \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261027_10_ai_runs.sql \
--     "$B" \
--     $R/ai_runs.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261027_10
-- files and the second verify block → "T0 FAIL: public.ai_runs does not exist".
--
-- Actors: A …a001 (lawyer; lots 30 expiring in 10 days + 100 in a year),
--         B …a002 (no points), M …a003 (admin), C …a004 (expired-lot refund).
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regclass('public.ai_runs') is null then
    raise exception 'T0 FAIL: public.ai_runs does not exist (20261027_10 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002'),
  ('00000000-0000-0000-0000-00000000a003'),
  ('00000000-0000-0000-0000-00000000a004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000a001', 'lawyer', 'A'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer', 'B'),
  ('00000000-0000-0000-0000-00000000a003', 'admin', 'M'),
  ('00000000-0000-0000-0000-00000000a004', 'individual', 'C');
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-00000000a001', 'grant', 30, 30, now() + interval '10 days'),
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-00000000a001', 'grant', 100, 100, now() + interval '1 year'),
  ('00000000-0000-0000-0000-0000000b0003', '00000000-0000-0000-0000-00000000a004', 'grant', 30, 30, now() + interval '5 days'),
  ('00000000-0000-0000-0000-0000000b0004', '00000000-0000-0000-0000-00000000a004', 'grant', 50, 50, now() + interval '1 year');

-- app_user stands in for authenticated: strip what stubs.sql's default
-- privileges gave it, so the read tests mean something
revoke all on public.ai_runs from app_user;

-- T1 with points_enforcement off a run is created and records its price but
--    debits nothing
set role service_role;
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'quick-answer', null, 'fast',
    20, 30, 'key-t1-0000', now() + interval '1 minute');
  if not r.created or r.charged or r.charged_points <> 0 or r.status <> 'running' then
    raise exception 'T1 FAIL: enforcement off → expected a new uncharged running run, got %', r;
  end if;
  if exists (select 1 from public.points_ledger where ref = 'ai_run:' || r.run_id) then
    raise exception 'T1 FAIL: enforcement off wrote a ledger row';
  end if;
  if (select price_points from public.ai_runs where id = r.run_id) <> 20 then
    raise exception 'T1 FAIL: the price was not recorded';
  end if;
end $$;
reset role;

update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- T2 enforcement on: a 50-point run spanning two lots debits 30 + 20 nearest
--    expiry first; T3 the same key returns the same run and debits nothing more
set role service_role;
do $$
declare r record; r2 record; run uuid;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'consult', null, 'fast',
    50, 30, 'key-t2-0000', now() + interval '1 minute');
  if not r.created or not r.charged or r.charged_points <> 50 then
    raise exception 'T2 FAIL: expected a charged 50-point run, got %', r;
  end if;
  run := r.run_id;
  if (select string_agg(lot_id::text || ':' || delta, ',' order by delta) from public.points_ledger
       where ref = 'ai_run:' || run and reason = 'usage')
     is distinct from '00000000-0000-0000-0000-0000000b0001:-30,00000000-0000-0000-0000-0000000b0002:-20' then
    raise exception 'T2 FAIL: the debit did not take 30 from the near lot and 20 from the far one';
  end if;
  if public.points_balance('00000000-0000-0000-0000-00000000a001') <> 80 then
    raise exception 'T2 FAIL: balance after the debit is not 80';
  end if;
  select * into r2 from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'consult', null, 'fast',
    50, 30, 'key-t2-0000', now() + interval '1 minute');
  if r2.created or r2.run_id <> run or public.points_balance('00000000-0000-0000-0000-00000000a001') <> 80 then
    raise exception 'T3 FAIL: a repeated key created or charged again (%)', r2;
  end if;
  perform set_config('test.t2run', run::text, false);
end $$;
reset role;

-- T4 too few points: P0001 insufficient_points and no run is left behind
set role service_role;
do $$
begin
  begin
    perform public.ai_start_run('00000000-0000-0000-0000-00000000a002', 'consult', null, 'fast',
      10, 30, 'key-t4-0000', now() + interval '1 minute');
    raise exception 'T4 FAIL: B with 0 points started a 10-point run';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'insufficient_points' then raise; end if;
  end;
  if exists (select 1 from public.ai_runs where user_id = '00000000-0000-0000-0000-00000000a002') then
    raise exception 'T4 FAIL: a refused run was left in ai_runs';
  end if;
end $$;
reset role;

-- T5 daily limit: the second run of the day is refused with P0001
--    daily_limit; a failed run does not count
set role service_role;
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'lim', null, 'fast',
    0, 1, 'key-t5-0001', now() + interval '1 minute');
  begin
    perform public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'lim', null, 'fast',
      0, 1, 'key-t5-0002', now() + interval '1 minute');
    raise exception 'T5 FAIL: a second run passed a daily limit of 1';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'daily_limit' then raise; end if;
  end;
  perform public.ai_fail_run(r.run_id, 'model_error');
  perform public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'lim', null, 'fast',
    0, 1, 'key-t5-0003', now() + interval '1 minute');
end $$;
reset role;

-- T6 a failure refunds to the original lots once; a second call changes nothing
set role service_role;
do $$
declare run uuid := current_setting('test.t2run')::uuid;
begin
  if not public.ai_fail_run(run, 'schema_invalid', 'bad json') then
    raise exception 'T6 FAIL: ai_fail_run returned false for a running run';
  end if;
  if (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000b0001') <> 30
     or (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000b0002') <> 100 then
    raise exception 'T6 FAIL: the refund did not restore 30 + 100';
  end if;
  if (select count(*) from public.points_ledger where ref = 'ai_run:' || run and reason = 'usage_refund') <> 2 then
    raise exception 'T6 FAIL: expected two usage_refund rows';
  end if;
  if (select status || ':' || error_code || ':' || (refunded_at is not null) from public.ai_runs where id = run)
     <> 'failed:schema_invalid:true' then
    raise exception 'T6 FAIL: the run is not failed / schema_invalid / refunded';
  end if;
  if public.ai_fail_run(run, 'model_error') then
    raise exception 'T6 FAIL: a second ai_fail_run returned true';
  end if;
  if (select count(*) from public.points_ledger where ref = 'ai_run:' || run and reason = 'usage_refund') <> 2
     or public.points_balance('00000000-0000-0000-0000-00000000a001') <> 130 then
    raise exception 'T6 FAIL: a second failure refunded again';
  end if;
end $$;
reset role;

-- T7 a run that succeeded can no longer fail or be refunded
set role service_role;
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'communicate', null, 'fast',
    5, 30, 'key-t7-0000', now() + interval '1 minute');
  update public.ai_runs set status = 'succeeded', finished_at = now() where id = r.run_id and status = 'running';
  if public.ai_fail_run(r.run_id, 'timeout') then
    raise exception 'T7 FAIL: a succeeded run failed afterwards';
  end if;
  if public.points_balance('00000000-0000-0000-0000-00000000a001') <> 125 then
    raise exception 'T7 FAIL: a succeeded run was refunded (balance %)', public.points_balance('00000000-0000-0000-0000-00000000a001');
  end if;
end $$;
reset role;

-- T8 a lot that expired after the debit is refunded as a new 30-day
--    refund_restore lot; the live lot gets its points back
set role service_role;
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a004', 'analyze', 'tier1', 'fast',
    40, 30, 'key-t8-0000', now() + interval '1 minute');
  perform set_config('test.t8run', r.run_id::text, false);
end $$;
reset role;
update public.points_lots set expires_at = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000b0003';
set role service_role;
do $$
declare run uuid := current_setting('test.t8run')::uuid; lot record;
begin
  perform public.ai_fail_run(run, 'model_error');
  if (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000b0003') <> 0 then
    raise exception 'T8 FAIL: the expired lot got points back';
  end if;
  if (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000b0004') <> 50 then
    raise exception 'T8 FAIL: the live lot did not get its 10 back';
  end if;
  select * into lot from public.points_lots
   where user_id = '00000000-0000-0000-0000-00000000a004' and source = 'refund_restore';
  if lot.points_total <> 30 or lot.points_left <> 30
     or lot.expires_at < now() + interval '30 days' - interval '1 hour' then
    raise exception 'T8 FAIL: expected a 30-point refund_restore lot valid 30 days, got %', lot;
  end if;
  if (select count(*) from public.points_ledger where ref = 'ai_run:' || run and reason = 'usage_refund') <> 2 then
    raise exception 'T8 FAIL: expected two usage_refund rows';
  end if;
end $$;
reset role;

-- T9 an exempt caller (platform admin) is never charged
set role service_role;
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a003', 'consult', null, 'fast',
    100, 30, 'key-t9-0000', now() + interval '1 minute', true);
  if r.charged or r.charged_points <> 0 then
    raise exception 'T9 FAIL: the exempt admin was charged';
  end if;
end $$;
reset role;

-- T10 the sweeper fails and refunds a running run past its deadline, and
--    leaves one within its deadline
set role service_role;
do $$
declare late record; fresh record; n int;
begin
  select * into late from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'wargaming', null, 'job',
    25, 5, 'key-t10-late', now() - interval '1 second');
  select * into fresh from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'wargaming', null, 'job',
    25, 5, 'key-t10-fresh', now() + interval '10 minutes');
  n := public.ai_sweep_runs();
  if n <> 1 then
    raise exception 'T10 FAIL: the sweeper failed % runs (expected 1)', n;
  end if;
  if (select status || ':' || error_code || ':' || (refunded_at is not null) from public.ai_runs where id = late.run_id)
     <> 'failed:timeout:true' then
    raise exception 'T10 FAIL: the late run is not failed / timeout / refunded';
  end if;
  if (select status from public.ai_runs where id = fresh.run_id) <> 'running' then
    raise exception 'T10 FAIL: the sweeper touched a run within its deadline';
  end if;
end $$;
reset role;

-- T11 retention clears input / output past 90 days, keeps the money facts
update public.ai_runs set input = '{"q":"x"}', output = '{"a":"y"}', created_at = now() - interval '91 days'
 where idempotency_key = 'key-t7-0000';
set role service_role;
do $$
begin
  if public.ai_runs_retention() < 1 then
    raise exception 'T11 FAIL: retention cleared nothing';
  end if;
  if exists (select 1 from public.ai_runs where idempotency_key = 'key-t7-0000'
              and (input is not null or output is not null or price_points <> 5 or not charged)) then
    raise exception 'T11 FAIL: retention kept the content or dropped the money facts';
  end if;
end $$;
reset role;

-- T12 a signed-in session reads only its own runs, never input / usage /
--    model / source_ids, cannot write, and cannot call the functions
set role app_user;
do $$
declare stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a002', true);
  if exists (select 1 from public.ai_runs) then
    raise exception 'T12 FAIL: B sees another user''s runs';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  if (select count(*) from (select id, status, output from public.ai_runs) s) < 5 then
    raise exception 'T12 FAIL: A does not see own runs';
  end if;
  foreach stmt in array array[
    $q$select input from public.ai_runs$q$,
    $q$select usage from public.ai_runs$q$,
    $q$select source_ids from public.ai_runs$q$,
    $q$update public.ai_runs set status = 'succeeded'$q$,
    $q$select public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'x', null, 'fast', 0, 9, 'key-t12-000', now())$q$,
    $q$select public.ai_fail_run('00000000-0000-0000-0000-00000000a001', 'x')$q$,
    $q$select public.ai_sweep_runs()$q$,
    $q$select public.ai_runs_retention()$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T12 FAIL: authenticated ran — %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

do $$ begin raise notice 'ai_runs.test.sql: ALL PASS'; end $$;
