-- admin_audit_events_no_guest_grant.test.sql — proves 20261109_13 (X-3): a
-- guest holds no privilege on public.admin_audit_events (a read is "permission
-- denied", not 0 rows), while a signed-in user still reads his own audit rows
-- and an admin all of them, and the service role still writes. 20261109_13
-- runs TWICE (idempotent).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself) — the chain of
-- platform_staff_roles.test.sql, then 20261109_13 twice. From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_admin_policies_live.sql \
--     $M/20261016_09_admin_policies_is_admin.sql \
--     $T/prelude_admin_audit_events_live.sql \
--     $M/20261019_30_platform_staff_roles.sql \
--     $M/20261109_13_admin_audit_events_no_guest_grant.sql \
--     $M/20261109_13_admin_audit_events_no_guest_grant.sql \
--     $T/admin_audit_events_no_guest_grant.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261109_13 lines fails at
-- T1 ("anon still holds SELECT").
--
-- Every assertion RAISES on failure.

-- T1 the guest has no privilege; a guest read is refused
do $$
begin
  if has_table_privilege('anon', 'public.admin_audit_events', 'SELECT')
     or has_any_column_privilege('anon', 'public.admin_audit_events', 'SELECT') then
    raise exception 'T1 FAIL: anon still holds SELECT on admin_audit_events';
  end if;
end $$;
set role anon;
do $$
begin
  begin
    perform count(*) from public.admin_audit_events;
    raise exception 'T1 FAIL: a guest read admin_audit_events';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T2 a signed-in client reads only his own rows; the admin reads all
set role authenticated;
do $$
declare
  n_own int;
  n_all int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  select count(*) into n_own from public.admin_audit_events;
  if n_own < 1 or exists (select 1 from public.admin_audit_events where actor_id is distinct from '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'T2 FAIL: the client reads % rows, or rows that are not his', n_own;
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  select count(*) into n_all from public.admin_audit_events;
  if n_all <= n_own then
    raise exception 'T2 FAIL: the admin reads % rows (client %)', n_all, n_own;
  end if;
end $$;
reset role;

-- T3 the service role still writes (audit inserts)
set role service_role;
insert into public.admin_audit_events (actor_id, action, target_type, target_id)
values ('00000000-0000-0000-0000-0000000000a1', 'test.x3', 'test', 'x3');
reset role;

do $$ begin raise notice 'admin_audit_events_no_guest_grant: ALL PASS (T1–T3)'; end $$;
