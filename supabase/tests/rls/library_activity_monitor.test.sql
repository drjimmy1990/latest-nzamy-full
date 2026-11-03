-- library_activity_monitor.test.sql — proves 20261031_10 («نشاط المكتبة»):
-- the settings row and per-user limits drive library_read_quota_hit (called
-- with the app's 6 arguments, unchanged), documents are counted per hour, the
-- review rules raise ONE open flag per user, the flag actions (notify / slow /
-- lock), the admins' notifications (one per flag, one per automatic lock),
-- the quiet period, retention, the top-readers function and re-running.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261031_10
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql $M/20261031_10_library_activity_monitor.sql $R/library_activity_monitor.test.sql
--
-- NEGATIVE CONTROL (must FAIL at T0):
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $R/library_activity_monitor.test.sql
--
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.library_activity_bump(jsonb)') is null then
    raise exception 'T0 FAIL: public.library_activity_bump does not exist (20261031_10 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users
  select ('00000000-0000-0000-0000-00000000d1' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 12) i;
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000d101', 'individual', 'A'),
  ('00000000-0000-0000-0000-00000000d102', 'firm', 'F'),
  ('00000000-0000-0000-0000-00000000d103', 'admin', 'M'),
  ('00000000-0000-0000-0000-00000000d104', 'individual', 'B'),
  ('00000000-0000-0000-0000-00000000d105', 'individual', 'C'),
  ('00000000-0000-0000-0000-00000000d106', 'individual', 'D'),
  ('00000000-0000-0000-0000-00000000d107', 'individual', 'E'),
  ('00000000-0000-0000-0000-00000000d108', 'individual', 'G'),
  ('00000000-0000-0000-0000-00000000d109', 'individual', 'H'),
  ('00000000-0000-0000-0000-00000000d110', 'individual', 'N'),
  ('00000000-0000-0000-0000-00000000d111', 'admin', 'M2'),
  ('00000000-0000-0000-0000-00000000d112', 'individual', 'R');

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;
-- The app's call, exactly as src/lib/library/readQuotaServer.ts makes it today.
create or replace function pg_temp.q(u text, k text)
returns table (status text, used_today int, day_limit int, used_hour int, hour_limit int,
               refused_today int, lock_reference text, locked_until timestamptz, resets_at timestamptz)
language sql as $$
  select * from public.library_read_quota_hit(u::uuid, k, 220, 400, 120, 60)
$$;
create or replace function pg_temp.bump(u text, r int, s int default 0, a int default 0) returns int language sql as $$
  select public.library_activity_bump(jsonb_build_array(jsonb_build_object('u', u, 'h', now(), 'r', r, 's', s, 'a', a)))
$$;
create or replace function pg_temp.notes() returns int language sql as $$
  select count(*)::int from public.notifications
$$;

-- T1 the seeded row = the old constants; then every rule off so each test turns on its own
do $$
declare s public.library_monitor_settings;
begin
  select * into s from public.library_monitor_settings;
  perform pg_temp.expect('T1 seeded caps', format('%s/%s/%s/%s', s.daily_docs, s.member_daily_docs, s.hourly_docs, s.lock_after_refused), '220/400/120/60');
  perform pg_temp.expect('T1 seeded action', s.flag_action, 'notify');
end $$;
update public.library_monitor_settings set
  daily_docs = 3, member_daily_docs = 5, hourly_docs = 50, lock_after_refused = 0,
  rule_hour_requests_on = false, rule_hour_searches_on = false, rule_week_docs_on = false,
  rule_sustained_on = false, rule_night_on = false, rule_near_cap_on = false;

-- T2 the settings win over the app's arguments (220/400/120/60): 3 docs for an individual, 5 for a firm
do $$
declare r record;
begin
  perform pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:1');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:2');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:3');
  perform pg_temp.expect('T2a third', r.status || '/' || r.day_limit, 'ok/3');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:4');
  perform pg_temp.expect('T2b fourth refused', r.status || '/' || r.day_limit, 'over_daily/3');
  perform pg_temp.expect('T2c hour limit from settings', r.hour_limit::text, '50');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d102', 'law:1');
  perform pg_temp.expect('T2d firm tier', r.day_limit::text, '5');
end $$;

-- T3 documents are counted into the hourly activity, once each
do $$
begin
  perform pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:1'); -- re-open: not a new document
  perform pg_temp.expect('T3 docs this hour',
    (select docs::text from public.library_activity_hourly
      where user_id = '00000000-0000-0000-0000-00000000d101' and hour = date_trunc('hour', now())), '3');
end $$;

-- T4 a per-user limit wins (lower here); an expired one no longer applies; raising works too
insert into public.library_user_limits (user_id, daily_docs, source, note)
  values ('00000000-0000-0000-0000-00000000d105', 1, 'admin', 'test');
do $$
declare r record;
begin
  perform pg_temp.q('00000000-0000-0000-0000-00000000d105', 'law:1');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d105', 'law:2');
  perform pg_temp.expect('T4a override 1', r.status || '/' || r.day_limit, 'over_daily/1');
  update public.library_user_limits set daily_docs = 10, hourly_docs = 40 where user_id = '00000000-0000-0000-0000-00000000d105';
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d105', 'law:3');
  perform pg_temp.expect('T4b raised', r.status || '/' || r.day_limit || '/' || r.hour_limit, 'ok/10/40');
  update public.library_user_limits set until = now() - interval '1 minute', set_at = now() - interval '1 hour'
   where user_id = '00000000-0000-0000-0000-00000000d105';
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d105', null);
  perform pg_temp.expect('T4c expired → settings', r.day_limit::text, '3');
  update public.library_user_limits set until = null where user_id = '00000000-0000-0000-0000-00000000d105';
end $$;

-- T5 an admin stays exempt, even with a limit row
insert into public.library_user_limits (user_id, daily_docs, source) values ('00000000-0000-0000-0000-00000000d103', 1, 'admin');
do $$
begin
  perform pg_temp.expect('T5 admin', (select status from pg_temp.q('00000000-0000-0000-0000-00000000d103', 'law:1')), 'exempt');
end $$;

-- T6 lock_after_refused comes from the settings; the automatic lock notifies each admin ONCE
update public.library_monitor_settings set lock_after_refused = 2;
do $$
declare r record; before int := pg_temp.notes();
begin
  -- A already has law:4 refused (T2b) → one more distinct refused document locks
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:5');
  perform pg_temp.expect('T6a locked', r.status, 'locked');
  perform pg_temp.expect('T6b one note per admin', (pg_temp.notes() - before)::text, '2');
  perform pg_temp.expect('T6c note title',
    (select title from public.notifications where user_id = '00000000-0000-0000-0000-00000000d103' order by id desc limit 1),
    'أُوقفت قراءة المكتبة لحساب تلقائياً');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:6');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d101', 'law:7');
  perform pg_temp.expect('T6d no more notes while locked', (pg_temp.notes() - before)::text, '2');
end $$;
-- with the alert off, an automatic lock is silent
update public.library_monitor_settings set notify_on_auto_lock = false;
do $$
declare before int := pg_temp.notes();
begin
  perform pg_temp.q('00000000-0000-0000-0000-00000000d112', 'law:1');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d112', 'law:2');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d112', 'law:3');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d112', 'law:4');
  perform pg_temp.expect('T6e locked silently', (select status from pg_temp.q('00000000-0000-0000-0000-00000000d112', 'law:5')), 'locked');
  perform pg_temp.expect('T6f no note', (pg_temp.notes() - before)::text, '0');
end $$;
update public.library_monitor_settings set notify_on_auto_lock = true, lock_after_refused = 0;

-- T7 the hour-requests rule: one flag, one note per admin; a second batch adds neither
update public.library_monitor_settings set rule_hour_requests_on = true, rule_hour_requests = 10;
do $$
declare before int := pg_temp.notes(); f public.library_review_flags;
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d104', 6);
  perform pg_temp.expect('T7a under the line', (select count(*)::text from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d104'), '0');
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d104', 6);
  select * into f from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d104';
  perform pg_temp.expect('T7b flagged', f.rule || '/' || f.action_taken || '/' || (f.details->>'hour_requests'), 'hour_requests/notify/12');
  perform pg_temp.expect('T7c reference', (f.reference like 'REV-%')::text, 'true');
  perform pg_temp.expect('T7d notes', (pg_temp.notes() - before)::text, '2');
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d104', 50);
  perform pg_temp.expect('T7e still one flag', (select count(*)::text from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d104'), '1');
  perform pg_temp.expect('T7f no new notes', (pg_temp.notes() - before)::text, '2');
  perform pg_temp.expect('T7g counted', (select requests::text from public.library_activity_hourly
     where user_id = '00000000-0000-0000-0000-00000000d104' and hour = date_trunc('hour', now())), '62');
end $$;

-- T8 an admin is never flagged; notify_admins off = a flag without a note
do $$
declare before int;
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d103', 500);
  perform pg_temp.expect('T8a admin not flagged', (select count(*)::text from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d103'), '0');
  update public.library_monitor_settings set notify_admins = false;
  before := pg_temp.notes();
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d110', 20);
  perform pg_temp.expect('T8b flagged silently', (select count(*)::text from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d110'), '1');
  perform pg_temp.expect('T8c no note', (pg_temp.notes() - before)::text, '0');
  update public.library_monitor_settings set notify_admins = true;
end $$;

-- T9 action 'slow': the flagged reader gets the slow limits; an admin's own limit is kept
update public.library_monitor_settings set flag_action = 'slow', slow_daily_docs = 2, slow_hourly_docs = 1, slow_hours = 24;
do $$
declare r record; l public.library_user_limits;
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d106', 20);
  select * into l from public.library_user_limits where user_id = '00000000-0000-0000-0000-00000000d106';
  perform pg_temp.expect('T9a slow row', l.source || '/' || l.daily_docs || '/' || l.hourly_docs, 'auto_slow/2/1');
  perform pg_temp.expect('T9b until ~24h', (l.until between now() + interval '23 hours' and now() + interval '25 hours')::text, 'true');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d106', 'law:1');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000d106', 'law:2');
  perform pg_temp.expect('T9c slowed', r.status || '/' || r.hour_limit, 'over_hourly/1');
  -- C holds an admin limit (T4): flagged with 'slow', the admin's row stays
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d105', 20);
  select * into l from public.library_user_limits where user_id = '00000000-0000-0000-0000-00000000d105';
  perform pg_temp.expect('T9d admin row kept', l.source || '/' || l.daily_docs, 'admin/10');
  perform pg_temp.expect('T9e flag says slow', (select action_taken from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d105'), 'slow');
end $$;

-- T10 action 'lock': a library lock with reason activity_flag; the reader is locked
update public.library_monitor_settings set flag_action = 'lock';
do $$
declare lk public.library_security_locks;
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d107', 20);
  select * into lk from public.library_security_locks where user_id = '00000000-0000-0000-0000-00000000d107' and lifted_at is null;
  perform pg_temp.expect('T10a lock', lk.reason, 'activity_flag');
  perform pg_temp.expect('T10b flag ref in lock', (lk.details->>'flag_reference' like 'REV-%')::text, 'true');
  perform pg_temp.expect('T10c reader locked', (select status from pg_temp.q('00000000-0000-0000-0000-00000000d107', 'law:1')), 'locked');
end $$;
update public.library_monitor_settings set flag_action = 'notify';

-- T11 the quiet period after a clear; 0 hours = re-flag at once
update public.library_review_flags set cleared_at = now(), clear_note = 'checked'
 where user_id = '00000000-0000-0000-0000-00000000d104' and cleared_at is null;
do $$
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d104', 50);
  perform pg_temp.expect('T11a quiet', (select count(*)::text from public.library_review_flags
     where user_id = '00000000-0000-0000-0000-00000000d104' and cleared_at is null), '0');
  update public.library_monitor_settings set reflag_quiet_hours = 0;
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d104', 1);
  perform pg_temp.expect('T11b re-flagged', (select count(*)::text from public.library_review_flags
     where user_id = '00000000-0000-0000-0000-00000000d104'), '2');
  update public.library_monitor_settings set reflag_quiet_hours = 24;
end $$;
update public.library_monitor_settings set rule_hour_requests_on = false;

-- T12 near the daily cap (document count from the quota table, limit from the settings)
update public.library_monitor_settings set rule_near_cap_on = true, rule_near_cap_pct = 60;
do $$
begin
  perform pg_temp.q('00000000-0000-0000-0000-00000000d108', 'law:1');
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d108', 1);
  perform pg_temp.expect('T12a 1 of 3 = 33%', (select count(*)::text from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d108'), '0');
  perform pg_temp.q('00000000-0000-0000-0000-00000000d108', 'law:2');
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d108', 1);
  perform pg_temp.expect('T12b 2 of 3 = 67%', (select rule from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d108'), 'near_cap');
end $$;
update public.library_monitor_settings set rule_near_cap_on = false;

-- T13 sustained pace + week total + night (rows written as the quota function would)
insert into public.library_activity_hourly (user_id, hour, docs)
  select '00000000-0000-0000-0000-00000000d109', date_trunc('hour', now()) - make_interval(hours => i), 40
    from generate_series(1, 7) i;
update public.library_monitor_settings set rule_sustained_on = true, rule_sustained_hours = 6, rule_sustained_min_docs = 30,
                                           rule_week_docs_on = true, rule_week_docs = 200;
do $$
declare f public.library_review_flags;
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d109', 1);
  select * into f from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d109';
  perform pg_temp.expect('T13a rules', array_to_string(f.rules, ','), 'week_docs,sustained');
  perform pg_temp.expect('T13b busy hours', f.details->>'busy_hours_24h', '7');
end $$;
update public.library_monitor_settings set rule_sustained_on = false, rule_week_docs_on = false;

update public.library_monitor_settings set rule_night_on = true, rule_night_docs = 10;
do $$
declare v_night timestamptz := (date_trunc('day', now() at time zone 'Asia/Riyadh') + interval '2 hours') at time zone 'Asia/Riyadh';
begin
  if v_night > now() then v_night := v_night - interval '1 day'; end if;
  insert into public.library_activity_hourly (user_id, hour, docs) values ('00000000-0000-0000-0000-00000000d102', v_night, 15);
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d102', 1);
  perform pg_temp.expect('T13c night', (select rule from public.library_review_flags where user_id = '00000000-0000-0000-0000-00000000d102'), 'night');
end $$;
update public.library_monitor_settings set rule_night_on = false;

-- T14 retention: rows older than retention_days go on the next batch
insert into public.library_activity_hourly (user_id, hour, requests)
  values ('00000000-0000-0000-0000-00000000d110', date_trunc('hour', now()) - interval '40 days', 5);
do $$
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d110', 1);
  perform pg_temp.expect('T14 old row gone', (select count(*)::text from public.library_activity_hourly
     where hour < now() - interval '30 days'), '0');
end $$;

-- T15 the top readers, most documents first
do $$
declare first uuid;
begin
  select user_id into first from public.library_activity_top(now() - interval '7 days', 5) limit 1;
  perform pg_temp.expect('T15 top', first::text, '00000000-0000-0000-0000-00000000d109');
end $$;

-- T16 the batch refuses junk; the lock reason check holds
do $$
begin
  begin
    perform public.library_activity_bump('{"u":1}'::jsonb);
    raise exception 'T16a FAIL: a non-array batch was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    insert into public.library_security_locks (user_id, reason) values ('00000000-0000-0000-0000-00000000d111', 'junk');
    raise exception 'T16b FAIL: reason junk accepted';
  exception when check_violation then null;
  end;
end $$;

-- T17 the bell links to the page when notifications has an href column
alter table public.notifications add column if not exists href text;
update public.library_monitor_settings set rule_hour_requests_on = true, rule_hour_requests = 10;
do $$
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000d112', 20);
  perform pg_temp.expect('T17 href', (select href from public.notifications order by id desc limit 1),
    '/dashboard/admin/security?tab=library_activity');
end $$;

-- T18 the session roles reach nothing
do $$
begin
  if has_function_privilege('authenticated', 'public.library_activity_bump(jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.library_activity_top(timestamptz,int)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.library_review_flags', 'SELECT')
     or has_table_privilege('authenticated', 'public.library_monitor_settings', 'UPDATE') then
    raise exception 'T18 FAIL: a session role holds a privilege';
  end if;
end $$;

select 'library_activity_monitor: ALL PASS' as result;
