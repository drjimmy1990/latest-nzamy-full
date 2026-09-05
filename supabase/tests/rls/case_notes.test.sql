-- RLS acceptance tests for 20260910_case_notes.sql
-- Run after 20260903_phase2 (adds service_requests.firm_id + can_access_case_row
-- + the firm_members auto-membership trigger this file's fixtures rely on) —
-- run.sh accepts several migrations, in order, before the test file:
--
--   supabase/tests/rls/run.sh \
--     supabase/migrations/20260903_phase2_clients_and_firm_membership.sql \
--     supabase/migrations/20260910_case_notes.sql \
--     supabase/tests/rls/case_notes.test.sql
--
-- Users: A (solo lawyer), B (another solo lawyer, unrelated to A or firm F),
-- O (owner of firm F — becomes an active member automatically, per
-- ensure_firm_owner_membership), C (lawyer, active member of F).
-- Non-superuser role throughout.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (bypasses RLS on purpose) ──────────────────────────
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000000f');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','B'),
  ('cccccccc-0000-0000-0000-000000000003','lawyer','C'),
  ('00000000-0000-0000-0000-00000000000f','firm','O');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','مكتب الاختبار');
-- O is now an active member of F automatically (ensure_firm_owner_membership).
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','lawyer','active', now());

-- Three cases: A's own (no firm), B's own (unrelated), and one C filed for firm F.
insert into public.service_requests (id, requester_user_id, title, firm_id) values
  ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'قضية أ', null),
  ('req-b', 'bbbbbbbb-0000-0000-0000-000000000002', 'قضية ب', null),
  ('req-firm', 'cccccccc-0000-0000-0000-000000000003', 'قضية المكتب', 'ffffffff-0000-0000-0000-0000000000f1');

select 'T0 owner auto-membership (expect 1): ' || count(*)
  from public.firm_members
 where firm_id = 'ffffffff-0000-0000-0000-0000000000f1'
   and user_id = '00000000-0000-0000-0000-00000000000f'
   and role = 'managing_partner' and status = 'active';

set role app_user;

-- T1 author sees own: A notes their own solo case
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.case_notes (request_id, author_user_id, body, visibility)
values ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'الموكل طلب تأجيل الجلسة', 'private');
select 'T1 A sees own note (expect 1): ' || count(*) from public.case_notes where request_id = 'req-a';

-- T2 another lawyer cannot: B is not a participant, not firm, not admin
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T2 B sees A''s private note (expect 0): ' || count(*) from public.case_notes where request_id = 'req-a';

-- T3 firm member sees firm-visible only: C notes the firm case twice
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
values ('req-firm', 'cccccccc-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', 'خاص بي فقط', 'private');
insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility)
values ('req-firm', 'cccccccc-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-0000000000f1', 'ملاحظة للمكتب كله', 'firm');
select 'T3 C (author) sees both own notes (expect 2): ' || count(*) from public.case_notes where request_id = 'req-firm';
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T3 O (firm colleague) sees only the firm-visible note (expect 1): ' || count(*) from public.case_notes where request_id = 'req-firm';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T3 outsider B sees firm case notes (expect 0): ' || count(*) from public.case_notes where request_id = 'req-firm';

-- T4 insert on a request the caller cannot read fails: B is not a participant
-- of req-a and not in any firm that owns it.
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  insert into public.case_notes (request_id, author_user_id, body)
  values ('req-a', 'bbbbbbbb-0000-0000-0000-000000000002', 'تسلّل');
  raise notice 'T4 FAIL: B noted a case they cannot read';
exception when insufficient_privilege then
  raise notice 'T4 PASS: insert on an unreadable case refused (42501)';
end $$;

-- T4b same, forging the author too — belt and suspenders: `author_user_id =
-- auth.uid()` alone already refuses this without reaching the case check.
do $$ begin
  insert into public.case_notes (request_id, author_user_id, body)
  values ('req-b', 'aaaaaaaa-0000-0000-0000-000000000001', 'منتحل');
  raise notice 'T4b FAIL: B inserted a note authored as A';
exception when insufficient_privilege then
  raise notice 'T4b PASS: forged author_user_id refused (42501)';
end $$;

-- T5 body constraints: blank refused, oversized refused
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$ begin
  insert into public.case_notes (request_id, author_user_id, body) values ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', '   ');
  raise notice 'T5 FAIL: a blank note was accepted';
exception when check_violation then
  raise notice 'T5 PASS: blank body refused (23514)';
end $$;
do $$ begin
  insert into public.case_notes (request_id, author_user_id, body)
  values ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', repeat('x', 8001));
  raise notice 'T5 FAIL: a note over 8000 chars was accepted';
exception when check_violation then
  raise notice 'T5 PASS: body over 8000 chars refused (23514)';
end $$;
do $$ begin
  insert into public.case_notes (request_id, author_user_id, body, visibility)
  values ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'public');
  raise notice 'T5 FAIL: an unknown visibility was accepted';
exception when check_violation then
  raise notice 'T5 PASS: visibility outside private/firm refused (23514)';
end $$;

-- T6 update/delete: author only
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
with u as (update public.case_notes set body = 'تم تعديلها' where request_id = 'req-a' and author_user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select 'T6 A edits own note (expect 1 row): ' || count(*) from u;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
with u as (update public.case_notes set body = 'تخريب' where request_id = 'req-a' returning 1)
select 'T6 B cannot edit A''s note (expect 0 rows): ' || count(*) from u;
with d as (delete from public.case_notes where request_id = 'req-a' returning 1)
select 'T6 B cannot delete A''s note (expect 0 rows): ' || count(*) from d;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
with d as (delete from public.case_notes where request_id = 'req-a' returning 1)
select 'T6 A deletes own note (expect 1 row): ' || count(*) from d;

-- T7 suspending C's firm membership cuts the firm-visible read immediately
reset role;
update public.firm_members set status = 'suspended' where user_id = 'cccccccc-0000-0000-0000-000000000003';
set role app_user;
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
select 'T7 suspended C still sees own notes (expect 2): ' || count(*) from public.case_notes where request_id = 'req-firm';
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T7 O still sees the firm-visible note (owner keeps access, expect 1): ' || count(*) from public.case_notes where request_id = 'req-firm';

reset role;
select 'policies case_notes=' || (select count(*) from pg_policies where tablename = 'case_notes') || ' (expect 4)';
select 'service_requests firm_id column (expect 1): ' || count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id';
