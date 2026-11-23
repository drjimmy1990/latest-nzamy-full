-- case_graph_insert_scope.test.sql — proves 20261203_95 (l13 integration:
--   a case map is created only by someone who works on the case). Fixture and
--   chain copied from case_free_board.test.sql, which proves 20261203_60 (batch l13-canvas, owner ١٨٩:
--   the «لوحة» tab beside the case map — one free board per case, opened only
--   by the people who work on the case AND can open it).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The firm-role
-- chain of l12_firm_scope.test.sql, so the restrictive layers on
-- service_requests (trainee / office roles → assigned cases only, finance
-- manager → no case files, restricted case → its team) are the real ones. The
-- migration runs TWICE (idempotent). From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260627_platform_settings.sql \
--     $M/20261128_10_payref_settings.sql \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261122_31_firm_row_write_check.sql \
--     $M/20261124_50_hearings_assignee.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $T/prelude_invoice_payments_live.sql \
--     $M/20261126_40_time_trust_expenses.sql \
--     $M/20261129_10_firm_company_roles_seats.sql \
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $M/20261202_80_l12_firm_roles_log_badge_storage.sql \
--     $M/20261203_60_case_free_board.sql \
--     $M/20261203_60_case_free_board.sql \
--     $M/20261203_95_case_graph_insert_scope.sql \
--     $M/20261203_95_case_graph_insert_scope.sql \
--     $T/case_graph_insert_scope.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the chain without the two 20261203_95 lines
--   → «G1 FAIL: a stranger created the map of a case he cannot open».
--
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-000000013a00'),
  ('00000000-0000-0000-0000-000000013a01'),
  ('00000000-0000-0000-0000-000000013a02'),
  ('00000000-0000-0000-0000-000000013a03'),
  ('00000000-0000-0000-0000-000000013a04'),
  ('00000000-0000-0000-0000-000000013a05'),
  ('00000000-0000-0000-0000-000000013a06'),
  ('00000000-0000-0000-0000-000000013a07'),
  ('00000000-0000-0000-0000-000000013a08'),
  ('00000000-0000-0000-0000-000000013a09');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-000000013a00', 'firm',       'O', 'o@l13.test'),
  ('00000000-0000-0000-0000-000000013a01', 'lawyer',     'L', 'l@l13.test'),
  ('00000000-0000-0000-0000-000000013a02', 'lawyer',     'M', 'm@l13.test'),
  ('00000000-0000-0000-0000-000000013a03', 'individual', 'T', 't@l13.test'),
  ('00000000-0000-0000-0000-000000013a04', 'individual', 'A', 'a@l13.test'),
  ('00000000-0000-0000-0000-000000013a05', 'individual', 'N', 'n@l13.test'),
  ('00000000-0000-0000-0000-000000013a06', 'firm',       'G', 'g@l13.test'),
  ('00000000-0000-0000-0000-000000013a07', 'lawyer',     'X', 'x@l13.test'),
  ('00000000-0000-0000-0000-000000013a08', 'lawyer',     'S', 's@l13.test'),
  ('00000000-0000-0000-0000-000000013a09', 'individual', 'C', 'c@l13.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a00', 'مكتب l13'),
  ('ffffffff-0000-0000-0000-000000013f02', '00000000-0000-0000-0000-000000013a06', 'مكتب آخر');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a01', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a02', 'lawyer',          'active', now()),
  ('ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a03', 'trainee',         'active', now()),
  ('ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a04', 'office_admin',    'active', now()),
  ('ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a05', 'finance_manager', 'active', now()),
  ('ffffffff-0000-0000-0000-000000013f02', '00000000-0000-0000-0000-000000013a07', 'lawyer',          'active', now());

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-a', '00000000-0000-0000-0000-000000013a01', '00000000-0000-0000-0000-000000013a01', 'قضية أ', 'ffffffff-0000-0000-0000-000000013f01'),
  ('case-b', '00000000-0000-0000-0000-000000013a01', '00000000-0000-0000-0000-000000013a01', 'قضية ب', 'ffffffff-0000-0000-0000-000000013f01'),
  ('case-s', '00000000-0000-0000-0000-000000013a09', '00000000-0000-0000-0000-000000013a08', 'قضية منفردة', null);
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id, is_restricted) values
  ('case-r', '00000000-0000-0000-0000-000000013a01', '00000000-0000-0000-0000-000000013a01', 'قضية مقيّدة', 'ffffffff-0000-0000-0000-000000013f01', true);
insert into public.case_team_members (request_id, user_id, firm_id, added_by) values
  ('case-a', '00000000-0000-0000-0000-000000013a03', 'ffffffff-0000-0000-0000-000000013f01', '00000000-0000-0000-0000-000000013a01');

-- a refused statement: RLS violation or a missing privilege (both 42501)
create or replace function pg_temp.refused(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when insufficient_privilege then
  return true;
end $$;
grant execute on function pg_temp.refused(text) to authenticated;

-- the free boards this session reads, as a sorted id list
create or replace function pg_temp.boards() returns text language sql as $$
  select coalesce(string_agg(case_request_id, ',' order by case_request_id), '') from public.case_free_boards;
$$;
grant execute on function pg_temp.boards() to authenticated;

create or replace function pg_temp.as_user(p_uid text) returns void language sql as $$
  select set_config('test.uid', p_uid, false) is not null;
$$;
grant execute on function pg_temp.as_user(text) to authenticated;

set role authenticated;

-- G1 a stranger (another firm's lawyer) cannot create the map of case-a
select pg_temp.as_user('00000000-0000-0000-0000-000000013a07');
do $$
begin
  if not pg_temp.refused($s$insert into public.case_graphs (case_request_id, owner_user_id)
      values ('case-a', '00000000-0000-0000-0000-000000013a07')$s$) then
    raise exception 'G1 FAIL: a stranger created the map of a case he cannot open';
  end if;
  raise notice 'G1 PASS: a stranger cannot take a case''s map';
end $$;

-- G2 the filing client of the solo case cannot create its map either
select pg_temp.as_user('00000000-0000-0000-0000-000000013a09');
do $$
begin
  if not pg_temp.refused($s$insert into public.case_graphs (case_request_id, owner_user_id)
      values ('case-s', '00000000-0000-0000-0000-000000013a09')$s$) then
    raise exception 'G2 FAIL: the client created the lawyer''s case map';
  end if;
  raise notice 'G2 PASS: the client cannot create the case map';
end $$;

-- G3 the people who work on the case still create maps as before
select pg_temp.as_user('00000000-0000-0000-0000-000000013a01');
do $$
begin
  insert into public.case_graphs (case_request_id, owner_user_id, firm_id)
    values ('case-a', '00000000-0000-0000-0000-000000013a01', 'ffffffff-0000-0000-0000-000000013f01');
  raise notice 'G3a PASS: the lead creates his case map';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000013a08');
do $$
begin
  insert into public.case_graphs (case_request_id, owner_user_id)
    values ('case-s', '00000000-0000-0000-0000-000000013a08');
  raise notice 'G3b PASS: the assigned solo lawyer creates his case map';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000013a00');
do $$
begin
  insert into public.case_graphs (case_request_id, owner_user_id, firm_id)
    values ('case-b', '00000000-0000-0000-0000-000000013a00', 'ffffffff-0000-0000-0000-000000013f01');
  raise notice 'G3c PASS: the firm owner creates a case map';
end $$;

reset role;
select 'case_graph_insert_scope: ALL PASS' as result;
