-- =============================================================================
-- Migration: 20261026_65_attachments_path_ownership.sql
-- Security fix (independent review of the 2026-10-26 dashboard track, finding
-- 1, HIGH). The hole is LIVE ON PRODUCTION today; the new ZIP route
-- (/api/v1/attachments/zip) only made it cheaper to use.
-- =============================================================================
--
-- THE HOLE
--   Every route that hands out a file of the private `documents` bucket signs
--   (or downloads) the row's storage_path with the SERVICE client, which
--   Storage RLS does not confine:
--     service-requests/[id]/attachments/[attachmentId], …/deliverable,
--     lawyer|client/contracts/[id]/versions/[vid]/url, attachments/zip, and
--     share (it copies attachments.storage_path into document_shares).
--   The routes trust the row; the database never tied storage_path to the
--   writer. A signed-in session can write the tables through raw PostgREST:
--     * attachments INSERT — "attachments_insert_policy" (20260616) checks
--       only owner_user_id = auth.uid(); "participants create attachments"
--       (20260518, never dropped) checks only that the caller filed the
--       request — any owner, any path; "users insert own attachments"
--       (20260616_entities) owner only. No policy looks at storage_path.
--     * attachments UPDATE — "attachments owner update" (20260906) lets the
--       owner or any participant rewrite ANY column: storage_path of a vault
--       document, owner_user_id, and request_id (a vault document moved into
--       somebody else's case). 20261025_51 froze request_id / storage_path of
--       CASE documents only.
--     * contract_versions INSERT — "contract versions insert" (20260905)
--       checks can_manage_contract and uploaded_by, never storage_path.
--   So: a client inserts an attachments row on his own request with
--   storage_path = '<victim uid>/<ms>-<name>' and downloads the victim's file
--   through any of the routes above; and anyone who knows a request id could
--   plant a row (a file of his) into that case. A planted row also marked the
--   victim's own object as a "case document" for
--   storage_object_is_case_document (20261025_51), so the victim could no
--   longer delete it through Storage.
--
-- THE RULE (this file)
--   A row written by a SESSION (any role but postgres / service_role /
--   supabase_admin — the 20261018_04 pattern; SECURITY DEFINER functions owned
--   by postgres, such as restore_case_document, run as postgres and pass):
--     attachments
--       INSERT  owner_user_id = auth.uid(); storage_path inside the owner's
--               folder (public.storage_path_in_folder: first segment = the
--               owner's uuid, at least one more segment, no empty / '.' /
--               '..' segment, no leading '/'); request_id null (the vault) or
--               a request the caller filed or is assigned to — exactly the
--               check POST /api/v1/documents makes and exactly the rows
--               attachments_select_policy shows back.
--       UPDATE  storage_path, owner_user_id and request_id never change.
--               (The bind of a vault document to a new order is the service
--               role's — POST /api/v1/service-requests — and is unaffected.)
--     contract_versions
--       INSERT  uploaded_by = auth.uid(), storage_path inside that folder.
--       UPDATE  storage_path and contract_id never change; uploaded_by only
--               to NULL (its foreign key is ON DELETE SET NULL). Sessions have
--               no UPDATE policy today — this is the second lock.
--   Enforced by BEFORE INSERT OR UPDATE triggers (trg_00_… so they fire before
--   trg_attachments_archive_stamp), SECURITY INVOKER (current_user must be the
--   session's role), plus ONE replacement INSERT policy on attachments: every
--   other INSERT policy is dropped by catalogue scan, not by name, because
--   permissive policies OR together and the live database may still carry the
--   20260518 / 20260616 ones. A trigger, not only a policy: a re-run of an
--   old migration or a restore cannot reopen it.
--
--   The routes also stop serving a row whose path is outside its writer's
--   folder (src/lib/storagePathOwnership.ts), so rows written BEFORE this file
--   are not trusted either. Existing rows are NOT rewritten; the verify below
--   counts them.
--
--   Also: an index on service_requests (requester_user_id) — read by the RLS
--   participant checks and the 20261026_62 phone trigger.
--
-- DEPLOY ORDER — EITHER ORDER, AND SOON
--   Every write the app makes already complies (checked 2026-10-26):
--     session INSERT attachments      POST /api/v1/documents —
--                                     `<uid>/<ms>-<name>` (uploadDocumentFile),
--                                     request_id null or a request the caller
--                                     filed / is assigned to (the route 403s
--                                     anything else);
--     session INSERT contract_versions POST /api/v1/lawyer/contracts/[id]/versions
--                                     — `<uid>/contracts/<id>/<ms>-<name>`,
--                                     uploaded_by = the caller;
--     session UPDATE attachments      soft delete / restore (deleted_at,
--                                     deleted_by) and legal hold (legal_hold,
--                                     hold_reason) only;
--     service role                    documents/[id]/copy (`<uid>/<ms>-copy-…`),
--                                     the order bind (request_id null → id),
--                                     the cron purge — not guarded.
--   So this file needs no code deploy and closes the hole for new rows the
--   moment it commits. Writers OUTSIDE this repo that use a USER's JWT (a
--   native app, an n8n workflow with a user token) are guarded the same way;
--   ones with the service-role key are not.
--
-- NOT CLOSED HERE (reported, same class — a service-signed path a session can
-- choose): public.document_shares ("document_shares_owner_write", FOR ALL,
-- owner_id = auth.uid()) lets a session insert any document_path with a
-- token_hash it chose, and /api/v1/share/[token]/verify signs it with the
-- service role. See the README.
--
-- IDEMPOTENT: create or replace / if not exists, drop … if exists, a policy
-- scan; revoke/grant are absolute. Docker:
--   supabase/tests/rls/attachments_path_ownership.test.sql (runs it twice).
--
-- ROLLBACK (manual):
--   drop trigger if exists trg_00_attachments_session_guard on public.attachments;
--   drop trigger if exists trg_00_contract_versions_session_guard on public.contract_versions;
--   drop policy if exists "attachments insert own file on own request" on public.attachments;
--   create policy "attachments_insert_policy" on public.attachments for insert
--     with check (owner_user_id = auth.uid());          -- the 20260616 policy
--   drop function if exists public.guard_attachment_session_writes();
--   drop function if exists public.guard_contract_version_session_writes();
--   drop function if exists public.can_attach_to_request(text);
--   drop function if exists public.storage_path_in_folder(text, uuid);
--   (the index can stay.)
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.attachments') is null or to_regclass('public.service_requests') is null then
    raise exception '20261026_65: public.attachments / public.service_requests are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'attachments' and column_name = 'deleted_at') then
    raise exception '20261026_65: attachments.deleted_at is missing — apply 20260906_phase6_settings_out_of_browser.sql first';
  end if;
  if to_regclass('public.contract_versions') is null then
    raise exception '20261026_65: public.contract_versions is missing — apply 20260905_phase3_consultations_and_contracts.sql first';
  end if;
end $$;


-- ── 1. Index ─────────────────────────────────────────────────────────────────
create index if not exists idx_service_requests_requester_user_id
  on public.service_requests (requester_user_id);


-- ── 2. Helpers ───────────────────────────────────────────────────────────────
-- The storage key sits in the owner's own folder: '<owner uuid>/<at least one
-- more segment>', no empty, '.' or '..' segment (so '<uid>/../<victim>/x' and
-- '<uid>//x' are refused), no leading '/'. The app's keys:
--   <uid>/<ms>-<name>                      uploadDocumentFile, documents copy
--   <uid>/contracts/<contract>/<ms>-<name> uploadContractVersionFile
-- The TypeScript twin is src/lib/storagePathOwnership.ts.
create or replace function public.storage_path_in_folder(p_path text, p_owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_path is not null and p_owner is not null
    and strpos(p_path, '/') > 1
    and split_part(p_path, '/', 1) = p_owner::text
    and not exists (select 1 from unnest(string_to_array(p_path, '/')) as s(seg)
                     where s.seg in ('', '.', '..')),
    false);
$$;

comment on function public.storage_path_in_folder(text, uuid) is
  '20261026_65: true when p_path is a key inside p_owner''s own folder of the documents bucket (first segment = the uuid, at least one more segment, no empty / . / .. segment).';

-- The caller filed or is assigned to this request — POST /api/v1/documents'
-- own rule, and the rows attachments_select_policy shows back. DEFINER so the
-- answer does not depend on which service_requests rows the caller may read.
create or replace function public.can_attach_to_request(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_request is not null and auth.uid() is not null and exists (
    select 1 from public.service_requests sr
     where sr.id = p_request
       and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid()));
$$;

comment on function public.can_attach_to_request(text) is
  '20261026_65: the caller (auth.uid()) filed or is assigned to request p_request — who may attach a file to it.';

do $$
declare f text;
begin
  foreach f in array array['public.storage_path_in_folder(text, uuid)', 'public.can_attach_to_request(text)'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;


-- ── 3. attachments: the session guard ────────────────────────────────────────
create or replace function public.guard_attachment_session_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_user_id is null or new.owner_user_id is distinct from auth.uid() then
      raise exception using errcode = '42501',
        message = 'attachments: a document is registered by its own uploader (owner_user_id = auth.uid())';
    end if;
    if not public.storage_path_in_folder(new.storage_path, new.owner_user_id) then
      raise exception using errcode = '42501',
        message = 'attachments: storage_path must be a file in the uploader''s own folder';
    end if;
    if new.request_id is not null and not public.can_attach_to_request(new.request_id) then
      raise exception using errcode = '42501',
        message = 'attachments: only the request''s client or its assigned lawyer may attach a file to it';
    end if;
    return new;
  end if;

  if new.storage_path is distinct from old.storage_path
     or new.owner_user_id is distinct from old.owner_user_id
     or new.request_id is distinct from old.request_id then
    raise exception using errcode = '42501',
      message = 'attachments: a document''s file, uploader and request are fixed once registered';
  end if;
  return new;
end $$;

comment on function public.guard_attachment_session_writes() is
  '20261026_65: a session (any role but postgres / service_role / supabase_admin) inserts an attachment only as itself, with a file in its own folder, on no request or one it filed / is assigned to; and never changes storage_path, owner_user_id or request_id.';

revoke all on function public.guard_attachment_session_writes() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.guard_attachment_session_writes() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.guard_attachment_session_writes() from authenticated;
  end if;
end $$;

drop trigger if exists trg_00_attachments_session_guard on public.attachments;
create trigger trg_00_attachments_session_guard
  before insert or update on public.attachments
  for each row execute function public.guard_attachment_session_writes();

comment on trigger trg_00_attachments_session_guard on public.attachments is
  'PATH-OWNERSHIP GUARD since 20261026_65 — read by _verify.sql.';


-- ── 4. attachments: ONE insert policy ────────────────────────────────────────
-- Every INSERT policy goes, whatever its name: on the live database the
-- 20260518 "participants create attachments" (any owner, any path) and the
-- 20260616 "users insert own attachments" may still sit beside
-- attachments_insert_policy, and permissive policies OR together. An ALL
-- policy is reported, not dropped (it carries other commands too); the
-- trigger above holds against it anyway.
do $$
declare p record;
begin
  for p in select polname, polcmd from pg_policy where polrelid = 'public.attachments'::regclass and polcmd in ('a', '*') loop
    if p.polcmd = 'a' then
      raise notice '20261026_65: dropping INSERT policy "%" on public.attachments', p.polname;
      execute format('drop policy %I on public.attachments', p.polname);
    else
      raise warning '20261026_65: public.attachments carries an ALL policy "%" — it also grants INSERT; the session guard trigger still applies to it. Review it.', p.polname;
    end if;
  end loop;
end $$;

create policy "attachments insert own file on own request" on public.attachments
  for insert
  with check (
    owner_user_id = auth.uid()
    and public.storage_path_in_folder(storage_path, owner_user_id)
    and (request_id is null or public.can_attach_to_request(request_id))
  );


-- ── 5. contract_versions: the session guard ──────────────────────────────────
create or replace function public.guard_contract_version_session_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.uploaded_by is null or new.uploaded_by is distinct from auth.uid() then
      raise exception using errcode = '42501',
        message = 'contract_versions: a version is registered by its own uploader (uploaded_by = auth.uid())';
    end if;
    if not public.storage_path_in_folder(new.storage_path, new.uploaded_by) then
      raise exception using errcode = '42501',
        message = 'contract_versions: storage_path must be a file in the uploader''s own folder';
    end if;
    return new;
  end if;

  if new.storage_path is distinct from old.storage_path
     or new.contract_id is distinct from old.contract_id
     or (new.uploaded_by is distinct from old.uploaded_by and new.uploaded_by is not null) then
    raise exception using errcode = '42501',
      message = 'contract_versions: a version''s file, contract and uploader are fixed once registered';
  end if;
  return new;
end $$;

comment on function public.guard_contract_version_session_writes() is
  '20261026_65: a session (any role but postgres / service_role / supabase_admin) inserts a contract version only as itself with a file in its own folder, and never changes storage_path, contract_id or uploaded_by (except to NULL, the foreign key''s ON DELETE SET NULL).';

revoke all on function public.guard_contract_version_session_writes() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.guard_contract_version_session_writes() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.guard_contract_version_session_writes() from authenticated;
  end if;
end $$;

drop trigger if exists trg_00_contract_versions_session_guard on public.contract_versions;
create trigger trg_00_contract_versions_session_guard
  before insert or update on public.contract_versions
  for each row execute function public.guard_contract_version_session_writes();

comment on trigger trg_00_contract_versions_session_guard on public.contract_versions is
  'PATH-OWNERSHIP GUARD since 20261026_65 — read by _verify.sql.';


-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  t text; first_before text; n int;
begin
  foreach t in array array['public.attachments', 'public.contract_versions'] loop
    select tg.tgname into first_before
      from pg_trigger tg
     where tg.tgrelid = t::regclass and not tg.tgisinternal and (tg.tgtype & 2) = 2 and tg.tgenabled <> 'D'
     order by tg.tgname limit 1;
    if first_before is distinct from (case t when 'public.attachments' then 'trg_00_attachments_session_guard'
                                             else 'trg_00_contract_versions_session_guard' end) then
      raise exception '20261026_65 verify: the session guard on % is missing, disabled or not the first BEFORE trigger (first: %)', t, first_before;
    end if;
  end loop;
  if exists (select 1 from pg_proc
              where oid in ('public.guard_attachment_session_writes()'::regprocedure,
                            'public.guard_contract_version_session_writes()'::regprocedure)
                and prosecdef) then
    raise exception '20261026_65 verify: a session guard is SECURITY DEFINER (current_user would always be its owner)';
  end if;
  if not (select prosecdef from pg_proc where oid = 'public.can_attach_to_request(text)'::regprocedure) then
    raise exception '20261026_65 verify: can_attach_to_request is not SECURITY DEFINER';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.attachments'::regclass and polcmd = 'a';
  if n <> 1 or not exists (select 1 from pg_policy where polrelid = 'public.attachments'::regclass
                            and polname = 'attachments insert own file on own request') then
    raise exception '20261026_65 verify: public.attachments carries % INSERT policies, expected exactly "attachments insert own file on own request"', n;
  end if;
  if not public.storage_path_in_folder('00000000-0000-0000-0000-000000000001/1-a.pdf', '00000000-0000-0000-0000-000000000001')
     or not public.storage_path_in_folder('00000000-0000-0000-0000-000000000001/contracts/c1/1-a.pdf', '00000000-0000-0000-0000-000000000001')
     or public.storage_path_in_folder('00000000-0000-0000-0000-000000000001/../00000000-0000-0000-0000-000000000002/a', '00000000-0000-0000-0000-000000000001')
     or public.storage_path_in_folder('00000000-0000-0000-0000-000000000002/1-a.pdf', '00000000-0000-0000-0000-000000000001')
     or public.storage_path_in_folder('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001')
     or public.storage_path_in_folder('00000000-0000-0000-0000-000000000001//a', '00000000-0000-0000-0000-000000000001')
     or public.storage_path_in_folder('/00000000-0000-0000-0000-000000000001/a', '00000000-0000-0000-0000-000000000001') then
    raise exception '20261026_65 verify: storage_path_in_folder answers wrong on its own examples';
  end if;

  -- Rows written before this file whose file is outside the writer's folder.
  -- Not rewritten; the routes refuse to serve them. A non-zero count is worth
  -- a look (a forged row, or an old writer with another key shape).
  select count(*) into n from public.attachments a
   where not public.storage_path_in_folder(a.storage_path, a.owner_user_id);
  if n > 0 then
    raise warning '20261026_65: % attachments row(s) point outside their owner''s folder — the download routes no longer serve them. List: select id, request_id, owner_user_id, storage_path, created_at from public.attachments where not public.storage_path_in_folder(storage_path, owner_user_id);', n;
  end if;
  select count(*) into n from public.contract_versions v
   where not public.storage_path_in_folder(v.storage_path, v.uploaded_by);
  if n > 0 then
    raise warning '20261026_65: % contract_versions row(s) point outside their uploader''s folder (or the uploader''s account is gone) — the download routes no longer serve them. List: select id, contract_id, uploaded_by, storage_path from public.contract_versions where not public.storage_path_in_folder(storage_path, uploaded_by);', n;
  end if;

  raise notice '20261026_65 verify: OK — attachments / contract_versions written by a session: own folder only, attachments only on a request the caller filed or is assigned to, file / uploader / request fixed after insert; one INSERT policy on attachments';
end $$;

commit;
notify pgrst, 'reload schema';
