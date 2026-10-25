-- =============================================================================
-- Migration: 20261026_72_file_folder_owner.sql
-- Integration of the 2026-10-26 batch: 20261026_65 / 66 (path ownership, the
-- dash track) MEET 20261026_70 / 71 (account deletion D6, owner ٢٩٨).
-- Requires 20261026_65. Run it after 66 and BEFORE 70: an account deleted
-- between 70 and 72 leaves its document on a shared case with owner null and
-- no trail row, and this file cannot learn that document's folder (a 70 run
-- first is otherwise recovered from firm_asset_transfers). Re-run it after a
-- re-run of 66 — see NOT AFTER THIS FILE.
-- =============================================================================
--
-- THE CONFLICT
--   65 and the routes (src/lib/storagePathOwnership.ts) serve a documents file
--   only when it sits in the folder of the row's CURRENT owner:
--     attachments        storage_path under owner_user_id/
--     contract_versions  storage_path under uploaded_by/
--   70 changes exactly those columns, and cannot move the bytes:
--     * a firm member removed or deleted → his firm case documents get
--       owner_user_id = the firm owner; the file stays in the MEMBER's folder;
--     * a deleted account's document on a case someone else is on → owner
--       null (kept for the other party);
--     * a deleted uploader → contract_versions.uploaded_by null (its FK).
--   Every one of those files became unservable: the firm owner inherits case
--   documents that the download, deliverable, ZIP and share routes refuse
--   ("not found"), and 66's can_share_attachment refuses to share them.
--
--   And the reverse: 65 lets a session register ANY path in its own folder —
--   so a removed member could re-register a firm file that 70 left in his
--   folder as a vault document of his own, and have the service-role routes
--   (documents/[id]/copy, share, …) hand him the bytes 71 withholds.
--
-- THE RULE (this file)
--   1. folder_owner_id on attachments and contract_versions: whose folder the
--      file sits in, fixed when the row is written and never changed by a
--      session. No foreign key — it names a folder, which outlives the account
--      (the purge keeps every object a surviving row points at, 70 §8). A
--      CHECK keeps it honest: null, or the path really is in that folder.
--        session INSERT   folder_owner_id := owner_user_id / uploaded_by (65
--                         already requires that = auth.uid(), path in it);
--        trusted INSERT   (postgres / service_role / supabase_admin — the 65
--                         list) stamped from the owner when the path is in his
--                         folder and the writer gave none;
--        session UPDATE   folder_owner_id never changes;
--        trusted UPDATE   a new storage_path re-stamps it (or nulls it).
--      The ownership transfer of 70 changes owner_user_id only: the row keeps
--      the folder of the member who uploaded it. Backfill: every row whose
--      file is in its owner's folder today (and, if 70 already moved rows,
--      the member's folder recorded in firm_asset_transfers). Rows outside
--      their owner's folder (pre-65 forgeries) stay null — still unserved.
--   2. The routes and 66's can_share_attachment check the path against
--      coalesce(folder_owner_id, owner) — the folder the file was written in.
--   3. A session cannot register a path another user's row holds
--      (public.storage_object_held_by_other, 70 §8b, once 70 has run): a
--      removed member cannot re-register the firm's files left in his folder.
--   Separate triggers (trg_01_…), NOT a replacement of 65's guard: a re-run of
--   65 leaves this file in force. They fire right after trg_00_… (65's guard
--   stays the first BEFORE trigger, which _verify checks).
--
-- WHY THE 65 GUARD NEEDS NO CHANGE FOR 70
--   65's guard is SECURITY INVOKER and judges current_user. 70's writers —
--   transfer_firm_assets, account_keep_rules (called by the firm_members
--   trigger on the owner's PATCH, and by the auth.users BEFORE DELETE
--   trigger that GoTrue fires as supabase_auth_admin) — are SECURITY DEFINER,
--   so inside them current_user is their OWNER (postgres on this project),
--   which 65 trusts. No flag, no extra role: a session cannot become that
--   owner, and supabase_auth_admin never reaches attachments outside those
--   definer functions (an FK action runs as the table's owner). 70's verify
--   and _verify.sql check that owner. Proved in Docker:
--   supabase/tests/rls/batch_2026_10_26_integration.test.sql.
--
-- DEPLOY ORDER — BEFORE THE CODE DEPLOY. The deployed routes select
--   folder_owner_id; before this file they answer «تعذّر» on every file
--   download. The file itself needs no code: run it any time after 65 / 66
--   and before 70.
--
-- NOT AFTER THIS FILE WITHOUT CARE
--   * Re-running 20261026_66 puts back its can_share_attachment (owner's
--     folder only): the firm owner then cannot share an inherited document.
--     Re-run this file after it. _verify.sql (verify:file_folder_owner) RAISES.
--   * Re-running 20261026_65 is harmless (its guard is a separate trigger).
--
-- IDEMPOTENT: add column if not exists, backfill of nulls only, drop … if
-- exists / create, create or replace. lock_timeout 5s.
-- Docker: supabase/tests/rls/batch_2026_10_26_integration.test.sql.
--
-- ROLLBACK (manual; the routes then refuse inherited files again):
--   drop trigger if exists trg_01_attachments_folder_owner on public.attachments;
--   drop trigger if exists trg_01_contract_versions_folder_owner on public.contract_versions;
--   drop function if exists public.stamp_attachment_folder_owner();
--   drop function if exists public.stamp_contract_version_folder_owner();
--   re-run 20261026_66 (its can_share_attachment), then
--   alter table public.attachments drop column if exists folder_owner_id;
--   alter table public.contract_versions drop column if exists folder_owner_id;
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.storage_path_in_folder(text, uuid)') is null
     or to_regprocedure('public.guard_attachment_session_writes()') is null
     or to_regprocedure('public.guard_contract_version_session_writes()') is null then
    raise exception '20261026_72: 20261026_65 has not run — run 65_BEFORE_DEPLOY_20261026_65_attachments_path_ownership.sql first';
  end if;
end $$;


-- ── 1. Columns ───────────────────────────────────────────────────────────────
alter table public.attachments       add column if not exists folder_owner_id uuid;
alter table public.contract_versions add column if not exists folder_owner_id uuid;

comment on column public.attachments.folder_owner_id is
  '20261026_72: whose documents folder storage_path is in — the uploader. Fixed for sessions; an ownership transfer (20261026_70) does not change it. No FK: the folder outlives the account.';
comment on column public.contract_versions.folder_owner_id is
  '20261026_72: whose documents folder storage_path is in — the uploader. Fixed for sessions; survives uploaded_by going null with the account. No FK.';


-- ── 2. Backfill (nulls only; postgres passes 65's guard) ─────────────────────
update public.attachments a
   set folder_owner_id = a.owner_user_id
 where a.folder_owner_id is null
   and public.storage_path_in_folder(a.storage_path, a.owner_user_id);

-- 70 ran first and already moved rows: the folder is the member's, recorded
-- in the trail (written only by 70's definer function).
do $$
begin
  if to_regclass('public.firm_asset_transfers') is not null then
    update public.attachments a
       set folder_owner_id = t.from_user_id
      from (select distinct on (row_id) row_id, from_user_id
              from public.firm_asset_transfers
             where table_name = 'attachments' and column_name = 'owner_user_id'
             order by row_id, id) t
     where a.folder_owner_id is null
       and t.row_id = a.id::text
       and public.storage_path_in_folder(a.storage_path, t.from_user_id);
  end if;
end $$;

update public.contract_versions v
   set folder_owner_id = v.uploaded_by
 where v.folder_owner_id is null
   and public.storage_path_in_folder(v.storage_path, v.uploaded_by);

alter table public.attachments drop constraint if exists attachments_folder_owner_check;
alter table public.attachments add constraint attachments_folder_owner_check
  check (folder_owner_id is null or public.storage_path_in_folder(storage_path, folder_owner_id));
alter table public.contract_versions drop constraint if exists contract_versions_folder_owner_check;
alter table public.contract_versions add constraint contract_versions_folder_owner_check
  check (folder_owner_id is null or public.storage_path_in_folder(storage_path, folder_owner_id));


-- ── 3. attachments: stamp, freeze, refuse a path held by another ─────────────
create or replace function public.stamp_attachment_folder_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin');
  held    boolean := false;
begin
  if tg_op = 'INSERT' then
    if trusted then
      if new.folder_owner_id is null and public.storage_path_in_folder(new.storage_path, new.owner_user_id) then
        new.folder_owner_id := new.owner_user_id;
      end if;
      return new;
    end if;
    -- 65's guard (trg_00_) already required owner_user_id = auth.uid() and
    -- the path in that folder.
    new.folder_owner_id := new.owner_user_id;
    -- A path another user's row holds: a firm file 70 left in a removed
    -- member's folder. Definer helper of 70 (the caller cannot see that row).
    if to_regprocedure('public.storage_object_held_by_other(text)') is not null then
      execute 'select public.storage_object_held_by_other($1)' into held using new.storage_path;
      if held then
        raise exception using errcode = '42501',
          message = 'attachments: this file belongs to another account''s record (a firm document left in your folder) and cannot be registered again';
      end if;
    end if;
    return new;
  end if;

  if not trusted then
    if new.folder_owner_id is distinct from old.folder_owner_id then
      raise exception using errcode = '42501',
        message = 'attachments: the file''s folder is fixed once registered';
    end if;
    return new;
  end if;
  if new.storage_path is distinct from old.storage_path
     and new.folder_owner_id is not distinct from old.folder_owner_id then
    new.folder_owner_id := case when public.storage_path_in_folder(new.storage_path, new.owner_user_id)
                                then new.owner_user_id end;
  end if;
  return new;
end $$;

comment on function public.stamp_attachment_folder_owner() is
  '20261026_72: attachments.folder_owner_id — the uploader for a session insert (and a session may not register a path another account''s row holds), stamped from the owner for a trusted insert, fixed for sessions after.';

drop trigger if exists trg_01_attachments_folder_owner on public.attachments;
create trigger trg_01_attachments_folder_owner
  before insert or update on public.attachments
  for each row execute function public.stamp_attachment_folder_owner();

comment on trigger trg_01_attachments_folder_owner on public.attachments is
  'FOLDER OWNER since 20261026_72 — read by _verify.sql.';


-- ── 4. contract_versions: the same ───────────────────────────────────────────
create or replace function public.stamp_contract_version_folder_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  trusted boolean := current_user in ('postgres', 'service_role', 'supabase_admin');
  held    boolean := false;
begin
  if tg_op = 'INSERT' then
    if trusted then
      if new.folder_owner_id is null and public.storage_path_in_folder(new.storage_path, new.uploaded_by) then
        new.folder_owner_id := new.uploaded_by;
      end if;
      return new;
    end if;
    new.folder_owner_id := new.uploaded_by;
    if to_regprocedure('public.storage_object_held_by_other(text)') is not null then
      execute 'select public.storage_object_held_by_other($1)' into held using new.storage_path;
      if held then
        raise exception using errcode = '42501',
          message = 'contract_versions: this file belongs to another account''s record (a firm document left in your folder) and cannot be registered again';
      end if;
    end if;
    return new;
  end if;

  if not trusted then
    if new.folder_owner_id is distinct from old.folder_owner_id then
      raise exception using errcode = '42501',
        message = 'contract_versions: the file''s folder is fixed once registered';
    end if;
    return new;
  end if;
  if new.storage_path is distinct from old.storage_path
     and new.folder_owner_id is not distinct from old.folder_owner_id then
    new.folder_owner_id := case when public.storage_path_in_folder(new.storage_path, new.uploaded_by)
                                then new.uploaded_by end;
  end if;
  return new;
end $$;

comment on function public.stamp_contract_version_folder_owner() is
  '20261026_72: contract_versions.folder_owner_id — the uploader for a session insert (never a path another account''s row holds), stamped for a trusted insert, fixed for sessions after; survives uploaded_by → null.';

drop trigger if exists trg_01_contract_versions_folder_owner on public.contract_versions;
create trigger trg_01_contract_versions_folder_owner
  before insert or update on public.contract_versions
  for each row execute function public.stamp_contract_version_folder_owner();

comment on trigger trg_01_contract_versions_folder_owner on public.contract_versions is
  'FOLDER OWNER since 20261026_72 — read by _verify.sql.';

do $$
declare f text;
begin
  foreach f in array array['public.stamp_attachment_folder_owner()', 'public.stamp_contract_version_folder_owner()'] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
end $$;


-- ── 5. 66's share check follows the folder, not the current owner ────────────
-- Only when 66 has run (document_shares is optional on a database).
do $$
begin
  if to_regprocedure('public.can_share_attachment(text, text)') is null then
    raise notice '20261026_72: 20261026_66 has not run — can_share_attachment left for 66 (re-run this file after it)';
    return;
  end if;
  execute $f$
    create or replace function public.can_share_attachment(p_document_id text, p_path text)
    returns boolean
    language sql
    stable
    security definer
    set search_path = ''
    as $body$
      select p_document_id is not null and p_path is not null and auth.uid() is not null and exists (
        select 1 from public.attachments a
         where a.id::text = p_document_id
           and a.storage_path = p_path
           and a.owner_user_id = auth.uid()
           and a.deleted_at is null
           and public.storage_path_in_folder(a.storage_path, coalesce(a.folder_owner_id, a.owner_user_id)));
    $body$
  $f$;
  comment on function public.can_share_attachment(text, text) is
    '20261026_66 + 20261026_72: (p_document_id, p_path) is (id, storage_path) of a live attachment (deleted_at null) the caller owns, whose file sits in the folder it was written in (folder_owner_id, else the owner''s) — what a session may put in a document_shares row.';
end $$;


-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  t text; n int; pos int; expect text;
begin
  foreach t in array array['public.attachments', 'public.contract_versions'] loop
    expect := case t when 'public.attachments' then 'trg_01_attachments_folder_owner' else 'trg_01_contract_versions_folder_owner' end;
    select p into pos from (
      select row_number() over (order by tg.tgname) as p, tg.tgname
        from pg_trigger tg
       where tg.tgrelid = t::regclass and not tg.tgisinternal and (tg.tgtype & 2) = 2 and tg.tgenabled <> 'D') s
     where s.tgname = expect;
    if pos is distinct from 2 then
      raise exception '20261026_72 verify: % is missing, disabled or not right after 65''s guard on % (position %)', expect, t, pos;
    end if;
  end loop;
  if exists (select 1 from pg_proc
              where oid in ('public.stamp_attachment_folder_owner()'::regprocedure,
                            'public.stamp_contract_version_folder_owner()'::regprocedure)
                and prosecdef) then
    raise exception '20261026_72 verify: a folder-owner trigger is SECURITY DEFINER (current_user would always be its owner)';
  end if;
  if to_regprocedure('public.can_share_attachment(text, text)') is not null
     and position('folder_owner_id' in (select prosrc from pg_proc where oid = 'public.can_share_attachment(text, text)'::regprocedure)) = 0 then
    raise exception '20261026_72 verify: can_share_attachment does not read folder_owner_id';
  end if;
  -- the ZIP, contract-version, copy and share routes read the column through
  -- the session client: a column-level SELECT grant without it fails them all
  foreach t in array array['public.attachments', 'public.contract_versions'] loop
    if exists (select 1 from pg_roles where rolname = 'authenticated')
       and not has_column_privilege('authenticated', t, 'folder_owner_id', 'SELECT') then
      raise exception '20261026_72 verify: authenticated cannot SELECT %.folder_owner_id — the session-client routes would fail every download (grant it)', t;
    end if;
  end loop;
  select count(*) into n from public.attachments
   where folder_owner_id is null and public.storage_path_in_folder(storage_path, owner_user_id);
  if n > 0 then
    raise exception '20261026_72 verify: % attachments row(s) in their owner''s folder have no folder_owner_id', n;
  end if;
  select count(*) into n from public.attachments where folder_owner_id is null;
  if n > 0 then
    raise notice '20261026_72: % attachments row(s) have no folder_owner_id — their file is outside the uploader''s folder (a pre-65 row); the routes keep refusing them', n;
  end if;
  raise notice '20261026_72 verify: OK — attachments / contract_versions keep the folder their file was written in (folder_owner_id), so a document moved to the firm owner, kept for the other party, or left by a deleted uploader is still served; a session cannot register a path another account''s row holds';
end $$;

commit;
notify pgrst, 'reload schema';
