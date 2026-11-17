-- firm_row_write_check.test.sql — proves 20261122_31 (owner ticket S3).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20261122_31_firm_row_write_check.sql \
--     $M/20261122_31_firm_row_write_check.sql \
--     $T/firm_row_write_check.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261122_31
-- lines → "T1 FAIL: hearings accepted another firm's id".
--
-- People: firm F1 (owner O1), firm F2 (owner O2), L lawyer member of F1.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

-- ── fixtures as postgres (bypasses RLS on purpose) ──────────────────────────
insert into auth.users values
  ('0f000000-0000-0000-0000-0000000000a1'),
  ('0f000000-0000-0000-0000-0000000000a2'),
  ('1a000000-0000-0000-0000-0000000000b1');
insert into public.profiles (id, user_type, display_name) values
  ('0f000000-0000-0000-0000-0000000000a1', 'firm', 'O1'),
  ('0f000000-0000-0000-0000-0000000000a2', 'firm', 'O2'),
  ('1a000000-0000-0000-0000-0000000000b1', 'lawyer', 'L');
-- the phase2 trigger makes each owner an active managing_partner of his firm
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('f1000000-0000-0000-0000-000000000001', '0f000000-0000-0000-0000-0000000000a1', 'مكتب ١'),
  ('f2000000-0000-0000-0000-000000000002', '0f000000-0000-0000-0000-0000000000a2', 'مكتب ٢');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('f1000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000b1', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('SR-L1', '1a000000-0000-0000-0000-0000000000b1', 'قضية ١', '1a000000-0000-0000-0000-0000000000b1'),
  ('SR-L2', '1a000000-0000-0000-0000-0000000000b1', 'قضية ٢', '1a000000-0000-0000-0000-0000000000b1'),
  ('SR-O1', '0f000000-0000-0000-0000-0000000000a1', 'قضية المالك', '0f000000-0000-0000-0000-0000000000a1');

-- refused(sql): true when the statement is refused by RLS (42501).
create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

set role app_user;
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b1', false) is not null as as_l;

-- T1 a member cannot write another firm's id into any of the five tables
do $$
declare
  stmt text;
  stmts text[] := array[
    $s$insert into public.hearings (owner_user_id, firm_id, title, hearing_date) values ('1a000000-0000-0000-0000-0000000000b1', 'f2000000-0000-0000-0000-000000000002', 'x', current_date)$s$,
    $s$insert into public.tasks (owner_user_id, firm_id, title) values ('1a000000-0000-0000-0000-0000000000b1', 'f2000000-0000-0000-0000-000000000002', 'x')$s$,
    $s$insert into public.case_stages (case_request_id, owner_user_id, firm_id) values ('SR-L1', '1a000000-0000-0000-0000-0000000000b1', 'f2000000-0000-0000-0000-000000000002')$s$,
    $s$insert into public.case_graphs (case_request_id, owner_user_id, firm_id) values ('SR-L1', '1a000000-0000-0000-0000-0000000000b1', 'f2000000-0000-0000-0000-000000000002')$s$,
    $s$insert into public.lawyer_clients (owner_user_id, firm_id, name) values ('1a000000-0000-0000-0000-0000000000b1', 'f2000000-0000-0000-0000-000000000002', 'x')$s$
  ];
begin
  foreach stmt in array stmts loop
    if not pg_temp.refused(stmt) then
      raise exception 'T1 FAIL: % accepted another firm''s id', split_part(split_part(stmt, 'public.', 2), ' ', 1);
    end if;
  end loop;
  raise notice 'T1 PASS: all five tables refuse another firm''s id on insert';
end $$;

-- T2 his own firm's id and no firm id are accepted
do $$
begin
  insert into public.hearings (owner_user_id, firm_id, title, hearing_date)
    values ('1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'جلسة', current_date);
  insert into public.hearings (owner_user_id, firm_id, title, hearing_date)
    values ('1a000000-0000-0000-0000-0000000000b1', null, 'جلسة خاصة', current_date);
  insert into public.tasks (owner_user_id, firm_id, title)
    values ('1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'مهمة');
  insert into public.case_stages (case_request_id, owner_user_id, firm_id)
    values ('SR-L1', '1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001');
  insert into public.case_graphs (case_request_id, owner_user_id, firm_id)
    values ('SR-L1', '1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001');
  insert into public.case_graphs (case_request_id, owner_user_id, firm_id)
    values ('SR-L2', '1a000000-0000-0000-0000-0000000000b1', null);
  insert into public.lawyer_clients (owner_user_id, firm_id, name)
    values ('1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'موكل');
  raise notice 'T2 PASS: own firm id and null are accepted';
end $$;

-- T3 an update cannot move his row to another firm; null and his own firm stay fine
do $$
declare t text;
begin
  foreach t in array array['hearings', 'tasks', 'case_stages', 'case_graphs', 'lawyer_clients'] loop
    if not pg_temp.refused(format(
         'update public.%I set firm_id = %L where owner_user_id = %L and firm_id = %L',
         t, 'f2000000-0000-0000-0000-000000000002', '1a000000-0000-0000-0000-0000000000b1',
         'f1000000-0000-0000-0000-000000000001')) then
      raise exception 'T3 FAIL: % let an update move a row to another firm', t;
    end if;
  end loop;
  update public.hearings set title = 'جلسة معدلة'
   where owner_user_id = '1a000000-0000-0000-0000-0000000000b1' and firm_id = 'f1000000-0000-0000-0000-000000000001';
  if not found then raise exception 'T3 FAIL: a plain update of his own firm row was refused'; end if;
  update public.hearings set firm_id = null where title = 'جلسة خاصة';
  if not found then raise exception 'T3 FAIL: an update to firm_id null was refused'; end if;
  raise notice 'T3 PASS: updates keep firm_id within the writer''s firm';
end $$;

-- T4 the firm owner writes his firm's id even without a member row
reset role;
delete from public.firm_members
 where firm_id = 'f1000000-0000-0000-0000-000000000001' and user_id = '0f000000-0000-0000-0000-0000000000a1';
set role app_user;
select set_config('test.uid', '0f000000-0000-0000-0000-0000000000a1', false) is not null as as_o1;
do $$
begin
  insert into public.tasks (owner_user_id, firm_id, title)
    values ('0f000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-000000000001', 'مهمة المالك');
  if not pg_temp.refused($s$insert into public.tasks (owner_user_id, firm_id, title) values ('0f000000-0000-0000-0000-0000000000a1', 'f2000000-0000-0000-0000-000000000002', 'x')$s$) then
    raise exception 'T4 FAIL: the owner of F1 wrote F2''s id';
  end if;
  raise notice 'T4 PASS: the owner arm admits his own firm only';
end $$;

-- T5 a suspended member can no longer update a row that carries the firm id
reset role;
update public.firm_members set status = 'suspended'
 where firm_id = 'f1000000-0000-0000-0000-000000000001' and user_id = '1a000000-0000-0000-0000-0000000000b1';
set role app_user;
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b1', false) is not null as as_l_again;
do $$
begin
  if not pg_temp.refused($s$update public.tasks set title = 'y' where owner_user_id = '1a000000-0000-0000-0000-0000000000b1' and firm_id = 'f1000000-0000-0000-0000-000000000001'$s$) then
    raise exception 'T5 FAIL: a suspended member updated a row of the firm';
  end if;
  raise notice 'T5 PASS: a suspended member''s firm rows are read-only for him';
end $$;

reset role;

-- T6 the ten restrictive policies are in place
do $$
declare n int;
begin
  select count(*) into n from pg_policy
   where polpermissive = false
     and polname in ('firm_id is the writer''s firm (insert)', 'firm_id is the writer''s firm (update)');
  if n <> 10 then raise exception 'T6 FAIL: % restrictive policies, expected 10', n; end if;
  raise notice 'T6 PASS: 10 restrictive policies';
end $$;
