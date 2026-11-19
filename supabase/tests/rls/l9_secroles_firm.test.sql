-- l9_secroles_firm.test.sql — proves section A of 20261129_10 (owner file 15
--   row 2): a firm TRAINEE or LEGAL SECRETARY reads only the cases and client
--   cards assigned to him; every other firm role keeps what it had.
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
--     $M/20261129_10_firm_company_roles_seats.sql \
--     $T/l9_secroles_firm.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261129_10
--   lines → «F1 FAIL: the trainee reads cases [case-a,case-b,case-c] —
--   expected [case-a]» (the state before this file: every active member reads
--   every firm case).
--
-- People (firm F, owner O — the phase2 trigger makes O its managing_partner):
--   L  lawyer, lead + filer of case-a and case-b
--   T  trainee, on case-a's team
--   S  legal_secretary, assignee of a task on case-b (nothing else)
--   M  lawyer, plain member, lead of case-c
--   P  managing_partner (not the owner)
--   C  individual, the client who filed case-c (not a firm member)
--   X  lawyer with no firm
-- Cards (all firm F): card-a ← case-a, card-b ← case-b, card-c (C's platform
--   account, case-c filed by C), card-u (owner L, linked to nothing),
--   card-t (owner T).
-- Every assertion RAISES on failure. Runs as role `authenticated`.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-0000000009a0'),
  ('00000000-0000-0000-0000-0000000009a1'),
  ('00000000-0000-0000-0000-0000000009a2'),
  ('00000000-0000-0000-0000-0000000009a3'),
  ('00000000-0000-0000-0000-0000000009a4'),
  ('00000000-0000-0000-0000-0000000009a5'),
  ('00000000-0000-0000-0000-0000000009a6'),
  ('00000000-0000-0000-0000-0000000009a7');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-0000000009a0', 'firm',       'O', 'o@l9.test'),
  ('00000000-0000-0000-0000-0000000009a1', 'lawyer',     'L', 'l@l9.test'),
  ('00000000-0000-0000-0000-0000000009a2', 'individual', 'T', 't@l9.test'),
  ('00000000-0000-0000-0000-0000000009a3', 'individual', 'S', 's@l9.test'),
  ('00000000-0000-0000-0000-0000000009a4', 'lawyer',     'M', 'm@l9.test'),
  ('00000000-0000-0000-0000-0000000009a5', 'lawyer',     'P', 'p@l9.test'),
  ('00000000-0000-0000-0000-0000000009a6', 'individual', 'C', 'c@l9.test'),
  ('00000000-0000-0000-0000-0000000009a7', 'lawyer',     'X', 'x@l9.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a0', 'مكتب الأدوار');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a1', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a2', 'trainee',          'active', now()),
  ('ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a3', 'legal_secretary',  'active', now()),
  ('ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a4', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a5', 'managing_partner', 'active', now());

insert into public.lawyer_clients (id, owner_user_id, firm_id, client_user_id, name) values
  ('cccccccc-0000-0000-0000-0000000009ca', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', null, 'موكل أ'),
  ('cccccccc-0000-0000-0000-0000000009cb', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', null, 'موكل ب'),
  ('cccccccc-0000-0000-0000-0000000009cc', '00000000-0000-0000-0000-0000000009a4', 'ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a6', 'موكل ج'),
  ('cccccccc-0000-0000-0000-0000000009cd', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', null, 'موكل بلا قضية'),
  ('cccccccc-0000-0000-0000-0000000009ce', '00000000-0000-0000-0000-0000000009a2', 'ffffffff-0000-0000-0000-0000000009f1', null, 'موكل المتدرب');

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id, lawyer_client_id) values
  ('case-a', '00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a1', 'قضية أ', 'ffffffff-0000-0000-0000-0000000009f1', 'cccccccc-0000-0000-0000-0000000009ca'),
  ('case-b', '00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a1', 'قضية ب', 'ffffffff-0000-0000-0000-0000000009f1', 'cccccccc-0000-0000-0000-0000000009cb'),
  ('case-c', '00000000-0000-0000-0000-0000000009a6', '00000000-0000-0000-0000-0000000009a4', 'قضية ج', 'ffffffff-0000-0000-0000-0000000009f1', null);
insert into public.case_team_members (request_id, user_id, firm_id, added_by) values
  ('case-a', '00000000-0000-0000-0000-0000000009a2', 'ffffffff-0000-0000-0000-0000000009f1', '00000000-0000-0000-0000-0000000009a1');
insert into public.hearings (owner_user_id, firm_id, case_request_id, title, hearing_date)
select '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', c, 'جلسة ' || c, current_date + 3
  from unnest(array['case-a', 'case-b', 'case-c']) c;
insert into public.tasks (owner_user_id, assignee_user_id, firm_id, case_request_id, title) values
  ('00000000-0000-0000-0000-0000000009a1', '00000000-0000-0000-0000-0000000009a3', 'ffffffff-0000-0000-0000-0000000009f1', 'case-b', 'تجهيز ملف ب');
insert into public.lawyer_client_notes (client_id, author_user_id, firm_id, body, visibility)
select id, '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', 'ملاحظة ' || name, 'firm'
  from public.lawyer_clients where owner_user_id = '00000000-0000-0000-0000-0000000009a1';
insert into public.contracts (id, owner_user_id, firm_id, request_id, lawyer_client_id, title) values
  ('ct-a', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', 'case-a', null, 'عقد أ'),
  ('ct-u', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', null, null, 'عقد بلا قضية'),
  ('ct-k', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1', null, 'cccccccc-0000-0000-0000-0000000009cb', 'عقد موكل ب');
insert into public.contract_versions (contract_id, version_no, file_name, storage_path)
select id, 1, id || '.pdf', 'contracts/' || id || '.pdf' from public.contracts where id like 'ct-%';
insert into public.consultations (id, request_id, lawyer_user_id, firm_id) values
  ('cs-b', 'case-b', '00000000-0000-0000-0000-0000000009a1', 'ffffffff-0000-0000-0000-0000000009f1'),
  ('cs-c', 'case-c', '00000000-0000-0000-0000-0000000009a4', 'ffffffff-0000-0000-0000-0000000009f1');

-- What a session reads, as sorted id lists (cards as their last two hex digits).
create or replace function pg_temp.view() returns text language sql as $$
  select concat_ws(' | ',
    'cases ['     || coalesce((select string_agg(id, ',' order by id) from public.service_requests where id like 'case-%'), '') || ']',
    'hearings ['  || coalesce((select string_agg(case_request_id, ',' order by case_request_id) from public.hearings where case_request_id like 'case-%'), '') || ']',
    'cards ['     || coalesce((select string_agg(right(id::text, 2), ',' order by id) from public.lawyer_clients where firm_id = 'ffffffff-0000-0000-0000-0000000009f1'), '') || ']',
    'notes ['     || coalesce((select string_agg(right(client_id::text, 2), ',' order by client_id) from public.lawyer_client_notes), '') || ']',
    'contracts [' || coalesce((select string_agg(id, ',' order by id) from public.contracts where id like 'ct-%'), '') || ']',
    'versions ['  || coalesce((select string_agg(contract_id, ',' order by contract_id) from public.contract_versions), '') || ']',
    'consults ['  || coalesce((select string_agg(id, ',' order by id) from public.consultations where id like 'cs-%'), '') || ']');
$$;
grant execute on function pg_temp.view() to authenticated;

create or replace function pg_temp.expect(p_who text, p_uid text, p_label text, p_expected text) returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, false);
  got := pg_temp.view();
  if got is distinct from p_expected then
    raise exception '% FAIL: % reads % — expected %', p_label, p_who, got, p_expected;
  end if;
  raise notice '% PASS: % reads %', p_label, p_who, got;
end $$;
grant execute on function pg_temp.expect(text, text, text, text) to authenticated;

set role authenticated;

-- ── F1 the trainee: case-a (his team), its card, its contract; nothing else ──
select pg_temp.expect('the trainee', '00000000-0000-0000-0000-0000000009a2', 'F1',
  'cases [case-a] | hearings [case-a] | cards [ca,ce] | notes [ca] | contracts [ct-a] | versions [ct-a] | consults []');

-- a quick look at the shape the owner asked for: «a trainee session gets 0 rows» of a case not his
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000009a2', false);
  if exists (select 1 from public.service_requests where id = 'case-c') then
    raise exception 'F1b FAIL: the trainee reads case-c by id';
  end if;
  if public.case_visible('case-b') then raise exception 'F1b FAIL: case_visible(case-b) is true for the trainee'; end if;
  if (select count(*) from public.tasks where case_request_id = 'case-b') <> 0 then
    raise exception 'F1b FAIL: the trainee reads a task of case-b';
  end if;
  raise notice 'F1b PASS: by id, case-c is 0 rows for the trainee; case-b and its task are hidden';
end $$;

-- ── F2 the secretary: case-b through the task assigned to him, its card, the
--      contract on its card, its consultation ─────────────────────────────────
select pg_temp.expect('the secretary', '00000000-0000-0000-0000-0000000009a3', 'F2',
  'cases [case-b] | hearings [case-b] | cards [cb] | notes [cb] | contracts [ct-k] | versions [ct-k] | consults [cs-b]');

-- ── F3 a plain lawyer member is NOT narrowed (control: the rule is by role) ──
select pg_temp.expect('a plain lawyer', '00000000-0000-0000-0000-0000000009a4', 'F3',
  'cases [case-a,case-b,case-c] | hearings [case-a,case-b,case-c] | cards [ca,cb,cc,cd,ce] | notes [ca,cb,cd] | contracts [ct-a,ct-k,ct-u] | versions [ct-a,ct-k,ct-u] | consults [cs-b,cs-c]');

-- ── F4 the managing partner and the firm owner see the whole firm ───────────
select pg_temp.expect('the managing partner', '00000000-0000-0000-0000-0000000009a5', 'F4',
  'cases [case-a,case-b,case-c] | hearings [case-a,case-b,case-c] | cards [ca,cb,cc,cd,ce] | notes [ca,cb,cd] | contracts [ct-a,ct-k,ct-u] | versions [ct-a,ct-k,ct-u] | consults [cs-b,cs-c]');
select pg_temp.expect('the firm owner', '00000000-0000-0000-0000-0000000009a0', 'F4b',
  'cases [case-a,case-b,case-c] | hearings [case-a,case-b,case-c] | cards [ca,cb,cc,cd,ce] | notes [ca,cb,cd] | contracts [ct-a,ct-k,ct-u] | versions [ct-a,ct-k,ct-u] | consults [cs-b,cs-c]');

-- ── F5 an outsider reads nothing; the client keeps his own case ─────────────
select pg_temp.expect('an outsider', '00000000-0000-0000-0000-0000000009a7', 'F5',
  'cases [] | hearings [] | cards [] | notes [] | contracts [] | versions [] | consults []');
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000009a6', false);
  if not exists (select 1 from public.service_requests where id = 'case-c') then
    raise exception 'F5b FAIL: the client lost the case he filed';
  end if;
  raise notice 'F5b PASS: the client still reads the case he filed';
end $$;

-- ── F6 a scoped member cannot update or note what he cannot see ─────────────
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000009a2', false);
  update public.lawyer_clients set city = 'الرياض' where id = 'cccccccc-0000-0000-0000-0000000009cd';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F6 FAIL: the trainee updated a card he cannot see'; end if;
  update public.hearings set title = 'x' where case_request_id = 'case-c';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F6 FAIL: the trainee updated a hearing of case-c'; end if;
  begin
    insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
    values ('case-c', '00000000-0000-0000-0000-0000000009a2', 'ffffffff-0000-0000-0000-0000000009f1', 'x', 'firm');
    raise exception 'F6 FAIL: the trainee wrote a note on case-c';
  exception when insufficient_privilege then null;
  end;
  raise notice 'F6 PASS: no update of a hidden card / hearing, no note on a hidden case (42501)';
end $$;

-- ── F7 a restricted case: the hearing/task assignee arm does not open it ────
select set_config('test.uid', '00000000-0000-0000-0000-0000000009a1', false);
select public.set_case_restricted('case-b', true);
select pg_temp.expect('the secretary (case-b restricted)', '00000000-0000-0000-0000-0000000009a3', 'F7',
  'cases [] | hearings [] | cards [] | notes [] | contracts [] | versions [] | consults []');
select set_config('test.uid', '00000000-0000-0000-0000-0000000009a1', false);
select public.set_case_restricted('case-b', false);

-- ── F8 the role is what counts: the trainee promoted to lawyer sees the firm;
--      a legal secretary removed from the firm sees nothing ───────────────────
reset role;
update public.firm_members set role = 'lawyer'
 where firm_id = 'ffffffff-0000-0000-0000-0000000009f1' and user_id = '00000000-0000-0000-0000-0000000009a2';
set role authenticated;
select pg_temp.expect('the former trainee, now a lawyer', '00000000-0000-0000-0000-0000000009a2', 'F8',
  'cases [case-a,case-b,case-c] | hearings [case-a,case-b,case-c] | cards [ca,cb,cc,cd,ce] | notes [ca,cb,cd] | contracts [ct-a,ct-k,ct-u] | versions [ct-a,ct-k,ct-u] | consults [cs-b,cs-c]');
reset role;
update public.firm_members set role = 'trainee'
 where firm_id = 'ffffffff-0000-0000-0000-0000000009f1' and user_id = '00000000-0000-0000-0000-0000000009a2';
update public.firm_members set status = 'removed'
 where firm_id = 'ffffffff-0000-0000-0000-0000000009f1' and user_id = '00000000-0000-0000-0000-0000000009a3';
set role authenticated;
select pg_temp.expect('the removed secretary', '00000000-0000-0000-0000-0000000009a3', 'F8b',
  'cases [] | hearings [] | cards [] | notes [] | contracts [] | versions [] | consults []');

-- ── F9 the trainee taken off case-a's team loses it ─────────────────────────
reset role;
delete from public.case_team_members where request_id = 'case-a' and user_id = '00000000-0000-0000-0000-0000000009a2';
set role authenticated;
select pg_temp.expect('the trainee off the team', '00000000-0000-0000-0000-0000000009a2', 'F9',
  'cases [] | hearings [] | cards [ce] | notes [] | contracts [] | versions [] | consults []');

-- ── F11 the assignee of a hearing on a case is assigned to that case ──────
reset role;
update public.hearings set assignee_user_id = '00000000-0000-0000-0000-0000000009a2' where case_request_id = 'case-c';
set role authenticated;
select pg_temp.expect('the trainee, assignee of case-c''s hearing', '00000000-0000-0000-0000-0000000009a2', 'F11',
  'cases [case-c] | hearings [case-c] | cards [cc,ce] | notes [] | contracts [] | versions [] | consults [cs-c]');

-- ── F10 privileges: no anon EXECUTE; a guest read is not broken by the policies ─
reset role;
do $$
declare f text;
begin
  foreach f in array array['public.firm_case_scoped_member(uuid)', 'public.client_card_visible(uuid)',
                           'public.firm_scoped_row_visible(uuid, uuid, text, uuid)', 'public.contract_scope_visible(text)',
                           'public.case_visible(text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'F10 FAIL: anon can execute %', f; end if;
    if not has_function_privilege('authenticated', f, 'EXECUTE') then raise exception 'F10 FAIL: authenticated cannot execute %', f; end if;
  end loop;
  raise notice 'F10 PASS: the helpers are authenticated-only';
end $$;
set role anon;
select set_config('test.uid', '', false);
do $$
declare n int;
begin
  select count(*) into n from public.service_requests;
  select count(*) into n from public.lawyer_clients;
  raise notice 'F10b PASS: guest reads run (no 42501 from the role-scope policies)';
exception when insufficient_privilege then
  if sqlerrm ilike '%scoped%' or sqlerrm ilike '%visible%' then raise exception 'F10b FAIL: a guest read hits a helper: %', sqlerrm; end if;
  raise notice 'F10b PASS: guest refused by table grants only (%), not by the helpers', sqlerrm;
end $$;
reset role;

select 'l9_secroles_firm: ALL PASS' as result;
