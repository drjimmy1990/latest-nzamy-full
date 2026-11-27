-- l18_firm_open_requests.test.sql — proves 20261208_90 (batch l18 review,
-- owner ٢٣٨): the owner of a VERIFIED firm reads the open requests, as a
-- verified lawyer does; a pending firm's owner and a client read nothing.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The new
-- migration runs TWICE (idempotent); the _verify block before (prints f) and
-- after. From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l18_review.sql
--   sed -n '/^-- >>> verify:l18_review/,/^-- <<< verify:l18_review/p' $M/_verify.sql > "$B"
--   bash $T/run.sh \
--     $M/20260815_marketplace_excludes_ai_workspace.sql \
--     $M/20261122_30_service_requests_open_view.sql \
--     $M/20261124_30_open_requests_city_summary.sql \
--     $T/prelude_open_requests_publish.sql \
--     $M/20261127_70_open_requests_publish.sql \
--     $T/prelude_platform_settings_min.sql \
--     $M/20261202_70_market_open.sql \
--     $M/20261206_40_nzamy_priority_minutes.sql \
--     $T/prelude_l18_firm_verification.sql \
--     "$B" \
--     $M/20261208_90_l18_firm_open_requests.sql $M/20261208_90_l18_firm_open_requests.sql \
--     "$B" \
--     $T/l18_firm_open_requests.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261208_90
-- lines → "T1 FAIL" (the verified firm reads nothing).
\set ON_ERROR_STOP 1

revoke all on public.marketplace_acceptances from app_user;
grant select on public.marketplace_acceptances to app_user;

insert into auth.users values
  ('11111111-0000-0000-0000-0000000018f1'), ('22222222-0000-0000-0000-0000000018f2'),
  ('33333333-0000-0000-0000-0000000018f3'), ('44444444-0000-0000-0000-0000000018f4');
insert into public.profiles (id, user_type, display_name, is_demo) values
  ('11111111-0000-0000-0000-0000000018f1', 'individual', 'R', false),
  ('22222222-0000-0000-0000-0000000018f2', 'lawyer', 'V', false),
  ('33333333-0000-0000-0000-0000000018f3', 'firm', 'F', false),
  ('44444444-0000-0000-0000-0000000018f4', 'firm', 'G', false);
insert into public.lawyer_profiles (user_id, verification_status) values
  ('22222222-0000-0000-0000-0000000018f2', 'verified');
insert into public.firm_profiles (owner_user_id, name_ar, verification_status) values
  ('33333333-0000-0000-0000-0000000018f3', 'مكتب موثّق', 'verified'),
  ('44444444-0000-0000-0000-0000000018f4', 'مكتب قيد المراجعة', 'pending');

-- a client's request opened to the market at once («افتحه للجميع فوراً»)
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-0000000018f1', false);
insert into public.service_requests (id, requester_user_id, type, title, receiver, status, payment, metadata)
values ('SR-FIRM', '11111111-0000-0000-0000-0000000018f1', 'consultation', 'طلب', 'ai_workspace', 'pending_assignment', '{"status":"not_required"}', '{"marketOpenNow": true}');
reset role;

do $$
begin
  if to_regprocedure('public.marketplace_open_requests(integer, integer)') is null then raise exception 'T0 FAIL: no marketplace_open_requests'; end if;
  raise notice 'T0 PASS: the list function exists';
end $$;

-- T1 the owner of a verified firm reads it; T2 the verified lawyer still does
set role app_user;
select set_config('test.uid', '33333333-0000-0000-0000-0000000018f3', false);
do $$
begin
  if not exists (select 1 from public.marketplace_open_requests() where id = 'SR-FIRM') then
    raise exception 'T1 FAIL: the verified firm reads no open request';
  end if;
  raise notice 'T1 PASS: the owner of a verified firm reads the open requests';
end $$;
select set_config('test.uid', '22222222-0000-0000-0000-0000000018f2', false);
do $$
begin
  if not exists (select 1 from public.marketplace_open_requests() where id = 'SR-FIRM') then
    raise exception 'T2 FAIL: the verified lawyer lost the list';
  end if;
  raise notice 'T2 PASS: the verified lawyer still reads it';
end $$;

-- T3 a pending firm's owner and the client read nothing
select set_config('test.uid', '44444444-0000-0000-0000-0000000018f4', false);
do $$
begin
  if exists (select 1 from public.marketplace_open_requests()) then raise exception 'T3 FAIL: a pending firm reads the list'; end if;
  raise notice 'T3 PASS (a): a pending firm reads nothing';
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-0000000018f1', false);
do $$
begin
  if exists (select 1 from public.marketplace_open_requests()) then raise exception 'T3 FAIL: a client reads the list'; end if;
  raise notice 'T3 PASS (b): a client reads nothing';
end $$;
reset role;
