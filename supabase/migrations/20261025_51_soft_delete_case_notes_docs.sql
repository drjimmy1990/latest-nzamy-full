-- =============================================================================
-- Migration: 20261025_51_soft_delete_case_notes_docs.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P6 item N3.9.
-- Owner intent: package 2026-10-22 §٤٣ directive ٥ and §٤٥ axis ٤ — «حظر
-- الحذف الفيزيائي التام لأي مذكرة أو وثيقة قانونية … وضع علامة أرشفة مؤمنة
-- وتخزين المحتوى داخل جدول السجل التاريخي … تنبيه لصاحب المكتب يتيح له
-- استرجاعها بنقرة زر واحدة». (Ideas only: the package's own schema is not used.)
-- =============================================================================
--
-- THE DECISION
--   Nobody hard-deletes a case note or a case document from the app. «حذف»
--   becomes «أرشفة»: the row stays, hidden from the normal lists, and shows in
--   the case file's «المحذوفات» to the people who may bring it back. The
--   service role (cron, admin tooling) keeps its privileges; the ONE automatic
--   purge — the 30-day bin of the hourly cron — skips case documents in the
--   code of this same branch (route.ts of /api/v1/cron/deadlines).
--
-- WHO IS WHO
--   * the writer       — case_notes.author_user_id / attachments.owner_user_id
--   * a supervisor of the case — public.can_supervise_case_records(request):
--       firm case:  the firm's owner (firm_profiles.owner_user_id), or the
--                   case lead (assigned_to) while an ACTIVE member of that firm;
--       solo case:  the assignee, or the requester when that account is a
--                   lawyer / firm account (the case_worker_ok rule of
--                   20261025_31 — a client is never a supervisor).
--
-- WHAT CHANGES
--   1. case_notes: deleted_at / deleted_by.
--        ARCHIVE  public.archive_case_note(note)  — the author only, a live note.
--        RESTORE  public.restore_case_note(note)  — the author; a supervisor of
--                 its case for a `firm` note; for a `case_team` note only a
--                 supervisor who is ON the case team.
--        SELECT   live notes: exactly the 20261017_41 rule. Archived notes:
--                 the author, and a supervisor under the same scope rule —
--                 never a PRIVATE note (owner ١٦٩ «خاصة بي فقط»), and a
--                 case-team note only to a supervisor on that team (a firm
--                 owner outside the team never read it live, so he does not
--                 read it archived). A colleague who could read a firm /
--                 case-team note no longer sees it once archived.
--        UPDATE   the author, live notes only; column grant body / visibility /
--                 firm_id — deleted_at / deleted_by move through the two
--                 functions only.
--        DELETE   no policy and no privilege for the API roles.
--   2. attachments (the case "documents"; Phase 6 already soft-deletes them):
--        * deleted_by is stamped by a trigger from the session (the existing
--          "attachments owner update" policy lets a participant write any
--          column, so a client-supplied deleted_by could name someone else);
--        * a supervisor reads the ARCHIVED documents of his cases (new SELECT
--          policy) and restores them with public.restore_case_document(id);
--        * DELETE / TRUNCATE revoked from anon and authenticated (no policy ever
--          allowed it; now no privilege either).
--   3. public.case_record_history — append-only trail. One row per archive and
--      per restore of a case note or a case document, written by trigger (so a
--      service-role change is recorded too): who, when, the case, the firm, and
--      a snapshot of the record (note body / document name and type, never a
--      storage path). Read by the actor, the record's writer and — never for a
--      private note — a supervisor of the case. No API role may INSERT,
--      UPDATE or DELETE it (service_role included); plain columns, no foreign
--      keys, so deleting a case or an account never rewrites the trail.
--   4. A notification row (public.notifications: user_id, title, body, href)
--      to the firm's owner when someone else archives a firm case's document,
--      a `firm` note, or a `case_team` note of a team the owner is on. The
--      text names the actor and the case, never the note's content.
--
-- NOT AFTER THIS FILE WITHOUT CARE
--   Re-running 20261017_41 puts back its four case_notes policies (archived
--   firm notes readable by colleagues again, an author DELETE policy). The
--   DELETE privilege stays revoked, but re-run THIS file right after it.
--   20261017_41's own verify expects 4 case_notes policies and will raise after
--   this file (3 policies): it never needs a re-run once applied.
--
-- DEPLOY ORDER — THIS FILE FIRST, THEN THE CODE
--   The new note routes call archive_case_note / restore_case_note; before this
--   file they answer an Arabic 503 instead of deleting anything. The note
--   lists read `deleted_at` with a 42703 fallback, so they keep working either
--   way.
--
-- IDEMPOTENT: add column if not exists, create … if not exists / or replace,
-- drop policy if exists, drop trigger if exists; revoke/grant are absolute.
-- Docker: supabase/tests/rls/soft_delete_case_records.test.sql (runs it twice).
--
-- ROLLBACK (manual): re-run 20261017_41 (policies) and
--   grant delete on public.case_notes to authenticated; drop the triggers,
--   functions and public.case_record_history; drop the two case_notes columns.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.case_notes') is null then
    raise exception '20261025_51: public.case_notes is missing — apply 20260910_case_notes.sql first';
  end if;
  if to_regprocedure('public.case_note_scope_ok(text,text,uuid)') is null
     or to_regprocedure('public.is_case_team_member(text)') is null then
    raise exception '20261025_51: the 20261017_41 note helpers are missing — apply 20261017_41_notes_visibility_case_team.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'attachments' and column_name = 'deleted_at') then
    raise exception '20261025_51: attachments.deleted_at is missing — apply 20260906_phase6_settings_out_of_browser.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'notifications' and column_name = 'href') then
    raise exception '20261025_51: public.notifications (user_id, title, body, href) is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id') then
    raise exception '20261025_51: service_requests.firm_id is missing — apply 20260903_phase2 first';
  end if;
end $$;


-- ── 1. case_notes: the archive columns ───────────────────────────────────────
alter table public.case_notes
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.case_notes drop constraint if exists case_notes_deleted_by_needs_deleted_at;
alter table public.case_notes add constraint case_notes_deleted_by_needs_deleted_at
  check (deleted_at is not null or deleted_by is null);

create index if not exists idx_case_notes_archived on public.case_notes (request_id) where deleted_at is not null;

comment on column public.case_notes.deleted_at is
  'N3.9 (20261025_51): archived («محذوفة») — the note stays and is restorable; set only through archive_case_note().';


-- ── 2. The append-only trail ─────────────────────────────────────────────────
create table if not exists public.case_record_history (
  id                bigserial primary key,
  record_kind       text not null check (record_kind in ('case_note', 'case_document')),
  record_id         text not null,
  request_id        text,
  firm_id           uuid,
  action            text not null check (action in ('archived', 'restored')),
  actor_user_id     uuid,
  record_owner      uuid,
  record_visibility text,
  snapshot          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

comment on table public.case_record_history is
  'N3.9 (20261025_51, owner directive ٥): who archived or restored which case note / case document, with a snapshot. Append-only: written by trigger, no API role may change it. No foreign keys on purpose — deleting a case or an account never rewrites it.';

create index if not exists idx_case_record_history_request on public.case_record_history (request_id, created_at desc);
alter table public.case_record_history enable row level security;


-- ── 3. Helpers ───────────────────────────────────────────────────────────────
-- A supervisor of the case: may see and restore what others archived on it.
create or replace function public.can_supervise_case_records(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_request is not null and auth.uid() is not null and exists (
    select 1
      from public.service_requests sr
     where sr.id = p_request
       and case
             when sr.firm_id is not null then
               exists (select 1 from public.firm_profiles fp
                        where fp.id = sr.firm_id and fp.owner_user_id = auth.uid())
               or (sr.assigned_to = auth.uid()
                   and exists (select 1 from public.firm_members m
                                where m.firm_id = sr.firm_id and m.user_id = auth.uid() and m.status = 'active'))
             else
               sr.assigned_to = auth.uid()
               or (sr.requester_user_id = auth.uid()
                   and exists (select 1 from public.profiles p
                                where p.id = auth.uid() and p.user_type in ('lawyer', 'firm')))
           end
  );
$$;

comment on function public.can_supervise_case_records(text) is
  '20261025_51: the caller may see and restore case notes (not private ones) and case documents others archived on this case — the firm owner or the active-member lead on a firm case; the assignee or a lawyer/firm requester on a solo case. Never a client.';

-- deleted_by comes from the session, never from the client; an archived note
-- is frozen until restored.
create or replace function public.case_record_archive_stamp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_by := coalesce(auth.uid(), new.deleted_by);
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  elsif old.deleted_at is not null and new.deleted_at is not null then
    -- Pinned against a rewrite, but a NULL is let through: that is the
    -- foreign key's ON DELETE SET NULL when the archiving account is deleted
    -- (reverting it would block the account deletion). The trail keeps the
    -- actor either way.
    if new.deleted_by is not null then
      new.deleted_by := old.deleted_by;
    end if;
    new.deleted_at := old.deleted_at;
    -- Nested, not `and`-ed: on attachments `new.body` does not exist, and a
    -- PL/pgSQL expression is planned as a whole.
    if tg_table_name = 'case_notes' then
      if new.body is distinct from old.body
         or new.visibility is distinct from old.visibility
         or new.firm_id is distinct from old.firm_id then
        raise exception 'an archived case note cannot be edited — restore it first'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- The trail and the owner's notification, on every archive / restore.
create or replace function public.case_record_archive_trail()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind     text;
  v_action   text;
  v_request  text;
  v_owner    uuid;
  v_vis      text;
  v_snapshot jsonb;
  v_firm     uuid;
  v_firm_own uuid;
  v_title    text;
  v_actor    uuid := coalesce(auth.uid(), new.deleted_by);
  v_name     text;
begin
  if old.deleted_at is null and new.deleted_at is not null then
    v_action := 'archived';
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_action := 'restored';
  else
    return null;
  end if;

  if tg_table_name = 'case_notes' then
    v_kind     := 'case_note';
    v_request  := new.request_id;
    v_owner    := new.author_user_id;
    v_vis      := new.visibility;
    v_snapshot := jsonb_build_object('body', old.body, 'visibility', old.visibility,
                                     'firm_id', old.firm_id, 'created_at', old.created_at,
                                     'updated_at', old.updated_at);
  else
    v_kind     := 'case_document';
    v_request  := new.request_id;
    v_owner    := new.owner_user_id;
    v_vis      := null;
    -- never the storage path
    v_snapshot := jsonb_build_object('file_name', old.file_name, 'mime_type', old.mime_type,
                                     'size_bytes', old.size_bytes, 'source', old.source,
                                     'created_at', old.created_at);
  end if;

  -- A personal vault document (no case) keeps the Phase 6 bin as it was.
  if v_request is null then
    return null;
  end if;

  select sr.firm_id, sr.title into v_firm, v_title
    from public.service_requests sr where sr.id = v_request;

  insert into public.case_record_history
    (record_kind, record_id, request_id, firm_id, action, actor_user_id, record_owner, record_visibility, snapshot)
  values
    (v_kind, new.id::text, v_request, v_firm, v_action, v_actor, v_owner, v_vis, v_snapshot);

  if v_action = 'archived' and v_firm is not null and coalesce(v_vis, '') <> 'private' then
    select fp.owner_user_id into v_firm_own from public.firm_profiles fp where fp.id = v_firm;
    -- A case-team note concerns the owner only when he is on that team
    -- (case_team_user_ids answers for the actor, an active member here).
    if v_vis = 'case_team' and not exists (
         select 1 from public.case_team_user_ids(v_request) t where t.user_id = v_firm_own) then
      v_firm_own := null;
    end if;
    if v_firm_own is not null and v_firm_own is distinct from v_actor then
      select nullif(btrim(p.display_name), '') into v_name from public.profiles p where p.id = v_actor;
      insert into public.notifications (user_id, title, body, href)
      values (
        v_firm_own,
        case when v_kind = 'case_note' then 'أُرشفت ملاحظة على قضية' else 'أُرشف مستند من قضية' end,
        format('%s أرشف %s في القضية «%s». يمكنك استرجاعه من «المحذوفات» في ملف القضية.',
               coalesce(v_name, 'أحد أعضاء المكتب'),
               case when v_kind = 'case_note' then 'ملاحظة' else 'مستنداً' end,
               coalesce(nullif(btrim(v_title), ''), 'بلا عنوان')),
        '/dashboard/firm/cases/' || v_request
      );
    end if;
  end if;
  return null;
end;
$$;

-- Archive a case note: its author, a live note.
create or replace function public.archive_case_note(p_note uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  update public.case_notes
     set deleted_at = now(), deleted_by = auth.uid()
   where id = p_note and author_user_id = auth.uid() and deleted_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- Restore a case note: its author; a supervisor of the case for a firm note;
-- for a case-team note, a supervisor who is on that case team.
create or replace function public.restore_case_note(p_note uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  update public.case_notes cn
     set deleted_at = null, deleted_by = null
   where cn.id = p_note and cn.deleted_at is not null
     and (cn.author_user_id = auth.uid()
          or (cn.visibility = 'firm' and public.can_supervise_case_records(cn.request_id))
          or (cn.visibility = 'case_team' and public.can_supervise_case_records(cn.request_id)
              and public.is_case_team_member(cn.request_id)));
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- Restore a case document: whoever may already update it (its uploader or a
-- participant of the case — the "attachments owner update" rule), or a
-- supervisor of the case. A personal vault document keeps its own restore
-- route (/api/v1/documents/[id]/restore).
create or replace function public.restore_case_document(p_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  update public.attachments a
     set deleted_at = null, deleted_by = null
   where a.id = p_id and a.deleted_at is not null and a.request_id is not null
     and (a.owner_user_id = auth.uid()
          or exists (select 1 from public.service_requests sr
                      where sr.id = a.request_id
                        and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid()))
          or public.can_supervise_case_records(a.request_id));
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_supervise_case_records(text)',
    'public.archive_case_note(uuid)',
    'public.restore_case_note(uuid)',
    'public.restore_case_document(bigint)',
    'public.case_record_archive_stamp()',
    'public.case_record_archive_trail()'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
  end loop;
  foreach f in array array[
    'public.can_supervise_case_records(text)',
    'public.archive_case_note(uuid)',
    'public.restore_case_note(uuid)',
    'public.restore_case_document(bigint)'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;


-- ── 4. Triggers ──────────────────────────────────────────────────────────────
drop trigger if exists trg_case_notes_archive_stamp on public.case_notes;
create trigger trg_case_notes_archive_stamp before update on public.case_notes
  for each row execute function public.case_record_archive_stamp();
drop trigger if exists trg_case_notes_archive_trail on public.case_notes;
create trigger trg_case_notes_archive_trail after update of deleted_at on public.case_notes
  for each row execute function public.case_record_archive_trail();

drop trigger if exists trg_attachments_archive_stamp on public.attachments;
create trigger trg_attachments_archive_stamp before update on public.attachments
  for each row execute function public.case_record_archive_stamp();
drop trigger if exists trg_attachments_archive_trail on public.attachments;
create trigger trg_attachments_archive_trail after update of deleted_at on public.attachments
  for each row execute function public.case_record_archive_trail();


-- ── 5. case_notes policies (the 20261017_41 rule, plus the archive) ──────────
drop policy if exists "case notes readable by author or firm"       on public.case_notes;
drop policy if exists "case notes readable by author, team or firm" on public.case_notes;
create policy "case notes readable by author, team or firm" on public.case_notes
  for select to authenticated
  using (
    (deleted_at is null and (
        author_user_id = auth.uid()
        or (visibility = 'firm' and firm_id is not null and public.can_access_case_row(null, firm_id))
        or (visibility = 'case_team' and public.is_case_team_member(request_id))))
    or (deleted_at is not null and (
        author_user_id = auth.uid()
        or (visibility = 'firm' and public.can_supervise_case_records(request_id))
        or (visibility = 'case_team' and public.can_supervise_case_records(request_id)
            and public.is_case_team_member(request_id))))
  );

drop policy if exists "case notes insertable by author" on public.case_notes;
create policy "case notes insertable by author" on public.case_notes
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and deleted_at is null
    and deleted_by is null
    and exists (
      select 1 from public.service_requests sr
       where sr.id = case_notes.request_id
         and (
           sr.requester_user_id = auth.uid()
           or sr.assigned_to = auth.uid()
           or (sr.firm_id is not null and public.can_access_case_row(null, sr.firm_id))
         )
    )
    and public.case_note_scope_ok(request_id, visibility, firm_id)
  );

drop policy if exists "case notes updatable by author" on public.case_notes;
create policy "case notes updatable by author" on public.case_notes
  for update to authenticated
  using (author_user_id = auth.uid() and deleted_at is null)
  with check (author_user_id = auth.uid() and deleted_at is null
              and public.case_note_scope_ok(request_id, visibility, firm_id));

drop policy if exists "case notes deletable by author" on public.case_notes;

-- Privileges: no DELETE for anyone but the service role; UPDATE on the three
-- columns PATCH /api/v1/cases/[id]/notes/[noteId] writes. A table-level REVOKE
-- also drops earlier column grants, so the GRANT below is the whole list.
revoke delete, truncate on public.case_notes from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.case_notes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke delete, truncate, update on public.case_notes from authenticated;
    grant select, insert on public.case_notes to authenticated;
    grant update (body, visibility, firm_id) on public.case_notes to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.case_notes to service_role;
  end if;
end $$;


-- ── 6. attachments: supervisors see the archive; no hard delete ──────────────
drop policy if exists "archived case documents readable by case supervisors" on public.attachments;
create policy "archived case documents readable by case supervisors" on public.attachments
  for select to authenticated
  using (deleted_at is not null and request_id is not null and public.can_supervise_case_records(request_id));

revoke delete, truncate on public.attachments from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke delete, truncate on public.attachments from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke delete, truncate on public.attachments from authenticated;
  end if;
end $$;


-- ── 7. case_record_history: read-only for everyone through the API ──────────
drop policy if exists "case record history readable by actor, writer or supervisor" on public.case_record_history;
create policy "case record history readable by actor, writer or supervisor" on public.case_record_history
  for select to authenticated
  using (
    actor_user_id = auth.uid()
    or record_owner = auth.uid()
    or (record_kind = 'case_document' and public.can_supervise_case_records(request_id))
    or (record_visibility = 'firm' and public.can_supervise_case_records(request_id))
    or (record_visibility = 'case_team' and public.can_supervise_case_records(request_id)
        and public.is_case_team_member(request_id))
  );

revoke all on public.case_record_history from public;
revoke all on sequence public.case_record_history_id_seq from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on public.case_record_history from %I', r);
      execute format('revoke all on sequence public.case_record_history_id_seq from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on public.case_record_history to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.case_record_history to service_role;
  end if;
end $$;


-- ── 8. Verify (raises → rolls back) ──────────────────────────────────────────
do $$
declare
  n   int;
  r   text;
  f   text;
  bad text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'case_notes' and column_name = 'deleted_at') then
    raise exception '20261025_51 verify: case_notes.deleted_at is missing';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.case_notes'::regclass and polcmd in ('d', '*')) then
    raise exception '20261025_51 verify: a DELETE policy is still on case_notes';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.case_notes'::regclass;
  if n <> 3 then
    raise exception '20261025_51 verify: case_notes carries % policies, expected 3 (select, insert, update)', n;
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.case_notes'::regclass and polcmd = 'r'
                   and pg_get_expr(polqual, polrelid) ilike '%deleted_at IS NULL%'
                   and pg_get_expr(polqual, polrelid) ilike '%is_case_team_member%'
                   and pg_get_expr(polqual, polrelid) ilike '%can_supervise_case_records%') then
    raise exception '20261025_51 verify: the case_notes SELECT policy lacks the archive split';
  end if;
  select string_agg(polname, ', ') into bad from pg_policy
   where polrelid = 'public.case_notes'::regclass and polcmd in ('a', 'w')
     and coalesce(pg_get_expr(polwithcheck, polrelid), '') !~ 'case_note_scope_ok';
  if bad is not null then
    raise exception '20261025_51 verify: case_notes write policies without case_note_scope_ok: %', bad;
  end if;

  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      if has_table_privilege(r, 'public.case_notes', 'DELETE') or has_table_privilege(r, 'public.case_notes', 'TRUNCATE') then
        raise exception '20261025_51 verify: % can DELETE/TRUNCATE case_notes', r;
      end if;
      if has_table_privilege(r, 'public.attachments', 'DELETE') or has_table_privilege(r, 'public.attachments', 'TRUNCATE') then
        raise exception '20261025_51 verify: % can DELETE/TRUNCATE attachments', r;
      end if;
      if has_column_privilege(r, 'public.case_notes', 'deleted_at', 'UPDATE')
         or has_column_privilege(r, 'public.case_notes', 'deleted_by', 'UPDATE')
         or has_column_privilege(r, 'public.case_notes', 'author_user_id', 'UPDATE')
         or has_column_privilege(r, 'public.case_notes', 'request_id', 'UPDATE') then
        raise exception '20261025_51 verify: % can UPDATE a locked case_notes column', r;
      end if;
      foreach f in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(r, 'public.case_record_history', f) then
          raise exception '20261025_51 verify: % holds % on case_record_history', r, f;
        end if;
      end loop;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if not (has_column_privilege('authenticated', 'public.case_notes', 'body', 'UPDATE')
            and has_column_privilege('authenticated', 'public.case_notes', 'visibility', 'UPDATE')
            and has_column_privilege('authenticated', 'public.case_notes', 'firm_id', 'UPDATE')) then
      raise exception '20261025_51 verify: authenticated lost UPDATE on case_notes body/visibility/firm_id (editing a note would fail)';
    end if;
    if has_table_privilege('anon', 'public.case_record_history', 'SELECT') then
      raise exception '20261025_51 verify: anon can read case_record_history';
    end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach f in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('service_role', 'public.case_record_history', f) then
        raise exception '20261025_51 verify: service_role holds % on case_record_history — the trail must be append-only', f;
      end if;
    end loop;
  end if;

  foreach f in array array['public.can_supervise_case_records(text)', 'public.archive_case_note(uuid)',
                           'public.restore_case_note(uuid)', 'public.restore_case_document(bigint)'] loop
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then
      raise exception '20261025_51 verify: % is not SECURITY DEFINER', f;
    end if;
    if has_function_privilege('public', f, 'EXECUTE')
       or (exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE')) then
      raise exception '20261025_51 verify: % is executable by PUBLIC/anon', f;
    end if;
  end loop;

  select count(*) into n from pg_trigger
   where not tgisinternal and tgname in ('trg_case_notes_archive_stamp', 'trg_case_notes_archive_trail',
                                         'trg_attachments_archive_stamp', 'trg_attachments_archive_trail');
  if n <> 4 then
    raise exception '20261025_51 verify: % of the 4 archive triggers exist', n;
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.attachments'::regclass
                   and polname = 'archived case documents readable by case supervisors') then
    raise exception '20261025_51 verify: the supervisor read of archived case documents is missing';
  end if;

  raise notice '20261025_51 verify: OK — case notes and case documents archive instead of delete (no DELETE for the API roles), supervisors read and restore what others archived (never a private note), deleted_by stamped from the session, append-only case_record_history, firm owner notified';
end $$;

commit;

notify pgrst, 'reload schema';
