-- canvas_boards.test.sql — proves 20261126_70 (batch l6-tools, P1-32 named case boards).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261122_31_firm_row_write_check.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $M/20261126_70_canvas_boards.sql \
--     $M/20261126_70_canvas_boards.sql \
--     $T/canvas_boards.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261126_70
-- lines → «relation "public.canvas_boards" does not exist».
--
-- People: firm F1 (owner O1) with lawyers L and M; firm F2 (owner O2);
-- S a solo lawyer. Every assertion RAISES on failure. Runs as `authenticated`.
\set ON_ERROR_STOP 1

insert into auth.users values
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
  ('1a000000-0000-0000-0000-0000000000b3', 'lawyer', 'S');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('f1000000-0000-0000-0000-000000000001', '0f000000-0000-0000-0000-0000000000a1', 'مكتب ١'),
  ('f2000000-0000-0000-0000-000000000002', '0f000000-0000-0000-0000-0000000000a2', 'مكتب ٢');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('f1000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000b1', 'lawyer', 'active', now()),
  ('f1000000-0000-0000-0000-000000000001', '1a000000-0000-0000-0000-0000000000b2', 'lawyer', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('SR-1', '1a000000-0000-0000-0000-0000000000b1', '1a000000-0000-0000-0000-0000000000b1', 'قضية ١', 'f1000000-0000-0000-0000-000000000001'),
  ('SR-R', '1a000000-0000-0000-0000-0000000000b1', '1a000000-0000-0000-0000-0000000000b1', 'قضية مقيدة', 'f1000000-0000-0000-0000-000000000001'),
  ('SR-S', '1a000000-0000-0000-0000-0000000000b3', '1a000000-0000-0000-0000-0000000000b3', 'قضية منفردة', null);

create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;

set role authenticated;

-- T1 L creates boards on his firm's case; M (same firm) reads and renames; M cannot delete
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b1', false) is not null as as_l;
do $$
begin
  insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
    values ('SR-1', '1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'خريطة الأطراف');
  insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
    values ('SR-R', '1a000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-000000000001', 'لوحة مقيدة');
  if (select count(*) from public.canvas_boards) <> 2 then raise exception 'T1 FAIL: L does not read his own boards'; end if;
  raise notice 'T1a PASS: the owner creates and reads named boards';
end $$;

select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b2', false) is not null as as_m;
do $$
declare n int;
begin
  if not exists (select 1 from public.canvas_boards where name = 'خريطة الأطراف') then
    raise exception 'T1 FAIL: an active colleague cannot read the firm board';
  end if;
  update public.canvas_boards set name = 'الأطراف' where name = 'خريطة الأطراف';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 FAIL: an active colleague cannot rename the firm board'; end if;
  delete from public.canvas_boards where name = 'الأطراف';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1 FAIL: a colleague deleted a board he does not own'; end if;
  raise notice 'T1b PASS: colleague reads and renames, cannot delete';
end $$;

-- T2 another firm and a solo lawyer see nothing; no one writes another's id or another firm's id
select set_config('test.uid', '0f000000-0000-0000-0000-0000000000a2', false) is not null as as_o2;
do $$
begin
  if exists (select 1 from public.canvas_boards) then raise exception 'T2 FAIL: another firm reads the boards'; end if;
  raise notice 'T2a PASS: another firm reads nothing';
end $$;
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b3', false) is not null as as_s;
do $$
begin
  if exists (select 1 from public.canvas_boards) then raise exception 'T2 FAIL: a solo lawyer reads the firm boards'; end if;
  if not pg_temp.refused($s$insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
      values ('SR-S', '1a000000-0000-0000-0000-0000000000b1', null, 'x')$s$) then
    raise exception 'T2 FAIL: a board was written under another user''s id';
  end if;
  if not pg_temp.refused($s$insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
      values ('SR-S', '1a000000-0000-0000-0000-0000000000b3', 'f2000000-0000-0000-0000-000000000002', 'x')$s$) then
    raise exception 'T2 FAIL: a board was written with another firm''s id';
  end if;
  insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
    values ('SR-S', '1a000000-0000-0000-0000-0000000000b3', null, 'لوحتي');
  raise notice 'T2b PASS: own id and no firm accepted; another id or firm refused';
end $$;

-- T3 a duplicate name in the same case is refused; 20 boards per case at most
do $$
declare i int;
begin
  begin
    insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
      values ('SR-S', '1a000000-0000-0000-0000-0000000000b3', null, 'لوحتي');
    raise exception 'T3 FAIL: a duplicate name was accepted';
  exception when unique_violation then null;
  end;
  for i in 2..20 loop
    insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
      values ('SR-S', '1a000000-0000-0000-0000-0000000000b3', null, 'لوحة ' || i);
  end loop;
  begin
    insert into public.canvas_boards (case_request_id, owner_user_id, firm_id, name)
      values ('SR-S', '1a000000-0000-0000-0000-0000000000b3', null, 'لوحة ٢١');
    raise exception 'T3 FAIL: a 21st board was accepted';
  exception when raise_exception then
    if sqlerrm not like '%at most 20 boards%' then raise; end if;
  end;
  delete from public.canvas_boards where name = 'لوحة 20';
  raise notice 'T3 PASS: unique names, cap of 20, the owner deletes';
end $$;

-- T4 a restricted case: its board is hidden from a colleague off the case team
reset role;
update public.service_requests set is_restricted = true where id = 'SR-R';
set role authenticated;
select set_config('test.uid', '1a000000-0000-0000-0000-0000000000b2', false) is not null as as_m2;
do $$
begin
  if exists (select 1 from public.canvas_boards where case_request_id = 'SR-R') then
    raise exception 'T4 FAIL: a colleague off the team reads a restricted case''s board';
  end if;
  if not exists (select 1 from public.canvas_boards where case_request_id = 'SR-1') then
    raise exception 'T4 FAIL: the unrestricted board disappeared';
  end if;
  raise notice 'T4 PASS: restricted case boards follow the case team';
end $$;

-- T5 anon has no grant
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.canvas_boards', 'select') then
    raise exception 'T5 FAIL: anon can read canvas_boards';
  end if;
  raise notice 'T5 PASS: anon has no grant';
end $$;
