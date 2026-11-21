-- l12_rules.test.sql — proves 20261202_50 (batch l12, builder «rules»):
--   * Q94a: a library exception with an end — permanent without one; ignored
--     once expires_at has passed; held while a library grant covers now when
--     it ends with the subscription; the type's switch answers otherwise;
--   * Q100a: the list cap is OFF (writes nothing, every item allowed); ON:
--     the daily and weekly numbers, an item already served today is free, an
--     item served earlier this week counts for the day only, the address
--     subject stops on its own, numbers come from the row, bad input 22023,
--     stats;
--   * Q121: ai_free_question_tool (individual from the setting, default
--     quick-answer; others the library assistant); ai_start_free_question
--     follows it ('assistant' accepted only when it is the account's tool);
--   * Q96: the setting row and decrees_circulars.summary_status;
--   * grants: no anon / authenticated privilege on anything new.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261202_50
-- runs TWICE (re-runnable), then its _verify.sql block. From the repo root,
-- in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l12_rules.sql
--   sed -n '/^-- >>> verify:l12_rules/,/^-- <<< verify:l12_rules/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
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
--     $M/20261202_50_l12_rules.sql $M/20261202_50_l12_rules.sql "$B" \
--     $R/l12_rules.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261202_50 files and the
-- verify block fails at T0.
--
-- Every assertion RAISES.

\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.library_public_list_hit(text[],text[])') is null
     or to_regprocedure('public.ai_free_question_tool(uuid)') is null then
    raise exception 'T0 FAIL: 20261202_50 is not applied';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

insert into auth.users (id, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000d0001', now()),   -- firm
  ('00000000-0000-0000-0000-0000000d0002', now()),   -- individual
  ('00000000-0000-0000-0000-0000000d0003', now())    -- lawyer
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000d0001', 'firm', 'F'),
  ('00000000-0000-0000-0000-0000000d0002', 'individual', 'I'),
  ('00000000-0000-0000-0000-0000000d0003', 'lawyer', 'L')
on conflict do nothing;
insert into public.lawyer_profiles (user_id, practice_kind) values
  ('00000000-0000-0000-0000-0000000d0003', 'advocate')
on conflict do nothing;
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

create or replace function pg_temp.firm_open() returns text language sql as $$
  select a.allowed::text || '/' || a.via from public.library_access_for('00000000-0000-0000-0000-0000000d0001') a $$;

-- T1 Q94a: the exception's end
do $$
begin
  perform pg_temp.expect('T1a firm closed by its type', pg_temp.firm_open(), 'false/type');
  insert into public.library_access_user_overrides (user_id, allowed, reason)
    values ('00000000-0000-0000-0000-0000000d0001', true, 'test');
  perform pg_temp.expect('T1b permanent exception', pg_temp.firm_open(), 'true/override');
  update public.library_access_user_overrides set expires_at = now() - interval '1 minute'
   where user_id = '00000000-0000-0000-0000-0000000d0001';
  perform pg_temp.expect('T1c expired exception ignored', pg_temp.firm_open(), 'false/type');
  update public.library_access_user_overrides set expires_at = now() + interval '7 days'
   where user_id = '00000000-0000-0000-0000-0000000d0001';
  perform pg_temp.expect('T1d dated exception in force', pg_temp.firm_open(), 'true/override');
  update public.library_access_user_overrides set expires_at = null, ends_with_subscription = true
   where user_id = '00000000-0000-0000-0000-0000000d0001';
  perform pg_temp.expect('T1e ends with the subscription, none held', pg_temp.firm_open(), 'false/type');
  insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at)
    values ('00000000-0000-0000-0000-0000000d0001', 'lib-q1', 'admin', now() - interval '1 day', now() + interval '89 days');
  perform pg_temp.expect('T1f ends with the subscription, one held', pg_temp.firm_open(), 'true/override');
  update public.library_access_grants set ends_at = now() - interval '1 minute', starts_at = now() - interval '91 days'
   where user_id = '00000000-0000-0000-0000-0000000d0001';
  perform pg_temp.expect('T1g subscription ended', pg_temp.firm_open(), 'false/type');
  update public.library_access_user_overrides set expires_at = now() + interval '3 days'
   where user_id = '00000000-0000-0000-0000-0000000d0001';
  perform pg_temp.expect('T1h purchase window (date) with the subscription rule', pg_temp.firm_open(), 'true/override');
  raise notice 'T1 PASS: the exception ends with its date or with the subscription';
end $$;

-- T2 Q100a: OFF writes nothing and allows everything
do $$
declare r record;
begin
  if (select non_subscriber_list_limit_enabled from public.library_monitor_settings where id) then
    raise exception 'T2 FAIL: the list cap does not ship OFF';
  end if;
  perform pg_temp.expect('T2 defaults',
    (select non_subscriber_list_daily_limit || '/' || non_subscriber_list_weekly_limit || '/' ||
            non_subscriber_list_address_daily_limit || '/' || non_subscriber_list_address_weekly_limit
       from public.library_monitor_settings where id), '30/100/150/500');
  select * into r from public.library_public_list_hit(array['u:t2'], array['law:a', 'law:b']);
  perform pg_temp.expect('T2 status off', r.status, 'off');
  perform pg_temp.expect('T2 all allowed', array_to_string(r.allowed, ','), 'law:a,law:b');
  if exists (select 1 from public.library_public_list_items) then
    raise exception 'T2 FAIL: OFF wrote rows';
  end if;
  raise notice 'T2 PASS: OFF';
end $$;

-- T3 ON: the daily number, a free re-serve, the order, a repeat in one request
do $$
declare r record;
begin
  update public.library_monitor_settings
     set non_subscriber_list_limit_enabled = true, non_subscriber_list_daily_limit = 3, non_subscriber_list_weekly_limit = 100
   where id;
  select * into r from public.library_public_list_hit(array['u:t3'], array['law:a', 'law:b', 'law:a', 'law:c', 'law:d', 'law:e']);
  perform pg_temp.expect('T3a status', r.status, 'partial');
  perform pg_temp.expect('T3a allowed', array_to_string(r.allowed, ','), 'law:a,law:b,law:c');
  perform pg_temp.expect('T3a window', r.cap_window || '/' || r.subject || '/' || r.day_limit, 'day/u:t3/3');
  if r.resets_at is null then raise exception 'T3a FAIL: no resets_at for the day window'; end if;
  select * into r from public.library_public_list_hit(array['u:t3'], array['law:c', 'law:a']);
  perform pg_temp.expect('T3b a re-serve is free', r.status || ':' || array_to_string(r.allowed, ','), 'ok:law:c,law:a');
  select * into r from public.library_public_list_hit(array['u:t3'], array['law:z']);
  perform pg_temp.expect('T3c over', r.status || ':' || coalesce(array_to_string(r.allowed, ','), ''), 'over:');
  perform pg_temp.expect('T3 rows', (select count(*)::text from public.library_public_list_items where subject = 'u:t3'), '3');
  raise notice 'T3 PASS: daily number, free re-serve, order kept';
end $$;

-- T4 the weekly number: an item served earlier this week counts for the day only
do $$
declare
  r     record;
  v_day date := (now() at time zone 'Asia/Riyadh')::date;
begin
  update public.library_monitor_settings set non_subscriber_list_daily_limit = 3, non_subscriber_list_weekly_limit = 4 where id;
  insert into public.library_public_list_items (subject, day, item_key) values
    ('u:t4', v_day - 1, 'law:e'), ('u:t4', v_day - 1, 'law:f'), ('u:t4', v_day - 2, 'law:g'),
    ('u:t4', v_day - 9, 'law:old');
  select * into r from public.library_public_list_hit(array['u:t4'], array['law:e', 'law:h', 'law:i']);
  perform pg_temp.expect('T4 allowed', array_to_string(r.allowed, ','), 'law:e,law:h');
  perform pg_temp.expect('T4 window', r.status || '/' || r.cap_window || '/' || r.week_limit, 'partial/week/4');
  if r.resets_at is not null then raise exception 'T4 FAIL: a weekly stop names a midnight reset'; end if;
  if exists (select 1 from public.library_public_list_items where subject = 'u:t4' and item_key = 'law:old') then
    raise exception 'T4 FAIL: a 9-day-old row was not cleared';
  end if;
  raise notice 'T4 PASS: weekly number, the week''s items free for the week';
end $$;

-- T5 the address subject stops on its own; the session is still under its number
do $$
declare r record;
begin
  update public.library_monitor_settings
     set non_subscriber_list_daily_limit = 30, non_subscriber_list_weekly_limit = 100,
         non_subscriber_list_address_daily_limit = 2
   where id;
  select * into r from public.library_public_list_hit(array['s:sess5', 'a:addr5'], array['book:1', 'book:2', 'book:3']);
  perform pg_temp.expect('T5', r.status || '/' || array_to_string(r.allowed, ',') || '/' || r.subject || '/' || r.cap_window,
    'partial/book:1,book:2/a:addr5/day');
  raise notice 'T5 PASS: the address number';
end $$;

-- T6 bad input, stats
do $$
declare s jsonb;
begin
  begin
    perform * from public.library_public_list_hit(array['c:googlebot'], array['law:a']);
    raise exception 'T6 FAIL: a crawler subject was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform * from public.library_public_list_hit(array['u:x'], array[repeat('x', 301)]);
    raise exception 'T6 FAIL: a 301-character item was accepted';
  exception when sqlstate '22023' then null;
  end;
  s := public.library_public_list_stats(7);
  if jsonb_array_length(s -> 'days') < 1
     or ((s -> 'days' -> 0 ->> 'refusedRequests')::int) < 3
     or ((s -> 'days' -> 0 ->> 'refusedItems')::int) < 5 then
    raise exception 'T6 FAIL: stats %', s;
  end if;
  raise notice 'T6 PASS: bad input refused, stats count the refusals';
end $$;

-- T7 Q121: the free-question tool
create or replace function pg_temp.ask(p_user uuid, p_tool text, p_key text)
returns table (run_id uuid, created boolean, charged boolean) language sql as $$
  select x.run_id, x.created, x.charged
    from public.ai_start_free_question(p_user, p_tool, null, 'fast', 0, 60, p_key,
      now() + interval '90 seconds', false, '{"question":"q","message":"q"}'::jsonb) x;
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

do $$
declare r record;
begin
  perform pg_temp.expect('T7a individual default', public.ai_free_question_tool('00000000-0000-0000-0000-0000000d0002'), 'quick-answer');
  perform pg_temp.expect('T7a lawyer', public.ai_free_question_tool('00000000-0000-0000-0000-0000000d0003'), 'library-assistant');
  perform pg_temp.expect('T7b assistant not the individual''s tool yet',
    pg_temp.refusal('00000000-0000-0000-0000-0000000d0002', 'assistant', 'l12-i-0001'), 'free_question_not_eligible');
  update public.platform_settings set value = '{"individual": "assistant"}'::jsonb where key = 'free_question_tool_by_account_type';
  perform pg_temp.expect('T7c individual on the assistant', public.ai_free_question_tool('00000000-0000-0000-0000-0000000d0002'), 'assistant');
  perform pg_temp.expect('T7c quick-answer no longer free',
    pg_temp.refusal('00000000-0000-0000-0000-0000000d0002', 'quick-answer', 'l12-i-0002'), 'free_question_not_eligible');
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000d0002', 'assistant', 'l12-i-0003');
  if not r.created or r.charged then raise exception 'T7d FAIL: the individual''s assistant question was not free: %', r; end if;
  if (select s.allowance from public.ai_free_question_status('00000000-0000-0000-0000-0000000d0002') s) <> 5 then
    raise exception 'T7d FAIL: the individual lost his 5 while the library is closed for individuals';
  end if;
  update public.platform_settings set value = '{"individual": "library-assistant"}'::jsonb where key = 'free_question_tool_by_account_type';
  perform pg_temp.expect('T7e a value outside the list reads as quick-answer',
    public.ai_free_question_tool('00000000-0000-0000-0000-0000000d0002'), 'quick-answer');
  update public.platform_settings set value = '{"individual": "quick-answer"}'::jsonb where key = 'free_question_tool_by_account_type';
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000d0003', 'library-assistant', 'l12-l-0001');
  if not r.created or r.charged then raise exception 'T7f FAIL: the lawyer''s library question was not free: %', r; end if;
  perform pg_temp.expect('T7g a fourth tool', pg_temp.refusal('00000000-0000-0000-0000-0000000d0003', 'contract-review', 'l12-l-0002'), 'invalid');
  raise notice 'T7 PASS: the free-question tool follows the setting';
end $$;

-- T8 Q96 + grants
do $$
declare
  fn text;
  t  text;
begin
  perform pg_temp.expect('T8 reviewed-only ships ON',
    (select value::text from public.platform_settings where key = 'library_summaries_reviewed_only'), '{"on": true}');
  -- the decree status column: nullable, draft | reviewed only, no session grant
  if to_regclass('library.decrees_circulars') is null then
    raise exception 'T8 SETUP: the chain must start with 20260626_legal_library_schema.sql';
  end if;
  begin
    insert into library.decrees_circulars (title, type, summary_status) values ('قرار', 'royal', 'approved');
    raise exception 'T8 FAIL: summary_status accepted a value outside draft / reviewed';
  exception when check_violation then null;
  end;
  insert into library.decrees_circulars (title, type, summary_status) values ('قرار', 'royal', 'reviewed');
  -- Live, decrees_circulars has no table-level session grant since 20261019_40
  -- (column grants only); the bare 20260626 schema of this chain still has
  -- one. Drop it as live did, then prove 20261202_50 granted no column.
  revoke select on library.decrees_circulars from anon, authenticated;
  if has_column_privilege('anon', 'library.decrees_circulars', 'summary_status', 'SELECT')
     or has_column_privilege('authenticated', 'library.decrees_circulars', 'summary_status', 'SELECT') then
    raise exception 'T8 FAIL: a session role can read decrees_circulars.summary_status';
  end if;
  foreach fn in array array['public.library_public_list_hit(text[],text[])', 'public.library_public_list_stats(int)',
                            'public.ai_free_question_tool(uuid)', 'public.library_access_for(uuid)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
       or not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'T8 FAIL: wrong EXECUTE grants on %', fn;
    end if;
  end loop;
  foreach t in array array['public.library_public_list_items', 'public.library_public_list_daily'] loop
    if has_table_privilege('anon', t, 'SELECT') or has_table_privilege('authenticated', t, 'SELECT')
       or has_table_privilege('authenticated', t, 'INSERT') then
      raise exception 'T8 FAIL: a session role can touch %', t;
    end if;
  end loop;
  raise notice 'T8 PASS: settings and grants';
end $$;

select 'l12_rules: all assertions passed' as result;
