-- l19_account_device_gate.test.sql — proves 20261209_40 (owner ٢٣٣ / LIVE-17):
--   one mobile + one computer per account, registered silently (a candidate
--   confirmed after a 2-minute wait), an extra device refused, admins and staff
--   exempt, firm members counted on their own, the label backfill,
--   grandfathered devices, old pending rows, parallel first ids that do not lock
--   a first device out, the admin reset, and the switch OFF by default.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261209_40
-- runs TWICE. From the repo root, in Git Bash:
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
--     $M/20261129_40_library_read_log.sql \
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $R/l19_account_device_seed.fixture.sql \
--     $M/20261209_40_l19_account_device_limit.sql $M/20261209_40_l19_account_device_limit.sql \
--     $R/l19_account_device_gate.test.sql
-- NEGATIVE CONTROLS (each must FAIL):
--   (a) the same chain without the two 20261209_40 lines → the first helper
--       fails to build (function public.account_device_gate does not exist);
--   (b) 20261209_40 with «and d.kind = v_kind» deleted (one slot for both
--       classes) → «A9 the lawyer's first phone FAIL: got refused, want pending»;
--   (c) 20261209_40 without the 2-minute wait («and v_row.first_seen <= now() -
--       interval '2 minutes'» deleted) → «A4 … FAIL: got registered, want pending».
--   (d) l19 review S4: 20261209_40 with «if v_recent >= 5 then» changed to
--       «if v_recent >= 500 then» (no bound) → «Z2 … FAIL: got pending/<id>, want pending/null».
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;
create or replace function pg_temp.h(n int) returns text language sql as $$
  select encode(sha256(convert_to('l19-device-' || n, 'UTF8')), 'hex');
$$;
create or replace function pg_temp.gate(p_user uuid, n int, p_kind text) returns text language sql as $$
  select status from public.account_device_gate(p_user, pg_temp.h(n), case p_kind when 'mobile' then 'جوال — Safari / iPhone' else 'كمبيوتر — Chrome / Windows' end, p_kind);
$$;
create or replace function pg_temp.kind_of(p_user uuid, n int) returns text language sql as $$
  select coalesce(d.kind, '<null>') from public.user_devices d where d.user_id = p_user and d.device_hash = pg_temp.h(n);
$$;
-- A candidate first seen 3 minutes ago (the 2-minute wait is over).
create or replace function pg_temp.age(p_user uuid, n int) returns void language sql as $$
  update public.user_devices d set first_seen = now() - interval '3 minutes'
   where d.user_id = p_user and d.device_hash = pg_temp.h(n);
$$;

-- L lawyer, A admin, S staff (a lawyer with a platform_staff row), M1/M2 two members of one firm, Q a fresh account.
insert into auth.users (id) values
  ('9c000000-0000-0000-0000-0000000000c1'),
  ('9c000000-0000-0000-0000-0000000000c2'),
  ('9c000000-0000-0000-0000-0000000000c3'),
  ('9c000000-0000-0000-0000-0000000000c4'),
  ('9c000000-0000-0000-0000-0000000000c5'),
  ('9c000000-0000-0000-0000-0000000000c8')
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('9c000000-0000-0000-0000-0000000000c1', 'lawyer', 'L'),
  ('9c000000-0000-0000-0000-0000000000c2', 'admin', 'A'),
  ('9c000000-0000-0000-0000-0000000000c3', 'lawyer', 'S'),
  ('9c000000-0000-0000-0000-0000000000c4', 'lawyer', 'M1'),
  ('9c000000-0000-0000-0000-0000000000c5', 'lawyer', 'M2'),
  ('9c000000-0000-0000-0000-0000000000c8', 'individual', 'Q')
on conflict do nothing;

-- B the backfill from the label (the fixture rows existed before the file ran).
select pg_temp.expect('B1 an old computer row',          pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c6', 101), 'desktop');
select pg_temp.expect('B2 the second old computer row',  pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c6', 102), 'desktop');
select pg_temp.expect('B3 an old phone row',             pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c6', 103), 'mobile');
select pg_temp.expect('B4 an unknown label stays null',  pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c6', 104), '<null>');

-- A0 the switch ships OFF, and the old library switch does not turn it on.
update public.library_monitor_settings set device_limit_enabled = true, device_limit = 1 where id;
select pg_temp.expect('A0 switch off by default', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'disabled');
select pg_temp.expect('A0 nothing written while off',
  (select pg_catalog.count(*)::text from public.user_devices d where d.user_id = '9c000000-0000-0000-0000-0000000000c1'), '0');

update public.library_monitor_settings set account_device_limit_enabled = true where id;

-- A the lawyer: one computer + one phone, silently; the extra ones refused.
select pg_temp.expect('A1 the lawyer''s first computer: a candidate', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'pending');
select pg_temp.expect('A2 … that holds no slot yet',
  (select (d.verified_at is null and d.kind = 'desktop')::text from public.user_devices d
    where d.user_id = '9c000000-0000-0000-0000-0000000000c1' and d.device_hash = pg_temp.h(1)), 'true');
select pg_temp.expect('A3 a second computer while the first is still a candidate', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 3, 'desktop'), 'pending');
select pg_temp.expect('A4 the first computer within the wait: still a candidate', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'pending');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c1', 1);
select pg_temp.expect('A5 the first computer after the wait: confirmed silently', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'registered');
select pg_temp.expect('A6 … verified now',
  (select (d.verified_at is not null)::text from public.user_devices d
    where d.user_id = '9c000000-0000-0000-0000-0000000000c1' and d.device_hash = pg_temp.h(1)), 'true');
select pg_temp.expect('A7 the other computer is now the extra one', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 3, 'desktop'), 'refused');
select pg_temp.expect('A8 a brand-new computer: refused at once', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 5, 'desktop'), 'refused');
select pg_temp.expect('A9 the lawyer''s first phone', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 2, 'mobile'), 'pending');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c1', 2);
select pg_temp.expect('A10 … confirmed after the wait', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 2, 'mobile'), 'registered');
select pg_temp.expect('A11 a second phone', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 4, 'mobile'), 'refused');
select pg_temp.expect('A12 a refusal writes no row',
  (select pg_catalog.count(*)::text from public.user_devices d
    where d.user_id = '9c000000-0000-0000-0000-0000000000c1' and d.device_hash in (pg_temp.h(4), pg_temp.h(5))), '0');
select pg_temp.expect('A13 the known computer', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'ok');
select pg_temp.expect('A14 the known phone, now claiming desktop', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 2, 'desktop'), 'ok');
select pg_temp.expect('A15 its stored class is kept', pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c1', 2), 'mobile');
select pg_temp.expect('A16 the two devices hold the two slots, neither signed out',
  (select pg_catalog.count(*)::text from public.user_devices d
    where d.user_id = '9c000000-0000-0000-0000-0000000000c1' and d.revoked_at is null and d.verified_at is not null), '2');

-- Q a fresh browser whose first parallel requests each minted an id: the id it keeps wins, no lock-out.
select pg_temp.expect('Q1 parallel id 1', pg_temp.gate('9c000000-0000-0000-0000-0000000000c8', 201, 'desktop'), 'pending');
select pg_temp.expect('Q2 parallel id 2', pg_temp.gate('9c000000-0000-0000-0000-0000000000c8', 202, 'desktop'), 'pending');
select pg_temp.expect('Q3 parallel id 3', pg_temp.gate('9c000000-0000-0000-0000-0000000000c8', 203, 'desktop'), 'pending');
select pg_temp.expect('Q4 the kept id (2) before the wait', pg_temp.gate('9c000000-0000-0000-0000-0000000000c8', 202, 'desktop'), 'pending');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c8', 201);
select pg_temp.age('9c000000-0000-0000-0000-0000000000c8', 202);
select pg_temp.age('9c000000-0000-0000-0000-0000000000c8', 203);
select pg_temp.expect('Q5 the kept id after the wait: confirmed', pg_temp.gate('9c000000-0000-0000-0000-0000000000c8', 202, 'desktop'), 'registered');
select pg_temp.expect('Q6 a dropped id never comes back; if it did, it is the extra one', pg_temp.gate('9c000000-0000-0000-0000-0000000000c8', 201, 'desktop'), 'refused');

-- E admins and staff are exempt; nothing is written for them.
select pg_temp.expect('E1 the admin, computer 1', pg_temp.gate('9c000000-0000-0000-0000-0000000000c2', 11, 'desktop'), 'exempt');
select pg_temp.expect('E2 the admin, computer 2', pg_temp.gate('9c000000-0000-0000-0000-0000000000c2', 12, 'desktop'), 'exempt');
select pg_temp.expect('E3 the admin, computer 3', pg_temp.gate('9c000000-0000-0000-0000-0000000000c2', 13, 'desktop'), 'exempt');
select pg_temp.expect('E4 no row for the admin',
  (select pg_catalog.count(*)::text from public.user_devices d where d.user_id = '9c000000-0000-0000-0000-0000000000c2'), '0');
-- Before platform_staff exists the staff member is an ordinary account (no error).
select pg_temp.expect('E5 no platform_staff table yet: counted', pg_temp.gate('9c000000-0000-0000-0000-0000000000c3', 21, 'desktop'), 'pending');
create table if not exists public.platform_staff (user_id uuid primary key, staff_role text);
insert into public.platform_staff (user_id, staff_role) values ('9c000000-0000-0000-0000-0000000000c3', 'support') on conflict do nothing;
select pg_temp.expect('E6 a staff member, his first computer', pg_temp.gate('9c000000-0000-0000-0000-0000000000c3', 21, 'desktop'), 'exempt');
select pg_temp.expect('E7 a staff member, a third computer',  pg_temp.gate('9c000000-0000-0000-0000-0000000000c3', 23, 'desktop'), 'exempt');

-- F two members of one firm: each has his own computer.
select pg_temp.expect('F1 member 1, computer', pg_temp.gate('9c000000-0000-0000-0000-0000000000c4', 31, 'desktop'), 'pending');
select pg_temp.expect('F2 member 2, computer', pg_temp.gate('9c000000-0000-0000-0000-0000000000c5', 32, 'desktop'), 'pending');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c4', 31);
select pg_temp.age('9c000000-0000-0000-0000-0000000000c5', 32);
select pg_temp.expect('F3 member 1, computer confirmed', pg_temp.gate('9c000000-0000-0000-0000-0000000000c4', 31, 'desktop'), 'registered');
select pg_temp.expect('F4 member 2, computer confirmed (independent)', pg_temp.gate('9c000000-0000-0000-0000-0000000000c5', 32, 'desktop'), 'registered');
select pg_temp.expect('F5 member 1, phone', pg_temp.gate('9c000000-0000-0000-0000-0000000000c4', 33, 'mobile'), 'pending');
select pg_temp.expect('F6 member 2 signing in on member 1''s computer is his own extra device',
  pg_temp.gate('9c000000-0000-0000-0000-0000000000c5', 31, 'desktop'), 'refused');

-- G grandfathered devices: every known row stays ok; a new one is refused.
select pg_temp.expect('G1 old computer 1',   pg_temp.gate('9c000000-0000-0000-0000-0000000000c6', 101, 'desktop'), 'ok');
select pg_temp.expect('G2 old computer 2',   pg_temp.gate('9c000000-0000-0000-0000-0000000000c6', 102, 'desktop'), 'ok');
select pg_temp.expect('G3 old phone',        pg_temp.gate('9c000000-0000-0000-0000-0000000000c6', 103, 'mobile'),  'ok');
select pg_temp.expect('G4 old unknown device', pg_temp.gate('9c000000-0000-0000-0000-0000000000c6', 104, 'desktop'), 'ok');
select pg_temp.expect('G5 … now classified', pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c6', 104), 'desktop');
select pg_temp.expect('G6 a new computer',   pg_temp.gate('9c000000-0000-0000-0000-0000000000c6', 106, 'desktop'), 'refused');
select pg_temp.expect('G7 a new phone',      pg_temp.gate('9c000000-0000-0000-0000-0000000000c6', 107, 'mobile'),  'refused');

-- P a row left waiting for an old e-mail code is a candidate like any other.
select pg_temp.expect('P1 a new phone beside the old pending phone', pg_temp.gate('9c000000-0000-0000-0000-0000000000c7', 108, 'mobile'), 'pending');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c7', 105);
select pg_temp.expect('P2 the old pending phone comes back: confirmed silently, no e-mail code', pg_temp.gate('9c000000-0000-0000-0000-0000000000c7', 105, 'mobile'), 'registered');
select pg_temp.expect('P3 the other phone is now the extra one', pg_temp.gate('9c000000-0000-0000-0000-0000000000c7', 108, 'mobile'), 'refused');

-- R the admin reset (library_device_revoke admin_reset): the next devices register.
select pg_temp.expect('R1 the reset revokes the lawyer''s rows (2 confirmed + 1 old candidate)',
  public.library_device_revoke('9c000000-0000-0000-0000-0000000000c1', null, null, 'admin_reset', '9c000000-0000-0000-0000-0000000000c2')::text, '3');
select pg_temp.expect('R2 the new computer after the reset', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 6, 'desktop'), 'pending');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c1', 6);
select pg_temp.expect('R3 … confirmed', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 6, 'desktop'), 'registered');
select pg_temp.expect('R4 the old computer is now the extra one', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'refused');
select pg_temp.expect('R5 the old phone comes back into the free phone slot', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 2, 'desktop'), 'pending');
select pg_temp.expect('R6 … in its stored class', pg_temp.kind_of('9c000000-0000-0000-0000-0000000000c1', 2), 'mobile');

-- Z l19 review S4: cookie-less requests cannot grow user_devices without end.
insert into auth.users (id) values ('9c000000-0000-0000-0000-0000000000c9') on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values ('9c000000-0000-0000-0000-0000000000c9', 'lawyer', 'Z') on conflict do nothing;
create or replace function pg_temp.rows_of(p_user uuid) returns text language sql as $$
  select pg_catalog.count(*)::text from public.user_devices d where d.user_id = p_user;
$$;
select pg_temp.expect('Z1 five parallel first ids of one computer: each a candidate', string_agg(pg_temp.gate('9c000000-0000-0000-0000-0000000000c9', n, 'desktop'), ','), 'pending,pending,pending,pending,pending')
  from generate_series(201, 205) n;
select pg_temp.expect('Z1 … five rows', pg_temp.rows_of('9c000000-0000-0000-0000-0000000000c9'), '5');
select pg_temp.expect('Z2 a sixth id within 10 minutes: allowed, no row, no id',
  (select g.status || '/' || coalesce(g.device_id::text, 'null') from public.account_device_gate('9c000000-0000-0000-0000-0000000000c9', pg_temp.h(206), 'كمبيوتر — Chrome / Windows', 'desktop') g), 'pending/null');
select pg_temp.expect('Z2 … still five rows', pg_temp.rows_of('9c000000-0000-0000-0000-0000000000c9'), '5');
select pg_temp.expect('Z3 the other class is counted on its own', pg_temp.gate('9c000000-0000-0000-0000-0000000000c9', 207, 'mobile'), 'pending');
select pg_temp.expect('Z3 … its row written', pg_temp.rows_of('9c000000-0000-0000-0000-0000000000c9'), '6');
select pg_temp.age('9c000000-0000-0000-0000-0000000000c9', 203);
select pg_temp.expect('Z4 the id the browser kept comes back after the wait: registered', pg_temp.gate('9c000000-0000-0000-0000-0000000000c9', 203, 'desktop'), 'registered');
select pg_temp.expect('Z5 the id that got no row is now the extra computer', pg_temp.gate('9c000000-0000-0000-0000-0000000000c9', 206, 'desktop'), 'refused');
-- stale rows: a candidate 2 days old (deleted), a revoked one 2 days old and the confirmed computer (kept)
insert into public.user_devices (user_id, device_hash, label, kind, first_seen, last_seen)
values ('9c000000-0000-0000-0000-0000000000c9', pg_temp.h(208), 'جوال — Safari / iPhone', 'mobile', now() - interval '2 days', now() - interval '2 days');
insert into public.user_devices (user_id, device_hash, label, kind, first_seen, last_seen, revoked_at, revoke_reason)
values ('9c000000-0000-0000-0000-0000000000c9', pg_temp.h(209), 'جوال — Safari / iPhone', 'mobile', now() - interval '2 days', now() - interval '2 days', now() - interval '1 day', 'admin_reset');
update public.user_devices d set first_seen = now() - interval '2 days'
 where d.user_id = '9c000000-0000-0000-0000-0000000000c9' and d.device_hash = pg_temp.h(203);
select pg_temp.expect('Z6 a new phone id: still a candidate', pg_temp.gate('9c000000-0000-0000-0000-0000000000c9', 210, 'mobile'), 'pending');
select pg_temp.expect('Z6 … the 2-day-old candidate is pruned',
  (select pg_catalog.count(*)::text from public.user_devices d where d.user_id = '9c000000-0000-0000-0000-0000000000c9' and d.device_hash = pg_temp.h(208)), '0');
select pg_temp.expect('Z6 … the revoked row and the confirmed computer are kept',
  (select pg_catalog.count(*)::text from public.user_devices d where d.user_id = '9c000000-0000-0000-0000-0000000000c9' and d.device_hash in (pg_temp.h(209), pg_temp.h(203))), '2');
select pg_temp.expect('Z6 … the confirmed computer still answers ok', pg_temp.gate('9c000000-0000-0000-0000-0000000000c9', 203, 'desktop'), 'ok');

-- O switch off again: nobody is refused.
update public.library_monitor_settings set account_device_limit_enabled = false where id;
select pg_temp.expect('O1 a refused device passes once the switch is off', pg_temp.gate('9c000000-0000-0000-0000-0000000000c1', 1, 'desktop'), 'disabled');

-- V bad arguments and grants.
do $$
begin
  perform public.account_device_gate('9c000000-0000-0000-0000-0000000000c1', pg_temp.h(1), 'x', 'tablet');
  raise exception 'V1 FAIL: an unknown class was accepted';
exception when sqlstate '22023' then
  raise notice 'V1 PASS: an unknown class is refused (22023)';
end $$;
select pg_temp.expect('V2 authenticated cannot call',
  has_function_privilege('authenticated', 'public.account_device_gate(uuid,text,text,text)', 'EXECUTE')::text, 'false');
select pg_temp.expect('V3 anon cannot call',
  has_function_privilege('anon', 'public.account_device_gate(uuid,text,text,text)', 'EXECUTE')::text, 'false');
select pg_temp.expect('V4 service_role can call',
  has_function_privilege('service_role', 'public.account_device_gate(uuid,text,text,text)', 'EXECUTE')::text, 'true');
select pg_temp.expect('V5 the old library gate is untouched (still no exemption)',
  (pg_catalog.strpos(pg_get_functiondef('public.library_device_gate(uuid,text,text,uuid,boolean)'::regprocedure), '''exempt''') = 0)::text, 'true');

do $$ begin raise notice 'l19_account_device_gate: ALL PASS'; end $$;
