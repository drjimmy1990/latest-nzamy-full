-- hearings_assignee.test.sql — proves 20261124_50 (owner N01-18: a hearing can
-- be assigned to a colleague in the same firm, who then sees and updates it
-- while his membership is active, and only then).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $M/20261122_31_firm_row_write_check.sql \
--     $M/20261124_50_hearings_assignee.sql \
--     $M/20261124_50_hearings_assignee.sql \
--     $T/hearings_assignee.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261124_50
-- lines → the first insert names a column that does not exist.
--
-- People: firm F1 (owner O1), L and M lawyers active in F1, X a solo lawyer,
-- firm F2 (owner O2). Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

insert into auth.users (id) values
  ('0f000000-0000-0000-0000-0000000000a1'),
  ('0f000000-0000-0000-0000-0000000000a2'),
  ('1a000000-0000-0000-0000-0000000000b1'),
  ('1a000000-0000-0000-0000-0000000000b2'),
  ('1a000000-0000-0000-0000-0000000000b3');
insert into public.profiles (id, user_type, display_name) values
  ('0f000000-0000-0000-0000-0000000000a1', 'firm', 'O1'),
  ('0f000000-0000-0000-0000-0000000000a2', 'firm', 'O2'),
  ('1a000000-0000-0000-0000-0000000000b1', 'lawyer', 'L'),
  ('1a000000-0000-0000-0000-0000000000b2', 'lawyer', 'M'),
  ('1a000000-0000-0000-0000-0000000000b3', 'lawyer', 'X');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('f1000000-0000-0000-0000-000000000001', '0f000000-0000-0000-0000-0000000000a1', 'مكتب ١'),
  ('f2000000-0000-0000-0000-000000000002', '0f000000-0000-0000-0000-0000000000a2', 'مكتب ٢');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('f1000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000b1', 'lawyer', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000b2', 'lawyer', 'active', now());

-- refused(sql): true when the statement is refused by RLS (42501) or the
-- member check (23514).
create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege or check_violation then
  return true;
end $$;

-- T0 the column, the trigger and the Art. 18 guard's pointer list
do $$
declare args text;
begin
  select encode(tgargs, 'escape') into args from pg_trigger
   where tgrelid = 'public.hearings'::regclass and tgname = 'trg_00_refuse_consultant_court_rows';
  if args is null or position('assignee_user_id' in args) = 0 then
    raise exception 'T0 FAIL: the Art. 18 guard on hearings does not name assignee_user_id (%)', args;
  end if;
  raise notice 'T0 PASS: guard pointers %', replace(args, E'\\000', ',');
end $$;

set role app_user;
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b1', false) is not null as as_l;

-- T1 L assigns his firm hearing to M (active member) and to himself; never to an outsider
do $$
begin
  insert into public.hearings (id, owner_user_id, firm_id, title, hearing_date, assignee_user_id)
    values ('c0000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000b1',
            'f1000000-0000-0000-0000-000000000001', 'جلسة لزميل', current_date, '1a000000-0000-0000-0000-0000000000b2');
  insert into public.hearings (id, owner_user_id, firm_id, title, hearing_date, assignee_user_id)
    values ('c0000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-0000000000b1',
            null, 'جلسة خاصة', current_date, '1a000000-0000-0000-0000-0000000000b1');
  if not pg_temp.refused($s$insert into public.hearings (owner_user_id, firm_id, title, hearing_date, assignee_user_id) values ('1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'x', current_date, '1a000000-0000-0000-0000-0000000000b3')$s$) then
    raise exception 'T1 FAIL: a firm hearing was assigned to a lawyer outside the firm';
  end if;
  if not pg_temp.refused($s$insert into public.hearings (owner_user_id, firm_id, title, hearing_date, assignee_user_id) values ('1a000000-0000-0000-0000-0000000000b1', null, 'x', current_date, '1a000000-0000-0000-0000-0000000000b2')$s$) then
    raise exception 'T1 FAIL: a solo hearing (no firm) was assigned to someone other than its owner';
  end if;
  if not pg_temp.refused($s$update public.hearings set assignee_user_id = '1a000000-0000-0000-0000-0000000000b3' where id = 'c0000000-0000-0000-0000-000000000001'$s$) then
    raise exception 'T1 FAIL: an update re-assigned the hearing to an outsider';
  end if;
  raise notice 'T1 PASS: assignee = owner or an active member of the row''s firm';
end $$;

-- T2 M (the assignee, active in F1) reads it and records the outcome
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b2', false) is not null as as_m;
do $$
declare n int;
begin
  select count(*) into n from public.hearings where assignee_user_id = '1a000000-0000-0000-0000-0000000000b2';
  if n <> 1 then raise exception 'T2 FAIL: the assignee sees % assigned hearings, expected 1', n; end if;
  update public.hearings set status = 'held', minutes = 'محضر' where id = 'c0000000-0000-0000-0000-000000000001';
  if not found then raise exception 'T2 FAIL: the assignee could not record the outcome'; end if;
  select count(*) into n from public.hearings where id = 'c0000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'T2 FAIL: M reads L''s solo hearing'; end if;
  raise notice 'T2 PASS: the active assignee reads and updates the firm hearing, not the solo one';
end $$;

-- T3 X (outside the firm) sees nothing
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b3', false) is not null as as_x;
do $$
declare n int;
begin
  select count(*) into n from public.hearings;
  if n <> 0 then raise exception 'T3 FAIL: an outsider reads % hearings', n; end if;
  raise notice 'T3 PASS: an outsider reads none';
end $$;

-- T4 M is removed from F1: no read, no update, and he cannot be re-assigned
reset role;
update public.firm_members set status = 'removed'
 where firm_id = 'f1000000-0000-0000-0000-000000000001' and user_id = '1a000000-0000-0000-0000-0000000000b2';
-- (the removal transfer moves only what he OWNS; the hearing above is L's)
set role app_user;
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b2', false) is not null as as_m_removed;
do $$
declare n int;
begin
  select count(*) into n from public.hearings;
  if n <> 0 then raise exception 'T4 FAIL: a removed member still reads % hearings', n; end if;
  update public.hearings set status = 'adjourned' where id = 'c0000000-0000-0000-0000-000000000001';
  if found then raise exception 'T4 FAIL: a removed member updated the hearing'; end if;
  raise notice 'T4 PASS: a removed assignee loses the hearing';
end $$;

select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b1', false) is not null as as_l_again;
do $$
begin
  -- his row keeps the old assignee; an edit that does not touch it still passes
  update public.hearings set title = 'جلسة معدلة' where id = 'c0000000-0000-0000-0000-000000000001';
  if not found then raise exception 'T5 FAIL: the owner could not edit a row whose assignee left'; end if;
  if not pg_temp.refused($s$update public.hearings set assignee_user_id = '1a000000-0000-0000-0000-0000000000b2' where id = 'c0000000-0000-0000-0000-000000000002'$s$) then
    raise exception 'T5 FAIL: a removed member was assigned again';
  end if;
  update public.hearings set assignee_user_id = null where id = 'c0000000-0000-0000-0000-000000000001';
  if not found then raise exception 'T5 FAIL: clearing the assignee was refused'; end if;
  raise notice 'T5 PASS: owner edits pass, a removed member cannot be assigned, clearing passes';
end $$;

-- T6 deleting the assignee's account nulls the pointer (the cascade passes the Art. 18 guard)
reset role;
update public.hearings set assignee_user_id = '1a000000-0000-0000-0000-0000000000b1'
 where id = 'c0000000-0000-0000-0000-000000000001';
delete from public.firm_members where user_id = '1a000000-0000-0000-0000-0000000000b1';
delete from public.profiles where id = '1a000000-0000-0000-0000-0000000000b1';
do $$
declare v uuid;
begin
  -- re-own the row first so the owner FK (CASCADE) does not delete it
  update public.hearings set owner_user_id = '0f000000-0000-0000-0000-0000000000a1'
   where id = 'c0000000-0000-0000-0000-000000000001';
  delete from auth.users where id = '1a000000-0000-0000-0000-0000000000b1';
  select assignee_user_id into v from public.hearings where id = 'c0000000-0000-0000-0000-000000000001';
  if not found then raise exception 'T6 FAIL: the hearing went with the assignee''s account'; end if;
  if v is not null then raise exception 'T6 FAIL: assignee_user_id still points at a deleted account'; end if;
  raise notice 'T6 PASS: the account deletion nulls the assignee';
end $$;
