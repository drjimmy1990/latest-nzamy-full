-- Regression test for owner decisions ١٥ / ١٩ (2026-10-17): a client never
-- reads the team's internal case data through PostgREST.
--
-- No migration goes with it. The client's view of a case (degree, next hearing,
-- final ruling) is a fixed server projection — GET
-- /api/v1/client/cases/[id]/summary, column lists in src/lib/clientCaseSummary.ts
-- — and that design is only safe while the database keeps the client OUT of the
-- source tables. This file pins that: if a later policy opened hearings,
-- case_stages or case_notes to the requester, every internal column (notes,
-- minutes, judge_name, metadata) would reach the browser through REST, and this
-- run would stop.
--
-- CHAIN:
--   supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_case_tables_real.sql \
--     supabase/migrations/20260903_phase1_case_tables.sql \
--     supabase/migrations/20260903_phase2_clients_and_firm_membership.sql \
--     supabase/migrations/20260910_case_notes.sql \
--     supabase/tests/rls/client_case_view_no_internal_rows.test.sql
--
-- POSITIVE CONTROL: the lawyer reads every row the client is refused, so a 0
-- for the client means "refused", not "nothing there".
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres ────────────────────────────────────────────────────
--   L  aaaaaaaa-…001  lawyer, assigned to the case
--   C  cccccccc-…003  client, the case's requester
--   X  eeeeeeee-…005  stranger
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('eeeeeeee-0000-0000-0000-000000000005');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'lawyer', 'L'),
  ('cccccccc-0000-0000-0000-000000000003', 'individual', 'C'),
  ('eeeeeeee-0000-0000-0000-000000000005', 'individual', 'X');
insert into public.service_requests (id, requester_user_id, assigned_to, title, status) values
  ('req-1', 'cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'قضية عمالية', 'assigned');

insert into public.case_stages (case_request_id, owner_user_id, degree, judge_name, circuit, outcome, notes)
values ('req-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'first_instance', 'القاضي', 'الدائرة ٣', 'won', 'تقدير داخلي للمخاطر');
insert into public.hearings (case_request_id, owner_user_id, kind, title, hearing_date, minutes, notes)
values
  ('req-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'judicial', 'جلسة', current_date + 3, '', 'خطة الدفاع'),
  ('req-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'internal', 'اجتماع الفريق', current_date + 1, 'محضر المداولة', '');
insert into public.case_notes (request_id, author_user_id, visibility, body)
values
  ('req-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'private', 'مذكرة مداولة'),
  ('req-1', 'aaaaaaaa-0000-0000-0000-000000000001', 'firm', 'ملاحظة تكتيكية للفريق');

set role app_user;

-- POSITIVE CONTROL — the lawyer reads all of it
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare h int; s int; n int;
begin
  select count(*) into h from public.hearings where case_request_id = 'req-1';
  select count(*) into s from public.case_stages where case_request_id = 'req-1';
  select count(*) into n from public.case_notes where request_id = 'req-1';
  if h <> 2 or s <> 1 or n <> 2 then
    raise exception 'CONTROL FAIL: the lawyer reads hearings=% stages=% notes=% (expected 2/1/2) — the fixture is wrong, the zeros below would prove nothing', h, s, n;
  end if;
  raise notice 'CONTROL PASS: the lawyer reads 2 hearings, 1 stage, 2 notes';
end $$;

-- C1 — the client reads the case itself…
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'req-1';
  if n <> 1 then raise exception 'C1 FAIL: the requester cannot read their own case (%)', n; end if;
  raise notice 'C1 PASS: the requester reads their case row';
end $$;

-- C2 — …and none of the internal rows behind it
do $$
declare h int; s int; n int;
begin
  select count(*) into h from public.hearings where case_request_id = 'req-1';
  select count(*) into s from public.case_stages where case_request_id = 'req-1';
  select count(*) into n from public.case_notes where request_id = 'req-1';
  if h <> 0 then raise exception 'C2 FAIL: the client reads % hearings rows through REST (notes/minutes would leak)', h; end if;
  if s <> 0 then raise exception 'C2 FAIL: the client reads % case_stages rows through REST (judge/notes would leak)', s; end if;
  if n <> 0 then raise exception 'C2 FAIL: the client reads % case_notes rows (deliberation notes would leak)', n; end if;
  raise notice 'C2 PASS: the client reads 0 hearings, 0 case_stages, 0 case_notes rows';
end $$;

-- C3 — a stranger reads nothing either
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare n int;
begin
  select (select count(*) from public.service_requests where id = 'req-1')
       + (select count(*) from public.hearings where case_request_id = 'req-1')
       + (select count(*) from public.case_notes where request_id = 'req-1') into n;
  if n <> 0 then raise exception 'C3 FAIL: a stranger reads % rows of the case', n; end if;
  raise notice 'C3 PASS: a stranger reads nothing of the case';
end $$;

reset role;
select 'client_case_view_no_internal_rows: all checks passed';
