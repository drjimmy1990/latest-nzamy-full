-- l11_scrape.test.sql — proves 20261201_30 (batch l11, builder scrape):
--   * the settings ship OFF with the owner's 5 and the chosen numbers;
--   * library_public_view_hit: 'off' writes nothing; ON: the 6th distinct
--     document of a viewer is refused, a re-open is free, the address subject
--     refuses on its own (several sessions behind one address), a verified
--     crawler has its own number, a visitor agent shares one number, numbers
--     come from the row; invalid subjects refused;
--   * library_public_view_stats counts the refusals and the crawler rows;
--   * O19: the 'sequential' and 'parallel' rules raise a review flag; an
--     ADMIN is flagged too (R67); a switched-off rule raises nothing;
--   * library_review_flags_claim_email claims each flag once;
--   * grants: no anon / authenticated privilege on any new table or function.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261201_30
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_auth_sessions_live.sql $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261103_10_library_auto_lock_hours.sql \
--     $M/20261108_20_library_device_limit.sql \
--     $R/prelude_platform_settings_min.sql $R/prelude_l7_community.sql \
--     $M/20261127_60_community_review_devices_freeze.sql \
--     $M/20261128_30_library_public_guard.sql \
--     $R/prelude_l9_read.sql $M/20261129_40_library_read_log.sql \
--     $M/20261201_30_library_scrape_guard.sql $M/20261201_30_library_scrape_guard.sql \
--     $R/l11_scrape.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261201_30 files fails at T0.

\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.library_public_view_hit(text,text[],text,boolean)') is null then
    raise exception 'T0 FAIL: 20261201_30 is not applied';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

create or replace function pg_temp.st(doc text, subjects text[], crawler text default null, verified boolean default null)
returns text language sql as $$
  select h.status || coalesce('|' || h.subject, '') from public.library_public_view_hit(doc, subjects, crawler, verified) h
$$;

insert into auth.users (id) values
  ('9b000000-0000-0000-0000-0000000000b1'),
  ('9b000000-0000-0000-0000-0000000000b2'),
  ('9b000000-0000-0000-0000-0000000000b3')
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('9b000000-0000-0000-0000-0000000000b1', 'lawyer', 'S1'),
  ('9b000000-0000-0000-0000-0000000000b2', 'admin', 'S2'),
  ('9b000000-0000-0000-0000-0000000000b3', 'lawyer', 'S3')
on conflict do nothing;

-- T1 settings: shipped OFF, the owner's 5
select pg_temp.expect('T1 off', (select non_subscriber_view_limit_enabled::text from public.library_monitor_settings where id), 'false');
select pg_temp.expect('T1 five', (select non_subscriber_daily_view_limit::text from public.library_monitor_settings where id), '5');
select pg_temp.expect('T1 address 20', (select non_subscriber_address_daily_limit::text from public.library_monitor_settings where id), '20');
select pg_temp.expect('T1 amazonbot on probation (off)',
  (select (crawler_view_limits -> 'amazonbot' ->> 'on') from public.library_monitor_settings where id), 'false');
select pg_temp.expect('T1 no staff address in the repo', (select cardinality(alert_emails)::text from public.library_monitor_settings where id), '0');

-- T2 grants
select pg_temp.expect('T2 tables closed', (
  select bool_or(has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT'))::text
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.library_public_views', 'public.library_crawler_daily', 'public.library_read_sessions']) t), 'false');
select pg_temp.expect('T2 functions closed', (
  select bool_or(has_function_privilege(r, f, 'EXECUTE'))::text
    from unnest(array['anon', 'authenticated']) r,
         unnest(array['public.library_public_view_hit(text,text[],text,boolean)', 'public.library_public_view_stats(int)',
                      'public.library_review_flags_claim_email(int,int)', 'public.library_read_session_seen(uuid,text,text)',
                      'public.library_monitor_evaluate(uuid)']) f), 'false');

-- T3 OFF: nothing is counted, nothing written
select pg_temp.expect('T3 off', pg_temp.st('law:a', array['u:9b000000-0000-0000-0000-0000000000b1']), 'off');
select pg_temp.expect('T3 nothing written', (select count(*)::text from public.library_public_views), '0');

-- T4 ON: a signed-in non-subscriber, 5 distinct documents, the 6th refused, re-open free
update public.library_monitor_settings set non_subscriber_view_limit_enabled = true where id;
select pg_temp.st('law:d' || n, array['u:9b000000-0000-0000-0000-0000000000b1']) from generate_series(1, 5) n;
select pg_temp.expect('T4 sixth refused', pg_temp.st('law:d6', array['u:9b000000-0000-0000-0000-0000000000b1']),
  'over|u:9b000000-0000-0000-0000-0000000000b1');
select pg_temp.expect('T4 re-open free', pg_temp.st('law:d3', array['u:9b000000-0000-0000-0000-0000000000b1']),
  'ok|u:9b000000-0000-0000-0000-0000000000b1');
select pg_temp.expect('T4 limit and reset', (
  select (h.day_limit = 5 and h.used = 5 and h.resets_at > now()
          and (h.resets_at at time zone 'Asia/Riyadh')::time = '00:00')::text
    from public.library_public_view_hit('law:d7', array['u:9b000000-0000-0000-0000-0000000000b1']) h), 'true');
select pg_temp.expect('T4 refused rows recorded', (
  select count(*)::text from public.library_public_views where subject = 'u:9b000000-0000-0000-0000-0000000000b1' and not allowed), '2');
-- the number comes from the row
update public.library_monitor_settings set non_subscriber_daily_view_limit = 6 where id;
select pg_temp.expect('T4 raised to 6', pg_temp.st('law:d6', array['u:9b000000-0000-0000-0000-0000000000b1']),
  'ok|u:9b000000-0000-0000-0000-0000000000b1');
update public.library_monitor_settings set non_subscriber_daily_view_limit = 5 where id;

-- T5 guests: per session, and the address on its own (4 sessions × 5 = 20)
select pg_temp.st('law:g' || n, array['s:sessAAAA', 'a:addrXXXX']) from generate_series(1, 5) n;
select pg_temp.expect('T5 session sixth refused', pg_temp.st('law:g6', array['s:sessAAAA', 'a:addrXXXX']), 'over|s:sessAAAA');
select pg_temp.st('law:g' || n, array['s:sess' || s, 'a:addrXXXX']) from generate_series(1, 5) n, unnest(array['BBBB', 'CCCC', 'DDDD']) s;
select pg_temp.expect('T5 address full', (select count(*)::text from public.library_public_views where subject = 'a:addrXXXX' and allowed), '5');
select pg_temp.expect('T5 address = distinct documents', pg_temp.st('law:h1', array['s:sessEEEE', 'a:addrXXXX']), 'ok|s:sessEEEE');
update public.library_monitor_settings set non_subscriber_address_daily_limit = 6 where id;
select pg_temp.expect('T5 address refuses on its own', pg_temp.st('law:h2', array['s:sessFFFF', 'a:addrXXXX']), 'over|a:addrXXXX');
select pg_temp.expect('T5 another address unaffected', pg_temp.st('law:h2', array['s:sessFFFF', 'a:addrYYYY']), 'ok|s:sessFFFF');
update public.library_monitor_settings set non_subscriber_address_daily_limit = 20 where id;

-- T6 a verified crawler has its own number; the stats row counts it
update public.library_monitor_settings
   set crawler_view_limits = jsonb_set(crawler_view_limits, '{googlebot,daily}', '2') where id;
select pg_temp.expect('T6 crawler 1', pg_temp.st('law:c1', array['c:googlebot'], 'googlebot', true), 'ok|c:googlebot');
select pg_temp.expect('T6 crawler 2', pg_temp.st('law:c2', array['c:googlebot'], 'googlebot', true), 'ok|c:googlebot');
select pg_temp.expect('T6 crawler 3 refused', pg_temp.st('law:c3', array['c:googlebot'], 'googlebot', true), 'over|c:googlebot');
-- a fake «Googlebot» (not proven) is counted as the visitor it is
select pg_temp.expect('T6 fake crawler = visitor', pg_temp.st('law:c1', array['s:fakeGGGG', 'a:addrZZZZ'], 'googlebot', false), 'ok|s:fakeGGGG');
select pg_temp.expect('T6 crawler stats', (
  select verified || '/' || not_verified || '/' || refused from public.library_crawler_daily
   where provider = 'googlebot' and day = (now() at time zone 'Asia/Riyadh')::date), '3/1/1');

-- T7 a visitor agent shares one number per provider
update public.library_monitor_settings set agent_view_limits = '{"chatgpt-user":1,"claude-user":100,"perplexity-user":100}' where id;
select pg_temp.expect('T7 agent 1', pg_temp.st('law:p1', array['s:agntAAAA', 'a:addrQQQQ', 'p:chatgpt-user']), 'ok|s:agntAAAA');
select pg_temp.expect('T7 agent 2 (other session) refused', pg_temp.st('law:p2', array['s:agntBBBB', 'a:addrRRRR', 'p:chatgpt-user']), 'over|p:chatgpt-user');

-- T8 bad input
do $$
begin
  perform public.library_public_view_hit('law:x', array['x:bad']);
  raise exception 'T8 FAIL: a bad subject was accepted';
exception when sqlstate '22023' then null;
end $$;
do $$
begin
  perform public.library_public_view_hit('law:x', array['u:a', 'u:b', 'u:c', 'u:d', 'u:e']);
  raise exception 'T8 FAIL: five subjects were accepted';
exception when sqlstate '22023' then null;
end $$;

-- T9 stats
select pg_temp.expect('T9 stats today', (
  -- d7 (u), g6 (session A), c3 (crawler), p2 (agent); h2 was opened later from another address
  select ((d -> 'refusals')::int || '/' || (d -> 'capped')::int || '/' || (d -> 'accounts')::int)
    from jsonb_array_elements(public.library_public_view_stats(7) -> 'days') d
   where d ->> 'day' = ((now() at time zone 'Asia/Riyadh')::date)::text), '4/4/1');
select pg_temp.expect('T9 crawler rows', (jsonb_array_length(public.library_public_view_stats(7) -> 'crawlers') >= 1)::text, 'true');

-- ═════ O19 ═══════════════════════════════════════════════════════════════════
-- Only the two new rules for these checks.
update public.library_monitor_settings
   set rule_hour_requests_on = false, rule_hour_searches_on = false, rule_week_docs_on = false,
       rule_sustained_on = false, rule_night_on = false, rule_near_cap_on = false,
       rule_sequence_on = true, rule_sequence_docs = 20, rule_sequence_gap_seconds = 20,
       rule_parallel_on = true, rule_parallel_sessions = 3, rule_parallel_minutes = 10,
       reflag_quiet_hours = 0, flag_action = 'notify'
 where id;

-- T10 sequential: 19 documents 5 s apart → no flag; the 20th → flag
insert into public.full_text_reads (user_id, day, doc_key, opened_at)
select '9b000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Riyadh')::date, 'seq:' || n,
       now() - make_interval(secs => 5 * (20 - n))
  from generate_series(1, 19) n;
-- and a slow one an hour earlier (a gap breaks the run)
insert into public.full_text_reads (user_id, day, doc_key, opened_at)
values ('9b000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Riyadh')::date, 'seq:early', now() - interval '1 hour');
select pg_temp.expect('T10 19 in a row: no flag', public.library_monitor_evaluate('9b000000-0000-0000-0000-0000000000b1'), null);
insert into public.full_text_reads (user_id, day, doc_key, opened_at)
values ('9b000000-0000-0000-0000-0000000000b1', (now() at time zone 'Asia/Riyadh')::date, 'seq:20', now());
select pg_temp.expect('T10 20 in a row: flagged',
  (public.library_monitor_evaluate('9b000000-0000-0000-0000-0000000000b1') like 'REV-%')::text, 'true');
select pg_temp.expect('T10 rule', (
  select rule || ':' || (details ->> 'sequence_docs') from public.library_review_flags
   where user_id = '9b000000-0000-0000-0000-0000000000b1' and cleared_at is null), 'sequential:20');

-- T11 parallel, on an ADMIN (R67): 2 sessions → nothing, the 3rd → flag
select pg_temp.expect('T11 session 1', public.library_read_session_seen('9b000000-0000-0000-0000-0000000000b2', 's:adminSess1', 'addrHash01'), null);
select pg_temp.expect('T11 session 1 again', public.library_read_session_seen('9b000000-0000-0000-0000-0000000000b2', 's:adminSess1', 'addrHash01'), null);
select pg_temp.expect('T11 session 2', public.library_read_session_seen('9b000000-0000-0000-0000-0000000000b2', 'a:addrHash02', null), null);
select pg_temp.expect('T11 session 3 flags the admin',
  (public.library_read_session_seen('9b000000-0000-0000-0000-0000000000b2', 's:adminSess3', 'addrHash03') like 'REV-%')::text, 'true');
select pg_temp.expect('T11 rule', (
  select rule || ':' || (details ->> 'parallel_sessions') from public.library_review_flags
   where user_id = '9b000000-0000-0000-0000-0000000000b2' and cleared_at is null), 'parallel:3');
do $$
begin
  perform public.library_read_session_seen('9b000000-0000-0000-0000-0000000000b2', 'bad key', null);
  raise exception 'T11 FAIL: a bad session key was accepted';
exception when sqlstate '22023' then null;
end $$;

-- T12 a switched-off rule raises nothing
update public.library_monitor_settings set rule_parallel_on = false where id;
select public.library_read_session_seen('9b000000-0000-0000-0000-0000000000b3', 's:userSess' || n, null) from generate_series(1, 5) n;
select pg_temp.expect('T12 no flag', (select count(*)::text from public.library_review_flags
   where user_id = '9b000000-0000-0000-0000-0000000000b3'), '0');

-- T13 the e-mail claim: each flag once, with the account type, never twice
select pg_temp.expect('T13 first claim', (
  select string_agg(c.rule || '/' || coalesce(c.user_type, '-'), ',' order by c.rule)
    from public.library_review_flags_claim_email(24, 20) c), 'parallel/admin,sequential/lawyer');
select pg_temp.expect('T13 second claim empty', (select count(*)::text from public.library_review_flags_claim_email(24, 20)), '0');

-- T14 the evaluator is the 20261201_30 one (no admin exemption)
select pg_temp.expect('T14 marker', (strpos(pg_get_functiondef('public.library_monitor_evaluate(uuid)'::regprocedure), 'l11_scrape') > 0)::text, 'true');

select 'l11_scrape tests: OK' as result;
