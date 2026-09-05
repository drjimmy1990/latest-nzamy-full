-- RLS acceptance tests for 20260911_community_reports.sql
-- Users: A (reports), B (another user, tries to read/report), ADM (admin).
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000ad');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','user','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','user','B'),
  ('00000000-0000-0000-0000-0000000000ad','admin','ADM');

select 'T0 community_reports columns (expect 10): ' || count(*) from information_schema.columns
 where table_schema = 'public' and table_name = 'community_reports';

set role app_user;

-- T1 A reports a post; the row belongs to A
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.community_reports (target_type, target_id, reporter_user_id, reason, details)
values ('post', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'spam', 'محتوى مكرر عدة مرات');
select 'T1 A reads own report (expect 1): ' || count(*) from public.community_reports;

-- T1b a second report of the SAME target by the SAME user is rejected (23505)
do $$ begin
  insert into public.community_reports (target_type, target_id, reporter_user_id, reason)
  values ('post', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'abuse');
  raise notice 'T1b FAIL: a duplicate report on the same target by the same user was accepted';
exception when unique_violation then
  raise notice 'T1b PASS: one report per (target, reporter) — 23505';
end $$;

-- T1c an invalid reason is rejected (23514)
do $$ begin
  insert into public.community_reports (target_type, target_id, reporter_user_id, reason)
  values ('post', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'not_a_real_reason');
  raise notice 'T1c FAIL: an unknown reason was accepted';
exception when check_violation then
  raise notice 'T1c PASS: reason is still checked (23514)';
end $$;

-- T1d an invalid target_type is rejected (23514)
do $$ begin
  insert into public.community_reports (target_type, target_id, reporter_user_id, reason)
  values ('comment', '22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'spam');
  raise notice 'T1d FAIL: an unknown target_type was accepted';
exception when check_violation then
  raise notice 'T1d PASS: target_type is still checked (23514)';
end $$;

-- T1e details over 1000 chars is rejected (23514)
do $$ begin
  insert into public.community_reports (target_type, target_id, reporter_user_id, reason, details)
  values ('post', '33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'other', repeat('x', 1001));
  raise notice 'T1e FAIL: details over 1000 chars was accepted';
exception when check_violation then
  raise notice 'T1e PASS: details length is still checked (23514)';
end $$;

-- T2 B cannot read A's report, and cannot report AS A (insert forged reporter_user_id)
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T2 B reads A''s report (expect 0): ' || count(*) from public.community_reports;
do $$ begin
  insert into public.community_reports (target_type, target_id, reporter_user_id, reason)
  values ('post', '44444444-4444-4444-4444-444444444444', 'aaaaaaaa-0000-0000-0000-000000000001', 'spam');
  raise notice 'T2 FAIL: B reported as A';
exception when insufficient_privilege then
  raise notice 'T2 PASS: reports are written only as yourself (42501)';
end $$;

-- T2b B CAN report a different target under their own id (different reporter, no conflict)
insert into public.community_reports (target_type, target_id, reporter_user_id, reason)
values ('post', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'misleading');
select 'T2b B reports the same target A reported (expect 1 own row): ' || count(*)
  from public.community_reports where reporter_user_id = 'bbbbbbbb-0000-0000-0000-000000000002';

-- T3 B cannot update any report's status (admin-only UPDATE policy)
with u as (update public.community_reports set status = 'dismissed' where reporter_user_id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1)
select 'T3 B cannot triage own report (expect 0 rows): ' || count(*) from u;

-- T4 admin reads everything and can triage
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
select 'T4 admin reads all reports (expect 2): ' || count(*) from public.community_reports;
with u as (
  update public.community_reports
  set status = 'actioned', reviewed_by = '00000000-0000-0000-0000-0000000000ad', reviewed_at = now()
  where target_id = '11111111-1111-1111-1111-111111111111' and reporter_user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning 1
)
select 'T4 admin triages A''s report (expect 1): ' || count(*) from u;

-- T5 the same reporter CAN report an answer target with the same uuid a post
-- target used — uniqueness is scoped by target_type too, not just target_id.
-- Still role A here, so RLS caps the read at A's own rows (not B's).
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.community_reports (target_type, target_id, reporter_user_id, reason)
values ('answer', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'off_platform_contact');
select 'T5 A now has a post report AND an answer report on the same uuid (expect 2 own rows): ' || count(*)
  from public.community_reports;

reset role;
select 'policies=' || (select count(*) from pg_policies where tablename = 'community_reports') || ' (expect 3)';
