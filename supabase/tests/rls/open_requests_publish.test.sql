-- open_requests_publish.test.sql — proves 20261127_70 (owner ٢٣, batch l7).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The new
-- migration runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260815_marketplace_excludes_ai_workspace.sql \
--     $M/20261122_30_service_requests_open_view.sql \
--     $M/20261124_30_open_requests_city_summary.sql \
--     $T/prelude_open_requests_publish.sql \
--     $M/20261127_70_open_requests_publish.sql \
--     $M/20261127_70_open_requests_publish.sql \
--     $T/open_requests_publish.test.sql
--
-- l12 (20261202_70, Q130a): with 20261202_70 in the chain the market is OPEN by default and
-- lists new client requests without a publish. FULL CHAIN: append
-- $T/prelude_platform_settings_min.sql $M/20261202_70_market_open.sql before this
-- file. T2 then first proves the open market (the verified lawyer sees R's
-- unpublished client request, never the demo / test account's or the lawyer
-- row), and closes the market as an admin would before the publish-only
-- checks below — which are the same on both chains.
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261127_70
-- lines → "F0 FAIL" (no marketplace_published_at column).
--
-- People: R requester (client)  D demo client  X test-account client
--         V verified lawyer     P pending lawyer
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

do $$
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.service_requests'::regclass
                  and attname = 'marketplace_published_at' and not attisdropped) then
    raise exception 'F0 FAIL: service_requests.marketplace_published_at does not exist';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('11111111-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-00000000000c'),
  ('44444444-0000-0000-0000-00000000000d'),
  ('55555555-0000-0000-0000-00000000000e'),
  ('66666666-0000-0000-0000-00000000000f');
insert into public.profiles (id, user_type, display_name, is_demo) values
  ('11111111-0000-0000-0000-00000000000a', 'individual', 'R', false),
  ('22222222-0000-0000-0000-00000000000b', 'lawyer', 'V', false),
  ('33333333-0000-0000-0000-00000000000c', 'lawyer', 'P', false),
  ('44444444-0000-0000-0000-00000000000d', 'individual', 'D', true),
  ('55555555-0000-0000-0000-00000000000e', 'individual', 'X', false),
  ('66666666-0000-0000-0000-00000000000f', 'admin', 'S', false);
insert into public.test_accounts (user_id) values ('55555555-0000-0000-0000-00000000000e');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('22222222-0000-0000-0000-00000000000b', 'verified'),
  ('33333333-0000-0000-0000-00000000000c', 'pending');

insert into public.service_requests (id, requester_user_id, type, title, description, receiver, status, city, public_summary) values
  ('SR-AI',    '11111111-0000-0000-0000-00000000000a', 'service', 'محمد ٠٥٠٠', 'نص خاص', 'ai_workspace', 'pending_assignment', 'riyadh', 'استشارة: نزاع عمالي حول المستحقات'),
  ('SR-LAW',   '11111111-0000-0000-0000-00000000000a', 'service', 'طلب قديم', '', 'lawyer', 'pending_assignment', 'jeddah', 'خدمة: طلب قديم غير منشور'),
  ('SR-DEMO',  '44444444-0000-0000-0000-00000000000d', 'service', 'تجريبي', '', 'ai_workspace', 'pending_assignment', null, 'خدمة: طلب حساب تجريبي'),
  ('SR-TEST',  '55555555-0000-0000-0000-00000000000e', 'service', 'اختبار', '', 'ai_workspace', 'pending_assignment', null, 'خدمة: طلب حساب اختبار'),
  ('SR-TAKEN', '11111111-0000-0000-0000-00000000000a', 'service', 'موجّه', '', 'ai_workspace', 'pending_assignment', null, 'خدمة: طلب موجّه');

-- T1 a session insert cannot publish its own request (forced to NULL)
set role app_user;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
insert into public.service_requests (id, requester_user_id, type, title, receiver, status,
                                     marketplace_published_at, marketplace_published_by, marketplace_category)
values ('SR-SELF', '11111111-0000-0000-0000-00000000000a', 'service', 'نشر ذاتي', 'ai_workspace', 'pending_assignment',
        now(), '11111111-0000-0000-0000-00000000000a', 'case');
reset role;
do $$
declare r record;
begin
  select marketplace_published_at, marketplace_published_by, marketplace_category into r
    from public.service_requests where id = 'SR-SELF';
  if r.marketplace_published_at is not null or r.marketplace_published_by is not null or r.marketplace_category is not null then
    raise exception 'T1 FAIL: a session insert published itself: %', row_to_json(r);
  end if;
  raise notice 'T1 PASS: a session insert cannot publish';
end $$;

-- T2 (l12, market OPEN — only when 20261202_70 is in the chain) the verified
-- lawyer sees R's new client requests (SR-AI, T1's SR-SELF, SR-TAKEN) without a
-- publish; the demo, the test
-- account and the receiver = lawyer rows stay out. Then the admin closes the market.
do $$
declare
  ids  text[];
  open boolean;
begin
  -- dynamic: on the 20261127_70 chain there is no platform_settings table.
  if to_regclass('public.platform_settings') is null then
    return;
  end if;
  execute $q$select coalesce((select (value ->> 'open')::boolean from public.platform_settings where key = 'marketplace_market'), false)$q$ into open;
  if not open then
    return;
  end if;
  set local role app_user;
  perform set_config('test.uid', '22222222-0000-0000-0000-00000000000b', true);
  select array_agg(id order by id) into ids from public.marketplace_open_requests();
  reset role;
  if ids is distinct from array['SR-AI', 'SR-SELF', 'SR-TAKEN'] then
    raise exception 'T2 FAIL (l12 open market): listed %, expected {SR-AI,SR-SELF,SR-TAKEN}', ids;
  end if;
  execute $q$update public.platform_settings set value = jsonb_set(value, '{open}', 'false'::jsonb) where key = 'marketplace_market'$q$;
  raise notice 'T2 PASS (l12): the open market lists the client''s unpublished requests only; market closed for the publish-only checks';
end $$;

-- T2 nothing is listed before staff publish — not even a receiver = lawyer row
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T2 FAIL: % unpublished row(s) listed', n; end if;
  raise notice 'T2 PASS: unpublished rows (ai_workspace and lawyer) are not listed';
end $$;
reset role;

-- T3 the service role publishes; the verified lawyer sees type + city + summary + category
set role service_role;
update public.service_requests
   set marketplace_published_at = now(), marketplace_published_by = '66666666-0000-0000-0000-00000000000f',
       marketplace_category = 'consultation'
 where id in ('SR-AI', 'SR-DEMO', 'SR-TEST', 'SR-TAKEN');
update public.service_requests set assigned_to = '66666666-0000-0000-0000-00000000000f' where id = 'SR-TAKEN';
reset role;
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare
  r record;
  n int;
  cols text;
begin
  select string_agg(a.attname, ',' order by a.attnum) into cols
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
   where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure and a.mode = 't';
  if cols is distinct from 'id,type,receiver,city,public_summary,status,created_at,category' then
    raise exception 'T3 FAIL: unexpected output columns %', cols;
  end if;
  select count(*) into n from public.marketplace_open_requests();
  if n <> 1 then raise exception 'T3 FAIL: the verified lawyer lists % row(s), expected 1 (SR-AI)', n; end if;
  select * into r from public.marketplace_open_requests();
  if r.id <> 'SR-AI' or r.category <> 'consultation' or r.city <> 'riyadh' or r.public_summary is null then
    raise exception 'T3 FAIL: got %', row_to_json(r);
  end if;
  if row_to_json(r)::text like '%محمد%' or row_to_json(r)::text like '%نص خاص%' then
    raise exception 'T3 FAIL: the client''s own text leaked: %', row_to_json(r);
  end if;
  select count(*) into n from public.service_requests;
  if n <> 0 then raise exception 'T3 FAIL: the verified lawyer reads % table row(s)', n; end if;
  raise notice 'T3 PASS: published → listed with its category; demo, test-account and routed rows are not';
end $$;

-- T4 a pending lawyer and the client get nothing
select set_config('test.uid', '33333333-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T4 FAIL: a pending lawyer listed % row(s)', n; end if;
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T4 FAIL: a client listed % row(s)', n; end if;
  raise notice 'T4 PASS: a pending lawyer and a client list nothing';
end $$;

-- T5 a session update cannot unpublish / re-type (the old values are kept)
update public.service_requests set marketplace_published_at = null, marketplace_category = 'case' where id = 'SR-AI';
reset role;
do $$
declare r record;
begin
  select marketplace_published_at, marketplace_category into r from public.service_requests where id = 'SR-AI';
  if r.marketplace_published_at is null or r.marketplace_category <> 'consultation' then
    raise exception 'T5 FAIL: a session changed the publication: %', row_to_json(r);
  end if;
  raise notice 'T5 PASS: a session update keeps the publication';
end $$;

-- T6 the checks: an unknown type, and published without a type, are refused
do $$
begin
  begin
    update public.service_requests set marketplace_category = 'auction' where id = 'SR-AI';
    raise exception 'T6 FAIL: category auction accepted';
  exception when check_violation then null;
  end;
  begin
    update public.service_requests set marketplace_category = null where id = 'SR-AI';
    raise exception 'T6 FAIL: published with no category accepted';
  exception when check_violation then null;
  end;
  raise notice 'T6 PASS: three types only, and a published row has one';
end $$;

-- T7 claimed by staff (in_review) → off the list; unpublished by staff → off the list
update public.service_requests set status = 'in_review' where id = 'SR-AI';
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T7 FAIL: an in_review row is still listed'; end if;
end $$;
reset role;
update public.service_requests set status = 'pending_assignment' where id = 'SR-AI';
set role service_role;
update public.service_requests
   set marketplace_published_at = null, marketplace_published_by = null, marketplace_category = null
 where id = 'SR-AI';
reset role;
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T7 FAIL: an unpublished row is still listed'; end if;
  raise notice 'T7 PASS: claimed or withdrawn → no longer listed';
end $$;
reset role;

-- T8 privileges: anon cannot execute, authenticated can; one function only
do $$
begin
  if has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T8 FAIL: anon can execute marketplace_open_requests';
  end if;
  if not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
    raise exception 'T8 FAIL: authenticated cannot execute marketplace_open_requests';
  end if;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'marketplace_open_requests') <> 1 then
    raise exception 'T8 FAIL: more than one marketplace_open_requests';
  end if;
  raise notice 'T8 PASS: EXECUTE for authenticated only';
end $$;
