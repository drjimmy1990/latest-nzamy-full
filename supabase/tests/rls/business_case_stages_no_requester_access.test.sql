-- Diagnostic (not a Phase migration acceptance test): proves that a
-- corporate/business requester — the owner of the business/cases/[id] page,
-- routeAccess.ts maps /dashboard/business to profiles.user_type = 'corporate'
-- — has NO row-level access to public.case_stages for their OWN case, even
-- though they can read the case itself (service_requests). Written to settle
-- owner item 7 remainder (درجات التقاضي tab on the business case file):
-- it evidences that the business page cannot show real case_stages data
-- without (a) an assertRole allow-list change in
-- src/app/api/v1/lawyer/case-stages/[caseId]/route.ts AND (b) a new RLS
-- select policy on case_stages keyed off service_requests.requester_user_id —
-- neither of which is this task's owned file.
--
-- Users: A (solo lawyer, operationally owns the case), D (corporate — the
-- requester/client who filed the case and would open its business case file).
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-00000000000a'),
  ('dddddddd-0000-0000-0000-00000000000d');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-00000000000a','lawyer','A'),
  ('dddddddd-0000-0000-0000-00000000000d','corporate','D');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('req-biz','dddddddd-0000-0000-0000-00000000000d','قضية الشركة','aaaaaaaa-0000-0000-0000-00000000000a');

set role app_user;

-- A (the lawyer working the case) records a stage — owner_user_id = A, per
-- "case stages insertable by owner".
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-00000000000a', false);
insert into public.case_stages (case_request_id, owner_user_id, degree)
values ('req-biz', 'aaaaaaaa-0000-0000-0000-00000000000a', 'first_instance');
select 'T1 A (owner) reads own stage (expect 1): ' || count(*) from public.case_stages where case_request_id = 'req-biz';

-- D is the case's requester — the business account that would open this
-- case's file — and can read the case row itself.
select set_config('test.uid', 'dddddddd-0000-0000-0000-00000000000d', false);
select 'T2 D (requester) reads the case itself (expect 1): ' || count(*) from public.service_requests where id = 'req-biz';

-- The claim under test: D reads ZERO case_stages rows for their own case —
-- can_access_case_row(owner_user_id, firm_id) only matches the lawyer/firm
-- side, never requester_user_id, so this is 0 today regardless of how many
-- stages exist.
select 'T3 D (requester) reads case_stages for own case (expect 0 — THE GAP): ' || count(*) from public.case_stages where case_request_id = 'req-biz';

-- footer
reset role;
select 'policies: ' || string_agg(tablename || '=' || cnt, ' · ' order by tablename)
  from (select tablename, count(*) as cnt from pg_policies
         where schemaname = 'public'
           and tablename in ('case_stages','service_requests')
         group by tablename) p;
