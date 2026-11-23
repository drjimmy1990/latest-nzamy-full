-- l13_assistant.test.sql — proves 20261203_50 (batch l13, builder «assistant»):
--   * Q181: the individual's free questions move to the floating window
--     («مساعد نظامي», tool 'floating') — the seeded "quick-answer" row is
--     moved ONCE, a re-run keeps an admin's later choice; ai_tools.floating
--     copies quick-answer's mode once; ai_free_question_tool defaults to
--     'floating'; ai_start_free_question takes 'floating' only as the
--     account's own tool: 5 free, the 6th refused, a failed run gives its
--     question back, an unverified e-mail / a lawyer / another tool refused,
--     nothing spent while points are not enforced;
--   * Q182: the listen_voice setting row;
--   * grants: both functions service_role only.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261203_50
-- runs TWICE with an admin's choices in between, then the free-question
-- verify blocks (old and new: the caller greps their rows), then this file.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l13_assistant.sql
--   for id in free_daily_question_1108 l7_points l8_liblock l9_public l12_rules l13_assistant; do
--     sed -n "/^-- >>> verify:$id/,/^-- <<< verify:$id/p" $M/_verify.sql; done > "$B"
--   bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql $M/20261127_40_points_wallets.sql \
--     $R/prelude_l8_liblock.sql $M/20261128_20_library_access_by_account_type.sql \
--     $M/20261129_60_free_questions_general_assistant.sql \
--     $R/prelude_auth_sessions_live.sql $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261103_10_library_auto_lock_hours.sql $M/20261108_20_library_device_limit.sql \
--     $R/prelude_l7_community.sql $M/20261127_60_community_review_devices_freeze.sql \
--     $M/20261128_30_library_public_guard.sql \
--     $R/prelude_l9_read.sql $M/20261129_40_library_read_log.sql \
--     $M/20261201_30_library_scrape_guard.sql \
--     $M/20261202_50_l12_rules.sql \
--     $R/prelude_l13_assistant.sql $M/20261203_50_l13_assistant.sql \
--     $R/prelude_l13_assistant_rerun.sql $M/20261203_50_l13_assistant.sql \
--     "$B" $R/l13_assistant.test.sql
-- NEGATIVE CONTROLS: (1) the same chain without the two 20261203_50 files
-- (and the rerun prelude) fails at the prelude / T0; (2) with
-- 20261202_50_l12_rules.sql appended after the second 20261203_50 (the
-- re-run hazard) the l13_assistant verify rows read f and this file fails at T0.
--
-- Every assertion RAISES.

\set ON_ERROR_STOP on

do $$
begin
  if pg_catalog.strpos(coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.ai_free_question_tool(uuid)')), ''), 'then v_tool else ''floating'' end') = 0
     or pg_catalog.strpos(coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)')), ''), '''assistant'', ''floating'')') = 0 then
    raise exception 'T0 FAIL: 20261203_50 is not applied (or 20261202_50 ran after it)';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

create or replace function pg_temp.ask(p_user uuid, p_tool text, p_key text)
returns table (run_id uuid, created boolean, charged boolean) language sql as $$
  select x.run_id, x.created, x.charged
    from public.ai_start_free_question(p_user, p_tool, null, 'fast', 0, 10, p_key,
      now() + interval '90 seconds', false, '{"question":"سؤال قانوني للتجربة"}'::jsonb) x;
$$;
create or replace function pg_temp.refusal(p_user uuid, p_tool text, p_key text)
returns text language plpgsql as $$
begin
  perform * from pg_temp.ask(p_user, p_tool, p_key);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
when sqlstate '22023' then
  return 'invalid';
end $$;

insert into auth.users (id, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000e0001', now()),   -- individual A
  ('00000000-0000-0000-0000-0000000e0002', null),    -- individual B, e-mail not verified
  ('00000000-0000-0000-0000-0000000e0003', now()),   -- lawyer
  ('00000000-0000-0000-0000-0000000e0004', now())    -- individual C
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000e0001', 'individual', 'A'),
  ('00000000-0000-0000-0000-0000000e0002', 'individual', 'B'),
  ('00000000-0000-0000-0000-0000000e0003', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000e0004', 'individual', 'C')
on conflict do nothing;
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- T1 a re-run keeps the admin's later choices; the setting rows
do $$
begin
  perform pg_temp.expect('T1a admin moved the individual back to quick-answer: kept',
    (select value ->> 'individual' from public.platform_settings where key = 'free_question_tool_by_account_type'), 'quick-answer');
  perform pg_temp.expect('T1b the description names Q181',
    (select (description like '%Q181%')::text from public.platform_settings where key = 'free_question_tool_by_account_type'), 'true');
  perform pg_temp.expect('T1c admin switched floating off: kept',
    (select value -> 'floating' ->> 'mode' from public.platform_settings where key = 'ai_tools'), 'off');
  perform pg_temp.expect('T1d the general assistant''s own entry untouched',
    (select value -> 'quick-answer' ->> 'mode' from public.platform_settings where key = 'ai_tools'), 'live');
  perform pg_temp.expect('T1e listen_voice: the admin''s voice kept',
    (select value ->> 'voice' from public.platform_settings where key = 'listen_voice'), 'Microsoft Hamed');
  update public.platform_settings set value = '{"individual": "floating"}'::jsonb where key = 'free_question_tool_by_account_type';
  raise notice 'T1 PASS: moved once, an admin''s later choice survives a re-run';
end $$;

-- T2 the tool rule
do $$
begin
  perform pg_temp.expect('T2a individual', public.ai_free_question_tool('00000000-0000-0000-0000-0000000e0001'), 'floating');
  perform pg_temp.expect('T2b lawyer', public.ai_free_question_tool('00000000-0000-0000-0000-0000000e0003'), 'library-assistant');
  update public.platform_settings set value = '{"individual": "library-assistant"}'::jsonb where key = 'free_question_tool_by_account_type';
  perform pg_temp.expect('T2c a value outside the list → floating', public.ai_free_question_tool('00000000-0000-0000-0000-0000000e0001'), 'floating');
  update public.platform_settings set value = '"floating"'::jsonb where key = 'free_question_tool_by_account_type';
  perform pg_temp.expect('T2d not an object → floating', public.ai_free_question_tool('00000000-0000-0000-0000-0000000e0001'), 'floating');
  update public.platform_settings set value = '{"individual": "assistant"}'::jsonb where key = 'free_question_tool_by_account_type';
  perform pg_temp.expect('T2e the admin''s assistant', public.ai_free_question_tool('00000000-0000-0000-0000-0000000e0001'), 'assistant');
  update public.platform_settings set value = '{"individual": "floating"}'::jsonb where key = 'free_question_tool_by_account_type';
  raise notice 'T2 PASS: floating by default, the setting''s choices honoured';
end $$;

-- T3 five free in the floating window, the sixth refused; others refused
do $$
declare
  r record;
  i int;
begin
  for i in 1..5 loop
    select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000e0001', 'floating', 'l13-a-000' || i);
    if not coalesce(r.created, false) or coalesce(r.charged, true) then
      raise exception 'T3a FAIL: floating question % was not a free start: %', i, r;
    end if;
  end loop;
  perform pg_temp.expect('T3b five use rows on floating',
    (select count(*)::text from public.ai_free_question_uses where user_id = '00000000-0000-0000-0000-0000000e0001' and tool = 'floating'), '5');
  perform pg_temp.expect('T3c the sixth', pg_temp.refusal('00000000-0000-0000-0000-0000000e0001', 'floating', 'l13-a-0006'), 'free_question_used');
  perform pg_temp.expect('T3d the status says none left',
    (select s.allowance::text || '/' || s.used::text from public.ai_free_question_status('00000000-0000-0000-0000-0000000e0001') s), '5/5');
  perform pg_temp.expect('T3e quick-answer is no longer the individual''s free tool',
    pg_temp.refusal('00000000-0000-0000-0000-0000000e0004', 'quick-answer', 'l13-c-0001'), 'free_question_not_eligible');
  perform pg_temp.expect('T3f unverified e-mail', pg_temp.refusal('00000000-0000-0000-0000-0000000e0002', 'floating', 'l13-b-0001'), 'free_question_not_eligible');
  perform pg_temp.expect('T3g a lawyer in the floating window', pg_temp.refusal('00000000-0000-0000-0000-0000000e0003', 'floating', 'l13-l-0001'), 'free_question_not_eligible');
  perform pg_temp.expect('T3h a tool outside the list', pg_temp.refusal('00000000-0000-0000-0000-0000000e0004', 'contract-review', 'l13-c-0002'), 'invalid');
  -- a retried request answers as the duplicate, spending nothing more
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000e0001', 'floating', 'l13-a-0001');
  if coalesce(r.created, true) then raise exception 'T3i FAIL: a retried key started a new run'; end if;
  raise notice 'T3 PASS: 5 free, the 6th refused, others not eligible';
end $$;

-- T4 a failed run gives its question back
do $$
declare r record;
begin
  update public.ai_runs set status = 'failed'
   where id = (select run_id from public.ai_free_question_uses
                where user_id = '00000000-0000-0000-0000-0000000e0001' order by created_at limit 1);
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000e0001', 'floating', 'l13-a-0007');
  if not coalesce(r.created, false) or coalesce(r.charged, true) then raise exception 'T4 FAIL: the returned question did not start free: %', r; end if;
  perform pg_temp.expect('T4b and then none again', pg_temp.refusal('00000000-0000-0000-0000-0000000e0001', 'floating', 'l13-a-0008'), 'free_question_used');
  raise notice 'T4 PASS: a failed run is not counted';
end $$;

-- T5 the admin's other choices still work
do $$
declare r record;
begin
  update public.platform_settings set value = '{"individual": "quick-answer"}'::jsonb where key = 'free_question_tool_by_account_type';
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000e0004', 'quick-answer', 'l13-c-0003');
  if not coalesce(r.created, false) or coalesce(r.charged, true) then raise exception 'T5a FAIL: quick-answer chosen, its question not free: %', r; end if;
  perform pg_temp.expect('T5b floating not the tool then', pg_temp.refusal('00000000-0000-0000-0000-0000000e0004', 'floating', 'l13-c-0004'), 'free_question_not_eligible');
  update public.platform_settings set value = '{"individual": "floating"}'::jsonb where key = 'free_question_tool_by_account_type';
  raise notice 'T5 PASS: quick-answer still a working choice';
end $$;

-- T6 points not enforced: a normal run, nothing spent from the allowance
do $$
declare
  r record;
  before int;
begin
  before := (select count(*) from public.ai_free_question_uses where user_id = '00000000-0000-0000-0000-0000000e0004');
  update public.platform_settings set value = 'false'::jsonb where key = 'points_enforcement';
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000e0004', 'floating', 'l13-c-0005');
  if not coalesce(r.created, false) or coalesce(r.charged, true) then raise exception 'T6 FAIL: %', r; end if;
  perform pg_temp.expect('T6b no use row', (select count(*)::int - before from public.ai_free_question_uses
                                              where user_id = '00000000-0000-0000-0000-0000000e0004')::text, '0');
  update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';
  raise notice 'T6 PASS: nothing spent while points are not enforced';
end $$;

-- T7 grants
do $$
declare fn text;
begin
  foreach fn in array array['public.ai_free_question_tool(uuid)', 'public.ai_free_question_status(uuid)',
                            'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
       or not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'T7 FAIL: wrong EXECUTE grants on %', fn;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_start_free_question') <> 1 then
    raise exception 'T7 FAIL: a second ai_start_free_question overload';
  end if;
  raise notice 'T7 PASS: service role only';
end $$;

select 'l13_assistant: all assertions passed' as result;
