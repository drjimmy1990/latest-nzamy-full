-- RLS acceptance tests for 20260906_phase6_settings_out_of_browser.sql
-- Users: A (lawyer), B (another lawyer), ADM (admin). Non-superuser throughout.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-0000000000ad');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','B'),
  ('00000000-0000-0000-0000-0000000000ad','admin','ADM');
insert into public.research_sessions (id, user_id, title) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'جلسة بحث');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'قضية أ', 'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.attachments (request_id, owner_user_id, file_name, storage_path) values
  ('req-a', 'aaaaaaaa-0000-0000-0000-000000000001', 'ملف.pdf', 'aaaaaaaa-0000-0000-0000-000000000001/x.pdf');

select 'T0 smart_folders.is_pinned exists (expect 1): ' || count(*) from information_schema.columns
 where table_schema = 'library' and table_name = 'smart_folders' and column_name = 'is_pinned';
select 'T0 profile columns (expect 4): ' || count(*) from information_schema.columns
 where (table_name = 'profiles' and column_name in ('city','nationality'))
    or (table_name = 'lawyer_profiles' and column_name in ('license_issued_on','office_address'));
select 'T0 attachments bin columns (expect 5): ' || count(*) from information_schema.columns
 where table_name = 'attachments' and column_name in ('source','deleted_at','deleted_by','legal_hold','hold_reason');

set role app_user;

-- T1 article notes: owner only, one per page
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.law_article_notes (user_id, page_id, note_text, strokes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'law:labor:art-10', 'ملاحظة', '[{"x":1}]'::jsonb);
do $$ begin
  insert into public.law_article_notes (user_id, page_id, note_text) values ('aaaaaaaa-0000-0000-0000-000000000001', 'law:labor:art-10', 'مكرّر');
  raise notice 'T1 FAIL: two notes on one page';
exception when unique_violation then
  raise notice 'T1 PASS: one note row per page (23505)';
end $$;
do $$ begin
  insert into public.law_article_notes (user_id, page_id, strokes) values ('aaaaaaaa-0000-0000-0000-000000000001', 'law:x', '{"not":"array"}'::jsonb);
  raise notice 'T1 FAIL: strokes accepted a non-array';
exception when check_violation then
  raise notice 'T1 PASS: strokes must be an array (23514)';
end $$;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T1 B reads A''s notes (expect 0): ' || count(*) from public.law_article_notes;
do $$ begin
  insert into public.law_article_notes (user_id, page_id, note_text) values ('aaaaaaaa-0000-0000-0000-000000000001', 'law:y', 'تسلل');
  raise notice 'T1 FAIL: B wrote a note as A';
exception when insufficient_privilege then
  raise notice 'T1 PASS: notes are written only as yourself (42501)';
end $$;

-- T2 work sessions: owner only, sane spans
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.work_sessions (user_id, mode, started_at, ended_at, duration_min)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'focus', now() - interval '25 minutes', now(), 25);
do $$ begin
  insert into public.work_sessions (user_id, mode, started_at, ended_at, duration_min)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'focus', now(), now() - interval '1 hour', 25);
  raise notice 'T2 FAIL: a session ending before it started was accepted';
exception when check_violation then
  raise notice 'T2 PASS: ended_at >= started_at (23514)';
end $$;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T2 B reads A''s sessions (expect 0): ' || count(*) from public.work_sessions;

-- T3 research items accept the Collector's vocabulary and keep the title
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.research_items (session_id, content, item_type, title)
values ('11111111-0000-0000-0000-000000000001', 'نص المادة', 'precedent', 'سابقة قضائية');
select 'T3 precedent stored with its title (expect سابقة قضائية|f): ' || title || '|' || used
  from public.research_items where session_id = '11111111-0000-0000-0000-000000000001';
do $$ begin
  insert into public.research_items (session_id, content, item_type) values ('11111111-0000-0000-0000-000000000001', 'x', 'banana');
  raise notice 'T3 FAIL: unknown item_type accepted';
exception when check_violation then
  raise notice 'T3 PASS: item_type still checked (23514)';
end $$;

-- T4 feature requests: own read/insert; the admin reads and updates all
insert into public.feature_requests (user_id, title, description, category, priority)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'تصدير القضايا إلى Excel', 'وصف', 'export', 'normal');
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T4 B reads A''s request (expect 0): ' || count(*) from public.feature_requests;
with u as (update public.feature_requests set status = 'planned' returning 1)
select 'T4 B cannot triage (expect 0 rows): ' || count(*) from u;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
select 'T4 admin reads it (expect 1): ' || count(*) from public.feature_requests;
with u as (update public.feature_requests set status = 'planned' returning 1)
select 'T4 admin triages (expect 1): ' || count(*) from u;

-- T5 issue reports: same shape
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.library_issue_reports (user_id, law_slug, article_ref, kind, description)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'labor-law', 'م ١٠', 'typo', 'خطأ إملائي في الفقرة الثانية');
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T5 B reads A''s report (expect 0): ' || count(*) from public.library_issue_reports;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000ad', false);
select 'T5 admin reads it (expect 1): ' || count(*) from public.library_issue_reports;

-- T6 attachments: a legal hold blocks the soft delete
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
with u as (update public.attachments set legal_hold = true, hold_reason = 'نزاع قائم' where request_id = 'req-a' returning 1)
select 'T6 owner places a hold (expect 1): ' || count(*) from u;
do $$ begin
  update public.attachments set deleted_at = now(), deleted_by = 'aaaaaaaa-0000-0000-0000-000000000001' where request_id = 'req-a';
  raise notice 'T6 FAIL: a held document was soft-deleted';
exception when check_violation then
  raise notice 'T6 PASS: a legal hold blocks deletion (23514)';
end $$;
with u as (update public.attachments set legal_hold = false, hold_reason = null where request_id = 'req-a' returning 1),
     d as (select 1)
select 'T6 hold lifted (expect 1): ' || count(*) from u;
with u as (update public.attachments set deleted_at = now(), deleted_by = 'aaaaaaaa-0000-0000-0000-000000000001' where request_id = 'req-a' returning 1)
select 'T6 soft delete after the hold is lifted (expect 1): ' || count(*) from u;

reset role;
select 'policies notes=' || (select count(*) from pg_policies where tablename = 'law_article_notes')
    || ' sessions=' || (select count(*) from pg_policies where tablename = 'work_sessions')
    || ' requests=' || (select count(*) from pg_policies where tablename = 'feature_requests')
    || ' reports=' || (select count(*) from pg_policies where tablename = 'library_issue_reports')
    || ' (expect 1 1 3 3)';
