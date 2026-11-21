-- ai_history_l12.test.sql — proves 20261202_40 (batch l12 lib-draft: «سجلّي»
-- delete column, retention from the admin setting, the draft limits) and its
-- _verify block.
--
-- CHAIN (run.sh, postgres:16). 20261202_40 runs TWICE (re-runnable); the
-- _verify block runs before it (may say false, must not error) and after it.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l12_lib_draft.sql
--   sed -n '/^-- >>> verify:l12_lib_draft/,/^-- <<< verify:l12_lib_draft/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     "$B" \
--     $M/20261202_40_l12_ai_history_draft_limits.sql \
--     $M/20261202_40_l12_ai_history_draft_limits.sql \
--     "$B" \
--     $R/ai_history_l12.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261202_40
-- files and the second verify block → "T0 FAIL: ai_runs.user_hidden_at is missing".
--
-- Actors: A …c001, B …c002 (lawyers). Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.ai_runs'::regclass and attname = 'user_hidden_at' and not attisdropped) then
    raise exception 'T0 FAIL: ai_runs.user_hidden_at is missing (20261202_40 not applied)';
  end if;
end $$;

insert into auth.users values ('00000000-0000-0000-0000-00000000c001'), ('00000000-0000-0000-0000-00000000c002');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000c001', 'lawyer', 'A'),
  ('00000000-0000-0000-0000-00000000c002', 'lawyer', 'B');

-- app_user stands in for authenticated: strip stubs.sql's blanket grant so
-- only what the migrations grant `authenticated` counts.
revoke all on public.ai_runs from app_user;

insert into public.ai_runs (id, user_id, tool, class, status, price_points, idempotency_key, deadline_at, input, output, created_at) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000c001', 'quick-answer', 'fast', 'succeeded', 5, 'k-l12-a-new', now(),
   '{"message":"سؤال حديث"}', '{"reply":"جواب حديث"}', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000c001', 'quick-answer', 'fast', 'succeeded', 5, 'k-l12-a-old', now(),
   '{"message":"سؤال قديم"}', '{"reply":"جواب قديم"}', now() - interval '13 months'),
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-00000000c001', 'quick-answer', 'fast', 'succeeded', 5, 'k-l12-a-mid', now(),
   '{"message":"سؤال متوسط"}', '{"reply":"جواب متوسط"}', now() - interval '4 months'),
  ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-00000000c002', 'quick-answer', 'fast', 'succeeded', 5, 'k-l12-b-1', now(),
   '{"message":"سؤال ب"}', '{"reply":"جواب ب"}', now() - interval '1 day');

-- T1 the settings exist with their defaults
do $$
begin
  if (select value from public.platform_settings where key = 'ai_runs_retention') <> '{"months": 12}'::jsonb then
    raise exception 'T1 FAIL: ai_runs_retention is not {"months": 12}';
  end if;
  if (select value from public.platform_settings where key = 'library_draft_limits')
     <> '{"max_items": 30, "share_excerpt_chars": 200}'::jsonb then
    raise exception 'T1 FAIL: library_draft_limits is not the default';
  end if;
end $$;

-- T2 retention (default 12 months): the 13-month run is cleared, the 4-month
--    one is not (it was under the old 90-day rule), money facts kept
set role service_role;
do $$
declare n int;
begin
  n := public.ai_runs_retention();
  if n <> 1 then
    raise exception 'T2 FAIL: retention cleared % runs (expected 1)', n;
  end if;
  if exists (select 1 from public.ai_runs where id = '00000000-0000-0000-0000-0000000d0002'
              and (input is not null or output is not null or price_points <> 5)) then
    raise exception 'T2 FAIL: the 13-month run kept its content or lost its price';
  end if;
  if exists (select 1 from public.ai_runs where id = '00000000-0000-0000-0000-0000000d0003' and output is null) then
    raise exception 'T2 FAIL: the 4-month run was cleared under a 12-month setting';
  end if;
end $$;
reset role;

-- T3 the admin lowers it to 3 months: the 4-month run is cleared now;
--    a bad value (0, a string) reads as 12
update public.platform_settings set value = '{"months": 3}' where key = 'ai_runs_retention';
set role service_role;
do $$
begin
  if public.ai_runs_retention() <> 1 then
    raise exception 'T3 FAIL: a 3-month setting did not clear the 4-month run';
  end if;
end $$;
reset role;
update public.ai_runs set output = '{"reply":"x"}', created_at = now() - interval '5 months'
 where id = '00000000-0000-0000-0000-0000000d0003';
update public.platform_settings set value = '{"months": 0}' where key = 'ai_runs_retention';
set role service_role;
do $$
begin
  if public.ai_runs_retention() <> 0 then
    raise exception 'T3 FAIL: months 0 was not read as 12';
  end if;
end $$;
reset role;
update public.platform_settings set value = '{"months": "x"}' where key = 'ai_runs_retention';
set role service_role;
do $$
begin
  if public.ai_runs_retention() <> 0 then
    raise exception 'T3 FAIL: a string was not read as 12';
  end if;
end $$;
reset role;

-- T4 a session sees user_hidden_at on its OWN rows only, never input, and
--    cannot write it (the delete goes through the server)
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c002', true);
  select count(*) into n from public.ai_runs where user_hidden_at is null;
  if n <> 1 then
    raise exception 'T4 FAIL: B sees % visible runs (expected only its own 1)', n;
  end if;
  begin
    perform input from public.ai_runs limit 1;
    raise exception 'T4 FAIL: B read input';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.ai_runs set user_hidden_at = now() where user_id = '00000000-0000-0000-0000-00000000c002';
    raise exception 'T4 FAIL: B updated its run from the session';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T5 the server's delete (the route's update, service role, own row): content
--    cleared, money facts kept, the row leaves the user's visible list
set role service_role;
update public.ai_runs
   set user_hidden_at = now(), input = null, output = null, citations = null, source_ids = null, error_message = null
 where id = '00000000-0000-0000-0000-0000000d0001' and user_id = '00000000-0000-0000-0000-00000000c001';
reset role;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  if exists (select 1 from public.ai_runs where id = '00000000-0000-0000-0000-0000000d0001' and user_hidden_at is null) then
    raise exception 'T5 FAIL: the hidden run is still in the visible list';
  end if;
  if (select count(*) from public.ai_runs where user_hidden_at is null) <> 2 then
    raise exception 'T5 FAIL: A should see its two other runs';
  end if;
  if (select price_points from public.ai_runs where id = '00000000-0000-0000-0000-0000000d0001') <> 5 then
    raise exception 'T5 FAIL: the delete dropped the price';
  end if;
end $$;
reset role;

-- T6 anon has nothing; the retention function is service role only
do $$
begin
  if has_column_privilege('anon', 'public.ai_runs', 'user_hidden_at', 'SELECT') then
    raise exception 'T6 FAIL: anon can read user_hidden_at';
  end if;
  if has_function_privilege('authenticated', 'public.ai_runs_retention()', 'EXECUTE') then
    raise exception 'T6 FAIL: authenticated can run the retention';
  end if;
end $$;

select 'ai_history_l12: T0–T6 passed' as result;
