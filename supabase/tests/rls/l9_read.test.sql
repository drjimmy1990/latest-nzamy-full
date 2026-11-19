-- l9_read.test.sql — proves 20261129_40 (batch l9, builder read):
--   * full_text_reads exists, RLS on, no session role reaches it, backfill;
--   * the warning (30) and weekly cap (150) columns with their defaults;
--   * library_read_quota_hit: one log row per (day, document), re-open free,
--     51st distinct document refused (over_daily), 150 over the last 7 Riyadh
--     days refused (over_weekly) with a reset time, an ADMIN is counted and
--     refused too (no exemption);
--   * library_device_gate / _code_verify never end a platform session; the
--     third device is 'refused' (never 'suspend');
--   * library_min_points_to_browse = {"points": 50}.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261129_40
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
--     $R/prelude_l9_read.sql \
--     $M/20261129_40_library_read_log.sql $M/20261129_40_library_read_log.sql \
--     $R/l9_read.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261129_40 files fails at T0.

\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.full_text_reads') is null then
    raise exception 'T0 FAIL: 20261129_40 is not applied';
  end if;
end $$;

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- Actors: R1 reader (lawyer), A1 admin, D9 device user. The backfill user BF
-- comes from prelude_l9_read.sql.
insert into auth.users (id) values
  ('9a000000-0000-0000-0000-0000000000a1'),
  ('9a000000-0000-0000-0000-0000000000a2'),
  ('9a000000-0000-0000-0000-0000000000d9')
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('9a000000-0000-0000-0000-0000000000a1', 'lawyer', 'R1'),
  ('9a000000-0000-0000-0000-0000000000a2', 'admin', 'A1'),
  ('9a000000-0000-0000-0000-0000000000d9', 'individual', 'D9')
on conflict do nothing;

-- T1 the table, its guard and the backfill
select pg_temp.expect('T1 RLS on',
  (select relrowsecurity::text from pg_class where oid = 'public.full_text_reads'::regclass), 'true');
select pg_temp.expect('T1 anon cannot read', has_table_privilege('anon', 'public.full_text_reads', 'SELECT')::text, 'false');
select pg_temp.expect('T1 authenticated cannot read', has_table_privilege('authenticated', 'public.full_text_reads', 'SELECT')::text, 'false');
select pg_temp.expect('T1 backfill: the allowed row only',
  (select string_agg(doc_key, ',') from public.full_text_reads where user_id = '9a000000-0000-0000-0000-0000000000bf'), 'law:backfilled');

-- T2 the settings
select pg_temp.expect('T2 warning 30', (select daily_full_read_limit::text from public.library_monitor_settings where id), '30');
select pg_temp.expect('T2 weekly 150', (select weekly_full_read_limit::text from public.library_monitor_settings where id), '150');
select pg_temp.expect('T2 hard cap 50', (select daily_docs::text from public.library_monitor_settings where id), '50');
select pg_temp.expect('T2 points gate', (select value::text from public.platform_settings where key = 'library_min_points_to_browse'), '{"points": 50}');
-- the hourly cap would stop a loop of 51 documents first: lift it for the test
update public.library_monitor_settings set hourly_docs = 100000, lock_after_refused = 0 where id;

create or replace function pg_temp.hit(u uuid, doc text) returns record language sql as $$
  select (h.status, h.used_today, h.week_used, h.week_limit, h.warn_at, h.resets_at, h.week_resets_at)
    from public.library_read_quota_hit(u, doc, 50, 50, 50, 60) h
$$;
create or replace function pg_temp.st(u uuid, doc text) returns text language sql as $$
  select h.status from public.library_read_quota_hit(u, doc, 50, 50, 50, 60) h
$$;

-- T3 one log row per day and document; re-open is free
select pg_temp.expect('T3 first open', pg_temp.st('9a000000-0000-0000-0000-0000000000a1', 'law:a'), 'ok');
select pg_temp.expect('T3 re-open', pg_temp.st('9a000000-0000-0000-0000-0000000000a1', 'law:a'), 'ok');
select pg_temp.expect('T3 one row',
  (select count(*)::text from public.full_text_reads where user_id = '9a000000-0000-0000-0000-0000000000a1'), '1');
select pg_temp.expect('T3 warn_at reported',
  (select h.warn_at::text from public.library_read_quota_hit('9a000000-0000-0000-0000-0000000000a1', null, 50, 50, 50, 60) h), '30');

-- T4 the 51st distinct document of the day is refused, and not logged
select pg_temp.st('9a000000-0000-0000-0000-0000000000a1', 'law:d' || n) from generate_series(2, 50) n;
select pg_temp.expect('T4 50 logged',
  (select count(*)::text from public.full_text_reads where user_id = '9a000000-0000-0000-0000-0000000000a1'), '50');
select pg_temp.expect('T4 51st', pg_temp.st('9a000000-0000-0000-0000-0000000000a1', 'law:d51'), 'over_daily');
select pg_temp.expect('T4 not logged',
  (select count(*)::text from public.full_text_reads where user_id = '9a000000-0000-0000-0000-0000000000a1'), '50');
select pg_temp.expect('T4 an old one still opens', pg_temp.st('9a000000-0000-0000-0000-0000000000a1', 'law:d7'), 'ok');

-- T5 the admin is counted and refused like everyone (no exemption)
select pg_temp.expect('T5 admin counted', pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:x1'), 'ok');
select pg_temp.expect('T5 admin logged',
  (select count(*)::text from public.full_text_reads where user_id = '9a000000-0000-0000-0000-0000000000a2'), '1');
select pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:x' || n) from generate_series(2, 50) n;
select pg_temp.expect('T5 admin 51st', pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:x51'), 'over_daily');

-- T6 the 7-day window: 120 documents over the 6 previous Riyadh days + 30
-- today = 150 → the next is over_weekly, even under the daily cap.
delete from public.full_text_reads where user_id = '9a000000-0000-0000-0000-0000000000a2';
delete from public.library_read_quota_docs where user_id = '9a000000-0000-0000-0000-0000000000a2';
insert into public.full_text_reads (user_id, day, doc_key)
select '9a000000-0000-0000-0000-0000000000a2', (now() at time zone 'Asia/Riyadh')::date - (1 + (n % 6)), 'old:' || n
  from generate_series(1, 120) n;
-- and 40 more 8 days ago: outside the window, never counted
insert into public.full_text_reads (user_id, day, doc_key)
select '9a000000-0000-0000-0000-0000000000a2', (now() at time zone 'Asia/Riyadh')::date - 8, 'older:' || n
  from generate_series(1, 40) n;
select pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:w' || n) from generate_series(1, 30) n;
select pg_temp.expect('T6 week used 150',
  (select h.week_used::text from public.library_read_quota_hit('9a000000-0000-0000-0000-0000000000a2', null, 50, 50, 50, 60) h), '150');
select pg_temp.expect('T6 151st refused weekly', pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:w31'), 'over_weekly');
select pg_temp.expect('T6 reset is a future Riyadh midnight',
  (select (h.resets_at > now() and h.resets_at = h.week_resets_at
           and ((h.resets_at at time zone 'Asia/Riyadh')::time = '00:00'))::text
     from public.library_read_quota_hit('9a000000-0000-0000-0000-0000000000a2', 'law:w32', 50, 50, 50, 60) h), 'true');
-- the oldest of the 6 days (day-6: n%6 = 5 → 20 docs) leaves first: 130 < 150 → tomorrow midnight
select pg_temp.expect('T6 reset = tomorrow',
  (select ((h.week_resets_at at time zone 'Asia/Riyadh')::date - (now() at time zone 'Asia/Riyadh')::date)::text
     from public.library_read_quota_hit('9a000000-0000-0000-0000-0000000000a2', null, 50, 50, 50, 60) h), '1');
select pg_temp.expect('T6 re-open still free', pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:w5'), 'ok');

-- T7 a per-user daily cap above the global one lifts the weekly cap (7 ×)
insert into public.library_user_limits (user_id, daily_docs, hourly_docs, source)
values ('9a000000-0000-0000-0000-0000000000a2', 100, 1000, 'admin')
on conflict (user_id) do update set daily_docs = 100, hourly_docs = 1000;
select pg_temp.expect('T7 week limit 700',
  (select h.week_limit::text from public.library_read_quota_hit('9a000000-0000-0000-0000-0000000000a2', null, 50, 50, 50, 60) h), '700');
select pg_temp.expect('T7 opens again', pg_temp.st('9a000000-0000-0000-0000-0000000000a2', 'law:w40'), 'ok');

-- ═════ devices: library only ═════════════════════════════════════════════════
create or replace function pg_temp.h(t text) returns text language sql as $$
  select encode(sha256(convert_to(t, 'UTF8')), 'hex')
$$;
create or replace function pg_temp.gate(d text, s uuid, code boolean default true) returns text language sql as $$
  select status from public.library_device_gate('9a000000-0000-0000-0000-0000000000d9'::uuid, pg_temp.h(d), 'جهاز', s, code)
$$;
update public.library_monitor_settings set device_limit_enabled = true where id;
insert into auth.sessions (id, user_id) values
  ('5e900000-0000-0000-0000-000000000001', '9a000000-0000-0000-0000-0000000000d9'),
  ('5e900000-0000-0000-0000-000000000002', '9a000000-0000-0000-0000-0000000000d9'),
  ('5e900000-0000-0000-0000-000000000003', '9a000000-0000-0000-0000-0000000000d9');

-- T8 a new device verified by its code ends NO other session
select pg_temp.expect('T8 new device', pg_temp.gate('d9-1', '5e900000-0000-0000-0000-000000000001'), 'needs_code');
select public.library_device_code_issue('9a000000-0000-0000-0000-0000000000d9', pg_temp.h('d9-1'), pg_temp.h('code-1'));
select pg_temp.expect('T8 verified, 0 sessions ended',
  public.library_device_code_verify('9a000000-0000-0000-0000-0000000000d9', pg_temp.h('d9-1'), pg_temp.h('code-1'),
                                    '5e900000-0000-0000-0000-000000000001') ->> 'sessions_ended', '0');
select pg_temp.expect('T8 all 3 sessions alive',
  (select count(*)::text from auth.sessions where user_id = '9a000000-0000-0000-0000-0000000000d9'), '3');

-- T9 the verified device opening with another session ends nothing
select pg_temp.expect('T9 ok', pg_temp.gate('d9-1', '5e900000-0000-0000-0000-000000000002'), 'ok');
select pg_temp.expect('T9 still 3',
  (select count(*)::text from auth.sessions where user_id = '9a000000-0000-0000-0000-0000000000d9'), '3');

-- T10 no code possible → registered, still nothing ended
select pg_temp.expect('T10 registered', pg_temp.gate('d9-2', '5e900000-0000-0000-0000-000000000003', false), 'registered');
select pg_temp.expect('T10 still 3',
  (select count(*)::text from auth.sessions where user_id = '9a000000-0000-0000-0000-0000000000d9'), '3');

-- T11 the third device is refused with the list — never 'suspend'
select pg_temp.expect('T11 third refused', pg_temp.gate('d9-3', '5e900000-0000-0000-0000-000000000003'), 'refused');
select pg_temp.expect('T11 list of 2',
  (select jsonb_array_length(devices)::text from public.library_device_gate('9a000000-0000-0000-0000-0000000000d9'::uuid,
     pg_temp.h('d9-3'), 'x', null, true)), '2');
select pg_temp.expect('T11 account untouched',
  (select count(*)::text from auth.sessions where user_id = '9a000000-0000-0000-0000-0000000000d9'), '3');

select 'l9_read tests' as step, true as ok;
