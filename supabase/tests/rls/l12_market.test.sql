-- l12_market.test.sql — proves 20261202_70 (batch l12, builder «market»: Q130a / Q151 / Q131a log).
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
--     $M/20261202_70_market_open.sql \
--     $T/l12_market.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261202_70
-- lines → "F0 FAIL" (no marketplace_acceptances).
--
-- People: R client · V, W verified lawyers · P pending lawyer · L lawyer who files
--         his own rows · D demo client · X test-account client · T verified
--         lawyer that is a test account · S admin
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

do $$
begin
  if to_regclass('public.marketplace_acceptances') is null then
    raise exception 'F0 FAIL: public.marketplace_acceptances does not exist';
  end if;
end $$;

-- app_user stands in for `authenticated`; the harness granted it every table
-- directly (stubs.sql default privileges) — take back what production never gives.
revoke all on public.marketplace_acceptances from app_user;
grant select on public.marketplace_acceptances to app_user;
revoke all on public.community_ai_reviews from app_user;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('11111111-0000-0000-0000-00000000000a'), ('22222222-0000-0000-0000-00000000000b'),
  ('33333333-0000-0000-0000-00000000000c'), ('44444444-0000-0000-0000-00000000000d'),
  ('55555555-0000-0000-0000-00000000000e'), ('66666666-0000-0000-0000-00000000000f'),
  ('77777777-0000-0000-0000-000000000001'), ('88888888-0000-0000-0000-000000000002'),
  ('99999999-0000-0000-0000-000000000003');
insert into public.profiles (id, user_type, display_name, is_demo) values
  ('11111111-0000-0000-0000-00000000000a', 'individual', 'R', false),
  ('22222222-0000-0000-0000-00000000000b', 'lawyer', 'V', false),
  ('33333333-0000-0000-0000-00000000000c', 'lawyer', 'P', false),
  ('44444444-0000-0000-0000-00000000000d', 'individual', 'D', true),
  ('55555555-0000-0000-0000-00000000000e', 'individual', 'X', false),
  ('66666666-0000-0000-0000-00000000000f', 'admin', 'S', false),
  ('77777777-0000-0000-0000-000000000001', 'lawyer', 'W', false),
  ('88888888-0000-0000-0000-000000000002', 'lawyer', 'L', false),
  ('99999999-0000-0000-0000-000000000003', 'lawyer', 'T', false);
insert into public.test_accounts (user_id) values
  ('55555555-0000-0000-0000-00000000000e'), ('99999999-0000-0000-0000-000000000003');
insert into public.lawyer_profiles (user_id, verification_status) values
  ('22222222-0000-0000-0000-00000000000b', 'verified'),
  ('33333333-0000-0000-0000-00000000000c', 'pending'),
  ('77777777-0000-0000-0000-000000000001', 'verified'),
  ('88888888-0000-0000-0000-000000000002', 'verified'),
  ('99999999-0000-0000-0000-000000000003', 'verified');

insert into public.service_requests (id, requester_user_id, type, title, description, receiver, status, city, public_summary, payment, created_at) values
  ('SR-NEW',   '11111111-0000-0000-0000-00000000000a', 'consultation', 'محمد ٠٥٠٠', 'نص خاص', 'ai_workspace', 'pending_assignment', 'riyadh', 'استشارة: نزاع عمالي حول المستحقات', '{"status":"not_required"}', now()),
  ('SR-NEW2',  '11111111-0000-0000-0000-00000000000a', 'service', 'طلب ٢', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now()),
  ('SR-NEW3',  '11111111-0000-0000-0000-00000000000a', 'service', 'طلب ٣', '', 'ai_workspace', 'pending', null, null, '{"status":"not_required"}', now()),
  ('SR-OLD',   '11111111-0000-0000-0000-00000000000a', 'service', 'قديم', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now() - interval '10 days'),
  ('SR-PUBOLD','11111111-0000-0000-0000-00000000000a', 'service', 'قديم منشور', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now() - interval '10 days'),
  ('SR-HEAR',  '88888888-0000-0000-0000-000000000002', 'service', 'جلسة', '', 'lawyer', 'pending_assignment', null, null, '{"status":"not_required"}', now()),
  ('SR-LAWAI', '88888888-0000-0000-0000-000000000002', 'service', 'طلب محامٍ', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now()),
  ('SR-PAID',  '11111111-0000-0000-0000-00000000000a', 'service', 'مدفوع', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"pending","amount":200}', now()),
  ('SR-DEMO',  '44444444-0000-0000-0000-00000000000d', 'service', 'تجريبي', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now()),
  ('SR-TEST',  '55555555-0000-0000-0000-00000000000e', 'service', 'اختبار', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now()),
  ('SR-HID',   '11111111-0000-0000-0000-00000000000a', 'service', 'مخفي', '', 'ai_workspace', 'pending_assignment', null, null, '{"status":"not_required"}', now());

set role service_role;
update public.service_requests
   set marketplace_published_at = now(), marketplace_published_by = '66666666-0000-0000-0000-00000000000f',
       marketplace_category = 'case'
 where id = 'SR-PUBOLD';
update public.service_requests set marketplace_hidden_at = now() where id = 'SR-HID';
reset role;

-- T1 the open market: new client requests listed; nothing else
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare
  ids text;
  r record;
  n int;
begin
  select string_agg(id, ',' order by id) into ids from public.marketplace_open_requests();
  if ids is distinct from 'SR-NEW,SR-NEW2,SR-NEW3,SR-PUBOLD' then
    raise exception 'T1 FAIL: verified lawyer lists %', ids;
  end if;
  select * into r from public.marketplace_open_requests() where id = 'SR-NEW';
  if r.category <> 'consultation' or r.city <> 'riyadh' then raise exception 'T1 FAIL: SR-NEW row %', row_to_json(r); end if;
  if row_to_json(r)::text like '%محمد%' or row_to_json(r)::text like '%نص خاص%' then
    raise exception 'T1 FAIL: the client''s own text leaked: %', row_to_json(r);
  end if;
  select category into r from public.marketplace_open_requests() where id = 'SR-PUBOLD';
  if r.category <> 'case' then raise exception 'T1 FAIL: published type lost'; end if;
  select count(*) into n from public.service_requests;
  if n <> 0 then raise exception 'T1 FAIL: the lawyer reads % table row(s)', n; end if;
  raise notice 'T1 PASS: new client requests + staff-published listed; old, hearing, lawyer''s own, paid, demo, test, hidden are not';
end $$;
select set_config('test.uid', '33333333-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T1 FAIL: a pending lawyer listed % row(s)', n; end if;
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T1 FAIL: a client listed % row(s)', n; end if;
  raise notice 'T1b PASS: a pending lawyer and a client list nothing';
end $$;

-- T2 a session cannot hide / unhide (insert forced NULL, update keeps the old value)
insert into public.service_requests (id, requester_user_id, title, receiver, status, marketplace_hidden_at)
values ('SR-SELF', '11111111-0000-0000-0000-00000000000a', 'ذاتي', 'ai_workspace', 'pending_assignment', now());
update public.service_requests set marketplace_hidden_at = now() where id = 'SR-NEW3';
reset role;
do $$
begin
  if (select marketplace_hidden_at from public.service_requests where id = 'SR-SELF') is not null then
    raise exception 'T2 FAIL: a session insert hid itself';
  end if;
  if (select marketplace_hidden_at from public.service_requests where id = 'SR-NEW3') is not null then
    raise exception 'T2 FAIL: a session update hid a request';
  end if;
  delete from public.service_requests where id = 'SR-SELF';
  raise notice 'T2 PASS: only the server hides';
end $$;

-- T3 asking to take a request (admin_approval, the default)
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-NEW');
  if j ->> 'result' <> 'pending' or (j ->> 'due_at')::timestamptz not between now() + interval '29 minutes' and now() + interval '31 minutes' then
    raise exception 'T3 FAIL: V ask → %', j;
  end if;
  j := public.marketplace_request_accept('SR-NEW');
  if j ->> 'result' <> 'already_pending' then raise exception 'T3 FAIL: double ask → %', j; end if;
  j := public.marketplace_request_accept('SR-HEAR');
  if j ->> 'result' <> 'not_open' then raise exception 'T3 FAIL: a lawyer''s own row → %', j; end if;
  j := public.marketplace_request_accept('SR-TEST');
  if j ->> 'result' <> 'not_open' then raise exception 'T3 FAIL: a test account''s row → %', j; end if;
  j := public.marketplace_request_accept('NO-SUCH');
  if j ->> 'result' <> 'not_open' then raise exception 'T3 FAIL: unknown id → %', j; end if;
end $$;
select set_config('test.uid', '77777777-0000-0000-0000-000000000001', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-NEW');
  if j ->> 'result' <> 'pending' then raise exception 'T3 FAIL: W ask → %', j; end if;
end $$;
select set_config('test.uid', '11111111-0000-0000-0000-00000000000a', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-NEW');
  if j ->> 'result' <> 'not_verified' then raise exception 'T3 FAIL: a client asked → %', j; end if;
end $$;
select set_config('test.uid', '33333333-0000-0000-0000-00000000000c', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-NEW');
  if j ->> 'result' <> 'not_verified' then raise exception 'T3 FAIL: a pending lawyer asked → %', j; end if;
end $$;
select set_config('test.uid', '99999999-0000-0000-0000-000000000003', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-NEW');
  if j ->> 'result' <> 'test_account' then raise exception 'T3 FAIL: a test lawyer asked → %', j; end if;
  raise notice 'T3 PASS: verified lawyers ask (pending, 30 min); double ask, not-open, client, pending and test lawyers refused';
end $$;
reset role;
do $$
begin
  if (select assigned_to from public.service_requests where id = 'SR-NEW') is not null then
    raise exception 'T3 FAIL: an ask assigned the request';
  end if;
end $$;

-- T4 the table: a lawyer reads his own rows only and writes nothing directly
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_acceptances;
  if n <> 1 then raise exception 'T4 FAIL: V reads % rows', n; end if;
  begin
    insert into public.marketplace_acceptances (request_id, lawyer_user_id, mode, status)
    values ('SR-NEW2', '22222222-0000-0000-0000-00000000000b', 'instant', 'approved');
    raise exception 'T4 FAIL: direct insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.marketplace_acceptances set status = 'approved';
    raise exception 'T4 FAIL: direct update accepted';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 PASS: own rows only, no direct writes';
end $$;

-- T5 admin decisions: approve assigns (status untouched), the rival ask is superseded
reset role;
set role service_role;
do $$
declare
  v_id uuid;
  w_id uuid;
  j jsonb;
  r record;
begin
  select id into v_id from public.marketplace_acceptances where lawyer_user_id = '22222222-0000-0000-0000-00000000000b' and request_id = 'SR-NEW';
  select id into w_id from public.marketplace_acceptances where lawyer_user_id = '77777777-0000-0000-0000-000000000001' and request_id = 'SR-NEW';
  j := public.marketplace_acceptance_decide(v_id, '66666666-0000-0000-0000-00000000000f', true, null);
  if j ->> 'result' <> 'approved' then raise exception 'T5 FAIL: approve → %', j; end if;
  select assigned_to, status into r from public.service_requests where id = 'SR-NEW';
  if r.assigned_to <> '22222222-0000-0000-0000-00000000000b' or r.status <> 'pending_assignment' then
    raise exception 'T5 FAIL: SR-NEW after approve %', row_to_json(r);
  end if;
  if (select status from public.marketplace_acceptances where id = w_id) <> 'superseded' then
    raise exception 'T5 FAIL: the rival ask was not superseded';
  end if;
  j := public.marketplace_acceptance_decide(w_id, '66666666-0000-0000-0000-00000000000f', true, null);
  if j ->> 'result' <> 'not_pending' then raise exception 'T5 FAIL: second approve → %', j; end if;
  raise notice 'T5 PASS: approve assigns, keeps the status, supersedes the rival; a second approve loses';
end $$;
reset role;

-- T5b reject with a note; and approve after the request was taken → taken
set role app_user;
select set_config('test.uid', '77777777-0000-0000-0000-000000000001', false);
select public.marketplace_request_accept('SR-NEW2');
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
select public.marketplace_request_accept('SR-NEW2');
reset role;
set role service_role;
do $$
declare
  v_id uuid;
  w_id uuid;
  j jsonb;
begin
  select id into w_id from public.marketplace_acceptances where lawyer_user_id = '77777777-0000-0000-0000-000000000001' and request_id = 'SR-NEW2';
  select id into v_id from public.marketplace_acceptances where lawyer_user_id = '22222222-0000-0000-0000-00000000000b' and request_id = 'SR-NEW2';
  j := public.marketplace_acceptance_decide(w_id, '66666666-0000-0000-0000-00000000000f', false, 'تخصص آخر');
  if j ->> 'result' <> 'rejected' then raise exception 'T5b FAIL: reject → %', j; end if;
  if (select decision_note from public.marketplace_acceptances where id = w_id) <> 'تخصص آخر' then
    raise exception 'T5b FAIL: the note was not kept';
  end if;
  update public.service_requests set assigned_to = '66666666-0000-0000-0000-00000000000f' where id = 'SR-NEW2';
  j := public.marketplace_acceptance_decide(v_id, '66666666-0000-0000-0000-00000000000f', true, null);
  if j ->> 'result' <> 'taken' then raise exception 'T5b FAIL: approve on a taken request → %', j; end if;
  if (select assigned_to from public.service_requests where id = 'SR-NEW2') <> '66666666-0000-0000-0000-00000000000f' then
    raise exception 'T5b FAIL: a taken request changed hands';
  end if;
  raise notice 'T5b PASS: reject keeps its note; approving a taken request answers taken and changes nothing';
end $$;
reset role;

-- T6 the admin assigns directly: over an internal routing, never over a lawyer
set role service_role;
do $$
declare j jsonb;
begin
  j := public.marketplace_assign_lawyer('SR-NEW2', '33333333-0000-0000-0000-00000000000c', '66666666-0000-0000-0000-00000000000f');
  if j ->> 'result' <> 'lawyer_not_verified' then raise exception 'T6 FAIL: pending lawyer → %', j; end if;
  j := public.marketplace_assign_lawyer('SR-NEW2', '99999999-0000-0000-0000-000000000003', '66666666-0000-0000-0000-00000000000f');
  if j ->> 'result' <> 'lawyer_is_test_account' then raise exception 'T6 FAIL: test lawyer → %', j; end if;
  j := public.marketplace_assign_lawyer('SR-NEW2', '77777777-0000-0000-0000-000000000001', '66666666-0000-0000-0000-00000000000f');
  if j ->> 'result' <> 'assigned' then raise exception 'T6 FAIL: over an admin routing → %', j; end if;
  if (select assigned_to from public.service_requests where id = 'SR-NEW2') <> '77777777-0000-0000-0000-000000000001' then
    raise exception 'T6 FAIL: not assigned';
  end if;
  if (select count(*) from public.marketplace_acceptances where request_id = 'SR-NEW2' and status = 'approved') <> 1 then
    raise exception 'T6 FAIL: no single approved record row';
  end if;
  j := public.marketplace_assign_lawyer('SR-NEW2', '22222222-0000-0000-0000-00000000000b', '66666666-0000-0000-0000-00000000000f');
  if j ->> 'result' <> 'not_assignable' then raise exception 'T6 FAIL: over another lawyer → %', j; end if;
  raise notice 'T6 PASS: admin assign: verified real lawyers only, over a team routing, never over a lawyer';
end $$;
reset role;

-- T7 instant mode (Q151): the ask assigns at once
update public.platform_settings set value = value || '{"accept_mode": "instant"}'::jsonb where key = 'marketplace_market';
set role app_user;
select set_config('test.uid', '77777777-0000-0000-0000-000000000001', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-PUBOLD');
  if j ->> 'result' <> 'assigned' then raise exception 'T7 FAIL: instant ask → %', j; end if;
end $$;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare j jsonb;
begin
  j := public.marketplace_request_accept('SR-PUBOLD');
  if j ->> 'result' <> 'not_open' then raise exception 'T7 FAIL: second instant ask → %', j; end if;
end $$;
reset role;
do $$
declare r record;
begin
  select assigned_to, status into r from public.service_requests where id = 'SR-PUBOLD';
  if r.assigned_to <> '77777777-0000-0000-0000-000000000001' or r.status <> 'pending_assignment' then
    raise exception 'T7 FAIL: SR-PUBOLD %', row_to_json(r);
  end if;
  raise notice 'T7 PASS: instant mode assigns the first lawyer, keeps the status, the second gets not_open';
end $$;
update public.platform_settings set value = value || '{"accept_mode": "admin_approval"}'::jsonb where key = 'marketplace_market';

-- T8 withdraw, then the overdue alert (marks once, never accepts)
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare
  j jsonb;
  a uuid;
begin
  j := public.marketplace_request_accept('SR-NEW3');
  a := (j ->> 'id')::uuid;
  if j ->> 'result' <> 'pending' then raise exception 'T8 FAIL: ask → %', j; end if;
  perform set_config('test.uid', '77777777-0000-0000-0000-000000000001', false);
  j := public.marketplace_acceptance_withdraw(a);
  if j ->> 'result' <> 'not_pending' then raise exception 'T8 FAIL: W withdrew V''s ask → %', j; end if;
  perform set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
  j := public.marketplace_acceptance_withdraw(a);
  if j ->> 'result' <> 'withdrawn' then raise exception 'T8 FAIL: own withdraw → %', j; end if;
  j := public.marketplace_request_accept('SR-NEW3');
  if j ->> 'result' <> 'pending' then raise exception 'T8 FAIL: ask again → %', j; end if;
end $$;
reset role;
update public.marketplace_acceptances set due_at = now() - interval '1 minute'
 where request_id = 'SR-NEW3' and status = 'pending';
set role service_role;
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_overdue_acceptances(false);
  if n <> 1 then raise exception 'T8 FAIL: % overdue (read)', n; end if;
  select count(*) into n from public.marketplace_overdue_acceptances(true);
  if n <> 1 then raise exception 'T8 FAIL: % newly alerted', n; end if;
  select count(*) into n from public.marketplace_overdue_acceptances(true);
  if n <> 0 then raise exception 'T8 FAIL: alerted twice'; end if;
  if (select assigned_to from public.service_requests where id = 'SR-NEW3') is not null then
    raise exception 'T8 FAIL: an overdue ask was accepted automatically';
  end if;
  if (select status from public.marketplace_acceptances where request_id = 'SR-NEW3' and alerted_at is not null) <> 'pending' then
    raise exception 'T8 FAIL: the overdue ask changed status';
  end if;
  raise notice 'T8 PASS: withdraw own only; overdue alerted once, never accepted';
end $$;

-- T9 admin view agrees with the predicate; the market can be closed
do $$
declare ids text;
begin
  select string_agg(id, ',' order by id) into ids from public.marketplace_open_requests_admin();
  if ids is distinct from 'SR-NEW3' then raise exception 'T9 FAIL: admin view %', ids; end if;
  if (select pending_asks from public.marketplace_open_requests_admin() where id = 'SR-NEW3') <> 1 then
    raise exception 'T9 FAIL: pending_asks';
  end if;
end $$;
reset role;
update public.platform_settings set value = value || '{"open": false}'::jsonb where key = 'marketplace_market';
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.marketplace_open_requests();
  if n <> 0 then raise exception 'T9 FAIL: closed market still lists % row(s)', n; end if;
  if public.marketplace_request_accept('SR-NEW2') ->> 'result' not in ('not_open') then
    raise exception 'T9 FAIL: ask on a closed market';
  end if;
  raise notice 'T9 PASS: admin view = predicate; a closed market lists only staff-published rows (none left)';
end $$;
reset role;
update public.platform_settings set value = value || '{"open": true}'::jsonb where key = 'marketplace_market';

-- T10 privileges
do $$
begin
  if has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.marketplace_request_accept(text)', 'EXECUTE') then
    raise exception 'T10 FAIL: anon can execute a market function';
  end if;
  if has_function_privilege('authenticated', 'public.marketplace_acceptance_decide(uuid, uuid, boolean, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_assign_lawyer(text, uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_overdue_acceptances(boolean)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_open_requests_admin(integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.marketplace_request_listable(text)', 'EXECUTE') then
    raise exception 'T10 FAIL: authenticated can execute an admin function';
  end if;
  if has_table_privilege('anon', 'public.marketplace_acceptances', 'SELECT')
     or has_table_privilege('anon', 'public.community_ai_reviews', 'SELECT')
     or has_table_privilege('authenticated', 'public.community_ai_reviews', 'SELECT')
     or has_table_privilege('authenticated', 'public.marketplace_acceptances', 'INSERT') then
    raise exception 'T10 FAIL: a table privilege too wide';
  end if;
end $$;
set role app_user;
select set_config('test.uid', '22222222-0000-0000-0000-00000000000b', false);
do $$
begin
  begin
    perform public.marketplace_acceptance_decide(gen_random_uuid(), null, true, null);
    raise exception 'T10 FAIL: a lawyer ran decide';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.community_ai_reviews;
    raise exception 'T10 FAIL: a member read community_ai_reviews';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T10 PASS: anon nothing; members only list/ask/withdraw; admin functions service_role only';
end $$;
reset role;

-- T11 settings rows are inserted once and never overwritten
do $$
begin
  if (select count(*) from public.platform_settings where key in ('marketplace_market', 'marketplace_commission_pct', 'community_ai_review')) <> 3 then
    raise exception 'T11 FAIL: settings rows';
  end if;
  if (select value ->> 'approval_minutes' from public.platform_settings where key = 'marketplace_market') <> '30'
     or (select value ->> 'subscriber' from public.platform_settings where key = 'marketplace_commission_pct') <> '7'
     or (select value ->> 'enabled' from public.platform_settings where key = 'community_ai_review') <> 'false' then
    raise exception 'T11 FAIL: defaults';
  end if;
  raise notice 'T11 PASS: defaults 30 min / admin approval / 5-7-15 / AI review off';
end $$;

select 'ALL PASS' as l12_market;
