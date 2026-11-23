-- NEGATIVE-CONTROL fixture for case_free_board.test.sql (NOT a migration).
-- Makes public.case_board_open SECURITY DEFINER: the case row is then read
-- past the service_requests policies, so a firm member who may not open a
-- case file (office admin, finance manager) would open its board.
-- With this file after 20261203_60 the test must FAIL at F2.
create or replace function public.case_board_open(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_request is not null
     and exists (select 1 from public.service_requests sr where sr.id = p_request)
     and coalesce(public.is_case_worker(p_request), false);
$fn$;
