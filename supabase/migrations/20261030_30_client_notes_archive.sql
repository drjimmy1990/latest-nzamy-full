-- =============================================================================
-- Migration: 20261030_30_client_notes_archive.sql
-- Owner package 2026-10-30, CODE-F36: «حذف» a client-file note becomes
-- «أرشفة» with an undo — the same rule 20261025_51 set for case notes
-- (N3.9: no physical delete of a lawyer's note from the app).
-- =============================================================================
--
-- WHAT CHANGES (public.lawyer_client_notes only)
--   1. deleted_at timestamptz / deleted_by uuid. A live note has both null;
--      an archived note has deleted_at set. CHECK: deleted_by only with
--      deleted_at.
--   2. Trigger lawyer_client_notes_archive_stamp (BEFORE UPDATE):
--        * archiving   → deleted_at := now(), deleted_by := auth.uid()
--                        (the client never chooses either value);
--        * restoring   → both back to null;
--        * an archived note's body / visibility / firm_id cannot change
--          (restore it first).
--      Archive and restore are plain UPDATEs through the existing
--      "client notes updatable by author" policy — the AUTHOR only, exactly
--      who could delete before.
--   3. DELETE: the "client notes deletable by author" policy is dropped and
--      DELETE / TRUNCATE are revoked from anon and authenticated. The service
--      role keeps its privileges, so account deletion (20261026_70, SECURITY
--      DEFINER) still erases a departing account's notes.
--   4. Partial index on (client_id, created_at desc) where deleted_at is null —
--      the normal list.
--
-- RETENTION POLICY
--   An archived note is kept until its author restores it. There is NO
--   automatic purge (no cron touches this table). The only path that removes
--   it is the platform's account-deletion flow for the author's own account
--   (20261026_70), unchanged here. The API lists live notes by default; the
--   «المؤرشفة» list returns the caller's OWN archived notes only.
--
-- RE-RUN SAFETY
--   Idempotent: add column if not exists, drop … if exists, create or replace.
--   NOTE: re-running 20261017_41 afterwards would re-create the dropped DELETE
--   policy (the privilege stays revoked, so a DELETE still fails with 42501) —
--   re-run this file after it if that ever happens.
--
-- DEPLOY ORDER
--   Either order is safe. Before this file runs, the app lists every note
--   (no deleted_at column → it retries without the filter) and «أرشفة»
--   answers 503 «الأرشفة غير متاحة بعد… 20261030_30. لم يُحذف شيء.» — it never
--   falls back to a hard delete. Preferred: run this file, then deploy.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.lawyer_client_notes') is null then
    raise exception '20261030_30: public.lawyer_client_notes missing — apply 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.lawyer_client_notes'::regclass
                   and polname = 'client notes updatable by author') then
    raise exception '20261030_30: policy "client notes updatable by author" missing — apply 20261017_41_notes_visibility_case_team.sql first';
  end if;
end $$;

-- ── 1. columns ──────────────────────────────────────────────────────────────
alter table public.lawyer_client_notes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.lawyer_client_notes
  drop constraint if exists lawyer_client_notes_deleted_by_needs_deleted_at;
alter table public.lawyer_client_notes
  add constraint lawyer_client_notes_deleted_by_needs_deleted_at
  check (deleted_at is not null or deleted_by is null);

create index if not exists lawyer_client_notes_live_idx
  on public.lawyer_client_notes (client_id, created_at desc)
  where deleted_at is null;

-- ── 2. archive stamp ────────────────────────────────────────────────────────
create or replace function public.lawyer_client_notes_archive_stamp()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.deleted_at is not null and new.deleted_at is not null then
    -- Still archived: nothing about it may change but nothing — restore first.
    if new.body is distinct from old.body
       or new.visibility is distinct from old.visibility then
      raise exception 'an archived client note cannot be edited — restore it first'
        using errcode = '42501';
    end if;
    new.deleted_at := old.deleted_at;
    -- deleted_by may only go to null: that is the FK's own «on delete set
    -- null» when the archiving account is erased, and it must not be blocked.
    -- (firm_id is left alone for the same reason — its FK may null it too.)
    new.deleted_by := case when new.deleted_by is null then null else old.deleted_by end;
    return new;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := auth.uid();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  else
    new.deleted_by := old.deleted_by;
  end if;
  return new;
end;
$$;

revoke all on function public.lawyer_client_notes_archive_stamp() from public;

drop trigger if exists trg_lawyer_client_notes_archive_stamp on public.lawyer_client_notes;
create trigger trg_lawyer_client_notes_archive_stamp
  before update on public.lawyer_client_notes
  for each row execute function public.lawyer_client_notes_archive_stamp();

-- ── 3. no hard delete from the API roles ────────────────────────────────────
drop policy if exists "client notes deletable by author" on public.lawyer_client_notes;
revoke delete, truncate on public.lawyer_client_notes from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke delete, truncate on public.lawyer_client_notes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke delete, truncate on public.lawyer_client_notes from authenticated;
  end if;
end $$;

-- ── verify (raises on failure) ──────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public'
                   and table_name = 'lawyer_client_notes' and column_name = 'deleted_at') then
    raise exception '20261030_30 verify: deleted_at missing';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.lawyer_client_notes'::regclass
               and polcmd = 'd') then
    raise exception '20261030_30 verify: a DELETE policy still exists on lawyer_client_notes';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and has_table_privilege('authenticated', 'public.lawyer_client_notes', 'DELETE') then
    raise exception '20261030_30 verify: authenticated still holds DELETE';
  end if;
  if not exists (select 1 from pg_trigger where not tgisinternal
                   and tgname = 'trg_lawyer_client_notes_archive_stamp') then
    raise exception '20261030_30 verify: archive stamp trigger missing';
  end if;
  raise notice '20261030_30 verify: OK — client notes archive instead of delete';
end $$;

commit;

notify pgrst, 'reload schema';

-- ── check (the SQL editor hides NOTICEs — read this row instead) ────────────
-- Expect: has_deleted_at = true, delete_policies = 0, authenticated_can_delete = false,
--         stamp_trigger = true, archived_notes = 0 on first run.
select
  exists (select 1 from information_schema.columns where table_schema = 'public'
            and table_name = 'lawyer_client_notes' and column_name = 'deleted_at')          as has_deleted_at,
  (select count(*) from pg_policy where polrelid = 'public.lawyer_client_notes'::regclass
     and polcmd = 'd')                                                                       as delete_policies,
  (exists (select 1 from pg_roles where rolname = 'authenticated')
     and has_table_privilege('authenticated', 'public.lawyer_client_notes', 'DELETE'))      as authenticated_can_delete,
  exists (select 1 from pg_trigger where not tgisinternal
            and tgname = 'trg_lawyer_client_notes_archive_stamp')                            as stamp_trigger,
  (select count(*) from public.lawyer_client_notes where deleted_at is not null)            as archived_notes;
