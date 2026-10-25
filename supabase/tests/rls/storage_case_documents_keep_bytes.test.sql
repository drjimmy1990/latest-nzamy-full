-- storage_case_documents_keep_bytes.test.sql — proves the narrowed
-- "documents delete own" / "documents update own" storage policies
-- (supabase/storage_policies_documents.sql, after 20261025_51): the uploader
-- can no longer delete or overwrite the FILE of a case document through the
-- Storage API, while his personal vault files and loose uploads stay his.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $T/prelude_storage_objects_stub.sql \
--     supabase/storage_policies_documents.sql \
--     $T/storage_case_documents_keep_bytes.test.sql
-- NEGATIVE CONTROL (must FAIL; recorded 2026-10-25): put
--   supabase/storage_policies_documents.sql BEFORE 20261025_51 (or use the
--   pre-N3.9 file) → the policies are built without the guard and T0 fails:
--   "T0 FAIL: 0 of the 2 storage policies carry the case-document guard".
-- People: S uploader (filer of case-a) · X another user.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('22222222-0000-0000-0000-000000000002'), ('99999999-0000-0000-0000-000000000009');
insert into public.profiles (id, user_type, display_name) values
  ('22222222-0000-0000-0000-000000000002', 'lawyer', 'S'),
  ('99999999-0000-0000-0000-000000000009', 'lawyer', 'X');
insert into public.service_requests (id, requester_user_id, assigned_to, title) values
  ('case-a', '22222222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'قضية');
insert into storage.objects (bucket_id, name) values
  ('documents', '22222222-0000-0000-0000-000000000002/case.pdf'),
  ('documents', '22222222-0000-0000-0000-000000000002/case-archived.pdf'),
  ('documents', '22222222-0000-0000-0000-000000000002/vault.pdf'),
  ('documents', '22222222-0000-0000-0000-000000000002/loose.pdf');
insert into public.attachments (request_id, owner_user_id, file_name, storage_path, deleted_at) values
  ('case-a', '22222222-0000-0000-0000-000000000002', 'case.pdf',  '22222222-0000-0000-0000-000000000002/case.pdf', null),
  ('case-a', '22222222-0000-0000-0000-000000000002', 'case-archived.pdf', '22222222-0000-0000-0000-000000000002/case-archived.pdf', now()),
  (null,     '22222222-0000-0000-0000-000000000002', 'vault.pdf', '22222222-0000-0000-0000-000000000002/vault.pdf', null);

-- T0: the policies were built with the guard, and _verify's shape test still
-- classifies them as owner-only.
do $$
declare n int;
begin
  select count(*) into n from pg_policy
   where polrelid = 'storage.objects'::regclass
     and polname in ('documents delete own', 'documents update own')
     and pg_get_expr(polqual, polrelid) ~ 'storage_object_is_case_document';
  if n <> 2 then raise exception 'T0 FAIL: % of the 2 storage policies carry the case-document guard', n; end if;
  raise notice 'T0 PASS: "documents delete own" / "documents update own" carry the case-document guard';
end $$;

set role authenticated;
select set_config('test.uid', '22222222-0000-0000-0000-000000000002', false);

-- T1: the uploader cannot delete or overwrite a case document's file — live or archived.
do $$
declare n int;
begin
  delete from storage.objects where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/case.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1 FAIL: the uploader deleted a case document''s file'; end if;
  delete from storage.objects where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/case-archived.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1 FAIL: the uploader deleted an ARCHIVED case document''s file'; end if;
  update storage.objects set name = '22222222-0000-0000-0000-000000000002/moved.pdf'
   where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/case.pdf';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1 FAIL: the uploader moved (Storage "move") a case document''s file'; end if;
  raise notice 'T1 PASS: a case document''s file is neither deleted nor moved by its uploader';
end $$;

-- T2: his vault file and a loose upload (an aborted upload's rollback) stay deletable.
do $$
declare n int;
begin
  delete from storage.objects where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/vault.pdf';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2 FAIL: the owner can no longer delete his vault file'; end if;
  delete from storage.objects where bucket_id = 'documents' and name = '22222222-0000-0000-0000-000000000002/loose.pdf';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2 FAIL: an upload rollback (no attachments row) can no longer remove its object'; end if;
  raise notice 'T2 PASS: vault files and loose uploads stay the owner''s to delete';
end $$;

-- T3: another user still cannot touch S's folder at all.
select set_config('test.uid', '99999999-0000-0000-0000-000000000009', false);
do $$
declare n int;
begin
  delete from storage.objects where bucket_id = 'documents';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T3 FAIL: another user deleted % object(s) of S', n; end if;
  raise notice 'T3 PASS: another user deletes nothing';
end $$;
reset role;

-- T4: the files are all still there.
do $$
declare n int;
begin
  select count(*) into n from storage.objects
   where name in ('22222222-0000-0000-0000-000000000002/case.pdf', '22222222-0000-0000-0000-000000000002/case-archived.pdf');
  if n <> 2 then raise exception 'T4 FAIL: % of the 2 case files survive', n; end if;
  raise notice 'T4 PASS: both case files survive';
end $$;

\echo 'storage_case_documents_keep_bytes.test.sql: ALL PASS'
