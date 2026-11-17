-- service_requests_open_view.test.sql — proves 20261122_30 (owner ticket M3).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260815_marketplace_excludes_ai_workspace.sql \
--     $M/20261122_30_service_requests_open_view.sql \
--     $M/20261122_30_service_requests_open_view.sql \
--     $T/service_requests_open_view.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261122_30
-- lines → "T1 FAIL" (a verified lawyer reads another user's open row).
--
-- People: R requester (client)   V verified lawyer   P pending (unverified) lawyer
--         A lawyer assigned to one request
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

-- ── fixtures as postgres (bypasses RLS on purpose) ──────────────────────────
insert into auth.users values
  ('11111111-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-00000000000c'),
  ('44444444-0000-0000-0000-00000000000d');
insert into public.profiles (id, user_type, display_name) values
  ('11111111-0000-0000-0000-00000000000a', 'individual', 'R'),
  ('22222222-0000-0000-0000-00000000000b', 'lawyer', 'V'),
  ('33333333-0000-0000-0000-00000000000c', 'lawyer', 'P'),
  ('44444444-0000-0000-0000-00000000000d', 'lawyer', 'A');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('22222222-0000-0000-0000-00000000000b', 'verified'),
  ('33333333-0000-0000-0000-00000000000c', 'pending'),
  ('44444444-0000-0000-0000-00000000000d', 'verified');
insert into public.service_requests (id, requester_user_id, type, title, description, requester, receiver, assigned_to, status, metadata) values
  ('SR-OPEN',     '11111111-0000-0000-0000-00000000000a', 'service', 'طلب مفتوح', 'نص خاص', '{"name":"x"}', 'lawyer', null, 'pending_assignment', '{"intake":{"k":"v"}}'),
  ('SR-AI',       '11111111-0000-0000-0000-00000000000a', 'service', 'طلب للفريق', '', '{}', 'ai_workspace', null, 'pending_assignment', '{"intake":{"k":"v"}}'),
  ('SR-ASSIGNED', '11111111-0000-0000-0000-00000000000a', 'service', 'طلب مسند', '', '{}', 'lawyer', '44444444-0000-0000-0000-00000000000d', 'assigned', '{}'),
  ('SR-DONE',     '11111111-0000-0000-0000-00000000000a', 'service', 'طلب منتهٍ', '', '{}', 'lawyer', null, 'completed', '{}');

set role app_user;

-- T1 a verified lawyer no longer reads other people's open rows from the table
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.service_requests;
  if n <> 0 then raise exception 'T1 FAIL: a verified lawyer reads % row(s) of the table that are not his', n; end if;
  raise notice 'T1 PASS: the table hides open rows from a verified lawyer';
end $$;

-- T2 the function lists the open row with the listing columns only
do $$
declare
  ids text;
  cols text;
begin
  select string_agg(id, ',' order by id) into ids from public.marketplace_open_requests();
  if ids is distinct from 'SR-OPEN' then
    raise exception 'T2 FAIL: expected SR-OPEN only, got %', ids;
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
   where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure and a.mode = 't';
  if cols is distinct from 'id,type,receiver,title,status,created_at' then
    raise exception 'T2 FAIL: unexpected output columns %', cols;
  end if;
  raise notice 'T2 PASS: the function returns SR-OPEN with %', cols;
end $$;

-- T3 an unverified lawyer and a client get nothing from the function
select set_config('test.uid', '33333333-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T3 FAIL: an unverified lawyer listed % row(s)', n; end if;
  raise notice 'T3 PASS: an unverified lawyer lists nothing';
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T3 FAIL: a client listed % row(s)', n; end if;
  raise notice 'T3 PASS: a client lists nothing';
end $$;

-- T4 the requester still reads all four of his rows, whole
do $$
declare n int; m jsonb;
begin
  select count(*) into n from public.service_requests;
  if n <> 4 then raise exception 'T4 FAIL: the requester reads % row(s), expected 4', n; end if;
  select metadata into m from public.service_requests where id = 'SR-OPEN';
  if m->'intake' is null then raise exception 'T4 FAIL: the requester lost his own metadata'; end if;
  raise notice 'T4 PASS: the requester reads his own rows';
end $$;

-- T5 the assigned lawyer still reads his assigned row (and only that one)
select set_config('test.uid', '44444444-0000-0000-0000-00000000000d', false);
do $$
declare ids text;
begin
  select string_agg(id, ',' order by id) into ids from public.service_requests;
  if ids is distinct from 'SR-ASSIGNED' then raise exception 'T5 FAIL: the assignee reads %', ids; end if;
  raise notice 'T5 PASS: the assignee reads his assigned row only';
end $$;

-- T6 limits are clamped (a negative offset or a huge limit is not an error)
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests(100000, -5);
  if n <> 1 then raise exception 'T6 FAIL: clamped call returned %', n; end if;
  raise notice 'T6 PASS: limit/offset are clamped';
end $$;

reset role;

-- T7 privileges: anon cannot execute, authenticated can
do $$
begin
  if has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T7 FAIL: anon can execute marketplace_open_requests';
  end if;
  if not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T7 FAIL: authenticated cannot execute marketplace_open_requests';
  end if;
  raise notice 'T7 PASS: EXECUTE for authenticated only';
end $$;
