-- platform_staff_roles.test.sql — proves 20261019_30 (owner ٢١٠, option a): an
-- internal role matrix for Nezamy staff (public.platform_staff: super_admin /
-- operations / auditor, read by admins, written by the service role only),
-- staff_role() / is_super_admin(), and an APPEND-ONLY admin_audit_events.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent), with the between-runs prelude in the middle. From
-- the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_admin_policies_live.sql \
--     $M/20261016_09_admin_policies_is_admin.sql \
--     $T/prelude_admin_audit_events_live.sql \
--     $M/20261019_30_platform_staff_roles.sql \
--     $T/prelude_platform_staff_between_runs.sql \
--     $M/20261019_30_platform_staff_roles.sql \
--     $T/platform_staff_roles.test.sql
-- Why each link:
--   prelude_admin_policies_live.sql  public.profiles' live policies and grants,
--       is_admin() executable by the API roles, the live (inline) audit SELECT
--       policy, and the rows a1 admin / c1 client / b1 lawyer / d1 provider
--       with one audit row each for a1 and c1.
--   20261016_09   turns the audit policy into its live form: TO authenticated,
--       actor_id = auth.uid() OR public.is_admin().
--   prelude_admin_audit_events_live.sql  the live audit columns, the live GRANT
--       ALL on the table and its sequence to anon / authenticated /
--       service_role, Supabase's default EXECUTE on new functions to the API
--       roles, a second admin a2 and audit rows for a2 and b1.
--   prelude_platform_staff_between_runs.sql  between the runs: the user
--       downgrades a2 to auditor and makes a3 an admin by hand — the second run
--       must keep a2 an auditor and give a3 super_admin.
--
-- NEGATIVE CONTROL (must FAIL; recorded 2026-10-18) — the chain without the
-- two 20261019_30 files and the between-runs prelude (it needs the table):
--   bash $T/run.sh $T/prelude_admin_policies_live.sql \
--     $M/20261016_09_admin_policies_is_admin.sql \
--     $T/prelude_admin_audit_events_live.sql $T/platform_staff_roles.test.sql
--   → "T1 FAIL: allowed — update public.admin_audit_events set action = 'tampered' …"
--     (the service role rewrites an audit row).
--
-- HOW A SESSION IS PLAYED: `set role authenticated` / `set role anon` /
-- `set role service_role` + test.uid — exactly what PostgREST does. app_user is
-- used once (T6), for the brief's "a non-admin app_user reads no staff rows";
-- it is a harness role that stubs.sql gave direct ALL on every table, so it is
-- never used to judge the write revokes.
--
-- THE FOREIGN-KEY CASCADE (Ruling P17 b). admin_audit_events.actor_id →
-- profiles(id) ON DELETE SET NULL, so deleting an account UPDATEs its audit
-- rows. Postgres runs a foreign-key action AS THE OWNER OF THE REFERENCING
-- TABLE (ri_triggers.c switches the user id to the FK table's owner): a probe
-- trigger during a GoTrue delete reported current_user = postgres at
-- pg_trigger_depth() = 2, session_user supabase_auth_admin. On live the owner
-- is postgres (dump: OWNER TO postgres), so the cascade passes on rule (a)
-- already, and T10 — GoTrue's delete, as P17 asks — is regression cover. Rule
-- (b) — inside a trigger, only actor_id changed, from a value to NULL — is
-- proved by T9 (writes relayed by another trigger at depth 2, as service_role)
-- and T12 (the table re-owned to an untrusted role, so the cascade's
-- current_user is that role and only (b) can let it through; a probe records
-- the writer).
--
-- A refusal must be THE TRIGGER'S where it says so: t_append_only() requires
-- 42501 AND the append-only message; t_denied() requires 42501 AND
-- "permission denied" (the revoke, not an RLS refusal).
--
-- Actors: a1 admin (super_admin) · a2 admin (auditor after the first run;
-- deleted by GoTrue in T10) · a3 admin made between the runs · c1 client ·
-- b1 lawyer (deleted in T12) · d1 provider.
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on

create function public.t_append_only(p_label text, p_stmt text) returns void
language plpgsql as $$
begin
  begin
    execute p_stmt;
  exception when insufficient_privilege then
    if sqlerrm <> 'سجل تدقيق الإدارة للإضافة فقط: لا يُعدَّل فيه سطر ولا يُحذف (admin_audit_events is append-only)' then
      raise exception '% FAIL: 42501, but not the append-only trigger: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception '% FAIL: allowed — %', p_label, left(p_stmt, 110);
end $$;

create function public.t_denied(p_label text, p_stmt text) returns void
language plpgsql as $$
begin
  begin
    execute p_stmt;
  exception when insufficient_privilege then
    if sqlerrm not like 'permission denied%' then
      raise exception '% FAIL: 42501, but not a missing privilege: %', p_label, sqlerrm;
    end if;
    return;
  end;
  raise exception '% FAIL: allowed — %', p_label, left(p_stmt, 110);
end $$;

create function public.t_ok(p_label text, p_stmt text) returns void
language plpgsql as $$
begin
  execute p_stmt;
exception when others then
  raise exception '% FAIL: refused (% %) — %', p_label, sqlstate, sqlerrm, left(p_stmt, 110);
end $$;

-- T1 (first, so the negative control stops on behaviour) — the service role
-- (PostgREST with the service key: every Next route that writes audit rows)
-- cannot rewrite or remove an audit row, nor null its actor directly
set role service_role;
do $$
begin
  perform public.t_append_only('T1',
    $q$update public.admin_audit_events set action = 'tampered' where action = 'admin.action'$q$);
  perform public.t_append_only('T1 delete',
    $q$delete from public.admin_audit_events where action = 'user.action'$q$);
  perform public.t_append_only('T1 direct actor_id → NULL (depth 1, not a cascade)',
    $q$update public.admin_audit_events set actor_id = null where actor_id = '00000000-0000-0000-0000-0000000000a1'$q$);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.admin_audit_events) <> 4
     or (select actor_id from public.admin_audit_events where action = 'admin.action') is distinct from '00000000-0000-0000-0000-0000000000a1'
     or not exists (select 1 from public.admin_audit_events where action = 'user.action') then
    raise exception 'T1 FAIL: a refused write changed the audit log';
  end if;
  raise notice 'T1 PASS: service_role UPDATE, DELETE and a direct actor_id → NULL on admin_audit_events get 42501 (append-only); nothing changes';
end $$;

-- T2 INSERT: the service role writes a full row (sequence usage included —
-- logAdminAction never throws, so a missing grant would fail silently); no API
-- role writes at all (permission denied, not an RLS refusal)
set role service_role;
do $$
begin
  perform public.t_ok('T2 service_role insert',
    $q$insert into public.admin_audit_events
         (actor_id, actor_type, actor_email, action, target_type, target_id,
          before_state, after_state, ip_address, user_agent, metadata)
       values ('00000000-0000-0000-0000-0000000000a1', 'admin', 'staff@example.test',
               'staff.role_change', 'platform_staff', '00000000-0000-0000-0000-0000000000a2',
               '{"staff_role":"super_admin"}', '{"staff_role":"auditor"}',
               '192.0.2.10', 'harness', '{"via":"T2"}')$q$);
end $$;
reset role;
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  perform public.t_denied('T2 authenticated insert',
    $q$insert into public.admin_audit_events (actor_id, action, target_type) values ('00000000-0000-0000-0000-0000000000a1', 'forged', 'x')$q$);
  perform public.t_denied('T2 authenticated update',
    $q$update public.admin_audit_events set action = 'tampered' where actor_id = '00000000-0000-0000-0000-0000000000a1'$q$);
  perform public.t_denied('T2 authenticated delete',
    $q$delete from public.admin_audit_events where actor_id = '00000000-0000-0000-0000-0000000000a1'$q$);
  perform public.t_denied('T2 authenticated truncate',
    $q$truncate public.admin_audit_events$q$);
  perform public.t_denied('T2 authenticated sequence',
    $q$select nextval(pg_get_serial_sequence('public.admin_audit_events', 'id'))$q$);
end $$;
reset role;
set role anon;
do $$
begin
  perform set_config('test.uid', '', true);
  perform public.t_denied('T2 anon insert',
    $q$insert into public.admin_audit_events (action, target_type) values ('forged', 'x')$q$);
  perform public.t_denied('T2 anon delete',
    $q$delete from public.admin_audit_events$q$);
end $$;
reset role;
do $$
begin
  if (select count(*) from public.admin_audit_events) <> 5
     or (select count(*) from public.admin_audit_events
          where action = 'staff.role_change' and actor_email = 'staff@example.test' and actor_type = 'admin'
            and after_state = '{"staff_role":"auditor"}' and id is not null) <> 1 then
    raise exception 'T2 FAIL: the service-role row is not there exactly once, or an API role wrote';
  end if;
  raise notice 'T2 PASS: service_role inserts a full row (actor_email included); authenticated / anon INSERT, UPDATE, DELETE, TRUNCATE and nextval get "permission denied"';
end $$;

-- T3 SELECT is kept (the live policy uses it): a user reads his own audit rows
-- (the lawyer activity feed), an admin reads all, a guest reads none — no error
set role authenticated;
do $$
declare
  n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  select count(*) into n from public.admin_audit_events;
  if n <> 1 or (select action from public.admin_audit_events) <> 'user.action' then
    raise exception 'T3 FAIL: the client reads % audit rows, expected his own 1', n;
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  select count(*) into n from public.admin_audit_events;
  if n <> 5 then
    raise exception 'T3 FAIL: the admin reads % audit rows, expected 5', n;
  end if;
end $$;
reset role;
set role anon;
do $$
begin
  if (select count(*) from public.admin_audit_events) <> 0 then
    raise exception 'T3 FAIL: a guest reads audit rows';
  end if;
end $$;
reset role;
do $$ begin raise notice 'T3 PASS: SELECT kept — the client reads his own row, the admin all 5, a guest none (no 42501)'; end $$;

-- T4 the trusted writers (current_user postgres / supabase_admin: the SQL
-- editor, maintenance) still update and delete; TRUNCATE is refused to the
-- service role and allowed to postgres (rolled back here)
-- (live supabase_admin is a superuser; here BYPASSRLS stands in, or RLS would
-- hide the row and its UPDATE / DELETE would touch nothing, silently)
insert into public.admin_audit_events (action, target_type) values ('T4.scratch', 'test');
do $$
begin
  perform public.t_ok('T4 postgres update', $q$update public.admin_audit_events set target_id = 'p' where action = 'T4.scratch'$q$);
  if (select target_id from public.admin_audit_events where action = 'T4.scratch') is distinct from 'p' then
    raise exception 'T4 FAIL: the postgres update did not land';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin noinherit bypassrls;
  end if;
end $$;
grant select, update, delete on public.admin_audit_events to supabase_admin;
set role supabase_admin;
do $$
begin
  perform public.t_ok('T4 supabase_admin update', $q$update public.admin_audit_events set target_id = 's' where action = 'T4.scratch'$q$);
  if (select target_id from public.admin_audit_events where action = 'T4.scratch') is distinct from 's' then
    raise exception 'T4 FAIL: the supabase_admin update did not land';
  end if;
  perform public.t_ok('T4 supabase_admin delete', $q$delete from public.admin_audit_events where action = 'T4.scratch'$q$);
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.admin_audit_events where action = 'T4.scratch') then
    raise exception 'T4 FAIL: the supabase_admin delete did not land';
  end if;
end $$;
revoke all on public.admin_audit_events from supabase_admin;
set role service_role;
do $$
begin
  perform public.t_append_only('T4 service_role truncate', $q$truncate public.admin_audit_events$q$);
end $$;
reset role;
do $$
begin
  begin
    truncate public.admin_audit_events;
    raise exception using errcode = 'P0001', message = 'T4 rollback marker';
  exception when raise_exception then
    if sqlerrm <> 'T4 rollback marker' then raise; end if;
  end;
  if (select count(*) from public.admin_audit_events) <> 5 then
    raise exception 'T4 FAIL: the log is not back to its 5 rows';
  end if;
  raise notice 'T4 PASS: postgres and supabase_admin update / delete (trusted); service_role TRUNCATE gets 42501 (append-only); postgres TRUNCATE passes';
end $$;

-- T5 the backfill after two runs: every admin of the first run became a
-- super_admin; a2's downgrade (between the runs) survived the re-run; a3,
-- made an admin by hand between the runs, was picked up; nobody else is staff
do $$
begin
  if (select count(*) from public.platform_staff) <> 3
     or (select staff_role from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a1') is distinct from 'super_admin'
     or (select granted_by from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a1') is not null
     or (select staff_role from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a2') is distinct from 'auditor'
     or (select staff_role from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a3') is distinct from 'super_admin'
     or exists (select 1 from public.profiles p
                 where p.user_type = 'admin'
                   and not exists (select 1 from public.platform_staff s where s.user_id = p.id)) then
    raise exception 'T5 FAIL: platform_staff is %',
      (select string_agg(user_id::text || '=' || staff_role, ', ' order by user_id) from public.platform_staff);
  end if;
  raise notice 'T5 PASS: the backfill made a1 super_admin, kept a2''s downgrade to auditor across the re-run, picked up a3; c1 / b1 / d1 are not staff';
end $$;

-- T6 reading platform_staff: a non-admin reads nothing (as authenticated and as
-- the brief's app_user), every admin reads all three rows (whatever his own
-- staff role), a guest has no privilege at all
set role authenticated;
do $$
declare
  n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  select count(*) into n from public.platform_staff;
  if n <> 0 then raise exception 'T6 FAIL: the client reads % staff rows', n; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  select count(*) into n from public.platform_staff;
  if n <> 3 then raise exception 'T6 FAIL: the auditor admin reads % staff rows, expected 3', n; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  select count(*) into n from public.platform_staff;
  if n <> 3 then raise exception 'T6 FAIL: the super_admin reads % staff rows, expected 3', n; end if;
end $$;
reset role;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  if (select count(*) from public.platform_staff) <> 0 then
    raise exception 'T6 FAIL: app_user as the client reads staff rows';
  end if;
end $$;
reset role;
set role anon;
do $$
begin
  perform set_config('test.uid', '', true);
  perform public.t_denied('T6 anon read', $q$select count(*) from public.platform_staff$q$);
end $$;
reset role;
do $$ begin raise notice 'T6 PASS: a non-admin (authenticated and app_user) reads 0 staff rows; the auditor and the super_admin read all 3; anon gets "permission denied"'; end $$;

-- T7 writing platform_staff: no session writes, not even a super_admin's (the
-- server does it with the service role, T3.4); the service role inserts,
-- updates and deletes; the CHECK refuses an unknown role
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  perform public.t_denied('T7 super_admin insert',
    $q$insert into public.platform_staff (user_id, staff_role) values ('00000000-0000-0000-0000-0000000000c1', 'operations')$q$);
  perform public.t_denied('T7 super_admin update',
    $q$update public.platform_staff set staff_role = 'super_admin' where user_id = '00000000-0000-0000-0000-0000000000a2'$q$);
  perform public.t_denied('T7 super_admin delete',
    $q$delete from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a2'$q$);
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  perform public.t_denied('T7 client makes himself staff',
    $q$insert into public.platform_staff (user_id, staff_role) values ('00000000-0000-0000-0000-0000000000c1', 'super_admin')$q$);
end $$;
reset role;
set role anon;
do $$
begin
  perform public.t_denied('T7 anon insert',
    $q$insert into public.platform_staff (user_id, staff_role) values ('00000000-0000-0000-0000-0000000000c1', 'super_admin')$q$);
end $$;
reset role;
set role service_role;
do $$
begin
  perform public.t_ok('T7 service_role insert',
    $q$insert into public.platform_staff (user_id, staff_role, granted_by) values ('00000000-0000-0000-0000-0000000000c1', 'operations', '00000000-0000-0000-0000-0000000000a1')$q$);
  perform public.t_ok('T7 service_role update',
    $q$update public.platform_staff set staff_role = 'auditor' where user_id = '00000000-0000-0000-0000-0000000000c1'$q$);
  perform public.t_ok('T7 service_role delete',
    $q$delete from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000c1'$q$);
  begin
    insert into public.platform_staff (user_id, staff_role) values ('00000000-0000-0000-0000-0000000000c1', 'admin');
    raise exception 'T7 FAIL: staff_role ''admin'' was accepted';
  exception when check_violation then
    null;
  end;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.platform_staff) <> 3
     or exists (select 1 from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000c1')
     or (select staff_role from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a2') <> 'auditor' then
    raise exception 'T7 FAIL: platform_staff changed';
  end if;
  raise notice 'T7 PASS: authenticated (even a super_admin) and anon get "permission denied" on INSERT / UPDATE / DELETE; service_role writes; the CHECK refuses ''admin''';
end $$;

-- T8 staff_role() / is_super_admin() for the caller (auth.uid()); a guest may
-- not call either
set role service_role;
update public.platform_staff set staff_role = 'operations' where user_id = '00000000-0000-0000-0000-0000000000a3';
reset role;
set role authenticated;
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('00000000-0000-0000-0000-0000000000a1', 'super_admin', true),
      ('00000000-0000-0000-0000-0000000000a2', 'auditor',     false),
      ('00000000-0000-0000-0000-0000000000a3', 'operations',  false),
      ('00000000-0000-0000-0000-0000000000c1', null,          false),
      ('',                                     null,          false)
    ) as v(uid, role, sup)
  loop
    perform set_config('test.uid', spec.uid, true);
    if public.staff_role() is distinct from spec.role then
      raise exception 'T8 FAIL: staff_role() for "%" is %, expected %', spec.uid, public.staff_role(), spec.role;
    end if;
    if public.is_super_admin() is distinct from spec.sup then
      raise exception 'T8 FAIL: is_super_admin() for "%" is %, expected %', spec.uid, public.is_super_admin(), spec.sup;
    end if;
  end loop;
end $$;
reset role;
set role anon;
do $$
begin
  perform public.t_denied('T8 anon staff_role()', $q$select public.staff_role()$q$);
  perform public.t_denied('T8 anon is_super_admin()', $q$select public.is_super_admin()$q$);
end $$;
reset role;
do $$ begin raise notice 'T8 PASS: staff_role() returns super_admin / auditor / operations / NULL (non-staff, no session); is_super_admin() is true only for the super_admin, never NULL; anon may call neither'; end $$;

-- T8b a staff role holds only while the account is an admin (controller
-- ruling on concern 3): demoting an admin — the service role demotes a1
-- (super_admin), postgres demotes a3 (operations) — leaves the platform_staff
-- rows in place, but staff_role() is NULL and is_super_admin() false for them;
-- promoting a1 back restores super_admin from the same row
set role service_role;
update public.profiles set user_type = 'client' where id = '00000000-0000-0000-0000-0000000000a1';
reset role;
update public.profiles set user_type = 'lawyer' where id = '00000000-0000-0000-0000-0000000000a3';
set role authenticated;
do $$
declare
  u text;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3'] loop
    perform set_config('test.uid', u, true);
    if public.staff_role() is not null or public.is_super_admin() is distinct from false then
      raise exception 'T8b FAIL: the demoted % still reads staff_role() = %, is_super_admin() = %',
        u, public.staff_role(), public.is_super_admin();
    end if;
  end loop;
end $$;
reset role;
do $$
begin
  if (select count(*) from public.platform_staff
       where user_id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3')) <> 2 then
    raise exception 'T8b FAIL: demoting an admin removed the staff row (the read should change, not the row)';
  end if;
end $$;
update public.profiles set user_type = 'admin'
 where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a3');
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.staff_role() is distinct from 'super_admin' or not public.is_super_admin() then
    raise exception 'T8b FAIL: a1 promoted back does not read super_admin again';
  end if;
end $$;
reset role;
do $$ begin raise notice 'T8b PASS: a demoted admin (by service_role or postgres) keeps the staff row but staff_role() is NULL and is_super_admin() false; promoted back, the role returns'; end $$;

-- T9 rule (b), the shape half: an UPDATE issued by ANOTHER trigger runs deeper
-- than depth 1, like a cascade. Played as the service role (current_user is
-- untrusted), it passes only when the one change is actor_id from a value to
-- NULL. Harness device: t_relay runs the statement it is given from an AFTER
-- INSERT trigger.
insert into public.admin_audit_events (actor_id, action, target_type) values
  ('00000000-0000-0000-0000-0000000000a1', 'relay.1', 'test'),
  ('00000000-0000-0000-0000-0000000000a1', 'relay.2', 'test'),
  (null,                                   'relay.3', 'test');
create table public.t_relay (stmt text not null);
create function public.t_relay_run() returns trigger language plpgsql as $$
begin
  execute new.stmt;
  return new;
end $$;
create trigger t_relay_after after insert on public.t_relay
  for each row execute function public.t_relay_run();
set role service_role;
do $$
begin
  perform public.t_append_only('T9 relayed: actor_id → NULL AND another column',
    $q$insert into public.t_relay (stmt) values ($r$update public.admin_audit_events set actor_id = null, action = 'relay.x' where action = 'relay.2'$r$)$q$);
  perform public.t_append_only('T9 relayed: re-point actor_id',
    $q$insert into public.t_relay (stmt) values ($r$update public.admin_audit_events set actor_id = '00000000-0000-0000-0000-0000000000c1' where action = 'relay.2'$r$)$q$);
  perform public.t_append_only('T9 relayed: set actor_id from NULL',
    $q$insert into public.t_relay (stmt) values ($r$update public.admin_audit_events set actor_id = '00000000-0000-0000-0000-0000000000a1' where action = 'relay.3'$r$)$q$);
  perform public.t_append_only('T9 relayed: actor_id NULL → NULL',
    $q$insert into public.t_relay (stmt) values ($r$update public.admin_audit_events set actor_id = null where action = 'relay.3'$r$)$q$);
  perform public.t_append_only('T9 relayed: no-op',
    $q$insert into public.t_relay (stmt) values ($r$update public.admin_audit_events set metadata = metadata where action = 'relay.2'$r$)$q$);
  perform public.t_append_only('T9 relayed: delete',
    $q$insert into public.t_relay (stmt) values ($r$delete from public.admin_audit_events where action = 'relay.2'$r$)$q$);
  perform public.t_ok('T9 relayed: only actor_id, from a value to NULL',
    $q$insert into public.t_relay (stmt) values ($r$update public.admin_audit_events set actor_id = null where action = 'relay.1'$r$)$q$);
end $$;
reset role;
do $$
begin
  if (select actor_id from public.admin_audit_events where action = 'relay.1') is not null
     or (select actor_id from public.admin_audit_events where action = 'relay.2') is distinct from '00000000-0000-0000-0000-0000000000a1'
     or (select actor_id from public.admin_audit_events where action = 'relay.3') is not null
     or exists (select 1 from public.admin_audit_events where action = 'relay.x') then
    raise exception 'T9 FAIL: a refused relayed write changed a row, or the actor-only null did not land';
  end if;
  raise notice 'T9 PASS: at depth 2 an untrusted writer may only null actor_id (from a value); nulling with another column, re-pointing, from NULL, NULL → NULL, a no-op and a delete get 42501';
end $$;
drop trigger t_relay_after on public.t_relay;
drop function public.t_relay_run();
drop table public.t_relay;

-- T10 GoTrue deletes an account (P17 b): it connects as supabase_auth_admin
-- and sets no role. a2 has a staff row and an audit row: the delete succeeds,
-- the staff row goes (ON DELETE CASCADE), the audit row stays with actor_id
-- NULL, and the log keeps every row
create temp table t_snap as select count(*) as n from public.admin_audit_events;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin noinherit;
  end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant select, delete on auth.users to supabase_auth_admin;
set session authorization supabase_auth_admin;
do $$
begin
  if pg_catalog.current_setting('role') <> 'none' or session_user <> 'supabase_auth_admin' then
    raise exception 'T10 SETUP: expected GoTrue''s shape (no role, session_user supabase_auth_admin), got % / %',
      pg_catalog.current_setting('role'), session_user;
  end if;
  perform public.t_ok('T10 GoTrue deletes a2',
    $q$delete from auth.users where id = '00000000-0000-0000-0000-0000000000a2'$q$);
end $$;
reset session authorization;
do $$
begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000a2')
     or exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'T10 FAIL: a2 survived the delete';
  end if;
  if exists (select 1 from public.platform_staff where user_id = '00000000-0000-0000-0000-0000000000a2') then
    raise exception 'T10 FAIL: a2''s staff row survived the delete';
  end if;
  if (select count(*) from public.admin_audit_events) <> (select n from t_snap)
     or (select count(*) from public.admin_audit_events where action = 'verification.approve' and actor_id is null) <> 1 then
    raise exception 'T10 FAIL: the audit log lost a row, or a2''s row still names a2';
  end if;
  raise notice 'T10 PASS: GoTrue (supabase_auth_admin, no role) deletes a2 — the staff row goes, the audit row stays with actor_id NULL, the log keeps all % rows', (select n from t_snap);
end $$;
drop table t_snap;

-- T11 catalog after two runs
do $$
declare
  fn   text;
  r    text;
  p    text;
  col  text;
  tbl  text;
  cfg  text[];
  seq  text := pg_get_serial_sequence('public.admin_audit_events', 'id');
  trg  regprocedure := 'public.admin_audit_append_only()'::regprocedure;
begin
  -- staff_role() / is_super_admin(): definer, search_path '', stable; EXECUTE
  -- for authenticated + service_role only
  foreach fn in array array['public.staff_role()', 'public.is_super_admin()'] loop
    select proconfig into cfg from pg_proc where oid = fn::regprocedure;
    if not (select prosecdef from pg_proc where oid = fn::regprocedure)
       or cfg is null or not ('search_path=""' = any (cfg))
       or (select provolatile from pg_proc where oid = fn::regprocedure) <> 's' then
      raise exception 'T11 FAIL: % is not a STABLE SECURITY DEFINER with search_path '''' (proconfig %)', fn, cfg;
    end if;
    foreach r in array array['public', 'anon'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'T11 FAIL: % can EXECUTE %', r, fn;
      end if;
    end loop;
    foreach r in array array['authenticated', 'service_role'] loop
      if not has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'T11 FAIL: % cannot EXECUTE %', r, fn;
      end if;
    end loop;
  end loop;

  -- the append-only function: SECURITY INVOKER (current_user = the writer)
  select proconfig into cfg from pg_proc where oid = trg;
  if (select prosecdef from pg_proc where oid = trg) or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception 'T11 FAIL: admin_audit_append_only is SECURITY DEFINER or lacks search_path '''' — under DEFINER every writer reads as its owner';
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, trg::text, 'EXECUTE') then
      raise exception 'T11 FAIL: % can EXECUTE admin_audit_append_only', r;
    end if;
  end loop;
  -- exactly one row trigger BEFORE UPDATE OR DELETE (no INSERT / TRUNCATE /
  -- INSTEAD, no WHEN, no column list) and one statement trigger BEFORE
  -- TRUNCATE, both enabled for normal sessions
  if (select count(*) from pg_trigger t
       where t.tgrelid = 'public.admin_audit_events'::regclass and t.tgname = 'trg_admin_audit_append_only'
         and not t.tgisinternal and t.tgenabled in ('O', 'A')
         and (t.tgtype & 27) = 27 and (t.tgtype & (4 | 32 | 64)) = 0
         and t.tgqual is null and t.tgattr = ''::int2vector and t.tgfoid = trg) <> 1 then
    raise exception 'T11 FAIL: admin_audit_events lacks exactly one enabled trg_admin_audit_append_only BEFORE UPDATE OR DELETE FOR EACH ROW';
  end if;
  if (select count(*) from pg_trigger t
       where t.tgrelid = 'public.admin_audit_events'::regclass and t.tgname = 'trg_admin_audit_no_truncate'
         and not t.tgisinternal and t.tgenabled in ('O', 'A')
         and t.tgtype = (2 | 32) and t.tgfoid = trg) <> 1 then
    raise exception 'T11 FAIL: admin_audit_events lacks exactly one enabled trg_admin_audit_no_truncate BEFORE TRUNCATE FOR EACH STATEMENT';
  end if;

  -- platform_staff: RLS on; one policy, SELECT TO authenticated via is_admin()
  if not (select relrowsecurity from pg_class where oid = 'public.platform_staff'::regclass)
     or (select count(*) from pg_policy where polrelid = 'public.platform_staff'::regclass) <> 1
     or not exists (select 1 from pg_policy
                     where polrelid = 'public.platform_staff'::regclass and polname = 'admins read platform staff'
                       and polcmd = 'r' and polroles = array['authenticated'::regrole::oid]
                       and pg_get_expr(polqual, polrelid) = 'is_admin()') then
    raise exception 'T11 FAIL: platform_staff is not RLS-on with the one admins-read SELECT policy';
  end if;

  -- effective privileges, table and column level
  foreach tbl in array array['public.platform_staff', 'public.admin_audit_events'] loop
    foreach r in array array['public', 'anon', 'authenticated'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, tbl, p) then
          raise exception 'T11 FAIL: % holds % on %', r, p, tbl;
        end if;
      end loop;
      for col in select attname::text from pg_attribute
                  where attrelid = tbl::regclass and attnum > 0 and not attisdropped loop
        if has_column_privilege(r, tbl, col, 'INSERT, UPDATE, REFERENCES') then
          raise exception 'T11 FAIL: % holds a column write privilege on %.%', r, tbl, col;
        end if;
      end loop;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', tbl, p) then
        raise exception 'T11 FAIL: service_role lacks % on %', p, tbl;
      end if;
    end loop;
  end loop;
  -- SELECT: platform_staff for authenticated only; the audit log for both API
  -- roles (as live; its one policy is TO authenticated)
  if has_table_privilege('anon', 'public.platform_staff', 'SELECT')
     or has_any_column_privilege('anon', 'public.platform_staff', 'SELECT')
     or has_table_privilege('public', 'public.platform_staff', 'SELECT')
     or not has_table_privilege('authenticated', 'public.platform_staff', 'SELECT')
     or not has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT')
     or not has_table_privilege('anon', 'public.admin_audit_events', 'SELECT') then
    raise exception 'T11 FAIL: the SELECT grants are not as designed';
  end if;
  -- the sequence: no API role, service_role USAGE
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_sequence_privilege(r, seq, 'USAGE, SELECT, UPDATE') then
      raise exception 'T11 FAIL: % holds a privilege on %', r, seq;
    end if;
  end loop;
  if not has_sequence_privilege('service_role', seq, 'USAGE') then
    raise exception 'T11 FAIL: service_role lacks USAGE on %', seq;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.admin_audit_events'::regclass
                  and attname = 'actor_email' and atttypid = 'text'::regtype and not attisdropped) then
    raise exception 'T11 FAIL: admin_audit_events.actor_email text is missing';
  end if;
  raise notice 'T11 PASS: definer role functions (authenticated / service_role EXECUTE only); invoker append-only function on one row + one TRUNCATE trigger; platform_staff one admin SELECT policy; no API write privilege on either table, column or sequence; service_role writes';
end $$;

-- T12 rule (b) on its own: re-own admin_audit_events to an untrusted role, so
-- the foreign-key action runs as that role (current_user is not postgres /
-- supabase_admin) and only the cascade exemption can let it through. A probe
-- BEFORE UPDATE trigger records the writer and depth (BEFORE, like the guard:
-- a foreign-key action runs its query with fire_triggers = false, so its AFTER
-- triggers fire later, at the end of the outer statement, as the session
-- user). GoTrue deletes b1, whose audit row must be nulled.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'audit_owner_t') then
    create role audit_owner_t nologin noinherit;
  end if;
end $$;
create table public.t_cascade_who (who text not null, depth int not null);
grant insert on public.t_cascade_who to audit_owner_t;
create function public.t_cascade_who_log() returns trigger language plpgsql as $$
begin
  insert into public.t_cascade_who values (current_user, pg_catalog.pg_trigger_depth());
  return new;
end $$;
create trigger t_cascade_who before update on public.admin_audit_events
  for each row execute function public.t_cascade_who_log();
alter table public.admin_audit_events owner to audit_owner_t;
set session authorization supabase_auth_admin;
do $$
begin
  perform public.t_ok('T12 GoTrue deletes b1 (audit table owned by an untrusted role)',
    $q$delete from auth.users where id = '00000000-0000-0000-0000-0000000000b1'$q$);
end $$;
reset session authorization;
alter table public.admin_audit_events owner to postgres;
do $$
begin
  if (select count(*) from public.t_cascade_who) <> 1
     or (select who from public.t_cascade_who) <> 'audit_owner_t'
     or (select depth from public.t_cascade_who) <= 1 then
    raise exception 'T12 FAIL: the cascade did not run as the untrusted owner inside a trigger: %',
      (select string_agg(who || '@' || depth, ', ') from public.t_cascade_who);
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-0000000000b1')
     or (select count(*) from public.admin_audit_events where action = 'profile.update' and actor_id is null) <> 1 then
    raise exception 'T12 FAIL: b1 survived, or b1''s audit row was not nulled';
  end if;
  raise notice 'T12 PASS: with the audit table owned by an untrusted role the cascade runs as that role (depth %) and passes on the actor_id-only exemption alone',
    (select depth from public.t_cascade_who);
end $$;
drop trigger t_cascade_who on public.admin_audit_events;
drop function public.t_cascade_who_log();
drop table public.t_cascade_who;

drop function public.t_append_only(text, text);
drop function public.t_denied(text, text);
drop function public.t_ok(text, text);
