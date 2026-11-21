-- l12_firm_scope.test.sql — proves parts A (Q112 + file 05 #28), B (Q113),
--   C (Q114) and D (N16) of 20261202_80 (batch l12, builder firm).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root, in Git Bash:
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
--     $M/20261202_80_l12_firm_roles_log_badge_storage.sql \
--     $T/l12_firm_scope.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261202_80
--   lines → «S1 FAIL: the office admin reads cases [case-a,case-b,case-c] …
--   expected cases []» (before this file every non-legal role but the trainee
--   and the secretary read every firm case).
--
-- People (firm F, owner O — the phase2 trigger makes O its managing_partner):
--   L  lawyer, filer + lead of case-a, case-b and the restricted case-r
--   T  trainee, on case-a's team
--   A  office_admin, assigned nothing
--   H  hr_manager, on case-b's team
--   K  compliance_manager, assigned nothing
--   N  finance_manager, assigned nothing
--   M  lawyer, plain member, lead of case-c
--   P  managing_partner (not the owner)
-- Cards: card-a ← case-a, card-b ← case-b, card-u (owner L, linked to nothing).
-- Every assertion RAISES on failure. Runs as role `authenticated`.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-000000012a00'),
  ('00000000-0000-0000-0000-000000012a01'),
  ('00000000-0000-0000-0000-000000012a02'),
  ('00000000-0000-0000-0000-000000012a03'),
  ('00000000-0000-0000-0000-000000012a04'),
  ('00000000-0000-0000-0000-000000012a05'),
  ('00000000-0000-0000-0000-000000012a06'),
  ('00000000-0000-0000-0000-000000012a07'),
  ('00000000-0000-0000-0000-000000012a08');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-000000012a00', 'firm',       'المالك',        'o@l12.test'),
  ('00000000-0000-0000-0000-000000012a01', 'lawyer',     'L',             'l@l12.test'),
  ('00000000-0000-0000-0000-000000012a02', 'individual', 'T',             't@l12.test'),
  ('00000000-0000-0000-0000-000000012a03', 'individual', 'A',             'a@l12.test'),
  ('00000000-0000-0000-0000-000000012a04', 'individual', 'H',             'h@l12.test'),
  ('00000000-0000-0000-0000-000000012a05', 'individual', 'K',             'k@l12.test'),
  ('00000000-0000-0000-0000-000000012a06', 'individual', 'N',             'n@l12.test'),
  ('00000000-0000-0000-0000-000000012a07', 'lawyer',     'M',             'm@l12.test'),
  ('00000000-0000-0000-0000-000000012a08', 'lawyer',     'الشريك المدير', 'p@l12.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a00', 'مكتب l12');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a01', 'lawyer',             'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a02', 'trainee',            'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a03', 'office_admin',       'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a04', 'hr_manager',         'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a05', 'compliance_manager', 'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a06', 'finance_manager',    'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a07', 'lawyer',             'active', now()),
  ('ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a08', 'managing_partner',   'active', now());

insert into public.lawyer_clients (id, owner_user_id, firm_id, client_user_id, name) values
  ('cccccccc-0000-0000-0000-000000012ca0', '00000000-0000-0000-0000-000000012a01', 'ffffffff-0000-0000-0000-000000012f01', null, 'موكل أ'),
  ('cccccccc-0000-0000-0000-000000012cb0', '00000000-0000-0000-0000-000000012a01', 'ffffffff-0000-0000-0000-000000012f01', null, 'موكل ب'),
  ('cccccccc-0000-0000-0000-000000012cd0', '00000000-0000-0000-0000-000000012a01', 'ffffffff-0000-0000-0000-000000012f01', null, 'موكل بلا قضية');

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id, lawyer_client_id) values
  ('case-a', '00000000-0000-0000-0000-000000012a01', '00000000-0000-0000-0000-000000012a01', 'قضية أ', 'ffffffff-0000-0000-0000-000000012f01', 'cccccccc-0000-0000-0000-000000012ca0'),
  ('case-b', '00000000-0000-0000-0000-000000012a01', '00000000-0000-0000-0000-000000012a01', 'قضية ب', 'ffffffff-0000-0000-0000-000000012f01', 'cccccccc-0000-0000-0000-000000012cb0'),
  ('case-c', '00000000-0000-0000-0000-000000012a07', '00000000-0000-0000-0000-000000012a07', 'قضية ج', 'ffffffff-0000-0000-0000-000000012f01', null);
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id, is_restricted) values
  ('case-r', '00000000-0000-0000-0000-000000012a01', '00000000-0000-0000-0000-000000012a01', 'قضية مقيّدة', 'ffffffff-0000-0000-0000-000000012f01', true);
insert into public.case_team_members (request_id, user_id, firm_id, added_by) values
  ('case-a', '00000000-0000-0000-0000-000000012a02', 'ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a01'),
  ('case-b', '00000000-0000-0000-0000-000000012a04', 'ffffffff-0000-0000-0000-000000012f01', '00000000-0000-0000-0000-000000012a01');

-- What a session reads: cases and firm cards, as sorted id lists.
create or replace function pg_temp.view() returns text language sql as $$
  select concat_ws(' | ',
    'cases [' || coalesce((select string_agg(id, ',' order by id) from public.service_requests where id like 'case-%'), '') || ']',
    'cards [' || coalesce((select string_agg(right(id::text, 3), ',' order by id) from public.lawyer_clients where firm_id = 'ffffffff-0000-0000-0000-000000012f01'), '') || ']');
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

create or replace function pg_temp.set_scope(p_value jsonb) returns void language sql security definer as $$
  update public.platform_settings set value = p_value where key = 'firm_case_scope';
$$;
grant execute on function pg_temp.set_scope(jsonb) to authenticated;

set role authenticated;

-- ── S1 the default: office admin, HR, compliance see their assigned cases only;
--      the finance manager sees no case file but every firm card ─────────────
select pg_temp.expect('the office admin', '00000000-0000-0000-0000-000000012a03', 'S1',
  'cases [] | cards []');
select pg_temp.expect('the HR manager', '00000000-0000-0000-0000-000000012a04', 'S1b',
  'cases [case-b] | cards [cb0]');
select pg_temp.expect('the compliance manager', '00000000-0000-0000-0000-000000012a05', 'S1c',
  'cases [] | cards []');
select pg_temp.expect('the finance manager', '00000000-0000-0000-0000-000000012a06', 'S1d',
  'cases [] | cards [ca0,cb0,cd0]');
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a06', false);
  -- his finance rows (time / expenses / trust, through case_visible) are not narrowed
  if not public.case_visible('case-a') then
    raise exception 'S1e FAIL: case_visible(case-a) is false for the finance manager — his finance rows would vanish';
  end if;
  raise notice 'S1e PASS: the finance manager keeps case_visible (finance rows) while the case files are hidden';
end $$;
-- controls: the trainee as before, the plain lawyer, the partner, the owner unchanged
select pg_temp.expect('the trainee', '00000000-0000-0000-0000-000000012a02', 'S1f',
  'cases [case-a] | cards [ca0]');
select pg_temp.expect('a plain lawyer', '00000000-0000-0000-0000-000000012a07', 'S1g',
  'cases [case-a,case-b,case-c] | cards [ca0,cb0,cd0]');
select pg_temp.expect('the managing partner', '00000000-0000-0000-0000-000000012a08', 'S1h',
  'cases [case-a,case-b,case-c,case-r] | cards [ca0,cb0,cd0]');
select pg_temp.expect('the firm owner', '00000000-0000-0000-0000-000000012a00', 'S1i',
  'cases [case-a,case-b,case-c,case-r] | cards [ca0,cb0,cd0]');

-- ── S2 the admin switches the narrowing off ([] and false) ──────────────────
select pg_temp.set_scope('{"assigned_only_roles": [], "finance_manager_no_cases": false}');
select pg_temp.expect('the office admin (narrowing off)', '00000000-0000-0000-0000-000000012a03', 'S2',
  'cases [case-a,case-b,case-c] | cards [ca0,cb0,cd0]');
select pg_temp.expect('the finance manager (narrowing off)', '00000000-0000-0000-0000-000000012a06', 'S2b',
  'cases [case-a,case-b,case-c] | cards [ca0,cb0,cd0]');
select pg_temp.expect('the trainee (always narrowed)', '00000000-0000-0000-0000-000000012a02', 'S2c',
  'cases [case-a] | cards [ca0]');

-- ── S3 only compliance narrowed; a legal role in the list is ignored ────────
select pg_temp.set_scope('{"assigned_only_roles": ["compliance_manager", "lawyer", "managing_partner"], "finance_manager_no_cases": true}');
select pg_temp.expect('the office admin (not listed)', '00000000-0000-0000-0000-000000012a03', 'S3',
  'cases [case-a,case-b,case-c] | cards [ca0,cb0,cd0]');
select pg_temp.expect('the compliance manager (listed)', '00000000-0000-0000-0000-000000012a05', 'S3b',
  'cases [] | cards []');
select pg_temp.expect('a plain lawyer («lawyer» in the list is ignored)', '00000000-0000-0000-0000-000000012a07', 'S3c',
  'cases [case-a,case-b,case-c] | cards [ca0,cb0,cd0]');
select pg_temp.expect('the managing partner (ignored too)', '00000000-0000-0000-0000-000000012a08', 'S3d',
  'cases [case-a,case-b,case-c,case-r] | cards [ca0,cb0,cd0]');

-- ── S4 a malformed setting reads as the default ─────────────────────────────
select pg_temp.set_scope('{"assigned_only_roles": "all", "finance_manager_no_cases": "yes"}');
select pg_temp.expect('the office admin (malformed → default)', '00000000-0000-0000-0000-000000012a03', 'S4',
  'cases [] | cards []');
select pg_temp.expect('the finance manager (malformed → default)', '00000000-0000-0000-0000-000000012a06', 'S4b',
  'cases [] | cards [ca0,cb0,cd0]');
select pg_temp.set_scope('{"assigned_only_roles": ["office_admin", "hr_manager", "compliance_manager"], "finance_manager_no_cases": true}');

-- ── S5 the setting functions are not open to a session ──────────────────────
do $$
begin
  begin
    perform public.firm_case_scope_roles();
    raise exception 'S5 FAIL: a session called firm_case_scope_roles()';
  exception when insufficient_privilege then null;
  end;
  raise notice 'S5 PASS: firm_case_scope_roles() is not callable by a session (42501)';
end $$;

-- ── D. N16 the restricted case's open log ───────────────────────────────────
do $$
declare r text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a08', false);
  r := public.log_restricted_case_open('case-r');
  if r <> 'logged' then raise exception 'D1 FAIL: the managing partner''s first open → %', r; end if;
  r := public.log_restricted_case_open('case-r');
  if r <> 'recent' then raise exception 'D1 FAIL: the second open within 10 minutes → %', r; end if;
  r := public.log_restricted_case_open('case-a');
  if r <> 'not_restricted' then raise exception 'D1 FAIL: an unrestricted case → %', r; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a00', false);
  r := public.log_restricted_case_open('case-r');
  if r <> 'logged' then raise exception 'D1 FAIL: the firm owner''s open → %', r; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a01', false);
  r := public.log_restricted_case_open('case-r');
  if r <> 'own' then raise exception 'D1 FAIL: the lead''s own open → %', r; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a07', false);
  r := public.log_restricted_case_open('case-r');
  if r <> 'not_privileged' then raise exception 'D1 FAIL: a plain member → %', r; end if;
  raise notice 'D1 PASS: partner and owner logged once each; recent, own, unrestricted and unprivileged opens not logged';
end $$;

do $$
declare got text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a01', false);
  select string_agg(viewer_kind || ':' || coalesce(viewer_name, '-'), ',' order by viewer_kind) into got
    from public.restricted_case_open_log_read('case-r');
  if got is distinct from 'firm_owner:المالك,managing_partner:الشريك المدير' then
    raise exception 'D2 FAIL: the lead reads the log as % — expected the owner and the partner', got;
  end if;
  raise notice 'D2 PASS: the case''s lead reads the log: %', got;

  perform set_config('test.uid', '00000000-0000-0000-0000-000000012a08', false);
  begin
    perform 1 from public.restricted_case_open_log_read('case-r');
    raise exception 'D3 FAIL: the managing partner read the log of a case he does not lead';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.restricted_case_open_log;
    raise exception 'D3 FAIL: a session read the log table directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.restricted_case_open_log (request_id, viewer_user_id, viewer_kind)
    values ('case-r', '00000000-0000-0000-0000-000000012a08', 'managing_partner');
    raise exception 'D3 FAIL: a session wrote the log table directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'D3 PASS: only the filer / lead reads the log; the table is closed to sessions (42501)';
end $$;

reset role;
do $$
begin
  begin
    update public.restricted_case_open_log set viewer_kind = 'platform_admin';
    raise exception 'D4 FAIL: the log was updated';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.restricted_case_open_log;
    raise exception 'D4 FAIL: the log was deleted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'D4 PASS: the log is append-only even for the owner role';
end $$;

-- ── B / C (as the superuser: settings and the seat function) ────────────────
do $$
begin
  if public.business_plan_seat_cap('biz-sm-basic') <> 5 or public.business_plan_seat_cap('dept-sm-basic') <> 5
     or public.business_plan_seat_cap('biz-md-pro') <> 15 or public.business_plan_seat_cap('biz-lg-full') is not null then
    raise exception 'B1 FAIL: business_plan_seat_cap biz-sm-basic % dept-sm-basic % biz-md-pro % biz-lg-full %',
      public.business_plan_seat_cap('biz-sm-basic'), public.business_plan_seat_cap('dept-sm-basic'),
      public.business_plan_seat_cap('biz-md-pro'), public.business_plan_seat_cap('biz-lg-full');
  end if;
  raise notice 'B1 PASS: the smallest company tiers seat 5; the others are unchanged';
  if (select value from public.platform_settings where key = 'firm_extra_seat_price_sar') <> '{"sar": 250}'::jsonb then
    raise exception 'C1 FAIL: firm_extra_seat_price_sar = %', (select value from public.platform_settings where key = 'firm_extra_seat_price_sar');
  end if;
  raise notice 'C1 PASS: the unset extra-seat price (20261128_10 {"sar": null}) became 250';
  if (select value from public.platform_settings where key = 'firm_case_scope')
     <> '{"assigned_only_roles": ["office_admin", "hr_manager", "compliance_manager"], "finance_manager_no_cases": true}'::jsonb then
    raise exception 'A0 FAIL: firm_case_scope seeded as %', (select value from public.platform_settings where key = 'firm_case_scope');
  end if;
  raise notice 'A0 PASS: firm_case_scope seeded with the owner''s default';
end $$;

select 'l12_firm_scope: ALL PASS' as result;
