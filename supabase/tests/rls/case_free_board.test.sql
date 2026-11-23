-- case_free_board.test.sql — proves 20261203_60 (batch l13-canvas, owner ١٨٩:
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
--     $T/case_free_board.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL):
--   1. the chain without the two 20261203_60 lines
--      → «relation "public.case_free_boards" does not exist».
--   2. add $T/case_free_board_no_worker.fixture.sql after the two 20261203_60
--      lines (the rule loses its «works on the case» half)
--      → «F1 FAIL: the client who filed the case reads its free board».
--   3. add $T/case_free_board_definer.fixture.sql instead (the rule stops
--      reading the case under its own policies)
--      → «F2 FAIL: the office admin edited a free board» (his READ is still
--      hidden by the restrictive case_visible layer; the write is not).
--
-- People (firm F, owner O):
--   L  lawyer, filer + lead of case-a and the restricted case-r
--   M  lawyer, plain member of F (off case-r's team)
--   T  trainee, on case-a's team
--   A  office_admin, assigned nothing
--   N  finance_manager, assigned nothing
--   X  lawyer of another firm G (a stranger to every case here)
--   S  solo lawyer, assignee of case-s; C the client who filed case-s
-- Every assertion RAISES on failure. Runs as role `authenticated`.
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

-- ── B1 the lead creates the boards of his cases and reads them ──────────────
select pg_temp.as_user('00000000-0000-0000-0000-000000013a01');
do $$
begin
  insert into public.case_free_boards (case_request_id, cards, links, created_by, updated_by) values
    ('case-a', '[{"id":"c1","title":"وقائع","text":"","color":"amber","x":10,"y":20}]', '[]',
     '00000000-0000-0000-0000-000000013a01', '00000000-0000-0000-0000-000000013a01'),
    ('case-r', '[]', '[]', '00000000-0000-0000-0000-000000013a01', '00000000-0000-0000-0000-000000013a01');
  if pg_temp.boards() is distinct from 'case-a,case-r' then
    raise exception 'B1 FAIL: the lead reads [%] — expected [case-a,case-r]', pg_temp.boards();
  end if;
  raise notice 'B1 PASS: the lead creates and reads his cases'' boards';
end $$;

-- ── B2 a colleague on the case reads and edits; cannot delete, move or re-own
select pg_temp.as_user('00000000-0000-0000-0000-000000013a02');
do $$
declare n int;
begin
  if pg_temp.boards() is distinct from 'case-a' then
    raise exception 'B2 FAIL: the colleague reads [%] — expected [case-a] (case-r is restricted)', pg_temp.boards();
  end if;
  update public.case_free_boards set cards = '[]', updated_by = '00000000-0000-0000-0000-000000013a02'
   where case_request_id = 'case-a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'B2 FAIL: the colleague cannot edit the board'; end if;
  if not pg_temp.refused($s$update public.case_free_boards set updated_by = '00000000-0000-0000-0000-000000013a01' where case_request_id = 'case-a'$s$) then
    raise exception 'B2 FAIL: an edit was signed with another user''s id';
  end if;
  if not pg_temp.refused($s$update public.case_free_boards set created_by = '00000000-0000-0000-0000-000000013a02' where case_request_id = 'case-a'$s$) then
    raise exception 'B2 FAIL: created_by can be rewritten';
  end if;
  if not pg_temp.refused($s$update public.case_free_boards set case_request_id = 'case-b' where case_request_id = 'case-a'$s$) then
    raise exception 'B2 FAIL: a board can be moved to another case';
  end if;
  if not pg_temp.refused($s$delete from public.case_free_boards where case_request_id = 'case-a'$s$) then
    raise exception 'B2 FAIL: a board can be deleted from a session';
  end if;
  if not pg_temp.refused($s$insert into public.case_free_boards (case_request_id, created_by, updated_by)
      values ('case-b', '00000000-0000-0000-0000-000000013a01', '00000000-0000-0000-0000-000000013a02')$s$) then
    raise exception 'B2 FAIL: a board was created under another user''s id';
  end if;
  insert into public.case_free_boards (case_request_id, created_by, updated_by)
    values ('case-b', '00000000-0000-0000-0000-000000013a02', '00000000-0000-0000-0000-000000013a02');
  raise notice 'B2 PASS: colleague reads + edits as himself; no delete, no move, no forged id';
end $$;

-- ── B3 the restricted case: the colleague off its team neither reads nor edits
do $$
declare n int;
begin
  update public.case_free_boards set cards = '[]', updated_by = '00000000-0000-0000-0000-000000013a02'
   where case_request_id = 'case-r';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B3 FAIL: a colleague off the team edited a restricted case''s board'; end if;
  raise notice 'B3 PASS: a restricted case''s board follows its team';
end $$;

-- ── B4 the firm owner and the trainee on the team read case-a's board ───────
select pg_temp.as_user('00000000-0000-0000-0000-000000013a00');
do $$
begin
  if position('case-a' in pg_temp.boards()) = 0 then
    raise exception 'B4 FAIL: the firm owner reads [%] — expected case-a among them', pg_temp.boards();
  end if;
  raise notice 'B4a PASS: the firm owner reads [%]', pg_temp.boards();
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000013a03');
do $$
begin
  if pg_temp.boards() is distinct from 'case-a' then
    raise exception 'B4 FAIL: the trainee on case-a''s team reads [%] — expected [case-a]', pg_temp.boards();
  end if;
  raise notice 'B4b PASS: the trainee reads only the case he is on';
end $$;

-- ── F2 firm members who may not open a case file: no board either ──────────
select pg_temp.as_user('00000000-0000-0000-0000-000000013a04');
do $$
declare n int;
begin
  if pg_temp.boards() <> '' then
    raise exception 'F2 FAIL: the office admin (no case files by default) reads a free board: [%]', pg_temp.boards();
  end if;
  update public.case_free_boards set cards = '[]', updated_by = '00000000-0000-0000-0000-000000013a04';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F2 FAIL: the office admin edited a free board'; end if;
  raise notice 'F2a PASS: the office admin reads and edits nothing';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000013a05');
do $$
begin
  if pg_temp.boards() <> '' then
    raise exception 'F2 FAIL: the finance manager reads a free board: [%]', pg_temp.boards();
  end if;
  raise notice 'F2b PASS: the finance manager reads nothing';
end $$;

-- ── B5 a stranger (another firm's lawyer) reads, edits and creates nothing ──
select pg_temp.as_user('00000000-0000-0000-0000-000000013a07');
do $$
declare n int;
begin
  if pg_temp.boards() <> '' then
    raise exception 'B5 FAIL: a stranger reads [%]', pg_temp.boards();
  end if;
  update public.case_free_boards set cards = '[]', updated_by = '00000000-0000-0000-0000-000000013a07';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B5 FAIL: a stranger edited a board'; end if;
  if not pg_temp.refused($s$insert into public.case_free_boards (case_request_id, created_by, updated_by)
      values ('case-s', '00000000-0000-0000-0000-000000013a07', '00000000-0000-0000-0000-000000013a07')$s$) then
    raise exception 'B5 FAIL: a stranger created the board of a case he cannot open';
  end if;
  raise notice 'B5 PASS: a stranger reads, edits and creates nothing';
end $$;

-- ── B6 solo case: the assigned lawyer creates the board; the filing client,
--      who CAN open his request, never reads or writes it ────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-000000013a08');
do $$
begin
  insert into public.case_free_boards (case_request_id, created_by, updated_by)
    values ('case-s', '00000000-0000-0000-0000-000000013a08', '00000000-0000-0000-0000-000000013a08');
  if pg_temp.boards() is distinct from 'case-s' then
    raise exception 'B6 FAIL: the assigned solo lawyer reads [%] — expected [case-s]', pg_temp.boards();
  end if;
  raise notice 'B6a PASS: the assigned solo lawyer creates and reads his board';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-000000013a09');
do $$
declare n int;
begin
  if not exists (select 1 from public.service_requests where id = 'case-s') then
    raise exception 'B6 setup FAIL: the client cannot read his own request (the premise of this check)';
  end if;
  if pg_temp.boards() <> '' then
    raise exception 'F1 FAIL: the client who filed the case reads its free board: [%]', pg_temp.boards();
  end if;
  update public.case_free_boards set cards = '[]', updated_by = '00000000-0000-0000-0000-000000013a09';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F1 FAIL: the client edited the lawyer''s board'; end if;
  raise notice 'B6b PASS: the client opens his request but not the lawyer''s board';
end $$;

-- ── B7 a colleague who leaves the firm loses the board ─────────────────────
reset role;
update public.firm_members set status = 'removed'
 where user_id = '00000000-0000-0000-0000-000000013a02';
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-000000013a02');
do $$
begin
  if pg_temp.boards() <> '' then
    raise exception 'B7 FAIL: a former colleague reads [%]', pg_temp.boards();
  end if;
  raise notice 'B7 PASS: a former colleague reads nothing';
end $$;

-- ── B8 the size caps hold in the database too ──────────────────────────────
select pg_temp.as_user('00000000-0000-0000-0000-000000013a01');
do $$
begin
  begin
    update public.case_free_boards
       set cards = (select jsonb_agg(jsonb_build_object('id', 'c' || g)) from generate_series(1, 301) g),
           updated_by = '00000000-0000-0000-0000-000000013a01'
     where case_request_id = 'case-a';
    raise exception 'B8 FAIL: 301 cards were accepted';
  exception when check_violation then null;
  end;
  begin
    update public.case_free_boards set links = '{}', updated_by = '00000000-0000-0000-0000-000000013a01'
     where case_request_id = 'case-a';
    raise exception 'B8 FAIL: links that are not an array were accepted';
  exception when check_violation then null;
  end;
  raise notice 'B8 PASS: 300-card cap and array shape enforced';
end $$;

-- ── B9 no guest grant; no session delete; the rule function is invoker ─────
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.case_free_boards', 'select')
     or has_table_privilege('anon', 'public.case_free_boards', 'insert') then
    raise exception 'B9 FAIL: anon holds a grant on case_free_boards';
  end if;
  if has_table_privilege('authenticated', 'public.case_free_boards', 'delete') then
    raise exception 'B9 FAIL: authenticated can delete boards';
  end if;
  if has_function_privilege('anon', 'public.case_board_open(text)', 'execute') then
    raise exception 'B9 FAIL: anon can execute case_board_open';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.case_board_open(text)'::regprocedure) then
    raise exception 'B9 FAIL: case_board_open must be SECURITY INVOKER';
  end if;
  raise notice 'B9 PASS: no guest grant, no delete, invoker rule';
end $$;
