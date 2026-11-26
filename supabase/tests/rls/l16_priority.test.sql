-- l16_priority.test.sql — proves 20261206_40 (batch l16, owner س٢٣: the Nezamy
-- priority window, nzamy_priority_minutes in working hours).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The new
-- migration runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260815_marketplace_excludes_ai_workspace.sql \
--     $M/20261122_30_service_requests_open_view.sql \
--     $M/20261124_30_open_requests_city_summary.sql \
--     $T/prelude_open_requests_publish.sql \
--     $M/20261127_70_open_requests_publish.sql \
--     $T/prelude_platform_settings_min.sql \
--     $M/20261202_70_market_open.sql \
--     $M/20261206_40_nzamy_priority_minutes.sql \
--     $M/20261206_40_nzamy_priority_minutes.sql \
--     $T/l16_priority.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261206_40
-- lines → "F0 FAIL" (no marketplace_release_at).
--
-- REGRESSION: l12_market.test.sql still passes with this file in its chain when
-- the window is 0 (its fixtures expect new requests listed at once): add
-- $M/20261206_40_nzamy_priority_minutes.sql and $T/prelude_l16_priority_zero.sql
-- after the 20261202_70 lines.
--
-- People: R client · Q second client · V verified lawyer · S admin
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

do $$
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'marketplace_release_at' and not attisdropped) then
    raise exception 'F0 FAIL: service_requests.marketplace_release_at does not exist';
  end if;
end $$;

revoke all on public.marketplace_acceptances from app_user;
grant select on public.marketplace_acceptances to app_user;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('11111111-0000-0000-0000-00000000000a'), ('22222222-0000-0000-0000-00000000000b'),
  ('66666666-0000-0000-0000-00000000000f'), ('77777777-0000-0000-0000-000000000001');
insert into public.profiles (id, user_type, display_name, is_demo) values
  ('11111111-0000-0000-0000-00000000000a', 'individual', 'R', false),
  ('22222222-0000-0000-0000-00000000000b', 'lawyer', 'V', false),
  ('66666666-0000-0000-0000-00000000000f', 'admin', 'S', false),
  ('77777777-0000-0000-0000-000000000001', 'individual', 'Q', false);
insert into public.lawyer_profiles (user_id, verification_status) values
  ('22222222-0000-0000-0000-00000000000b', 'verified');

-- T0 settings defaults
do $$
begin
  if (select value from public.platform_settings where key = 'nzamy_priority_minutes') <> '30'::jsonb then
    raise exception 'T0 FAIL: default minutes';
  end if;
  if (select value ->> 'tz' from public.platform_settings where key = 'nzamy_working_hours') <> 'Asia/Riyadh'
     or (select value -> 'days' from public.platform_settings where key = 'nzamy_working_hours') <> '[0, 1, 2, 3, 4]'::jsonb then
    raise exception 'T0 FAIL: default working hours';
  end if;
  raise notice 'T0 PASS: 30 minutes, Asia/Riyadh Sun–Thu 09:00–17:00';
end $$;

-- T1 the working-hours arithmetic (Riyadh = UTC+3, no daylight saving)
do $$
declare
  h jsonb := '{"tz": "Asia/Riyadh", "days": [0, 1, 2, 3, 4], "start": "09:00", "end": "17:00"}'::jsonb;
begin
  -- 2026-11-26 is a Thursday, 2026-11-27 a Friday, 2026-11-29 a Sunday
  if public.nzamy_add_working_minutes('2026-11-26 16:50+03', 30, h) <> '2026-11-29 09:20+03' then raise exception 'T1 FAIL: Thu 16:50'; end if;
  if public.nzamy_add_working_minutes('2026-11-27 10:00+03', 30, h) <> '2026-11-29 09:30+03' then raise exception 'T1 FAIL: Friday'; end if;
  if public.nzamy_add_working_minutes('2026-11-24 08:00+03', 30, h) <> '2026-11-24 09:30+03' then raise exception 'T1 FAIL: before opening'; end if;
  if public.nzamy_add_working_minutes('2026-11-24 10:00+03', 15, h) <> '2026-11-24 10:15+03' then raise exception 'T1 FAIL: inside hours'; end if;
  if public.nzamy_add_working_minutes('2026-11-24 16:30+03', 60, h) <> '2026-11-25 09:30+03' then raise exception 'T1 FAIL: across the night'; end if;
  if public.nzamy_add_working_minutes('2026-11-24 18:00+03', 30, h) <> '2026-11-25 09:30+03' then raise exception 'T1 FAIL: after closing'; end if;
  if public.nzamy_add_working_minutes('2026-11-24 16:30+03', 30, h) <> '2026-11-24 17:00+03' then raise exception 'T1 FAIL: ends at closing'; end if;
  if public.nzamy_add_working_minutes('2026-11-24 10:00+03', 0, h) <> '2026-11-24 10:00+03' then raise exception 'T1 FAIL: zero'; end if;
  -- bad fields fall back to the defaults, field by field
  if public.nzamy_add_working_minutes('2026-11-26 16:50+03', 30, '{"tz": "Mars/Base", "days": [], "start": "17:00", "end": "09:00"}')
     <> '2026-11-29 09:20+03' then raise exception 'T1 FAIL: bad settings'; end if;
  if public.nzamy_add_working_minutes('2026-11-26 16:50+03', 30, null) <> '2026-11-29 09:20+03' then raise exception 'T1 FAIL: null settings'; end if;
  -- a custom week (Saturday too) and hours
  if public.nzamy_add_working_minutes('2026-11-27 10:00+03', 30, '{"tz": "Asia/Riyadh", "days": [6], "start": "10:00", "end": "12:00"}')
     <> '2026-11-28 10:30+03' then raise exception 'T1 FAIL: custom week'; end if;
  raise notice 'T1 PASS: working minutes skip nights and the weekend; bad settings fall back';
end $$;

-- T2 a client's new request is held (stamped), and the lawyer can neither see nor take it
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment)
values ('SR-HELD', '11111111-0000-0000-0000-00000000000a', 'consultation', 'محجوز', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}');
-- the client tries to set the moment himself: overwritten
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment, marketplace_release_at)
values ('SR-CHEAT', '11111111-0000-0000-0000-00000000000a', 'consultation', 'غش', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}', now() - interval '1 day');
-- «افتحه للجميع فوراً» on the form
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment, metadata)
values ('SR-NOW', '11111111-0000-0000-0000-00000000000a', 'consultation', 'فوري', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}', '{"marketOpenNow": true}');
-- a lawyer-bound row is never stamped
insert into public.service_requests (id, requester_user_id, type, title, receiver, status)
values ('SR-LAWYER', '11111111-0000-0000-0000-00000000000a', 'service', 'محامٍ', 'lawyer', 'pending_assignment');
reset role;
do $$
begin
  if coalesce((select marketplace_release_at > now() from public.service_requests where id = 'SR-HELD'), false) is not true then
    raise exception 'T2 FAIL: SR-HELD not held (%)', (select marketplace_release_at from public.service_requests where id = 'SR-HELD');
  end if;
  if coalesce((select marketplace_release_at > now() from public.service_requests where id = 'SR-CHEAT'), false) is not true then
    raise exception 'T2 FAIL: a session set its own release moment';
  end if;
  if (select marketplace_release_at is distinct from created_at from public.service_requests where id = 'SR-NOW') then
    raise exception 'T2 FAIL: marketOpenNow not honoured';
  end if;
  if (select marketplace_release_at from public.service_requests where id = 'SR-LAWYER') is not null then
    raise exception 'T2 FAIL: a lawyer-bound row was stamped';
  end if;
  raise notice 'T2 PASS: stamped at creation, client opt-in honoured, session value ignored, lawyer rows untouched';
end $$;

set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare ids text;
begin
  select string_agg(id, ',' order by id) into ids from public.marketplace_open_requests();
  if ids is distinct from 'SR-NOW' then raise exception 'T2b FAIL: the lawyer lists %', ids; end if;
  if public.marketplace_request_accept('SR-HELD') ->> 'result' <> 'not_open' then
    raise exception 'T2b FAIL: a lawyer took a held request';
  end if;
  raise notice 'T2b PASS: a held request is neither listed nor taken';
end $$;
reset role;

-- T3 the admin sees the held rows with their release moment; the team can assign during the window
set role service_role;
do $$
declare r record;
begin
  select * into r from public.marketplace_open_requests_admin() where id = 'SR-HELD';
  if r.id is null or r.release_at is null or r.release_at <= now() then
    raise exception 'T3 FAIL: admin view misses the held row or its release_at (%)', row_to_json(r);
  end if;
  if not exists (select 1 from public.marketplace_open_requests_admin() where id = 'SR-NOW') then
    raise exception 'T3 FAIL: admin view misses a released row';
  end if;
  if public.marketplace_request_listable('SR-HELD') or not public.marketplace_request_in_market('SR-HELD', true) then
    raise exception 'T3 FAIL: listable / in_market disagree with the window';
  end if;
  raise notice 'T3 PASS: the admin view includes held rows with release_at';
end $$;
reset role;

-- T4 a session cannot move the moment on update
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
update public.service_requests set marketplace_release_at = now() - interval '1 hour' where id = 'SR-HELD';
reset role;
do $$
begin
  if coalesce((select marketplace_release_at > now() from public.service_requests where id = 'SR-HELD'), false) is not true then
    raise exception 'T4 FAIL: a session update moved the release moment';
  end if;
  raise notice 'T4 PASS: only the server moves it';
end $$;

-- T5 the client's «افتحه للجميع فوراً» on his order page
set role app_user;
select set_config('test.uid', '77777777-0000-0000-0000-000000000001', false);
do $$
begin
  if public.service_request_market_open_now('SR-HELD') ->> 'result' <> 'not_found' then
    raise exception 'T5 FAIL: another client opened R''s request';
  end if;
end $$;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
begin
  if public.service_request_market_open_now('SR-HELD') ->> 'result' <> 'not_found' then
    raise exception 'T5 FAIL: a lawyer opened R''s request';
  end if;
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
begin
  if public.service_request_market_open_now('SR-HELD') ->> 'result' <> 'opened' then raise exception 'T5 FAIL: open-now'; end if;
  if public.service_request_market_open_now('SR-HELD') ->> 'result' <> 'already_open' then raise exception 'T5 FAIL: twice'; end if;
  if public.service_request_market_open_now('SR-LAWYER') ->> 'result' <> 'not_open' then raise exception 'T5 FAIL: lawyer-bound row'; end if;
  if public.service_request_market_open_now('SR-NONE') ->> 'result' <> 'not_found' then raise exception 'T5 FAIL: missing row'; end if;
end $$;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
begin
  if not exists (select 1 from public.marketplace_open_requests() where id = 'SR-HELD') then
    raise exception 'T5 FAIL: the opened request is not listed';
  end if;
  raise notice 'T5 PASS: only the requester opens it, once; then it is listed';
end $$;
reset role;
select set_config('test.uid', '', false);
set role app_user;
do $$
begin
  if public.service_request_market_open_now('SR-CHEAT') ->> 'result' <> 'not_found' then
    raise exception 'T5 FAIL: signed out';
  end if;
end $$;
reset role;

-- T6 a staff-published request is never held (publishing is the broadcast)
set role service_role;
update public.service_requests
   set marketplace_published_at = now(), marketplace_published_by = '66666666-0000-0000-0000-00000000000f', marketplace_category = 'case'
 where id = 'SR-CHEAT';
reset role;
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
begin
  if not exists (select 1 from public.marketplace_open_requests() where id = 'SR-CHEAT') then
    raise exception 'T6 FAIL: a published held request is not listed';
  end if;
  raise notice 'T6 PASS: published rows skip the window';
end $$;
reset role;

-- T7 the admin's setting: 0 = no hold; a bad value = 30; a server insert is stamped from created_at
update public.platform_settings set value = '0'::jsonb where key = 'nzamy_priority_minutes';
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment)
values ('SR-ZERO', '11111111-0000-0000-0000-00000000000a', 'consultation', 'صفر', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}');
reset role;
update public.platform_settings set value = '45'::jsonb where key = 'nzamy_priority_minutes';
set role app_user;
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment)
values ('SR-BAD', '11111111-0000-0000-0000-00000000000a', 'consultation', 'سيئ', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}');
reset role;
update public.platform_settings set value = '30'::jsonb where key = 'nzamy_priority_minutes';
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment, created_at)
values ('SR-SERVER', '11111111-0000-0000-0000-00000000000a', 'consultation', 'خادم', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}', now());
do $$
begin
  if (select marketplace_release_at is distinct from created_at from public.service_requests where id = 'SR-ZERO') then
    raise exception 'T7 FAIL: 0 minutes still held';
  end if;
  if (select marketplace_release_at is distinct from public.nzamy_add_working_minutes(created_at, 30, (select value from public.platform_settings where key = 'nzamy_working_hours'))
        from public.service_requests where id = 'SR-BAD') then
    raise exception 'T7 FAIL: a bad setting did not fall back to 30';
  end if;
  if coalesce((select marketplace_release_at > now() from public.service_requests where id = 'SR-SERVER'), false) is not true then
    raise exception 'T7 FAIL: a server insert was not stamped';
  end if;
  raise notice 'T7 PASS: 0 releases at once, a bad value is 30, server inserts are stamped';
end $$;

-- T8 rows from before this file (NULL) stay released
update public.service_requests set marketplace_release_at = null where id = 'SR-SERVER';
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
begin
  if not exists (select 1 from public.marketplace_open_requests() where id = 'SR-SERVER') then
    raise exception 'T8 FAIL: a NULL release moment is not listed';
  end if;
  raise notice 'T8 PASS: NULL = released (old rows unchanged)';
end $$;
reset role;

-- T9 privileges
do $$
begin
  if has_function_privilege('anon', 'public.service_request_market_open_now(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.nzamy_market_release_at(timestamptz, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T9 FAIL: anon can execute';
  end if;
  if has_function_privilege('authenticated', 'public.marketplace_request_in_market(text, boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_request_listable(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_open_requests_admin(integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.nzamy_add_working_minutes(timestamptz, integer, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.guard_service_request_marketplace_publish()', 'EXECUTE') then
    raise exception 'T9 FAIL: authenticated can execute a server function';
  end if;
  if not has_function_privilege('authenticated', 'public.service_request_market_open_now(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.nzamy_market_release_at(timestamptz, boolean)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.marketplace_request_accept(text)', 'EXECUTE') then
    raise exception 'T9 FAIL: a member call is missing';
  end if;
  raise notice 'T9 PASS: anon nothing; members list / ask / open-now; the predicates stay service_role';
end $$;

-- T10 settings rows survive a re-run (the second run above did not reset them)
do $$
begin
  if (select count(*) from public.platform_settings where key in ('nzamy_priority_minutes', 'nzamy_working_hours')) <> 2 then
    raise exception 'T10 FAIL: rows';
  end if;
  raise notice 'T10 PASS: two rows';
end $$;

select 'ALL PASS' as l16_priority;
