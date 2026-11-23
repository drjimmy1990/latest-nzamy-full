-- NEGATIVE-CONTROL fixture for case_free_board.test.sql (NOT a migration).
-- Drops the «works on the case» half of public.case_board_open: anyone who can
-- read the case row (the client who filed it included) would open the board.
-- With this file after 20261203_60 the test must FAIL at F1.
create or replace function public.case_board_open(p_request text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select p_request is not null
     and exists (select 1 from public.service_requests sr where sr.id = p_request);
$fn$;
