-- attachments_path_ownership.test.sql — proves 20261026_65 (security review
-- 2026-10-26, finding 1): a session can no longer register, or re-point, an
-- attachments / contract_versions row at a file outside its own folder, nor
-- attach a file to a request it is not on — the rows the service-role
-- download routes then sign.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent). From the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $T/prelude_attachments_stray_insert_policies.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $T/attachments_path_ownership.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-26):
--   NC1 — the chain without the two 20261026_65 lines → "T0 FAIL: 3 INSERT
--         policies on attachments (the stray ones survived?)".
--   NC2 — NC1 with the T0 block removed → "T1 FAIL: a client registered the
--         victim's file on his own request" (the hole as it is on production).
--
-- People:
--   C  a client, filer of req-c (assigned to L)
--   L  a lawyer, assignee of req-c, owner of contract ct1
--   V  the victim, another client, filer of req-v, a vault file V/1-secret.pdf
--   X  a stranger
-- Every assertion RAISES on failure. Sessions run as role `authenticated`.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('c0000000-0000-0000-0000-00000000000c'), ('10000000-0000-0000-0000-00000000001a'),
  ('70000000-0000-0000-0000-00000000007a'), ('80000000-0000-0000-0000-00000000008a');
insert into public.profiles (id, user_type, display_name) values
  ('c0000000-0000-0000-0000-00000000000c', 'individual', 'C موكل'),
  ('10000000-0000-0000-0000-00000000001a', 'lawyer',     'L محامٍ'),
  ('70000000-0000-0000-0000-00000000007a', 'individual', 'V الضحية'),
  ('80000000-0000-0000-0000-00000000008a', 'individual', 'X غريب');
insert into public.service_requests (id, requester_user_id, assigned_to, title) values
  ('req-c', 'c0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000001a', 'طلب C'),
  ('req-v', '70000000-0000-0000-0000-00000000007a', null, 'طلب V');
-- Fixtures written as postgres.
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path) values
  (900, null,    '70000000-0000-0000-0000-00000000007a', 'سري.pdf',  '70000000-0000-0000-0000-00000000007a/1-secret.pdf'),
  (901, null,    'c0000000-0000-0000-0000-00000000000c', 'خزنتي.pdf', 'c0000000-0000-0000-0000-00000000000c/1-mine.pdf'),
  (902, 'req-c', 'c0000000-0000-0000-0000-00000000000c', 'قضيتي.pdf', 'c0000000-0000-0000-0000-00000000000c/2-case.pdf');
insert into public.contracts (id, owner_user_id, title) values
  ('ct1', '10000000-0000-0000-0000-00000000001a', 'عقد L');

-- ── T0 the policy set ────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from pg_policy where polrelid = 'public.attachments'::regclass and polcmd = 'a';
  if n <> 1 then raise exception 'T0 FAIL: % INSERT policies on attachments (the stray ones survived?)', n; end if;
  if exists (select 1 from pg_policy where polrelid = 'public.attachments'::regclass
              and polname in ('participants create attachments', 'users insert own attachments', 'attachments_insert_policy')) then
    raise exception 'T0 FAIL: an old INSERT policy is still there';
  end if;
  raise notice 'T0 PASS: exactly one INSERT policy on attachments — the 20260518 / 20260616 ones are gone';
end $$;

set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);

-- ── T1 the attack: the victim's path on the attacker's own request ──────────
do $$
begin
  begin
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values ('req-c', 'c0000000-0000-0000-0000-00000000000c', 'x.pdf', '70000000-0000-0000-0000-00000000007a/1-secret.pdf');
    raise exception 'T1 FAIL: a client registered the victim''s file on his own request';
  exception when insufficient_privilege then null;
  end;
  begin  -- the vault variant
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values (null, 'c0000000-0000-0000-0000-00000000000c', 'x.pdf', '70000000-0000-0000-0000-00000000007a/1-secret.pdf');
    raise exception 'T1 FAIL: a client registered the victim''s file in his vault';
  exception when insufficient_privilege then null;
  end;
  begin  -- the 20260518 policy's shape: the victim named as owner
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values ('req-c', '70000000-0000-0000-0000-00000000007a', 'x.pdf', '70000000-0000-0000-0000-00000000007a/1-secret.pdf');
    raise exception 'T1 FAIL: a client registered a row in the victim''s name';
  exception when insufficient_privilege then null;
  end;
  begin  -- traversal out of his own folder
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values ('req-c', 'c0000000-0000-0000-0000-00000000000c', 'x.pdf',
            'c0000000-0000-0000-0000-00000000000c/../70000000-0000-0000-0000-00000000007a/1-secret.pdf');
    raise exception 'T1 FAIL: a ../ path got through';
  exception when insufficient_privilege then null;
  end;
  begin  -- the folder itself, no file
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values (null, 'c0000000-0000-0000-0000-00000000000c', 'x.pdf', 'c0000000-0000-0000-0000-00000000000c');
    raise exception 'T1 FAIL: a bare folder name got through';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T1 PASS: a foreign path, a foreign owner, a ../ path and a bare folder are all refused (42501)';
end $$;

-- ── T2 the participant check ─────────────────────────────────────────────────
do $$
begin
  begin  -- C plants his own file into V's request
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values ('req-v', 'c0000000-0000-0000-0000-00000000000c', 'x.pdf', 'c0000000-0000-0000-0000-00000000000c/9-plant.pdf');
    raise exception 'T2 FAIL: a client attached a file to a request he is not on';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: no file into a request the caller did not file and is not assigned to';
end $$;
select set_config('test.uid', '80000000-0000-0000-0000-00000000008a', false);
do $$
begin
  begin
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values ('req-c', '80000000-0000-0000-0000-00000000008a', 'x.pdf', '80000000-0000-0000-0000-00000000008a/1-x.pdf');
    raise exception 'T2b FAIL: a stranger who knows the request id attached a file to it';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2b PASS: a stranger knowing the request id cannot attach to it';
end $$;

-- ── T3 the legitimate uploads still work ─────────────────────────────────────
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
  values (null, 'c0000000-0000-0000-0000-00000000000c', 'خزنة.pdf', 'c0000000-0000-0000-0000-00000000000c/1730000000000-vault.pdf');
  insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
  values ('req-c', 'c0000000-0000-0000-0000-00000000000c', 'صحيفة.pdf', 'c0000000-0000-0000-0000-00000000000c/1730000000001-claim.pdf');
  select count(*) into n from public.attachments where owner_user_id = 'c0000000-0000-0000-0000-00000000000c';
  if n <> 4 then raise exception 'T3 FAIL: the client''s own uploads: % rows, expected 4', n; end if;
  raise notice 'T3 PASS: the client uploads into his vault and into his own request (POST /api/v1/documents shape)';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
begin
  -- the deliverable: the LAWYER's folder, the client's request
  insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
  values ('req-c', '10000000-0000-0000-0000-00000000001a', 'مذكرة.pdf', '10000000-0000-0000-0000-00000000001a/1730000000002-memo.pdf');
  -- a contract version: <uid>/contracts/<id>/<ms>-<name>
  insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by)
  values ('ct1', 1, 'عقد.pdf', '10000000-0000-0000-0000-00000000001a/contracts/ct1/1730000000003-contract.pdf',
          '10000000-0000-0000-0000-00000000001a');
  raise notice 'T3b PASS: the assigned lawyer uploads into the client''s request from his own folder; a contract version registers';
end $$;

-- ── T4 contract versions: the same rule ──────────────────────────────────────
do $$
begin
  begin
    insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by)
    values ('ct1', 2, 'x.pdf', '70000000-0000-0000-0000-00000000007a/1-secret.pdf', '10000000-0000-0000-0000-00000000001a');
    raise exception 'T4 FAIL: a contract version pointed at the victim''s file';
  exception when insufficient_privilege then null;
  end;
  begin  -- uploaded_by null was allowed by the 20260905 policy
    insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by)
    values ('ct1', 2, 'x.pdf', '10000000-0000-0000-0000-00000000001a/contracts/ct1/2-x.pdf', null);
    raise exception 'T4 FAIL: a contract version without an uploader registered';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by)
    values ('ct1', 2, 'x.pdf', '70000000-0000-0000-0000-00000000007a/contracts/ct1/2-x.pdf', '70000000-0000-0000-0000-00000000007a');
    raise exception 'T4 FAIL: a contract version in the victim''s name registered';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 PASS: a contract version is only the uploader''s own file, in his own name';
end $$;

-- ── T5 no rewrite after insert ───────────────────────────────────────────────
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin  -- his vault document re-pointed at the victim's file
    update public.attachments set storage_path = '70000000-0000-0000-0000-00000000007a/1-secret.pdf' where id = 901;
    raise exception 'T5 FAIL: the owner re-pointed his vault document at the victim''s file';
  exception when insufficient_privilege then null;
  end;
  begin  -- the owner handed to someone else
    update public.attachments set owner_user_id = '70000000-0000-0000-0000-00000000007a' where id = 901;
    raise exception 'T5 FAIL: the owner rewrote owner_user_id';
  exception when insufficient_privilege then null;
  end;
  begin  -- his vault document moved into the victim's case
    update public.attachments set request_id = 'req-v' where id = 901;
    raise exception 'T5 FAIL: a vault document was moved into another person''s request';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T5 PASS: storage_path, owner_user_id and request_id are fixed for the owner';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
begin
  begin  -- a participant (the "attachments owner update" policy) takes the client's document over
    update public.attachments set owner_user_id = '10000000-0000-0000-0000-00000000001a' where id = 902;
    raise exception 'T5b FAIL: a participant rewrote owner_user_id';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T5b PASS: a participant cannot take a document over';
end $$;

-- ── T6 the app's own updates still work ──────────────────────────────────────
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare ok boolean; n int;
begin
  update public.attachments set legal_hold = true, hold_reason = 'نزاع' where id = 901;
  update public.attachments set legal_hold = false, hold_reason = null where id = 901;
  update public.attachments set deleted_at = now(), deleted_by = 'c0000000-0000-0000-0000-00000000000c' where id = 902;
  select count(*) into n from public.attachments where id = 902 and deleted_at is not null;
  if n <> 1 then raise exception 'T6 FAIL: the soft delete did not land'; end if;
  -- restore_case_document is SECURITY DEFINER (runs as postgres) — passes the guard
  select public.restore_case_document(902) into ok;
  if not ok then raise exception 'T6 FAIL: restore_case_document refused the uploader'; end if;
  update public.attachments set deleted_at = now() where id = 901;
  update public.attachments set deleted_at = null, deleted_by = null where id = 901;
  raise notice 'T6 PASS: legal hold, soft delete, restore (route and DEFINER function) all still work';
end $$;

-- ── T7 anon is refused ───────────────────────────────────────────────────────
reset role;
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  begin
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values (null, null, 'x.pdf', '70000000-0000-0000-0000-00000000007a/1-secret.pdf');
    raise exception 'T7 FAIL: a guest registered a row';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T7 PASS: a guest cannot register a row';
end $$;
reset role;

-- ── T8 the trigger holds even if a wide-open policy comes back ───────────────
create policy "test wide open insert" on public.attachments for insert with check (true);
create policy "test wide open update" on public.attachments for update using (true) with check (true);
create policy "test wide open cv insert" on public.contract_versions for insert with check (true);
create policy "test wide open cv update" on public.contract_versions for update using (true) with check (true);
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    insert into public.attachments (request_id, owner_user_id, file_name, storage_path)
    values ('req-v', 'c0000000-0000-0000-0000-00000000000c', 'x.pdf', '70000000-0000-0000-0000-00000000007a/1-secret.pdf');
    raise exception 'T8 FAIL: an open INSERT policy let the forged row in';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set storage_path = '70000000-0000-0000-0000-00000000007a/1-secret.pdf' where id = 901;
    raise exception 'T8 FAIL: an open UPDATE policy let a row be re-pointed at the victim''s file';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T8 PASS: with a wide-open policy beside it the attachments guard still refuses';
end $$;
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
begin
  begin
    update public.contract_versions set storage_path = '70000000-0000-0000-0000-00000000007a/1-secret.pdf' where contract_id = 'ct1';
    raise exception 'T8b FAIL: a contract version was re-pointed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.contract_versions set uploaded_by = '70000000-0000-0000-0000-00000000007a' where contract_id = 'ct1';
    raise exception 'T8b FAIL: a contract version''s uploader was rewritten';
  exception when insufficient_privilege then null;
  end;
  update public.contract_versions set notes = 'ملاحظة' where contract_id = 'ct1';
  raise notice 'T8b PASS: contract versions: file and uploader fixed, other columns still writable under a policy';
end $$;
reset role;
drop policy "test wide open insert" on public.attachments;
drop policy "test wide open update" on public.attachments;
drop policy "test wide open cv insert" on public.contract_versions;
drop policy "test wide open cv update" on public.contract_versions;

-- ── T9 the service role is not guarded ───────────────────────────────────────
set role service_role;
do $$
begin
  -- documents/[id]/copy writes with the service role; the order bind moves request_id null → id
  insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path)
  values (950, null, 'c0000000-0000-0000-0000-00000000000c', 'نسخة.pdf', 'c0000000-0000-0000-0000-00000000000c/1-copy-mine.pdf');
  update public.attachments set request_id = 'req-c' where id = 950;
  -- and the guard does not apply to it at all
  insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path)
  values (951, null, null, 'نظام.pdf', 'system/report.pdf');
  update public.attachments set storage_path = 'system/report-2.pdf' where id = 951;
  insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by)
  values ('ct1', 5, 'نظام.pdf', 'system/c.pdf', null);
  raise notice 'T9 PASS: the service role inserts and rewrites freely (copy, bind, tooling)';
end $$;
reset role;

-- ── T10 deleting an uploader's account still works (ON DELETE SET NULL) ─────
do $$
declare n int;
begin
  delete from public.contract_versions where version_no = 5;
  delete from public.attachments where id in (950, 951);
  -- a version X uploaded (fixture, as postgres), then X's account goes
  insert into public.contract_versions (contract_id, version_no, file_name, storage_path, uploaded_by)
  values ('ct1', 7, 'x.pdf', '80000000-0000-0000-0000-00000000008a/contracts/ct1/7-x.pdf', '80000000-0000-0000-0000-00000000008a');
  delete from auth.users where id = '80000000-0000-0000-0000-00000000008a';
  select count(*) into n from public.contract_versions where contract_id = 'ct1' and version_no = 7 and uploaded_by is null;
  if n <> 1 then raise exception 'T10 FAIL: the version of a deleted uploader: % rows with uploaded_by null, expected 1', n; end if;
  raise notice 'T10 PASS: deleting an uploader''s account nulls uploaded_by on his contract versions (the guard lets the FK through)';
end $$;

-- ── T11 the helper on its own ────────────────────────────────────────────────
do $$
begin
  if public.storage_path_in_folder(null, 'c0000000-0000-0000-0000-00000000000c')
     or public.storage_path_in_folder('c0000000-0000-0000-0000-00000000000c/a', null)
     or public.storage_path_in_folder('c0000000-0000-0000-0000-00000000000c/./a', 'c0000000-0000-0000-0000-00000000000c')
     or public.storage_path_in_folder('c0000000-0000-0000-0000-00000000000c/', 'c0000000-0000-0000-0000-00000000000c')
     or not public.storage_path_in_folder('c0000000-0000-0000-0000-00000000000c/report..final.pdf', 'c0000000-0000-0000-0000-00000000000c') then
    raise exception 'T11 FAIL: storage_path_in_folder edge cases';
  end if;
  raise notice 'T11 PASS: null, ./, trailing / refused; a name with .. inside it accepted';
end $$;

select 'attachments_path_ownership: ALL PASS';
