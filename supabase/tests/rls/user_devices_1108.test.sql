-- user_devices_1108.test.sql — proves 20261108_20 (owner answer ٤٢٧): the
-- library device limit. public.user_devices, library_device_check,
-- library_device_revoke, and the two settings columns.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261108_20
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261108_20_library_device_limit.sql $M/20261108_20_library_device_limit.sql \
--     $R/user_devices_1108.test.sql
--
-- NEGATIVE CONTROL (must FAIL at T0):
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $R/user_devices_1108.test.sql
--
-- Actors: A …d001 individual, B …d002 individual, M …d003 admin.
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.library_device_check(uuid,text,text)') is null then
    raise exception 'T0 FAIL: public.library_device_check does not exist (20261108_20 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000d001'),
  ('00000000-0000-0000-0000-00000000d002'),
  ('00000000-0000-0000-0000-00000000d003');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000d001', 'individual', 'A'),
  ('00000000-0000-0000-0000-00000000d002', 'individual', 'B'),
  ('00000000-0000-0000-0000-00000000d003', 'admin', 'M');

-- stubs.sql's default privileges hand app_user every new table directly; on a
-- real project app_user does not exist and the signed-in role is
-- authenticated, which the migration's grants govern. Drop the stub's direct
-- grant so app_user holds exactly what authenticated holds.
revoke all on public.user_devices from app_user;

create or replace function pg_temp.h(n int) returns text language sql as $$
  select encode(sha256(convert_to('device-' || n, 'UTF8')), 'hex')
$$;
create or replace function pg_temp.chk(u text, n int, lbl text default 'كمبيوتر — Chrome / Windows')
returns text language sql as $$
  select status from public.library_device_check(u::uuid, pg_temp.h(n), lbl)
$$;
create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- T1 the settings ship OFF at 2
select pg_temp.expect('T1 default enabled', (select device_limit_enabled::text from public.library_monitor_settings where id), 'false');
select pg_temp.expect('T1 default limit', (select device_limit::text from public.library_monitor_settings where id), '2');

-- T2 disabled = always allowed, nothing written
select pg_temp.expect('T2 disabled 1', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 1), 'disabled');
select pg_temp.expect('T2 disabled 2', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 2), 'disabled');
select pg_temp.expect('T2 disabled 3', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 3), 'disabled');
select pg_temp.expect('T2 nothing written', (select count(*)::text from public.user_devices), '0');

update public.library_monitor_settings set device_limit_enabled = true where id;

-- T3 two devices register, the same device again is ok, the third is refused
select pg_temp.expect('T3 first', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 1), 'registered');
select pg_temp.expect('T3 second', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 2, 'جوال — Safari / iPhone'), 'registered');
select pg_temp.expect('T3 first again', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 1), 'ok');
select pg_temp.expect('T3 third', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 3), 'refused');
select pg_temp.expect('T3 third again', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 3), 'refused');
select pg_temp.expect('T3 refusal lists both devices',
  (select jsonb_array_length(devices)::text
     from public.library_device_check('00000000-0000-0000-0000-00000000d001', pg_temp.h(3), 'x')), '2');
select pg_temp.expect('T3 refusal limit',
  (select device_limit::text
     from public.library_device_check('00000000-0000-0000-0000-00000000d001', pg_temp.h(3), 'x')), '2');
select pg_temp.expect('T3 refusal list carries no hash',
  (select (devices::text like '%device_hash%')::text
     from public.library_device_check('00000000-0000-0000-0000-00000000d001', pg_temp.h(3), 'x')), 'false');
select pg_temp.expect('T3 two rows', (select count(*)::text from public.user_devices where user_id = '00000000-0000-0000-0000-00000000d001'), '2');

-- T4 another user's slots are his own
select pg_temp.expect('T4 B first', pg_temp.chk('00000000-0000-0000-0000-00000000d002', 1), 'registered');

-- T5 revoke frees a slot (the refused device revokes another one by id)
select pg_temp.expect('T5 revoke count',
  public.library_device_revoke('00000000-0000-0000-0000-00000000d001',
    (select id from public.user_devices where user_id = '00000000-0000-0000-0000-00000000d001' and device_hash = pg_temp.h(1)),
    null, 'other_device', '00000000-0000-0000-0000-00000000d001')::text, '1');
select pg_temp.expect('T5 third now registers', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 3), 'registered');
select pg_temp.expect('T5 revoked first is refused', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 1), 'refused');

-- T6 a revoke by id cannot touch another user's device
select pg_temp.expect('T6 cross-user revoke is a no-op',
  public.library_device_revoke('00000000-0000-0000-0000-00000000d001',
    (select id from public.user_devices where user_id = '00000000-0000-0000-0000-00000000d002'),
    null, 'other_device', null)::text, '0');
select pg_temp.expect('T6 B still ok', pg_temp.chk('00000000-0000-0000-0000-00000000d002', 1), 'ok');

-- T7 sign-out by hash frees the slot; the revoked row revives on re-register
select pg_temp.expect('T7 sign-out',
  public.library_device_revoke('00000000-0000-0000-0000-00000000d001', null, pg_temp.h(3), 'sign_out', '00000000-0000-0000-0000-00000000d001')::text, '1');
select pg_temp.expect('T7 first comes back', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 1), 'registered');
select pg_temp.expect('T7 three rows: device 1 revived, not duplicated',
  (select count(*)::text from public.user_devices where user_id = '00000000-0000-0000-0000-00000000d001'), '3');

-- T8 "revoke all" is the admin reset only
do $$
begin
  perform public.library_device_revoke('00000000-0000-0000-0000-00000000d001', null, null, 'self', null);
  raise exception 'T8 FAIL: revoke-all without admin_reset was accepted';
exception when sqlstate '22023' then null;
end $$;
select pg_temp.expect('T8 admin reset',
  public.library_device_revoke('00000000-0000-0000-0000-00000000d001', null, null, 'admin_reset', '00000000-0000-0000-0000-00000000d003')::text, '2');
select pg_temp.expect('T8 after reset a new device registers', pg_temp.chk('00000000-0000-0000-0000-00000000d001', 4), 'registered');

-- T9 the admin is exempt and nothing is written for him
select pg_temp.expect('T9 admin 1', pg_temp.chk('00000000-0000-0000-0000-00000000d003', 1), 'exempt');
select pg_temp.expect('T9 admin 2', pg_temp.chk('00000000-0000-0000-0000-00000000d003', 2), 'exempt');
select pg_temp.expect('T9 admin 3', pg_temp.chk('00000000-0000-0000-0000-00000000d003', 3), 'exempt');
select pg_temp.expect('T9 admin no rows', (select count(*)::text from public.user_devices where user_id = '00000000-0000-0000-0000-00000000d003'), '0');

-- T10 a limit of 1 refuses the second device
update public.library_monitor_settings set device_limit = 1 where id;
select pg_temp.expect('T10 B second refused at limit 1', pg_temp.chk('00000000-0000-0000-0000-00000000d002', 2), 'refused');
update public.library_monitor_settings set device_limit = 2 where id;

-- T11 bad arguments
do $$
begin
  perform public.library_device_check('00000000-0000-0000-0000-00000000d001', 'not-a-hash', 'x');
  raise exception 'T11 FAIL: a bad hash was accepted';
exception when sqlstate '22023' then null;
end $$;

-- T12 security: SECURITY DEFINER + empty search_path, the advisory lock, grants
do $$
declare
  fn text;
begin
  foreach fn in array array['public.library_device_check(uuid,text,text)',
                            'public.library_device_revoke(uuid,uuid,text,text,uuid)'] loop
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(fn) and p.prosecdef
                     and p.proconfig @> array['search_path=""']) then
      raise exception 'T12 FAIL: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if position('pg_advisory_xact_lock' in pg_get_functiondef(to_regprocedure(fn))) = 0 then
      raise exception 'T12 FAIL: % takes no per-user advisory lock (concurrency guard)', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') then raise exception 'T12 FAIL: anon can execute %', fn; end if;
    if has_function_privilege('authenticated', fn, 'EXECUTE') then raise exception 'T12 FAIL: authenticated can execute %', fn; end if;
    if has_function_privilege('app_user', fn, 'EXECUTE') then raise exception 'T12 FAIL: app_user can execute %', fn; end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then raise exception 'T12 FAIL: service_role cannot execute %', fn; end if;
  end loop;
  if has_column_privilege('authenticated', 'public.user_devices', 'device_hash', 'SELECT') then
    raise exception 'T12 FAIL: authenticated can read device_hash';
  end if;
  if has_table_privilege('authenticated', 'public.user_devices', 'INSERT')
     or has_table_privilege('authenticated', 'public.user_devices', 'UPDATE')
     or has_table_privilege('authenticated', 'public.user_devices', 'DELETE')
     or has_table_privilege('anon', 'public.user_devices', 'SELECT') then
    raise exception 'T12 FAIL: anon / authenticated hold a write (or anon a read) on user_devices';
  end if;
end $$;

-- ── as a signed-in user (non-superuser, RLS on) ─────────────────────────────
set role app_user;

-- T13 anon-equivalent: no session → no rows; and the function is not executable
select set_config('test.uid', '', false);
select pg_temp.expect('T13 no session reads nothing',
  (select count(*)::text from public.user_devices), '0');
do $$
begin
  perform public.library_device_check('00000000-0000-0000-0000-00000000d001', encode(sha256('z'::bytea), 'hex'), 'x');
  raise exception 'T13 FAIL: app_user executed library_device_check';
exception when insufficient_privilege then null;
end $$;

-- T14 A reads his own rows only (id/label/dates), never B's
select set_config('test.uid', '00000000-0000-0000-0000-00000000d001', false);
select pg_temp.expect('T14 A sees his rows',
  (select (count(*) > 0 and bool_and(user_id = '00000000-0000-0000-0000-00000000d001'))::text
     from (select id, user_id, label, first_seen, last_seen, revoked_at from public.user_devices) x), 'true');
select pg_temp.expect('T14 A cannot see B',
  (select count(*)::text from (select id from public.user_devices
                                where user_id = '00000000-0000-0000-0000-00000000d002') x), '0');
do $$
begin
  perform device_hash from public.user_devices limit 1;
  raise exception 'T14 FAIL: A read device_hash';
exception when insufficient_privilege then null;
end $$;
do $$
begin
  update public.user_devices set revoked_at = null;
  raise exception 'T14 FAIL: A updated user_devices directly';
exception when insufficient_privilege then null;
end $$;

reset role;

-- T15 anon proper
set role anon;
do $$
begin
  perform public.library_device_revoke('00000000-0000-0000-0000-00000000d001', null, null, 'admin_reset', null);
  raise exception 'T15 FAIL: anon executed library_device_revoke';
exception when insufficient_privilege then null;
end $$;
reset role;

select 'user_devices_1108: ALL PASS' as result;
