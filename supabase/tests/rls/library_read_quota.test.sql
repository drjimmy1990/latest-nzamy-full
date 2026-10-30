-- library_read_quota.test.sql — proves 20261030_80 (owner note ١٣ C07 + C09):
-- library_read_quota_docs / library_read_quota_hit, library_security_locks /
-- library_security_lock_create / library_security_lock_lift.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261030_80_library_read_quota.sql $R/library_read_quota.test.sql
--
-- NEGATIVE CONTROL (must FAIL): run.sh needs one file before the test, so
--   bash $R/run.sh $R/prelude_platform_settings_min.sql $R/library_read_quota.test.sql
-- → "T0 FAIL: public.library_read_quota_hit does not exist". (Both run
-- 2026-10-30 on postgres:16-alpine: the chain printed ALL PASS, the control
-- stopped at T0.)
--
-- Small limits so the edges are reachable: individual 3 docs/day, member 5,
-- 4 docs/hour, lock after 2 distinct refused documents.
-- Actors: A …c001 individual, F …c002 firm, M …c003 admin, B …c004 individual
--         (member of a firm through firm_members), H …c005 individual (hourly).
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)') is null then
    raise exception 'T0 FAIL: public.library_read_quota_hit does not exist (20261030_80 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002'),
  ('00000000-0000-0000-0000-00000000c003'),
  ('00000000-0000-0000-0000-00000000c004'),
  ('00000000-0000-0000-0000-00000000c005');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000c001', 'individual', 'A'),
  ('00000000-0000-0000-0000-00000000c002', 'firm', 'F'),
  ('00000000-0000-0000-0000-00000000c003', 'admin', 'M'),
  ('00000000-0000-0000-0000-00000000c004', 'lawyer', 'B'),
  ('00000000-0000-0000-0000-00000000c005', 'individual', 'H');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000c002', 'مكتب');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000c004', 'lawyer', 'active');

create temp table hit as
  select * from public.library_read_quota_hit('00000000-0000-0000-0000-00000000c001', null, 3, 5, 4, 2) limit 0;
create or replace function pg_temp.q(u text, k text, hourly int default 4)
returns setof hit language sql as $$
  select * from public.library_read_quota_hit(u::uuid, k, 3, 5, hourly, 2)
$$;
create or replace function pg_temp.expect(label text, got text, want text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% FAIL: got %, want %', label, got, want;
  end if;
end $$;

-- T1 an individual: three distinct documents allowed, re-opening is free
do $$
declare r record;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'law:a');
  perform pg_temp.expect('T1a status', r.status, 'ok');
  perform pg_temp.expect('T1a used', r.used_today::text, '1');
  perform pg_temp.expect('T1a limit', r.day_limit::text, '3');
  -- the same law again (another window): still 1
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'law:a');
  perform pg_temp.expect('T1b same doc status', r.status, 'ok');
  perform pg_temp.expect('T1b same doc used', r.used_today::text, '1');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'book:b');
  perform pg_temp.expect('T1c used', r.used_today::text, '2');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'precedent:c');
  perform pg_temp.expect('T1d used', r.used_today::text, '3');
end $$;

-- T2 the fourth distinct document is refused (over_daily) with the Riyadh midnight
--    as the reset; the documents already read stay open
do $$
declare r record;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'decree:d');
  perform pg_temp.expect('T2a status', r.status, 'over_daily');
  perform pg_temp.expect('T2a refused', r.refused_today::text, '1');
  if r.resets_at <> (((now() at time zone 'Asia/Riyadh')::date + 1)::timestamp at time zone 'Asia/Riyadh') then
    raise exception 'T2a FAIL: resets_at % is not the next Riyadh midnight', r.resets_at;
  end if;
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'law:a');
  perform pg_temp.expect('T2b already-read doc still ok', r.status, 'ok');
  -- the same refused document again is not a second refusal
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'decree:d');
  perform pg_temp.expect('T2c same refused doc', r.status, 'over_daily');
  perform pg_temp.expect('T2c refused stays 1', r.refused_today::text, '1');
  if exists (select 1 from public.library_security_locks where user_id = '00000000-0000-0000-0000-00000000c001') then
    raise exception 'T2 FAIL: one refusal opened a lock';
  end if;
end $$;

-- T3 the second DISTINCT refused document opens a quota_breach lock
do $$
declare r record; n int;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'decree:e');
  perform pg_temp.expect('T3a status', r.status, 'locked');
  if r.lock_reference !~ '^SEC-[0-9A-F]{10}$' then
    raise exception 'T3a FAIL: reference % is not SEC-XXXXXXXXXX', r.lock_reference;
  end if;
  select count(*) into n from public.library_security_locks
   where user_id = '00000000-0000-0000-0000-00000000c001' and lifted_at is null and reason = 'quota_breach' and locked_by is null;
  perform pg_temp.expect('T3b one open system lock', n::text, '1');
  -- locked: even a document read earlier today is refused now, and the state call says so
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'law:a');
  perform pg_temp.expect('T3c locked blocks old doc', r.status, 'locked');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', null);
  perform pg_temp.expect('T3d state call', r.status, 'locked');
  -- the account itself is untouched (no freeze, no delete)
  if not exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-00000000c001') then
    raise exception 'T3e FAIL: the profile is gone';
  end if;
end $$;

-- T4 lifting closes the lock, keeps the row, clears today's count: reads work again
do $$
declare r record; v_id uuid; l public.library_security_locks;
begin
  select id into v_id from public.library_security_locks
   where user_id = '00000000-0000-0000-0000-00000000c001' and lifted_at is null;
  select * into l from public.library_security_lock_lift(v_id, '00000000-0000-0000-0000-00000000c003', 'تواصل معنا وتحققنا');
  if l.lifted_at is null or l.lifted_by <> '00000000-0000-0000-0000-00000000c003' then
    raise exception 'T4a FAIL: lift did not record when / who';
  end if;
  if (select count(*) from public.library_security_locks where user_id = '00000000-0000-0000-0000-00000000c001') <> 1 then
    raise exception 'T4b FAIL: the lock row was not kept';
  end if;
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c001', 'decree:e');
  perform pg_temp.expect('T4c after lift', r.status, 'ok');
  perform pg_temp.expect('T4c count restarted', r.used_today::text, '1');
  -- lifting twice returns the lifted row unchanged
  select * into l from public.library_security_lock_lift(v_id, '00000000-0000-0000-0000-00000000c003', 'again');
  if l.lift_note <> 'تواصل معنا وتحققنا' then
    raise exception 'T4d FAIL: a second lift rewrote the row';
  end if;
end $$;

-- T5 office tier: a firm account and an active firm member get the member limit (5)
do $$
declare r record;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c002', 'law:x');
  perform pg_temp.expect('T5a firm limit', r.day_limit::text, '5');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c004', 'law:x');
  perform pg_temp.expect('T5b member limit', r.day_limit::text, '5');
  update public.firm_members set status = 'suspended' where user_id = '00000000-0000-0000-0000-00000000c004';
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c004', 'law:y');
  perform pg_temp.expect('T5c suspended member is individual', r.day_limit::text, '3');
end $$;

-- T6 an admin is exempt and never counted; an admin cannot be locked
do $$
declare r record;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c003', 'law:a');
  perform pg_temp.expect('T6a admin', r.status, 'exempt');
  if exists (select 1 from public.library_read_quota_docs where user_id = '00000000-0000-0000-0000-00000000c003') then
    raise exception 'T6b FAIL: an admin read was counted';
  end if;
  begin
    perform public.library_security_lock_create('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000c003', 'x');
    raise exception 'T6c FAIL: an admin was locked';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'admin_target' then raise; end if;
  end;
end $$;

-- T7 the hourly cap: H may read 2 per hour (hourly = 2), the third is over_hourly
do $$
declare r record;
begin
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c005', 'law:1', 2);
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c005', 'law:2', 2);
  perform pg_temp.expect('T7a', r.status, 'ok');
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c005', 'law:3', 2);
  perform pg_temp.expect('T7b over hour', r.status, 'over_hourly');
  if r.resets_at > now() + interval '1 hour' or r.resets_at <= now() then
    raise exception 'T7b FAIL: hourly reset % not within the next hour', r.resets_at;
  end if;
  -- an hour later (rows aged by hand) the same document is allowed and promoted
  update public.library_read_quota_docs set first_at = first_at - interval '2 hours'
   where user_id = '00000000-0000-0000-0000-00000000c005' and allowed;
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c005', 'law:3', 2);
  perform pg_temp.expect('T7c after the hour', r.status, 'ok');
  if not (select allowed from public.library_read_quota_docs
           where user_id = '00000000-0000-0000-0000-00000000c005' and doc_key = 'law:3') then
    raise exception 'T7d FAIL: the refused row was not promoted';
  end if;
end $$;

-- T8 admin lock: create, one open lock per user (a second create returns it),
--    a time-limited lock expires by itself
do $$
declare l1 public.library_security_locks; l2 public.library_security_locks; r record;
begin
  select * into l1 from public.library_security_lock_create(
    '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003', 'نشاط آلي مشتبه');
  perform pg_temp.expect('T8a reason', l1.reason, 'admin');
  select * into l2 from public.library_security_lock_create(
    '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000c003', 'again');
  perform pg_temp.expect('T8b same lock', l2.id::text, l1.id::text);
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c002', 'law:x');
  perform pg_temp.expect('T8c locked', r.status, 'locked');
  -- expire it by hand: the next call closes it and reads again
  update public.library_security_locks set locked_at = now() - interval '2 days', locked_until = now() - interval '1 day'
   where id = l1.id;
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c002', 'law:x');
  perform pg_temp.expect('T8d expired lock', r.status, 'ok');
  if (select lifted_at is null or lifted_by is not null from public.library_security_locks where id = l1.id) then
    raise exception 'T8e FAIL: the expired lock was not closed by time';
  end if;
  -- the partial unique index: two open locks for one user are impossible
  insert into public.library_security_locks (user_id, reason) values ('00000000-0000-0000-0000-00000000c005', 'admin');
  begin
    insert into public.library_security_locks (user_id, reason) values ('00000000-0000-0000-0000-00000000c005', 'admin');
    raise exception 'T8f FAIL: a second open lock was accepted';
  exception when unique_violation then null;
  end;
end $$;

-- T9 invalid arguments are refused (22023)
do $$
begin
  begin
    perform public.library_read_quota_hit('00000000-0000-0000-0000-00000000c001', 'law:a', 0, 5, 4, 2);
    raise exception 'T9a FAIL: a zero limit was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.library_read_quota_hit('00000000-0000-0000-0000-00000000c001', repeat('x', 301), 3, 5, 4, 2);
    raise exception 'T9b FAIL: an over-long key was accepted';
  exception when sqlstate '22023' then null;
  end;
end $$;

-- T10 housekeeping: rows older than yesterday are removed on the next call
do $$
declare r record;
begin
  insert into public.library_read_quota_docs (user_id, day, doc_key, allowed)
    values ('00000000-0000-0000-0000-00000000c004', current_date - 10, 'law:old', true);
  select * into r from pg_temp.q('00000000-0000-0000-0000-00000000c004', 'law:z');
  if exists (select 1 from public.library_read_quota_docs where doc_key = 'law:old') then
    raise exception 'T10 FAIL: an old row survived';
  end if;
end $$;

-- ── as a session role (app_user stands in for authenticated) ────────────────
-- stubs.sql's default privileges gave app_user everything: take it back, as
-- the real authenticated role never had it.
revoke all on public.library_security_locks, public.library_read_quota_docs from app_user;

set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000c001', false);

-- T11 a signed-in user cannot read, write or call any of it
do $$
begin
  begin
    perform 1 from public.library_security_locks limit 1;
    raise exception 'T11a FAIL: a user can read the locks table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.library_read_quota_docs limit 1;
    raise exception 'T11b FAIL: a user can read the counter table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.library_read_quota_hit('00000000-0000-0000-0000-00000000c001', 'law:q', 3, 5, 4, 2);
    raise exception 'T11c FAIL: a user can call library_read_quota_hit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.library_security_lock_lift(gen_random_uuid(), '00000000-0000-0000-0000-00000000c001', 'x');
    raise exception 'T11d FAIL: a user can lift a lock';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.library_security_lock_create('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-00000000c001', 'x');
    raise exception 'T11e FAIL: a user can create a lock';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'library_read_quota.test.sql: ALL PASS'; end $$;
