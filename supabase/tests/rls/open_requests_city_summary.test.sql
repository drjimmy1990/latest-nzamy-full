-- open_requests_city_summary.test.sql — proves 20261124_30 (owner decisions ١٠ + ١٩).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The new
-- migration runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260815_marketplace_excludes_ai_workspace.sql \
--     $M/20261122_30_service_requests_open_view.sql \
--     $M/20261124_30_open_requests_city_summary.sql \
--     $M/20261124_30_open_requests_city_summary.sql \
--     $T/open_requests_city_summary.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261124_30
-- lines → "F0 FAIL" (no city column) — and with only 20261122_30 the function
-- still returns `title` (T2 fails).
--
-- People: R requester (client)   V verified lawyer   P pending lawyer
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.service_requests'::regclass
                  and attname = 'city' and not attisdropped) then
    raise exception 'F0 FAIL: service_requests.city does not exist';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('11111111-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-00000000000c');
insert into public.profiles (id, user_type, display_name) values
  ('11111111-0000-0000-0000-00000000000a', 'individual', 'R'),
  ('22222222-0000-0000-0000-00000000000b', 'lawyer', 'V'),
  ('33333333-0000-0000-0000-00000000000c', 'lawyer', 'P');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('22222222-0000-0000-0000-00000000000b', 'verified'),
  ('33333333-0000-0000-0000-00000000000c', 'pending');

-- T1 a session insert cannot write public_summary (forced to NULL) but keeps its city
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
insert into public.service_requests (id, requester_user_id, type, title, description, receiver, status, city, public_summary)
values ('SR-OPEN', '11111111-0000-0000-0000-00000000000a', 'service', 'محمد بن سعد ٠٥٠٠٠٠٠٠٠٠', 'نص خاص', 'lawyer',
        'pending_assignment', 'riyadh', 'ملخص كتبه العميل بنفسه');
reset role;
do $$
declare r record;
begin
  select city, public_summary into r from public.service_requests where id = 'SR-OPEN';
  if r.public_summary is not null then
    raise exception 'T1 FAIL: a session insert wrote public_summary = %', r.public_summary;
  end if;
  if r.city is distinct from 'riyadh' then
    raise exception 'T1 FAIL: the city was not kept (%)', r.city;
  end if;
  raise notice 'T1 PASS: session insert keeps the city, drops the summary';
end $$;

-- T2 the service role writes the summary; a session update cannot change it
set role service_role;
update public.service_requests set public_summary = 'خدمة: نزاع عمالي حول مستحقات نهاية الخدمة' where id = 'SR-OPEN';
reset role;
do $$
declare s text;
begin
  select public_summary into s from public.service_requests where id = 'SR-OPEN';
  if s is distinct from 'خدمة: نزاع عمالي حول مستحقات نهاية الخدمة' then
    raise exception 'T2 FAIL: the service role could not write the summary (%)', s;
  end if;
  raise notice 'T2 PASS: the service role writes the summary';
end $$;
-- the guard trigger alone (20261018_04's trg_00 is not in this chain, so the
-- UPDATE reaches trg_01): the old value is kept
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
update public.service_requests set public_summary = 'تعديل من العميل' where id = 'SR-OPEN';
reset role;
do $$
declare s text;
begin
  select public_summary into s from public.service_requests where id = 'SR-OPEN';
  if s is distinct from 'خدمة: نزاع عمالي حول مستحقات نهاية الخدمة' then
    raise exception 'T2 FAIL: a session update changed the summary to %', s;
  end if;
  raise notice 'T2 PASS: a session update cannot change the summary';
end $$;

-- T3 the checks refuse digits (any script), e-mails, URLs, line breaks and free-text cities
do $$
declare
  bad text;
  ok boolean;
begin
  foreach bad in array array['رقم ٠٥٥١٢٣٤٥٦٧', 'رقم 0551234567', 'رقم ۰۵۵', 'رقم ０５５', 'راسلني a@b.co',
                             'الموقع https://x.sa', 'الموقع www.x.sa', E'سطر\nثان'] loop
    ok := false;
    begin
      update public.service_requests set public_summary = bad where id = 'SR-OPEN';
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'T3 FAIL: the summary check accepted %', bad; end if;
  end loop;
  foreach bad in array array['الرياض', 'Riyadh', 'riyadh1', 'a@b', 'r'] loop
    ok := false;
    begin
      update public.service_requests set city = bad where id = 'SR-OPEN';
    exception when check_violation then ok := true;
    end;
    if not ok then raise exception 'T3 FAIL: the city check accepted %', bad; end if;
  end loop;
  begin
    update public.service_requests set public_summary = repeat('ع', 121) where id = 'SR-OPEN';
    raise exception 'T3 FAIL: a 121-character summary was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T3 PASS: the checks refuse digits, e-mails, URLs, line breaks, long text and free-text cities';
end $$;

-- T4 the function: exact columns, no title, city + summary for a verified lawyer
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare
  r record;
  cols text;
  n int;
begin
  select string_agg(a.attname, ',' order by a.attnum) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
   where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure and a.mode = 't';
  if cols is distinct from 'id,type,receiver,city,public_summary,status,created_at' then
    raise exception 'T4 FAIL: unexpected output columns %', cols;
  end if;
  select count(*) into n from public.marketplace_open_requests();
  if n <> 1 then raise exception 'T4 FAIL: the verified lawyer lists % row(s), expected 1', n; end if;
  select * into r from public.marketplace_open_requests();
  if r.id <> 'SR-OPEN' or r.city <> 'riyadh' or r.public_summary is null then
    raise exception 'T4 FAIL: got %', row_to_json(r);
  end if;
  if row_to_json(r)::text like '%محمد%' or row_to_json(r)::text like '%نص خاص%' then
    raise exception 'T4 FAIL: the client''s own text leaked: %', row_to_json(r);
  end if;
  -- the table itself is still closed to him (20261122_30)
  select count(*) into n from public.service_requests;
  if n <> 0 then raise exception 'T4 FAIL: the verified lawyer reads % table row(s)', n; end if;
  raise notice 'T4 PASS: % → city + summary, no title', cols;
end $$;

-- T5 a pending lawyer and the client get nothing from the function
select set_config('test.uid', '33333333-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T5 FAIL: a pending lawyer listed % row(s)', n; end if;
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T5 FAIL: a client listed % row(s)', n; end if;
  raise notice 'T5 PASS: a pending lawyer and a client list nothing';
end $$;
reset role;

-- T6 privileges: anon cannot execute, authenticated can; one function only
do $$
begin
  if has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T6 FAIL: anon can execute marketplace_open_requests';
  end if;
  if not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T6 FAIL: authenticated cannot execute marketplace_open_requests';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'marketplace_open_requests') <> 1 then
    raise exception 'T6 FAIL: more than one marketplace_open_requests';
  end if;
  raise notice 'T6 PASS: EXECUTE for authenticated only';
end $$;
