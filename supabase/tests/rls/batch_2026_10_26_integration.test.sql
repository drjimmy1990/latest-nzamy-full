-- batch_2026_10_26_integration.test.sql — the two halves of the 2026-10-26
-- batch working TOGETHER: path ownership (20261026_65 / 66, the dash track)
-- and account deletion (20261026_70 / 71, D6), joined by 20261026_72 (the
-- folder a file was written in).
--
-- WHAT IT PROVES
--   * 65's guard does not block 70: a firm owner's member removal (his
--     session) and a deleteUser run as GoTrue's supabase_auth_admin both move
--     a member's attachments to the firm owner — the moves run inside 70's
--     SECURITY DEFINER functions, where current_user is their owner
--     (postgres), which 65 trusts. No flag and no extra role in 65.
--   * the moved files stay SERVABLE: storage_path is still in the member's
--     folder, folder_owner_id (72) says so, and the routes' rule —
--     storage_path_in_folder(path, coalesce(folder_owner_id, owner)), the twin
--     of src/lib/storagePathOwnership.ts fileFolderOwner — holds for the firm
--     owner's documents, a document kept for the other party (owner null) and
--     a contract version whose uploader was deleted (uploaded_by null); 66's
--     can_share_attachment lets the firm owner share an inherited document.
--   * the removed member cannot get them back through 65's own-folder rule:
--     no re-registration of a firm file left in his folder (attachments or
--     contract_versions), his vault copy of a firm file moved with it, no
--     raw Storage read, delete or move of them (71's SELECT guard: a Storage
--     DELETE / UPDATE filters by name, so it only reaches rows SELECT shows);
--     his own files stay his.
--
-- ONE CHAIN — production order, every file run TWICE (65, 66, 72, 70, 71, then
-- again in the same order), then EVERY test of these files against the
-- result, each in its own rolled-back transaction (their fixtures share ids).
-- From the repo root (postgres:16; stubs.sql loads first by itself):
--   T=supabase/tests/rls; M=supabase/migrations; S=$(mktemp -d)
--   for t in account_deletion attachments_path_ownership document_shares_path_ownership batch_2026_10_26_integration; do
--     printf '\\set ON_ERROR_STOP 1\nbegin;\n'; cat "$T/$t.test.sql"; printf '\nrollback;\n'
--   done > "$S/all.test.sql"
--   bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20261019_21_consultant_court_write_guard.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $T/prelude_attachments_stray_insert_policies.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_32_case_tracking_links.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20260706_entitlement_requests.sql \
--     $T/prelude_storage_objects_stub.sql \
--     $T/prelude_document_shares_live.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $M/20261026_72_file_folder_owner.sql \
--     $M/20261026_70_account_deletion.sql \
--     supabase/storage_policies_documents.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $M/20261026_72_file_folder_owner.sql \
--     $M/20261026_70_account_deletion.sql \
--     supabase/storage_policies_documents.sql \
--     "$S/all.test.sql"
-- (storage_policies_documents.sql is the canonical copy of
-- SQL_batch_2026-10-26_owner_answers/71_AFTER_70_…; prod runs it as
-- supabase_admin, Docker as postgres. This file alone also runs as the last
-- argument of the same chain.)
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-26, exit 3):
--   NC1 — the chain without the two 20261026_72 lines (this file alone) →
--         "I0 FAIL: trg_01_…folder_owner is missing or not second on
--         public.attachments ({trg_00_attachments_session_guard,
--         trg_attachments_archive_stamp})".
--   NC2 — NC1 with I0 and I1 removed and the routes' rule as merged
--         (storage_path_in_folder(path, owner_user_id), no folder_owner_id) →
--         "I2 FAIL: the firm owner's inherited document 2001 is not servable":
--         the conflict 72 resolves — 65 lets the move through, the routes
--         then refuse the moved file.
--   NC3 — 20261026_70 without the vault-copy step → "I2 FAIL: the removed
--         member's vault copy of the firm document stayed his".
--
-- People:
--   FO  owner of firm F (managing partner by the 20260903_phase2 trigger)
--   MA  lawyer, member of F — REMOVED by FO in FO's session (I2)
--   MB  lawyer, member of F — his account DELETED as supabase_auth_admin (I5)
--   CL  a client of F (case-a), not a member — his account deleted (I6)
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- GoTrue's auth.users has an email column (the stub does not); GoTrue deletes
-- as supabase_auth_admin with no SET ROLE.
alter table auth.users add column if not exists email text;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin login;
  end if;
end $$;
grant usage on schema auth to supabase_auth_admin;
grant select, delete on auth.users to supabase_auth_admin;

insert into auth.users (id) values
  ('f0000000-0000-0000-0000-0000000000f0'), ('a1000000-0000-0000-0000-0000000000a1'),
  ('b1000000-0000-0000-0000-0000000000b1'), ('c1000000-0000-0000-0000-0000000000c1');
insert into public.profiles (id, user_type, display_name, email) values
  ('f0000000-0000-0000-0000-0000000000f0', 'firm',       'FO صاحب المكتب', 'fo@example.test'),
  ('a1000000-0000-0000-0000-0000000000a1', 'lawyer',     'MA محامٍ',       'ma@example.test'),
  ('b1000000-0000-0000-0000-0000000000b1', 'lawyer',     'MB محامٍ',       'mb@example.test'),
  ('c1000000-0000-0000-0000-0000000000c1', 'individual', 'CL موكل',        'cl@example.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('f1000000-0000-0000-0000-0000000000f1', 'f0000000-0000-0000-0000-0000000000f0', 'مكتب التكامل');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('f1000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-0000000000a1', 'lawyer', 'active', now()),
  ('f1000000-0000-0000-0000-0000000000f1', 'b1000000-0000-0000-0000-0000000000b1', 'lawyer', 'active', now());

insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-ia', 'c1000000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-0000000000a1', 'قضية CL عند MA', 'f1000000-0000-0000-0000-0000000000f1'),
  ('case-ib', 'b1000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-0000000000b1', 'قضية MB في المكتب', 'f1000000-0000-0000-0000-0000000000f1');

-- Fixtures written as postgres (a trusted writer: 72 stamps folder_owner_id).
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
  (2001, 'case-ia', 'a1000000-0000-0000-0000-0000000000a1', 'مذكرة.pdf',  'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf'),
  (2003, null,      'a1000000-0000-0000-0000-0000000000a1', 'شخصي.pdf',   'a1000000-0000-0000-0000-0000000000a1/2-personal.pdf'),
  (2004, 'case-ia', 'c1000000-0000-0000-0000-0000000000c1', 'هوية.pdf',   'c1000000-0000-0000-0000-0000000000c1/1-id.pdf'),
  (2005, 'case-ib', 'b1000000-0000-0000-0000-0000000000b1', 'لائحة.pdf',  'b1000000-0000-0000-0000-0000000000b1/1-brief.pdf');
insert into public.contracts (id, client_user_id, owner_user_id, firm_id, title) values
  ('ct-ia', 'c1000000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-0000000000a1', 'f1000000-0000-0000-0000-0000000000f1', 'عقد المكتب عند MA'),
  ('ct-ib', 'c1000000-0000-0000-0000-0000000000c1', 'b1000000-0000-0000-0000-0000000000b1', 'f1000000-0000-0000-0000-0000000000f1', 'عقد المكتب عند MB');
insert into public.contracts (id, client_user_id, owner_user_id, title) values
  ('ct-ma', 'c1000000-0000-0000-0000-0000000000c1', 'a1000000-0000-0000-0000-0000000000a1', 'عقد MA الشخصي');
insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by) values
  ('ct-ia', 1, 'v1.pdf', 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf', 'a1000000-0000-0000-0000-0000000000a1'),
  ('ct-ib', 1, 'v1.pdf', 'b1000000-0000-0000-0000-0000000000b1/contracts/ct-ib/1-v1.pdf', 'b1000000-0000-0000-0000-0000000000b1');
insert into storage.objects (bucket_id, name) values
  ('documents', 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf'),
  ('documents', 'a1000000-0000-0000-0000-0000000000a1/2-personal.pdf'),
  ('documents', 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf'),
  ('documents', 'b1000000-0000-0000-0000-0000000000b1/1-brief.pdf'),
  ('documents', 'b1000000-0000-0000-0000-0000000000b1/9-personal.pdf'),
  ('documents', 'b1000000-0000-0000-0000-0000000000b1/contracts/ct-ib/1-v1.pdf'),
  ('documents', 'c1000000-0000-0000-0000-0000000000c1/1-id.pdf');

-- ── I0 the joined schema ─────────────────────────────────────────────────────
do $$
declare t text; names text[]; rec record;
begin
  foreach t in array array['public.attachments', 'public.contract_versions'] loop
    select array_agg(tg.tgname::text order by tg.tgname) into names
      from pg_trigger tg
     where tg.tgrelid = t::regclass and not tg.tgisinternal and (tg.tgtype & 2) = 2 and tg.tgenabled <> 'D';
    if names[1] not like 'trg_00_%session_guard' then
      raise exception 'I0 FAIL: 65''s guard is not the first BEFORE trigger on % (%)', t, names;
    end if;
    if names[2] is distinct from (case t when 'public.attachments' then 'trg_01_attachments_folder_owner'
                                          else 'trg_01_contract_versions_folder_owner' end) then
      raise exception 'I0 FAIL: trg_01_…folder_owner is missing or not second on % (%)', t, names;
    end if;
  end loop;
  for rec in select p.oid::regprocedure::text as f, pg_get_userbyid(p.proowner) as o
               from pg_proc p
              where p.oid in ('public.transfer_firm_assets(uuid, uuid, text, boolean)'::regprocedure,
                              'public.account_keep_rules(uuid, text)'::regprocedure) loop
    if rec.o not in ('postgres', 'supabase_admin') then
      raise exception 'I0 FAIL: % is owned by % — 65 would refuse its moves', rec.f, rec.o;
    end if;
  end loop;
  if position('folder_owner_id' in (select prosrc from pg_proc where oid = 'public.can_share_attachment(text, text)'::regprocedure)) = 0 then
    raise exception 'I0 FAIL: can_share_attachment (66) was not replaced by 72';
  end if;
  if (select count(*) from public.attachments where id between 2001 and 2005
       and folder_owner_id is distinct from owner_user_id) <> 0 then
    raise exception 'I0 FAIL: a trusted insert was not stamped with its owner''s folder';
  end if;
  raise notice 'I0 PASS: 65''s guard first, 72''s folder trigger second on both tables; 70''s movers owned by postgres; 66''s share check replaced; trusted inserts stamped';
end $$;

-- ── I1 MA, still a member, keeps a vault copy of his own case document ──────
set role authenticated;
select set_config('test.uid', 'a1000000-0000-0000-0000-0000000000a1', false);
-- he even names another folder owner: a session cannot choose it
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path, folder_owner_id) values
  (2002, null, 'a1000000-0000-0000-0000-0000000000a1', 'نسخة.pdf', 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf',
   'f0000000-0000-0000-0000-0000000000f0');
do $$
begin
  if (select folder_owner_id from public.attachments where id = 2002) is distinct from 'a1000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'I1 FAIL: a session chose the folder owner of its row';
  end if;
  raise notice 'I1 PASS: a member may keep a vault row on his own file; the folder is his, whatever he sends';
end $$;

-- ── I2 FO removes MA in FO's own session ─────────────────────────────────────
select set_config('test.uid', 'f0000000-0000-0000-0000-0000000000f0', false);
update public.firm_members set status = 'removed'
 where user_id = 'a1000000-0000-0000-0000-0000000000a1' and firm_id = 'f1000000-0000-0000-0000-0000000000f1';
reset role;
do $$
declare a record;
begin
  if (select status from public.firm_members where user_id = 'a1000000-0000-0000-0000-0000000000a1') <> 'removed' then
    raise exception 'I2 FAIL: the removal did not commit';
  end if;
  select * into a from public.attachments where id = 2001;
  if a.owner_user_id is distinct from 'f0000000-0000-0000-0000-0000000000f0'::uuid then
    raise exception 'I2 FAIL: 65 kept the firm document 2001 with the removed member (owner %)', a.owner_user_id;
  end if;
  if a.storage_path <> 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf' then
    raise exception 'I2 FAIL: the move changed the path';
  end if;
  if not public.storage_path_in_folder(a.storage_path, coalesce(a.folder_owner_id, a.owner_user_id)) then
    raise exception 'I2 FAIL: the firm owner''s inherited document 2001 is not servable (folder_owner_id %)', a.folder_owner_id;
  end if;
  if (select owner_user_id from public.attachments where id = 2002) is distinct from 'f0000000-0000-0000-0000-0000000000f0'::uuid then
    raise exception 'I2 FAIL: the removed member''s vault copy of the firm document stayed his';
  end if;
  if (select owner_user_id from public.attachments where id = 2003) is distinct from 'a1000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'I2 FAIL: the removed member''s personal vault document moved';
  end if;
  if (select owner_user_id from public.contracts where id = 'ct-ia') is distinct from 'f0000000-0000-0000-0000-0000000000f0'::uuid then
    raise exception 'I2 FAIL: the firm contract stayed with the removed member';
  end if;
  if (select count(*) from public.firm_asset_transfers
       where from_user_id = 'a1000000-0000-0000-0000-0000000000a1' and table_name = 'attachments'
         and row_id in ('2001', '2002') and reason = 'member_removed') <> 2 then
    raise exception 'I2 FAIL: the trail does not record both moved attachments';
  end if;
  raise notice 'I2 PASS: the owner''s session removal moved the firm document and the member''s vault copy of it to the owner through 65''s guard; the path is unchanged and still servable; the personal document stayed';
end $$;

-- ── I3 the removed member cannot take the firm's files back ─────────────────
set role authenticated;
select set_config('test.uid', 'a1000000-0000-0000-0000-0000000000a1', false);
do $$
declare n int;
begin
  begin
    insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
      (2010, null, 'a1000000-0000-0000-0000-0000000000a1', 'استرجاع.pdf', 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf');
    raise exception 'I3 FAIL: the removed member re-registered the firm document left in his folder';
  exception when insufficient_privilege then
    if sqlerrm not like '%belongs to another account%' then raise; end if;
  end;
  begin
    insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by) values
      ('ct-ma', 1, 'x.pdf', 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf', 'a1000000-0000-0000-0000-0000000000a1');
    raise exception 'I3 FAIL: the removed member registered the firm contract version as one of his own contract';
  exception when insufficient_privilege then
    if sqlerrm not like '%belongs to another account%' then raise; end if;
  end;
  begin
    update public.attachments set folder_owner_id = 'f0000000-0000-0000-0000-0000000000f0' where id = 2003;
    raise exception 'I3 FAIL: a session changed the folder of its document';
  exception when insufficient_privilege then
    if sqlerrm not like '%folder is fixed%' then raise; end if;
  end;
  -- a new file of his own is fine
  insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
    (2011, null, 'a1000000-0000-0000-0000-0000000000a1', 'جديد.pdf', 'a1000000-0000-0000-0000-0000000000a1/3-new.pdf');
  -- raw Storage: no read of the firm files, his own still his
  select count(*) into n from storage.objects where bucket_id = 'documents'
     and name in ('a1000000-0000-0000-0000-0000000000a1/1-memo.pdf', 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf');
  if n <> 0 then raise exception 'I3 FAIL: the removed member still reads the firm files in his folder (%)', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'documents' and name = 'a1000000-0000-0000-0000-0000000000a1/2-personal.pdf';
  if n <> 1 then raise exception 'I3 FAIL: the removed member lost the read of his own file'; end if;
  -- raw Storage: no delete / move of a firm contract version (not a case
  -- document, so 51's guard does not cover it): the WHERE reaches only rows
  -- 71's SELECT policy shows
  delete from storage.objects where bucket_id = 'documents' and name = 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf';
  update storage.objects set name = 'a1000000-0000-0000-0000-0000000000a1/stolen.pdf'
   where bucket_id = 'documents' and name = 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf';
  -- …while his own file is still his to delete
  delete from storage.objects where bucket_id = 'documents' and name = 'a1000000-0000-0000-0000-0000000000a1/2-personal.pdf';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'I3 FAIL: the removed member cannot delete his own file'; end if;
  -- and he cannot share what is no longer his
  if public.can_share_attachment('2001', 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf') then
    raise exception 'I3 FAIL: the removed member may still share the firm document';
  end if;
end $$;
reset role;
do $$
begin
  if not exists (select 1 from storage.objects where name = 'a1000000-0000-0000-0000-0000000000a1/contracts/ct-ia/1-v1.pdf') then
    raise exception 'I3 FAIL: the removed member deleted the firm contract version left in his folder';
  end if;
  raise notice 'I3 PASS: the removed member cannot re-register, read, delete, move or share the firm files left in his folder (65 + 71 + 72); his own files stay his';
end $$;

-- ── I4 the firm owner shares an inherited document ──────────────────────────
set role authenticated;
select set_config('test.uid', 'f0000000-0000-0000-0000-0000000000f0', false);
do $$
begin
  if not public.can_share_attachment('2001', 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf') then
    raise exception 'I4 FAIL: 66 refuses the firm owner a share of the document he inherited';
  end if;
end $$;
insert into public.document_shares (owner_id, document_id, document_path, title, token_hash) values
  ('f0000000-0000-0000-0000-0000000000f0', '2001', 'a1000000-0000-0000-0000-0000000000a1/1-memo.pdf', 'مذكرة', 'hash-i4');
reset role;
do $$
begin
  if not exists (select 1 from public.document_shares where token_hash = 'hash-i4') then
    raise exception 'I4 FAIL: the share was not written';
  end if;
  raise notice 'I4 PASS: the firm owner shares a document inherited from a member''s folder (66 through 72)';
end $$;

-- ── I5 MB's account is deleted the way GoTrue does it ───────────────────────
set role service_role;
do $$
declare r jsonb;
begin
  r := public.account_purge_prepare('b1000000-0000-0000-0000-0000000000b1');
  if not coalesce((r->>'ok')::boolean, false) then raise exception 'I5 FAIL: prepare refused MB: %', r; end if;
end $$;
reset role;
set session authorization supabase_auth_admin;
delete from auth.users where id = 'b1000000-0000-0000-0000-0000000000b1';
reset session authorization;
do $$
declare a record; v record; paths text[];
begin
  if exists (select 1 from auth.users where id = 'b1000000-0000-0000-0000-0000000000b1') then
    raise exception 'I5 FAIL: MB was not deleted (ACCOUNT_DELETE_FIRM_ASSETS_LEFT?)';
  end if;
  select * into a from public.attachments where id = 2005;
  if a.owner_user_id is distinct from 'f0000000-0000-0000-0000-0000000000f0'::uuid then
    raise exception 'I5 FAIL: the deleted member''s case document did not move to the firm owner (%)', a.owner_user_id;
  end if;
  if not public.storage_path_in_folder(a.storage_path, coalesce(a.folder_owner_id, a.owner_user_id)) then
    raise exception 'I5 FAIL: the deleted member''s case document is not servable';
  end if;
  select * into v from public.contract_versions where contract_id = 'ct-ib';
  if v.uploaded_by is not null then
    raise exception 'I5 FAIL: expected uploaded_by null after the uploader''s account went';
  end if;
  if not public.storage_path_in_folder(v.storage_path, coalesce(v.folder_owner_id, v.uploaded_by)) then
    raise exception 'I5 FAIL: the firm contract version of a deleted uploader is not servable';
  end if;
  if (select count(*) from public.firm_asset_transfers where from_user_id = 'b1000000-0000-0000-0000-0000000000b1'
       and table_name = 'attachments' and row_id = '2005' and reason = 'account_deleted') <> 1 then
    raise exception 'I5 FAIL: the trail does not record the move of 2005';
  end if;
  paths := public.account_purge_storage_paths('b1000000-0000-0000-0000-0000000000b1');
  if paths is distinct from array['b1000000-0000-0000-0000-0000000000b1/9-personal.pdf'] then
    raise exception 'I5 FAIL: the purge would remove %, expected only the personal file', paths;
  end if;
  raise notice 'I5 PASS: a deleteUser as supabase_auth_admin passes 65 (70''s definer moves), moves the case document to the firm owner, keeps it and the contract version servable from the deleted member''s folder; the purge lists only his personal file';
end $$;

-- ── I6 the client's account is deleted: his document is kept for the firm ───
set session authorization supabase_auth_admin;
delete from auth.users where id = 'c1000000-0000-0000-0000-0000000000c1';
reset session authorization;
do $$
declare a record;
begin
  select * into a from public.attachments where id = 2004;
  if not found then raise exception 'I6 FAIL: the client''s document on the firm case went with him'; end if;
  if a.owner_user_id is not null then raise exception 'I6 FAIL: expected owner null (kept for the other party)'; end if;
  if not public.storage_path_in_folder(a.storage_path, coalesce(a.folder_owner_id, a.owner_user_id)) then
    raise exception 'I6 FAIL: the document kept for the firm is not servable';
  end if;
  raise notice 'I6 PASS: a deleted client''s document on a firm case is kept with owner null and stays servable from his folder';
end $$;

-- ── I7 the folder is never a trusted writer's free choice either ────────────
do $$
begin
  insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
    (2099, null, 'f0000000-0000-0000-0000-0000000000f0', 'مزوّر.pdf', 'a1000000-0000-0000-0000-0000000000a1/3-new.pdf');
  if (select folder_owner_id from public.attachments where id = 2099) is not null then
    raise exception 'I7 FAIL: a row outside its owner''s folder got a folder owner';
  end if;
  if (select public.storage_path_in_folder(storage_path, coalesce(folder_owner_id, owner_user_id)) from public.attachments where id = 2099) then
    raise exception 'I7 FAIL: a row outside its owner''s folder is servable';
  end if;
  begin
    update public.attachments set folder_owner_id = 'f0000000-0000-0000-0000-0000000000f0' where id = 2003;
    raise exception 'I7 FAIL: a folder owner that is not the path''s was accepted';
  exception when check_violation then null;
  end;
  raise notice 'I7 PASS: a row outside its owner''s folder stays unserved; no writer can record a folder the path is not in';
end $$;
