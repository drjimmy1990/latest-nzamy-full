-- library_auto_lock_hours.test.sql — proves 20261103_10 (owner q362,
-- owner-free wave S1 Task 14): an AUTOMATIC library lock (quota_breach from
-- library_read_quota_hit, activity_flag from library_monitor_evaluate) ends
-- after library_monitor_settings.auto_lock_hours (default 24; 0 = until an
-- admin lifts it); an admin lock is never touched; an expired lock closes
-- itself; the function signatures are unchanged (one overload each); a staff
-- lock (library_security_lock_create) placed on a reader with an open
-- AUTOMATIC lock converts that lock into the staff lock (A10). Also runs the
-- _verify block verify:library_auto_lock_hours.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261103_10
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   V=$D/verify_library_auto_lock_hours.sql
--   sed -n '/^-- >>> verify:library_auto_lock_hours/,/^-- <<< verify:library_auto_lock_hours/p' $M/_verify.sql > "$V"
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261103_10_library_auto_lock_hours.sql $M/20261103_10_library_auto_lock_hours.sql "$V" \
--     $R/library_auto_lock_hours.test.sql
--
-- A7 IN ITS OWN STATE (no settings row: the coalesce gives 24 h) — the same
-- chain with the prelude before the test:
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--     $M/20261103_10_library_auto_lock_hours.sql $M/20261103_10_library_auto_lock_hours.sql \
--     $R/prelude_library_monitor_no_settings.sql $R/library_auto_lock_hours.test.sql
-- (A7 runs first when the row is missing, then the row is re-seeded and the
-- rest runs; with the row present A7 runs last, after deleting the row.)
--
-- NEGATIVE CONTROLS:
--   1. without 20261103_10 the test stops at T0 (the column is missing):
--      bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql $R/library_auto_lock_hours.test.sql
--   2. without 20261103_10 the _verify block RAISES «run 20261103_10 … (BEFORE the deploy)»:
--      bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql "$V" $R/library_auto_lock_hours.test.sql
--   3. the OLD library_security_lock_create body (20261030_80 §4, extracted
--      verbatim) put back after 20261103_10: the test stops at A10 (the staff
--      lock silently stays the 24-hour quota_breach lock):
--      sed -n '/^create or replace function public.library_security_lock_create/,/^grant execute on function public.library_security_lock_create/p' \
--        $M/20261030_80_library_read_quota.sql > $D/old_lock_create.sql
--      bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--        $M/20261103_10_library_auto_lock_hours.sql $D/old_lock_create.sql $R/library_auto_lock_hours.test.sql
--   4. the same old body: the _verify block RAISES «… returns an open automatic lock unchanged …»:
--      bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql \
--        $M/20261103_10_library_auto_lock_hours.sql $D/old_lock_create.sql "$V"
--
-- Every assertion RAISES on failure.

-- T0 precondition (negative control 1 stops here)
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'library_monitor_settings'
                    and column_name = 'auto_lock_hours') then
    raise exception 'T0 FAIL: library_monitor_settings.auto_lock_hours does not exist (20261103_10 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users
  select ('00000000-0000-0000-0000-00000000e1' || lpad(i::text, 2, '0'))::uuid from generate_series(1, 8) i;
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000e101', 'individual', 'A'),   -- quota_breach
  ('00000000-0000-0000-0000-00000000e102', 'individual', 'B'),   -- activity_flag
  ('00000000-0000-0000-0000-00000000e103', 'individual', 'C'),   -- admin lock
  ('00000000-0000-0000-0000-00000000e104', 'individual', 'D'),   -- expired lock
  ('00000000-0000-0000-0000-00000000e105', 'individual', 'E'),   -- A7 (no settings row, at the start)
  ('00000000-0000-0000-0000-00000000e106', 'individual', 'F'),   -- A7 (no settings row, at the end)
  ('00000000-0000-0000-0000-00000000e107', 'individual', 'G'),   -- A10 staff lock over quota_breach
  ('00000000-0000-0000-0000-00000000e108', 'individual', 'H');   -- A10 staff lock over activity_flag

create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;
-- The app's six arguments, small: with the settings row the row wins (set to
-- the same small numbers below); without it these ARE the limits.
create or replace function pg_temp.q(u text, k text)
returns table (status text, used_today int, day_limit int, used_hour int, hour_limit int,
               refused_today int, lock_reference text, locked_until timestamptz, resets_at timestamptz)
language sql as $$
  select * from public.library_read_quota_hit(u::uuid, k, 1, 1, 50, 2)
$$;
create or replace function pg_temp.bump(u text, r int) returns int language sql as $$
  select public.library_activity_bump(jsonb_build_array(jsonb_build_object('u', u, 'h', now(), 'r', r, 's', 0, 'a', 0)))
$$;
-- Opens a quota_breach lock for u (daily 1, lock after 2 refused) and checks it ends ≈ 24 h from now.
create or replace function pg_temp.lock_about_24h(label text, u text) returns void language plpgsql as $$
declare r record; lk public.library_security_locks;
begin
  perform pg_temp.expect(label || ' d1', (select status from pg_temp.q(u, 'law:1')), 'ok');
  perform pg_temp.expect(label || ' d2', (select status from pg_temp.q(u, 'law:2')), 'over_daily');
  select * into r from pg_temp.q(u, 'law:3');
  perform pg_temp.expect(label || ' d3', r.status, 'locked');
  select * into lk from public.library_security_locks l where l.user_id = u::uuid and l.lifted_at is null;
  perform pg_temp.expect(label || ' reason', lk.reason, 'quota_breach');
  perform pg_temp.expect(label || ' ends ~24h',
    (lk.locked_until between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute')::text, 'true');
  perform pg_temp.expect(label || ' output = row', r.locked_until::text, lk.locked_until::text);
end $$;

-- A7 (prelude state): no settings row → the coalesce gives 24 h
do $$
begin
  if not exists (select 1 from public.library_monitor_settings) then
    perform pg_temp.lock_about_24h('A7 (prelude, no row)', '00000000-0000-0000-0000-00000000e105');
    raise notice 'A7 ran in the prelude state (no settings row)';
  end if;
end $$;
insert into public.library_monitor_settings (id) values (true) on conflict (id) do nothing;

-- A1 the seeded value is 24
do $$
begin
  perform pg_temp.expect('A1 default', (select auto_lock_hours::text from public.library_monitor_settings), '24');
end $$;

-- every review rule off; daily 1 document, lock after 2 refused documents
update public.library_monitor_settings set
  daily_docs = 1, member_daily_docs = 1, hourly_docs = 50, lock_after_refused = 2,
  rule_hour_requests_on = false, rule_hour_searches_on = false, rule_week_docs_on = false,
  rule_sustained_on = false, rule_night_on = false, rule_near_cap_on = false, flag_action = 'notify';

-- A2 a quota_breach lock ends 24 h from now, and the function says so
do $$
begin
  perform pg_temp.lock_about_24h('A2', '00000000-0000-0000-0000-00000000e101');
end $$;

-- A3 lifted, auto_lock_hours = 0 → the next automatic lock has no end
update public.library_security_locks set lifted_at = now(), lift_note = 'test lift'
 where user_id = '00000000-0000-0000-0000-00000000e101' and lifted_at is null;
update public.library_monitor_settings set auto_lock_hours = 0;
do $$
declare r record; lk public.library_security_locks;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000e101', 'law:4');
  perform pg_temp.expect('A3 locked again', r.status, 'locked');
  select * into lk from public.library_security_locks l
   where l.user_id = '00000000-0000-0000-0000-00000000e101' and l.lifted_at is null;
  perform pg_temp.expect('A3 reason', lk.reason, 'quota_breach');
  perform pg_temp.expect('A3 no end', (lk.locked_until is null)::text, 'true');
  perform pg_temp.expect('A3 output no end', (r.locked_until is null)::text, 'true');
end $$;
update public.library_monitor_settings set auto_lock_hours = 24;

-- A4 flag_action 'lock': the activity_flag lock ends ≈ 24 h from now
update public.library_monitor_settings set flag_action = 'lock', rule_hour_requests_on = true, rule_hour_requests = 10;
do $$
declare lk public.library_security_locks;
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000e102', 20);
  select * into lk from public.library_security_locks l
   where l.user_id = '00000000-0000-0000-0000-00000000e102' and l.lifted_at is null;
  perform pg_temp.expect('A4 reason', lk.reason, 'activity_flag');
  perform pg_temp.expect('A4 ends ~24h',
    (lk.locked_until between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute')::text, 'true');
end $$;

-- A5 an admin lock with no end keeps no end after both functions run
insert into public.library_security_locks (user_id, reason, note)
  values ('00000000-0000-0000-0000-00000000e103', 'admin', 'test admin lock');
do $$
declare lk public.library_security_locks;
begin
  perform pg_temp.expect('A5 reader locked', (select status from pg_temp.q('00000000-0000-0000-0000-00000000e103', 'law:1')), 'locked');
  perform pg_temp.bump('00000000-0000-0000-0000-00000000e103', 20);   -- flag_action is 'lock'
  select * into lk from public.library_security_locks l
   where l.user_id = '00000000-0000-0000-0000-00000000e103' and l.lifted_at is null;
  perform pg_temp.expect('A5 still the admin lock', lk.reason, 'admin');
  perform pg_temp.expect('A5 still no end', (lk.locked_until is null)::text, 'true');
  perform pg_temp.expect('A5 one lock row',
    (select count(*)::text from public.library_security_locks where user_id = '00000000-0000-0000-0000-00000000e103'), '1');
end $$;
update public.library_monitor_settings set flag_action = 'notify', rule_hour_requests_on = false;

-- A6 an automatic lock whose end has passed closes itself on the next read
insert into public.library_security_locks (user_id, reason, locked_at, locked_until)
  values ('00000000-0000-0000-0000-00000000e104', 'quota_breach', now() - interval '2 hours', now() - interval '1 minute');
do $$
declare lk public.library_security_locks;
begin
  perform pg_temp.expect('A6 reads again', (select status from pg_temp.q('00000000-0000-0000-0000-00000000e104', 'law:1')), 'ok');
  select * into lk from public.library_security_locks l where l.user_id = '00000000-0000-0000-0000-00000000e104';
  perform pg_temp.expect('A6 closed as expired', ((lk.lifted_at is not null) and lk.lift_note = 'expired')::text, 'true');
end $$;

-- A8 the bound holds
do $$
begin
  begin
    update public.library_monitor_settings set auto_lock_hours = 721;
    raise exception 'A8 FAIL: auto_lock_hours = 721 accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    update public.library_monitor_settings set auto_lock_hours = -1;
    raise exception 'A8 FAIL: auto_lock_hours = -1 accepted';
  exception when sqlstate '23514' then null;
  end;
  update public.library_monitor_settings set auto_lock_hours = 720;   -- the edge is allowed
  update public.library_monitor_settings set auto_lock_hours = 24;
end $$;

-- A9 one overload of each function; both read the setting; still service role only
do $$
begin
  perform pg_temp.expect('A9 quota overloads', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_read_quota_hit'), '1');
  perform pg_temp.expect('A9 evaluate overloads', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_monitor_evaluate'), '1');
  if has_function_privilege('authenticated', 'public.library_read_quota_hit(uuid,text,int,int,int,int)', 'EXECUTE')
     or has_function_privilege('anon', 'public.library_monitor_evaluate(uuid)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.library_monitor_settings', 'SELECT') then
    raise exception 'A9 FAIL: a session role holds a privilege';
  end if;
end $$;

-- A10 a staff lock on a reader with an open AUTOMATIC lock converts that lock
-- (20261103_10 §3b): reason 'admin', the staff note, locked_by, locked_until
-- = what the staff chose (null = until lifted); same row, same SEC reference;
-- details records what it was. A second staff lock returns the admin lock
-- unchanged (20261030_80 behaviour). One overload, the same identity arguments.
do $$
declare before_lk public.library_security_locks; lk public.library_security_locks;
        lk2 public.library_security_locks; v_until timestamptz := now() + interval '3 days';
begin
  perform pg_temp.expect('A10 lock_create overloads', (select count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_security_lock_create'), '1');
  perform pg_temp.expect('A10 lock_create identity args',
    pg_get_function_identity_arguments('public.library_security_lock_create(uuid,uuid,text,timestamptz)'::regprocedure),
    'p_user uuid, p_admin uuid, p_note text, p_until timestamp with time zone');
  if has_function_privilege('authenticated', 'public.library_security_lock_create(uuid,uuid,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.library_security_lock_create(uuid,uuid,text,timestamptz)', 'EXECUTE') then
    raise exception 'A10 FAIL: a session role can EXECUTE library_security_lock_create';
  end if;

  -- (a) over a quota_breach lock that ends in 24 h, no end chosen → indefinite
  perform pg_temp.lock_about_24h('A10a setup', '00000000-0000-0000-0000-00000000e107');
  select * into before_lk from public.library_security_locks l
   where l.user_id = '00000000-0000-0000-0000-00000000e107' and l.lifted_at is null;
  select * into lk from public.library_security_lock_create(
    '00000000-0000-0000-0000-00000000e107', '00000000-0000-0000-0000-00000000e101', '  x  ', null);
  perform pg_temp.expect('A10a reason', lk.reason, 'admin');
  perform pg_temp.expect('A10a no end', (lk.locked_until is null)::text, 'true');
  perform pg_temp.expect('A10a note saved', lk.note, 'x');
  perform pg_temp.expect('A10a locked_by', lk.locked_by::text, '00000000-0000-0000-0000-00000000e101');
  perform pg_temp.expect('A10a same row', lk.id::text, before_lk.id::text);
  perform pg_temp.expect('A10a same reference', lk.reference, before_lk.reference);
  perform pg_temp.expect('A10a locked_at kept', lk.locked_at::text, before_lk.locked_at::text);
  perform pg_temp.expect('A10a converted_from', lk.details->>'converted_from', 'quota_breach');
  perform pg_temp.expect('A10a old end recorded', (lk.details->>'converted_locked_until' is not null)::text, 'true');
  perform pg_temp.expect('A10a the table agrees',
    (select (reason = 'admin' and locked_until is null and note = 'x')::text from public.library_security_locks
      where user_id = '00000000-0000-0000-0000-00000000e107' and lifted_at is null), 'true');
  perform pg_temp.expect('A10a one lock row',
    (select count(*)::text from public.library_security_locks where user_id = '00000000-0000-0000-0000-00000000e107'), '1');
  perform pg_temp.expect('A10a reader still locked',
    (select status from pg_temp.q('00000000-0000-0000-0000-00000000e107', 'law:9')), 'locked');

  -- (b) a second staff lock: the admin lock comes back unchanged
  select * into lk2 from public.library_security_lock_create(
    '00000000-0000-0000-0000-00000000e107', '00000000-0000-0000-0000-00000000e102', 'second', v_until);
  perform pg_temp.expect('A10b same lock', lk2.id::text, lk.id::text);
  perform pg_temp.expect('A10b note unchanged', lk2.note, 'x');
  perform pg_temp.expect('A10b end unchanged', (lk2.locked_until is null)::text, 'true');
  perform pg_temp.expect('A10b locked_by unchanged', lk2.locked_by::text, '00000000-0000-0000-0000-00000000e101');
end $$;

-- (c) over an activity_flag lock, with an end chosen by the staff
update public.library_monitor_settings set flag_action = 'lock', rule_hour_requests_on = true, rule_hour_requests = 10;
do $$
declare before_lk public.library_security_locks; lk public.library_security_locks;
        v_until timestamptz := date_trunc('second', now() + interval '3 days');
begin
  perform pg_temp.bump('00000000-0000-0000-0000-00000000e108', 20);
  select * into before_lk from public.library_security_locks l
   where l.user_id = '00000000-0000-0000-0000-00000000e108' and l.lifted_at is null;
  perform pg_temp.expect('A10c setup reason', before_lk.reason, 'activity_flag');
  select * into lk from public.library_security_lock_create(
    '00000000-0000-0000-0000-00000000e108', '00000000-0000-0000-0000-00000000e101', 'three days', v_until);
  perform pg_temp.expect('A10c reason', lk.reason, 'admin');
  perform pg_temp.expect('A10c the staff end', lk.locked_until::text, v_until::text);
  perform pg_temp.expect('A10c same reference', lk.reference, before_lk.reference);
  perform pg_temp.expect('A10c converted_from', lk.details->>'converted_from', 'activity_flag');
  perform pg_temp.expect('A10c rule details kept', (lk.details - 'converted_from' - 'converted_at' - 'converted_locked_until')::text,
    (before_lk.details)::text);
end $$;
update public.library_monitor_settings set flag_action = 'notify', rule_hour_requests_on = false;

-- A7 (normal state): delete the settings row → an automatic lock still gets ≈ 24 h (the coalesce)
delete from public.library_monitor_settings;
do $$
begin
  perform pg_temp.lock_about_24h('A7 (no row)', '00000000-0000-0000-0000-00000000e106');
end $$;
insert into public.library_monitor_settings (id) values (true);

select 'library_auto_lock_hours: ALL PASS' as result, true as ok;
