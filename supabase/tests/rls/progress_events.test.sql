-- progress_events.test.sql — proves 20261103_31 (a run's live progress: titles
-- only, own rows, 7-day prune), its _verify block, and the three database facts
-- the 202 path stands on: a repeated key charges once, a failed dispatch
-- refunds once, and a run nobody finishes is swept into a state its owner reads.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). The chain needs 20261027_10 (ai_runs) and
-- NOT 20261103_30: progress_events reads only ai_runs.id and auth.users.id. From
-- the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_progress_events_block.sql
--   sed -n '/^-- >>> verify:progress_events/,/^-- <<< verify:progress_events/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261103_31_progress_events.sql \
--     $M/20261103_31_progress_events.sql \
--     "$B" \
--     $R/progress_events.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL):
--   the same chain without the two 20261103_31 files and the verify block
--     → "T0 FAIL: public.progress_events does not exist";
--   the chain without the two 20261103_31 files, with the verify block
--     → "_verify: 20261103_31 — public.progress_events is missing: run ...".
--
-- Actors: A …a001 (lawyer, 130 points), B …a002 (lawyer). Every assertion
-- RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regclass('public.progress_events') is null then
    raise exception 'T0 FAIL: public.progress_events does not exist (20261103_31 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000a001', 'lawyer', 'A'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer', 'B');
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-00000000a001', 'grant', 130, 130, now() + interval '1 year');
insert into public.ai_runs (id, user_id, tool, class, price_points, idempotency_key, deadline_at, input, error_message) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'wargaming', 'job', 25, 'key-a-run-1', now() + interval '10 minutes', '{"memo_text":"SECRET"}', 'SECRET'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-00000000a002', 'wargaming', 'job', 25, 'key-b-run-1', now() + interval '10 minutes', '{"memo_text":"SECRET"}', 'SECRET');
insert into public.progress_events (run_id, user_id, kind, label) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'file', 'عقد.pdf'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'law', 'نظام العمل — المادة ٧٧'),
  ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-00000000a002', 'file', 'ملف ب.pdf');

-- app_user stands in for authenticated: strip what stubs.sql's default
-- privileges gave it, so the read and write tests mean something
revoke all on public.ai_runs from app_user;
revoke all on public.progress_events from app_user;

-- T1 a session reads only its own events, through the granted columns
set role app_user;
do $$
declare stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  if (select count(*) from public.progress_events) <> 2 then
    raise exception 'T1 FAIL: A does not count exactly its own 2 events';
  end if;
  if exists (select 1 from public.progress_events where label = 'ملف ب.pdf') then
    raise exception 'T1 FAIL: A sees B''s event';
  end if;
  if (select string_agg(kind, ',' order by id) from (select id, run_id, kind, label, created_at from public.progress_events) s)
     is distinct from 'file,law' then
    raise exception 'T1 FAIL: A reads the granted columns in id order';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a002', true);
  if (select count(*) from public.progress_events) <> 1 then
    raise exception 'T1 FAIL: B does not count exactly its own event';
  end if;
  -- T2 a session cannot write, and cannot read the owner column or prune
  foreach stmt in array array[
    $q$insert into public.progress_events (run_id, user_id, kind, label) values ('00000000-0000-0000-0000-0000000c0002', '00000000-0000-0000-0000-00000000a002', 'note', 'x')$q$,
    $q$update public.progress_events set label = 'x'$q$,
    $q$delete from public.progress_events$q$,
    $q$select user_id from public.progress_events$q$,
    $q$select public.progress_events_prune()$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T2 FAIL: authenticated ran — %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

-- T2b anon reads nothing at all
set role anon;
do $$
begin
  perform 1 from public.progress_events;
  raise exception 'T2b FAIL: anon read progress_events';
exception when insufficient_privilege then null;
end $$;
reset role;

-- T3 a label over 200 characters, an empty one, and an unknown kind are refused
set role service_role;
do $$
declare stmt text;
begin
  foreach stmt in array array[
    format($q$insert into public.progress_events (run_id, user_id, kind, label) values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'note', %L)$q$, repeat('x', 201)),
    $q$insert into public.progress_events (run_id, user_id, kind, label) values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'note', '')$q$,
    $q$insert into public.progress_events (run_id, user_id, kind, label) values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'secret', 'x')$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T3 FAIL: the check let this through — %', left(stmt, 150);
    exception when check_violation then null;
    end;
  end loop;
  -- exactly 200 is allowed, and the service role can write through the sequence
  insert into public.progress_events (run_id, user_id, kind, label)
  values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'note', repeat('ق', 200));
  delete from public.progress_events where kind = 'note';
end $$;
reset role;

-- T4 deleting a run deletes its events
set role service_role;
do $$
begin
  insert into public.ai_runs (id, user_id, tool, class, price_points, idempotency_key, deadline_at)
  values ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-00000000a001', 'wargaming', 'job', 25, 'key-a-run-3', now() + interval '10 minutes');
  insert into public.progress_events (run_id, user_id, kind, label)
  values ('00000000-0000-0000-0000-0000000c0003', '00000000-0000-0000-0000-00000000a001', 'step', 'x');
  delete from public.ai_runs where id = '00000000-0000-0000-0000-0000000c0003';
  if exists (select 1 from public.progress_events where run_id = '00000000-0000-0000-0000-0000000c0003') then
    raise exception 'T4 FAIL: the run''s events survived it';
  end if;
end $$;
reset role;

-- T5 the prune removes only what is older than 7 days
insert into public.progress_events (run_id, user_id, kind, label, created_at) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'step', 'old', now() - interval '8 days'),
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a001', 'step', 'recent', now() - interval '1 day');
set role service_role;
do $$
declare n int;
begin
  n := public.progress_events_prune();
  if n <> 1 then
    raise exception 'T5 FAIL: the prune removed % rows (expected 1)', n;
  end if;
  if exists (select 1 from public.progress_events where label = 'old') then
    raise exception 'T5 FAIL: the 8-day-old row is still there';
  end if;
  if not exists (select 1 from public.progress_events where label = 'recent') then
    raise exception 'T5 FAIL: the 1-day-old row was removed';
  end if;
end $$;
reset role;

-- T6 the activity log's read: own runs only, through its exact column list; the
--    columns that hold a text or the idempotency key stay closed to a session
set role app_user;
do $$
declare stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  if (select count(*) from (select id, tool, status, charged_points, refunded_at, created_at from public.ai_runs) s) <> 1 then
    raise exception 'T6 FAIL: A does not read exactly its own run';
  end if;
  if exists (select 1 from public.ai_runs where id = '00000000-0000-0000-0000-0000000c0002') then
    raise exception 'T6 FAIL: A reads B''s run';
  end if;
  foreach stmt in array array[
    $q$select input from public.ai_runs$q$,
    $q$select error_message from public.ai_runs$q$,
    $q$select idempotency_key from public.ai_runs$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T6 FAIL: authenticated ran — %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- T7 a repeated request is the same run and charges once; a failed dispatch
--    refunds once, however many times the failure is reported; its owner reads it
set role service_role;
do $$
declare r record; r2 record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'wargaming', null, 'job',
    50, 30, 'key-t7-0000', now() + interval '10 minutes');
  if not r.created or not r.charged or r.charged_points <> 50 then
    raise exception 'T7 FAIL: expected a charged 50-point run, got %', r;
  end if;
  select * into r2 from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'wargaming', null, 'job',
    50, 30, 'key-t7-0000', now() + interval '10 minutes');
  if r2.created or r2.run_id <> r.run_id then
    raise exception 'T7 FAIL: a repeated key created a second run (%)', r2;
  end if;
  if public.points_balance('00000000-0000-0000-0000-00000000a001') <> 80 then
    raise exception 'T7 FAIL: a repeated key charged again: balance %', public.points_balance('00000000-0000-0000-0000-00000000a001');
  end if;
  perform public.ai_fail_run(r.run_id, 'n8n_unreachable', 'dispatch failed');
  perform public.ai_fail_run(r.run_id, 'internal', 'reported twice');
  if public.points_balance('00000000-0000-0000-0000-00000000a001') <> 130 then
    raise exception 'T7 FAIL: the refund is not exactly once: balance %', public.points_balance('00000000-0000-0000-0000-00000000a001');
  end if;
  perform set_config('test.t7run', r.run_id::text, false);
end $$;
reset role;
set role app_user;
do $$
declare v record;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  select status, error_code, refunded_at into v from public.ai_runs where id = current_setting('test.t7run')::uuid;
  if v.status <> 'failed' or v.error_code <> 'n8n_unreachable' or v.refunded_at is null then
    raise exception 'T7 FAIL: the owner does not read a failed, refunded run with the first code: %', v;
  end if;
end $$;
reset role;

-- T8 a run past its deadline (a deferred dispatch killed by a restart) is swept
--    to failed + refunded, and its owner reads that
set role service_role;
do $$
declare r record;
begin
  select * into r from public.ai_start_run('00000000-0000-0000-0000-00000000a001', 'wargaming', null, 'job',
    50, 30, 'key-t8-0000', now() - interval '1 second');
  if public.points_balance('00000000-0000-0000-0000-00000000a001') <> 80 then
    raise exception 'T8 FAIL: the run was not charged';
  end if;
  if public.ai_sweep_runs() < 1 then
    raise exception 'T8 FAIL: the sweeper left the run running';
  end if;
  if public.points_balance('00000000-0000-0000-0000-00000000a001') <> 130 then
    raise exception 'T8 FAIL: the sweeper did not refund';
  end if;
  perform set_config('test.t8run', r.run_id::text, false);
end $$;
reset role;
set role app_user;
do $$
declare v record;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  select status, error_code, refunded_at into v from public.ai_runs where id = current_setting('test.t8run')::uuid;
  if v.status <> 'failed' or v.error_code <> 'timeout' or v.refunded_at is null then
    raise exception 'T8 FAIL: the owner does not read a timed-out, refunded run: %', v;
  end if;
end $$;
reset role;

do $$ begin raise notice 'progress_events.test.sql: ALL PASS'; end $$;
