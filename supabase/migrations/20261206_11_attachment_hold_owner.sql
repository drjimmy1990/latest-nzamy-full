-- =============================================================================
-- Migration: 20261206_11_attachment_hold_owner.sql   (verify id: l16_hold)
-- =============================================================================
-- PURPOSE (batch l16, builder «secdb» — owner decision س٢٠٣, gaps A-32 / D-130)
--
--   «كل طرف يملك ويحذف ملفه فقط؛ رفع الحجز لصاحب الملف أو الإدارة فقط؛ والطرف
--   الآخر يطلب الرفع دون تنفيذ مباشر.»
--   Until now the RLS policy "attachments owner update" (20260906) let the
--   file's owner OR either party of its request update the row, and the
--   session column guard (20261203_80) let a session change exactly
--   deleted_at / deleted_by / legal_hold / hold_reason — so the other party
--   could lift a hold on, or bin, a file that is not his.
--
-- WHAT IT DOES (no policy is replaced or dropped — WHO may update a row stays
-- "attachments owner update"; this file narrows WHAT each of them may change)
--   1. public.can_manage_attachment(p_request text, p_owner uuid) → boolean,
--      SECURITY DEFINER, authenticated: the caller manages the file when he
--      owns it (owner_user_id = auth.uid()), or when the caller supervises
--      the case (public.can_supervise_case_records, 20261025_51: the firm
--      owner / the active-member lead of a firm case; the assignee of a solo
--      case) AND the file is not the other side's: its owner is neither party
--      of the request (a team member's upload), or — on a firm case — its
--      owner is the firm's owner or an ACTIVE member of that firm (the lead's
--      own files, a colleague who filed the case). So firm supervision of the
--      firm's own files is unchanged, and nobody manages the client's (or
--      another firm's) file.
--   2. trg_03_attachments_hold_owner — BEFORE UPDATE, SECURITY INVOKER (the
--      20261026_65 / 20261203_80 pattern: postgres / service_role /
--      supabase_admin pass), sorted after trg_02_ and before
--      trg_attachments_archive_stamp. For a session caller:
--        * legal_hold false → true (placing a hold): any caller RLS admits —
--          either party may hold any file of the request (with a reason);
--        * legal_hold true → false (lifting): can_manage_attachment, or a
--          platform admin (public.is_admin());
--        * hold_reason changed while the hold stays: as lifting;
--        * deleted_at / deleted_by changed (bin or restore): can_manage_
--          attachment only.
--      Anything else refused with 42501 and a message the routes map.
--   3. public.restore_case_document(p_id) re-created (same signature, same
--      grants): its «participant of the case» arm is gone — the owner, or a
--      supervisor for a team file (can_manage_attachment), or a supervisor of
--      the case for a file whose owner is not a party. It is SECURITY DEFINER,
--      so the trigger above trusts it; the rule therefore lives here too.
--   4. «طلب رفع الحجز» — public.attachment_hold_lift_requests (append-only:
--      RLS on, SELECT for the requester / the file owner / an admin, no
--      session write) and public.request_attachment_hold_lift(p_id bigint,
--      p_reason text) → bigint, SECURITY DEFINER, authenticated: the caller is
--      a party of the file's request, not its owner, and the file is on hold.
--      It writes the request row, notifies the file's owner and the platform
--      admins (public.notifications) and writes an admin_audit_events row. It
--      never changes the file. A second request by the same caller for the
--      same file within 24 hours returns the first one's id.
--   Lifting by an admin: PATCH /api/v1/admin/documents/[id]/hold (service role
--   + requireStaff + admin audit) — the trigger trusts service_role.
--   Storage: the documents bucket policies are already own-folder only and
--   refuse a case document's object (supabase/storage_policies_documents.sql,
--   20261025_51 storage_object_is_case_document) — nothing to change.
--
-- HOW TO RUN (any time; recommended right AFTER the deploy — the deployed
--   routes then answer the new refusals with a clear sentence; before the
--   deploy the old routes answer them with the generic «غير مصرح لك بهذا الإجراء»):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_11_attachment_hold_owner.sql
--   Expect: NOTICE  l16_hold verify: OK …  and a row with `t`.
--
-- RUN ORDER: after 20261025_51, 20261203_80. Idempotent.
--
-- Docker: supabase/tests/rls/attachment_hold_owner.test.sql
--
-- ROLLBACK (manual):
--   drop trigger if exists trg_03_attachments_hold_owner on public.attachments;
--   drop function if exists public.guard_attachment_hold_owner();
--   drop function if exists public.request_attachment_hold_lift(bigint, text);
--   drop table if exists public.attachment_hold_lift_requests;
--   re-run 20261025_51 section restore_case_document (puts the participant arm back);
--   drop function if exists public.can_manage_attachment(text, uuid);
-- =============================================================================

set lock_timeout = '10s';

begin;

do $pre$
begin
  if to_regclass('public.attachments') is null then
    raise exception '20261206_11: public.attachments is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'attachments' and column_name = 'legal_hold') then
    raise exception '20261206_11: attachments.legal_hold is missing — run 20260906_phase6_settings_out_of_browser.sql first';
  end if;
  if to_regprocedure('public.can_supervise_case_records(text)') is null then
    raise exception '20261206_11: public.can_supervise_case_records(text) is missing — run 20261025_51_soft_delete_case_notes_docs.sql first';
  end if;
end
$pre$;

-- ── 1. who manages a file ────────────────────────────────────────────────────
create or replace function public.can_manage_attachment(p_request text, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- coalesce: a file with no owner (p_owner NULL) must answer false, never
  -- NULL — the guard below tests `not v_manage`, and NOT NULL raises nothing.
  select coalesce(auth.uid() is not null and (
    p_owner = auth.uid()
    or (p_request is not null
        and exists (select 1 from public.service_requests sr
                     where sr.id = p_request
                       and (
                         -- a third person's file (neither party of the request)
                         (p_owner is distinct from sr.requester_user_id
                          and p_owner is distinct from sr.assigned_to)
                         -- or, on a FIRM case, a file of the firm's own side:
                         -- its owner or an active member of THAT firm (the
                         -- client, or a lawyer of another firm, is neither)
                         or (sr.firm_id is not null and p_owner is not null
                             and (exists (select 1 from public.firm_profiles fp
                                           where fp.id = sr.firm_id and fp.owner_user_id = p_owner)
                                  or exists (select 1 from public.firm_members m
                                              where m.firm_id = sr.firm_id and m.user_id = p_owner
                                                and m.status = 'active')))
                       ))
        and public.can_supervise_case_records(p_request))
  ), false);
$$;

comment on function public.can_manage_attachment(text, uuid) is
  'س٢٠٣ (20261206_11): the caller may lift a hold on, bin or restore this file — its owner, or a supervisor of the case when the file is not the other side''s (owner neither party, or on a firm case the firm owner / an active member of that firm). Never the client''s or another firm''s file.';

-- ── 2. the hold / bin guard ──────────────────────────────────────────────────
create or replace function public.guard_attachment_hold_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_manage boolean;
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  v_manage := coalesce(public.can_manage_attachment(old.request_id, old.owner_user_id), false);

  if (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by)
     and not v_manage then
    raise exception using errcode = '42501',
      message = 'attachments: only the owner of a file can delete or restore it';
  end if;

  if coalesce(old.legal_hold, false) and not coalesce(new.legal_hold, false)
     and not (v_manage or public.is_admin()) then
    raise exception using errcode = '42501',
      message = 'attachments: only the owner of a file or the administration can lift its hold';
  end if;

  if coalesce(old.legal_hold, false) and coalesce(new.legal_hold, false)
     and new.hold_reason is distinct from old.hold_reason
     and not (v_manage or public.is_admin()) then
    raise exception using errcode = '42501',
      message = 'attachments: only the owner of a file or the administration can lift its hold';
  end if;

  return new;
end
$$;

comment on function public.guard_attachment_hold_owner() is
  'س٢٠٣ (20261206_11): a session places a hold on any file it may update, but lifts a hold, changes its reason, bins or restores only a file it manages (public.can_manage_attachment); an admin may also lift. Trusted roles pass.';

do $trg$
begin
  execute 'drop trigger if exists trg_03_attachments_hold_owner on public.attachments';
  execute 'create trigger trg_03_attachments_hold_owner before update on public.attachments '
          'for each row execute function public.guard_attachment_hold_owner()';
  execute $c$comment on trigger trg_03_attachments_hold_owner on public.attachments is
    'HOLD / BIN OWNER GUARD since 20261206_11 (س٢٠٣) — read by _verify.sql (verify:l16_hold).'$c$;
end
$trg$;

-- ── 3. restore_case_document without the «other party» arm ───────────────────
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
     and public.can_manage_attachment(a.request_id, a.owner_user_id);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

comment on function public.restore_case_document(bigint) is
  '20261025_51, narrowed by 20261206_11 (س٢٠٣): restore an archived case document — its owner, or a supervisor of the case for a team file whose owner is neither party (public.can_manage_attachment). The other party no longer can.';

-- ── 4. «طلب رفع الحجز» ───────────────────────────────────────────────────────
create table if not exists public.attachment_hold_lift_requests (
  id            bigserial primary key,
  attachment_id bigint not null,
  request_id    text,
  file_owner    uuid,
  requested_by  uuid not null,
  reason        text not null default ''
                  constraint attachment_hold_lift_requests_reason_len check (char_length(reason) <= 500),
  created_at    timestamptz not null default now()
);

comment on table public.attachment_hold_lift_requests is
  'س٢٠٣ (20261206_11): «طلب رفع الحجز» — the other party of a request asks the file''s owner (and the administration) to lift a legal hold. Written only by request_attachment_hold_lift(); append-only; no FK so the record outlives the file.';

create index if not exists attachment_hold_lift_requests_attachment_idx
  on public.attachment_hold_lift_requests (attachment_id, created_at desc);

alter table public.attachment_hold_lift_requests enable row level security;
revoke all on table public.attachment_hold_lift_requests from public;
do $g$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table public.attachment_hold_lift_requests from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on table public.attachment_hold_lift_requests from authenticated;
    grant select on table public.attachment_hold_lift_requests to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on table public.attachment_hold_lift_requests to service_role;
    grant usage, select on sequence public.attachment_hold_lift_requests_id_seq to service_role;
  end if;
end
$g$;

drop policy if exists "hold lift requests: requester, file owner or admin" on public.attachment_hold_lift_requests;
create policy "hold lift requests: requester, file owner or admin" on public.attachment_hold_lift_requests
  for select to authenticated
  using (requested_by = auth.uid() or file_owner = auth.uid() or public.is_admin());

create or replace function public.attachment_hold_lift_requests_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'attachment_hold_lift_requests is append-only' using errcode = '42501';
end
$$;

drop trigger if exists trg_attachment_hold_lift_requests_append_only on public.attachment_hold_lift_requests;
create trigger trg_attachment_hold_lift_requests_append_only
  before update or delete on public.attachment_hold_lift_requests
  for each row execute function public.attachment_hold_lift_requests_append_only();

create or replace function public.request_attachment_hold_lift(p_id bigint, p_reason text)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_doc    record;
  v_sr     record;
  v_id     bigint;
  v_reason text := left(btrim(coalesce(p_reason, '')), 500);
  v_name   text;
  v_title  text;
  v_body   text;
  v_href   boolean;
begin
  if v_uid is null then
    raise exception 'request_attachment_hold_lift: sign in' using errcode = '42501';
  end if;
  select a.id, a.request_id, a.owner_user_id, a.file_name, coalesce(a.legal_hold, false) as legal_hold
    into v_doc
    from public.attachments a where a.id = p_id;
  if not found or v_doc.request_id is null then
    raise exception 'request_attachment_hold_lift: no such file' using errcode = 'P0002';
  end if;
  select sr.id, sr.title, sr.requester_user_id, sr.assigned_to
    into v_sr
    from public.service_requests sr where sr.id = v_doc.request_id;
  -- coalesce: on a request with no assignee `assigned_to = v_uid` is NULL and
  -- NOT (false OR NULL) is NULL, which would let a stranger through. A
  -- non-party gets exactly the answer a missing file gets, before any other check.
  if not found or not coalesce(v_sr.requester_user_id = v_uid or v_sr.assigned_to = v_uid, false) then
    -- not a party: answered as "no such file", never "exists but not yours"
    raise exception 'request_attachment_hold_lift: no such file' using errcode = 'P0002';
  end if;
  if v_doc.owner_user_id = v_uid then
    raise exception 'request_attachment_hold_lift: the owner lifts his own hold' using errcode = '22023';
  end if;
  if not v_doc.legal_hold then
    raise exception 'request_attachment_hold_lift: the file is not on hold' using errcode = '22023';
  end if;

  select r.id into v_id
    from public.attachment_hold_lift_requests r
   where r.attachment_id = p_id and r.requested_by = v_uid
     and r.created_at > pg_catalog.now() - interval '24 hours'
   order by r.created_at desc
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.attachment_hold_lift_requests (attachment_id, request_id, file_owner, requested_by, reason)
  values (p_id, v_doc.request_id, v_doc.owner_user_id, v_uid, v_reason)
  returning id into v_id;

  insert into public.admin_audit_events (actor_id, action, target_type, target_id, metadata)
  values (v_uid, 'attachment_hold_lift_requested', 'attachment', p_id::text,
          pg_catalog.jsonb_build_object('request_id', v_doc.request_id, 'lift_request_id', v_id,
                                        'file_owner', v_doc.owner_user_id, 'reason', v_reason));

  -- The notices are a courtesy: the request row and the audit row above stand
  -- even if a notice cannot be written.
  begin
    select nullif(btrim(p.display_name), '') into v_name from public.profiles p where p.id = v_uid;
    v_title := 'طلب رفع الحجز عن ملف';
    v_body  := pg_catalog.format('%s يطلب رفع الحجز القانوني عن الملف «%s» في الطلب «%s».%s',
                 coalesce(v_name, 'الطرف الآخر'),
                 coalesce(nullif(btrim(v_doc.file_name), ''), 'بلا اسم'),
                 coalesce(nullif(btrim(v_sr.title), ''), 'بلا عنوان'),
                 case when v_reason <> '' then ' السبب: ' || v_reason else '' end);
    v_href := exists (select 1 from information_schema.columns c
                       where c.table_schema = 'public' and c.table_name = 'notifications' and c.column_name = 'href');
    -- the owner may be a client or a lawyer (different pages): no link
    if v_doc.owner_user_id is not null then
      execute 'insert into public.notifications (user_id, title, body) values ($1, $2, $3)'
        using v_doc.owner_user_id, v_title, v_body || ' رفع الحجز إليك وحدك أو إلى الإدارة.';
    end if;
    if v_href then
      execute 'insert into public.notifications (user_id, title, body, href)
               select p.id, $1, $2, $3 from public.profiles p where p.user_type = ''admin'''
        using v_title, v_body, '/dashboard/admin/audit-log';
    else
      execute 'insert into public.notifications (user_id, title, body)
               select p.id, $1, $2 from public.profiles p where p.user_type = ''admin'''
        using v_title, v_body;
    end if;
  exception when others then
    raise warning 'request_attachment_hold_lift: notice not written (%): %', sqlstate, sqlerrm;
  end;

  return v_id;
end
$$;

comment on function public.request_attachment_hold_lift(bigint, text) is
  'س٢٠٣ (20261206_11): «طلب رفع الحجز» — a party of the file''s request who does not own it asks for its hold to be lifted. Writes a request row + an admin audit row, notifies the owner and the admins; never changes the file. Returns the request id (the same id again within 24 hours).';

-- ── grants ───────────────────────────────────────────────────────────────────
do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.can_manage_attachment(text, uuid)',
    'public.request_attachment_hold_lift(bigint, text)',
    'public.restore_case_document(bigint)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  foreach f in array array[
    'public.guard_attachment_hold_owner()',
    'public.attachment_hold_lift_requests_append_only()'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
end
$grants$;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
begin
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.attachments'::regclass
                    and tgname = 'trg_03_attachments_hold_owner' and tgenabled <> 'D'
                    and tgfoid = 'public.guard_attachment_hold_owner()'::regprocedure) then
    missing := missing || ' trg_03_attachments_hold_owner missing or disabled;';
  end if;
  if coalesce((select prosecdef from pg_catalog.pg_proc where oid = 'public.guard_attachment_hold_owner()'::regprocedure), true) then
    missing := missing || ' guard_attachment_hold_owner must be SECURITY INVOKER;';
  end if;
  if coalesce(pg_catalog.pg_get_functiondef('public.restore_case_document(bigint)'::regprocedure), '') !~ 'can_manage_attachment' then
    missing := missing || ' restore_case_document still has the other-party arm;';
  end if;
  if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
                    where oid = 'public.request_attachment_hold_lift(bigint, text)'::regprocedure), false)
     or not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc
                    where oid = 'public.can_manage_attachment(text, uuid)'::regprocedure), false) then
    missing := missing || ' the hold-lift request / can_manage_attachment functions are not SECURITY DEFINER with an empty search_path;';
  end if;
  -- l16 review: the NULL-safe party test and the NULL-safe manage answer
  if coalesce(pg_catalog.pg_get_functiondef('public.request_attachment_hold_lift(bigint, text)'::regprocedure), '')
       !~ 'not coalesce\(v_sr\.requester_user_id = v_uid or v_sr\.assigned_to = v_uid, false\)'
     or coalesce(pg_catalog.pg_get_functiondef('public.can_manage_attachment(text, uuid)'::regprocedure), '')
       !~ 'select coalesce\(auth\.uid\(\) is not null' then
    missing := missing || ' the party / manage tests are not NULL-safe (a request with no assignee lets a stranger in);';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.attachment_hold_lift_requests', 'INSERT')
          or has_table_privilege('authenticated', 'public.attachment_hold_lift_requests', 'UPDATE')
          or has_table_privilege('authenticated', 'public.attachment_hold_lift_requests', 'DELETE')) then
    missing := missing || ' sessions can write attachment_hold_lift_requests;';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and (has_function_privilege('anon', 'public.request_attachment_hold_lift(bigint, text)', 'EXECUTE')
          or has_function_privilege('anon', 'public.can_manage_attachment(text, uuid)', 'EXECUTE')) then
    missing := missing || ' a guest can call the hold functions;';
  end if;
  if missing <> '' then
    raise exception 'l16_hold verify:%', missing;
  end if;
  raise notice 'l16_hold verify: OK — a party places a hold on any file of its request; only the file owner (or the case supervisor for a team file, or an admin) lifts it; only the owner bins or restores; «طلب رفع الحجز» recorded and notified';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261206_11 l16 س٢٠٣: file holds — only the owner lifts or bins; the other party requests' as migration,
       exists (select 1 from pg_catalog.pg_trigger
                where tgrelid = 'public.attachments'::regclass and tgname = 'trg_03_attachments_hold_owner')
       and to_regprocedure('public.request_attachment_hold_lift(bigint, text)') is not null as ok;
