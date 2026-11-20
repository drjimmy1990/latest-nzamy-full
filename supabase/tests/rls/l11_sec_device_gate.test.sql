-- l11_sec_device_gate.test.sql — proves part B (O2) of 20261201_10: the library
--   device gate counts an ADMIN like everyone else (no 'exempt' answer).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261201_10
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
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $R/l11_sec_device_gate.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261201_10
--   lines → «G1 FAIL: the admin's first device: got exempt, want registered».
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
  raise notice '% PASS: %', label, got;
end $$;
create or replace function pg_temp.h(n int) returns text language sql as $$
  select encode(sha256(convert_to('l11-device-' || n, 'UTF8')), 'hex');
$$;
create or replace function pg_temp.gate(p_user uuid, n int) returns text language sql as $$
  select status from public.library_device_gate(p_user, pg_temp.h(n), 'جهاز', null::uuid, false);
$$;

insert into auth.users (id) values
  ('9b000000-0000-0000-0000-0000000000a1'),
  ('9b000000-0000-0000-0000-0000000000a2')
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('9b000000-0000-0000-0000-0000000000a1', 'admin', 'A'),
  ('9b000000-0000-0000-0000-0000000000a2', 'lawyer', 'L')
on conflict do nothing;

update public.library_monitor_settings set device_limit_enabled = true, device_limit = 2 where id;

-- G1 the admin registers devices like everyone; the third is refused.
select pg_temp.expect('G1 the admin''s first device',  pg_temp.gate('9b000000-0000-0000-0000-0000000000a1', 1), 'registered');
select pg_temp.expect('G1 the admin''s second device', pg_temp.gate('9b000000-0000-0000-0000-0000000000a1', 2), 'registered');
select pg_temp.expect('G1 the admin''s third device',  pg_temp.gate('9b000000-0000-0000-0000-0000000000a1', 3), 'refused');
select pg_temp.expect('G1 a known device of the admin', pg_temp.gate('9b000000-0000-0000-0000-0000000000a1', 1), 'ok');
-- G2 a lawyer: unchanged.
select pg_temp.expect('G2 the lawyer''s first device', pg_temp.gate('9b000000-0000-0000-0000-0000000000a2', 1), 'registered');
-- G3 the switch off: everyone passes, the admin included.
update public.library_monitor_settings set device_limit_enabled = false where id;
select pg_temp.expect('G3 switch off',                  pg_temp.gate('9b000000-0000-0000-0000-0000000000a1', 9), 'disabled');
-- G4 the definition carries no exemption and no session role may call it.
select pg_temp.expect('G4 no exempt branch',
  (pg_catalog.strpos(pg_get_functiondef('public.library_device_gate(uuid,text,text,uuid,boolean)'::regprocedure), '''exempt''') = 0)::text, 'true');
select pg_temp.expect('G4 authenticated cannot call',
  has_function_privilege('authenticated', 'public.library_device_gate(uuid,text,text,uuid,boolean)', 'EXECUTE')::text, 'false');

do $$ begin raise notice 'l11_sec_device_gate: ALL PASS'; end $$;
