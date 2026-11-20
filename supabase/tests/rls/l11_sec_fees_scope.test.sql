-- l11_sec_fees_scope.test.sql — proves parts A (O1 fee columns) and C (O3
--   no-case firm rows) of 20261201_10 (batch l11, builder sec).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root, in Git Bash:
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
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $M/20261201_10_l11_sec_fees_scope_device_phone.sql \
--     $T/l11_sec_fees_scope.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261201_10
--   lines → «A1 FAIL: a plain firm lawyer read a colleague's fee …».
--
-- People (firm F, owner O — the phase2 trigger makes O its managing_partner):
--   L lawyer · T trainee · S legal_secretary · M lawyer (plain) · P managing_partner
--   Q partner · N finance_manager · X lawyer with no firm.
-- Cards: card-L (owner L, 1000 / 200), card-M (owner M, 500 / 0), both firm F.
-- Every assertion RAISES on failure. Session reads run as role `authenticated`.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-000000000bb0'), ('00000000-0000-0000-0000-000000000bb1'),
  ('00000000-0000-0000-0000-000000000bb2'), ('00000000-0000-0000-0000-000000000bb3'),
  ('00000000-0000-0000-0000-000000000bb4'), ('00000000-0000-0000-0000-000000000bb5'),
  ('00000000-0000-0000-0000-000000000bb6'), ('00000000-0000-0000-0000-000000000bb7'),
  ('00000000-0000-0000-0000-000000000bb8');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-000000000bb0', 'firm',       'O', 'o@l11.test'),
  ('00000000-0000-0000-0000-000000000bb1', 'lawyer',     'L', 'l@l11.test'),
  ('00000000-0000-0000-0000-000000000bb2', 'individual', 'T', 't@l11.test'),
  ('00000000-0000-0000-0000-000000000bb3', 'individual', 'S', 's@l11.test'),
  ('00000000-0000-0000-0000-000000000bb4', 'lawyer',     'M', 'm@l11.test'),
  ('00000000-0000-0000-0000-000000000bb5', 'lawyer',     'P', 'p@l11.test'),
  ('00000000-0000-0000-0000-000000000bb6', 'lawyer',     'Q', 'q@l11.test'),
  ('00000000-0000-0000-0000-000000000bb7', 'individual', 'N', 'n@l11.test'),
  ('00000000-0000-0000-0000-000000000bb8', 'lawyer',     'X', 'x@l11.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb0', 'مكتب الأتعاب');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb1', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb2', 'trainee',          'active', now()),
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb3', 'legal_secretary',  'active', now()),
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb4', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb5', 'managing_partner', 'active', now()),
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb6', 'partner',          'active', now()),
  ('ffffffff-0000-0000-0000-000000000bf1', '00000000-0000-0000-0000-000000000bb7', 'finance_manager',  'active', now());

insert into public.lawyer_clients (id, owner_user_id, firm_id, name, fee_total_sar, fee_paid_sar) values
  ('cccccccc-0000-0000-0000-000000000bc1', '00000000-0000-0000-0000-000000000bb1', 'ffffffff-0000-0000-0000-000000000bf1', 'موكل ل', 1000, 200),
  ('cccccccc-0000-0000-0000-000000000bc4', '00000000-0000-0000-0000-000000000bb4', 'ffffffff-0000-0000-0000-000000000bf1', 'موكل م', 500, 0);

-- O3 fixtures: firm rows with NO case.
insert into public.hearings (id, owner_user_id, assignee_user_id, firm_id, case_request_id, title, hearing_date) values
  ('eeeeeeee-0000-0000-0000-000000000be1', '00000000-0000-0000-0000-000000000bb1', null,                                   'ffffffff-0000-0000-0000-000000000bf1', null, 'اجتماع المكتب', current_date + 1),
  ('eeeeeeee-0000-0000-0000-000000000be2', '00000000-0000-0000-0000-000000000bb1', '00000000-0000-0000-0000-000000000bb2', 'ffffffff-0000-0000-0000-000000000bf1', null, 'موعد يحضره المتدرب', current_date + 2);
insert into public.tasks (id, owner_user_id, assignee_user_id, firm_id, case_request_id, title) values
  ('dddddddd-0000-0000-0000-000000000bd1', '00000000-0000-0000-0000-000000000bb1', null,                                   'ffffffff-0000-0000-0000-000000000bf1', null, 'مهمة عامة'),
  ('dddddddd-0000-0000-0000-000000000bd2', '00000000-0000-0000-0000-000000000bb1', '00000000-0000-0000-0000-000000000bb3', 'ffffffff-0000-0000-0000-000000000bf1', null, 'مهمة السكرتير');
insert into public.dashboard_notes (id, author_user_id, firm_id, case_request_id, body, visibility) values
  ('aaaaaaaa-0000-0000-0000-000000000ba1', '00000000-0000-0000-0000-000000000bb1', 'ffffffff-0000-0000-0000-000000000bf1', null, 'ملاحظة للمكتب', 'firm'),
  ('aaaaaaaa-0000-0000-0000-000000000ba2', '00000000-0000-0000-0000-000000000bb2', 'ffffffff-0000-0000-0000-000000000bf1', null, 'ملاحظة المتدرب', 'firm');

-- The fees a session gets from lawyer_client_fees, as «card:total/paid» sorted.
-- plpgsql (not sql) so the negative control reaches A1 instead of failing here.
create or replace function pg_temp.fees() returns text language plpgsql as $$
begin
  return (select coalesce(string_agg(right(f.id::text, 1) || ':' || f.fee_total_sar::int || '/' || f.fee_paid_sar::int, ',' order by f.id), '')
            from public.lawyer_client_fees(array['cccccccc-0000-0000-0000-000000000bc1',
                                                 'cccccccc-0000-0000-0000-000000000bc4']::uuid[]) f);
end $$;
-- The no-case rows a session reads, by the last digit of their id.
create or replace function pg_temp.nocase() returns text language sql as $$
  select concat_ws(' | ',
    'hearings [' || coalesce((select string_agg(right(id::text, 1), ',' order by id) from public.hearings where case_request_id is null), '') || ']',
    'tasks ['    || coalesce((select string_agg(right(id::text, 1), ',' order by id) from public.tasks where case_request_id is null), '') || ']',
    'notes ['    || coalesce((select string_agg(right(id::text, 1), ',' order by id) from public.dashboard_notes where case_request_id is null), '') || ']');
$$;
create or replace function pg_temp.expect(p_label text, p_uid text, p_what text, p_expected text) returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, false);
  got := case p_what when 'fees' then pg_temp.fees() else pg_temp.nocase() end;
  if got is distinct from p_expected then
    raise exception '% FAIL: % reads % — expected %', p_label, p_what, got, p_expected;
  end if;
  raise notice '% PASS: % = %', p_label, p_what, got;
end $$;
grant execute on function pg_temp.fees() to authenticated;
grant execute on function pg_temp.nocase() to authenticated;
grant execute on function pg_temp.expect(text, text, text, text) to authenticated;

set role authenticated;

-- ── A1 a plain firm lawyer cannot read any fee column directly ──────────────
select set_config('test.uid', '00000000-0000-0000-0000-000000000bb4', false);
do $$
declare v numeric;
begin
  begin
    select fee_total_sar into v from public.lawyer_clients where id = 'cccccccc-0000-0000-0000-000000000bc1';
    raise exception 'A1 FAIL: a plain firm lawyer read a colleague''s fee (%)', v;
  exception when insufficient_privilege then
    raise notice 'A1 PASS: fee_total_sar refused (%)', sqlerrm;
  end;
  begin
    select fee_paid_sar into v from public.lawyer_clients where id = 'cccccccc-0000-0000-0000-000000000bc4';
    raise exception 'A1 FAIL: fee_paid_sar readable even on his own card (%)', v;
  exception when insufficient_privilege then
    raise notice 'A1 PASS: fee_paid_sar refused too (own card included — the session never reads it)';
  end;
  begin
    perform 1 from public.lawyer_clients;  -- no columns: allowed
    perform count(*) from (select * from public.lawyer_clients) s;
    raise exception 'A1 FAIL: select * (RETURNING *) still works';
  exception when insufficient_privilege then
    raise notice 'A1 PASS: select * is refused (a RETURNING * would be too)';
  end;
end $$;

-- ── A2 the other columns still work: read, insert/update RETURNING named cols ─
do $$
declare n int; v_id uuid; v_name text;
begin
  select count(*) into n from (select id, name, owner_user_id, firm_id, client_user_id, status, created_at
                                 from public.lawyer_clients) s;
  if n <> 2 then raise exception 'A2 FAIL: the plain lawyer reads % cards, expected 2', n; end if;
  insert into public.lawyer_clients (owner_user_id, firm_id, name, fee_total_sar, fee_paid_sar)
  values ('00000000-0000-0000-0000-000000000bb4', 'ffffffff-0000-0000-0000-000000000bf1', 'موكل جديد', 300, 100)
  returning id, name into v_id, v_name;
  update public.lawyer_clients set name = 'موكل م (معدّل)', fee_total_sar = 600
   where id = 'cccccccc-0000-0000-0000-000000000bc4' returning id into v_id;
  if v_id is null then raise exception 'A2 FAIL: the owner''s update of his card did not apply'; end if;
  delete from public.lawyer_clients where name = 'موكل جديد';
  raise notice 'A2 PASS: named-column read, INSERT … RETURNING id, name and the owner''s fee UPDATE all work';
end $$;

-- ── A3 lawyer_client_fees: the clientFeeVisibility matrix ───────────────────
select pg_temp.expect('A3 plain lawyer M (own card only)', '00000000-0000-0000-0000-000000000bb4', 'fees', '4:600/0');
select pg_temp.expect('A3 lawyer L (own card only)',       '00000000-0000-0000-0000-000000000bb1', 'fees', '1:1000/200');
select pg_temp.expect('A3 trainee T (nothing)',            '00000000-0000-0000-0000-000000000bb2', 'fees', '');
select pg_temp.expect('A3 secretary S (nothing)',          '00000000-0000-0000-0000-000000000bb3', 'fees', '');
select pg_temp.expect('A3 managing partner P (both)',      '00000000-0000-0000-0000-000000000bb5', 'fees', '1:1000/200,4:600/0');
select pg_temp.expect('A3 partner Q (both)',               '00000000-0000-0000-0000-000000000bb6', 'fees', '1:1000/200,4:600/0');
select pg_temp.expect('A3 finance manager N (both)',       '00000000-0000-0000-0000-000000000bb7', 'fees', '1:1000/200,4:600/0');
select pg_temp.expect('A3 firm owner O (both)',            '00000000-0000-0000-0000-000000000bb0', 'fees', '1:1000/200,4:600/0');
select pg_temp.expect('A3 outsider X (nothing)',           '00000000-0000-0000-0000-000000000bb8', 'fees', '');

-- A partner who leaves the firm loses the fees at once.
reset role;
update public.firm_members set status = 'removed'
 where user_id = '00000000-0000-0000-0000-000000000bb6';
set role authenticated;
select pg_temp.expect('A3 former partner Q (nothing)',     '00000000-0000-0000-0000-000000000bb6', 'fees', '');
reset role;
update public.firm_members set status = 'active'
 where user_id = '00000000-0000-0000-0000-000000000bb6';

-- ── A4 a guest: no fee function, no fee column ──────────────────────────────
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  begin
    perform public.lawyer_client_fees(array['cccccccc-0000-0000-0000-000000000bc1']::uuid[]);
    raise exception 'A4 FAIL: anon may call lawyer_client_fees';
  exception when insufficient_privilege then
    raise notice 'A4 PASS: anon cannot call lawyer_client_fees';
  end;
  begin
    perform fee_total_sar from public.lawyer_clients;
    raise exception 'A4 FAIL: anon may read fee_total_sar';
  exception when insufficient_privilege then
    raise notice 'A4 PASS: anon cannot read fee_total_sar';
  end;
end $$;
reset role;

-- ── C. firm rows with no case ───────────────────────────────────────────────
set role authenticated;
select pg_temp.expect('C1 trainee T (assigned hearing, own note)', '00000000-0000-0000-0000-000000000bb2', 'nocase',
                      'hearings [2] | tasks [] | notes [2]');
select pg_temp.expect('C2 secretary S (assigned task)',            '00000000-0000-0000-0000-000000000bb3', 'nocase',
                      'hearings [] | tasks [2] | notes []');
select pg_temp.expect('C3 plain lawyer M (unchanged: all)',        '00000000-0000-0000-0000-000000000bb4', 'nocase',
                      'hearings [1,2] | tasks [1,2] | notes [1,2]');
select pg_temp.expect('C4 managing partner P (unchanged: all)',    '00000000-0000-0000-0000-000000000bb5', 'nocase',
                      'hearings [1,2] | tasks [1,2] | notes [1,2]');
select pg_temp.expect('C5 finance manager N (unchanged: all)',     '00000000-0000-0000-0000-000000000bb7', 'nocase',
                      'hearings [1,2] | tasks [1,2] | notes [1,2]');
select pg_temp.expect('C6 author L (unchanged: all)',              '00000000-0000-0000-0000-000000000bb1', 'nocase',
                      'hearings [1,2] | tasks [1,2] | notes [1,2]');
select pg_temp.expect('C7 outsider X (nothing)',                   '00000000-0000-0000-0000-000000000bb8', 'nocase',
                      'hearings [] | tasks [] | notes []');

-- A hidden row cannot be updated by the trainee either.
select set_config('test.uid', '00000000-0000-0000-0000-000000000bb2', false);
do $$
declare n int;
begin
  update public.hearings set title = 'عبث' where id = 'eeeeeeee-0000-0000-0000-000000000be1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C8 FAIL: the trainee updated a hidden no-case hearing'; end if;
  update public.tasks set title = 'عبث' where id = 'dddddddd-0000-0000-0000-000000000bd1';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C8 FAIL: the trainee updated a hidden no-case task'; end if;
  raise notice 'C8 PASS: the trainee cannot update the hidden no-case rows';
end $$;

-- Promotion: the trainee made a lawyer reads the firm-wide rows again.
reset role;
update public.firm_members set role = 'lawyer' where user_id = '00000000-0000-0000-0000-000000000bb2';
set role authenticated;
select pg_temp.expect('C9 former trainee T now lawyer (all)', '00000000-0000-0000-0000-000000000bb2', 'nocase',
                      'hearings [1,2] | tasks [1,2] | notes [1,2]');
reset role;

do $$ begin raise notice 'l11_sec_fees_scope: ALL PASS'; end $$;
