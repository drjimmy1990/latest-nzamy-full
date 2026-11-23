-- =============================================================================
-- Migration: 20261203_80_vault_document_session_columns.sql
-- Batch l13 vault (owner Q167 — the vault starts after its permissions are
-- fixed and it passes a security review). Report: D:\nzwt\reports\l13-vault.md.
-- =============================================================================
--
-- WHAT IT DOES
--   A signed-in session (any role but postgres / service_role / supabase_admin,
--   the 20261026_65 pattern) may change ONLY these columns of a row of
--   public.attachments it is allowed to update:
--       deleted_at, deleted_by   the bin (DELETE /api/v1/documents/[id], restore)
--       legal_hold, hold_reason  the legal hold (PATCH …/hold)
--   — exactly what the app writes through a session (checked 2026-11-23: no
--   other session update of attachments exists in src/). `updated_at`, if a
--   database ever carries one, is let through too (no reader trusts it).
--   Every other column (file_name, mime_type, size_bytes, source, created_at,
--   label, …) is fixed for sessions once the row exists. The order bind, the
--   copy route, the account purge, restore_case_document and the cron run as
--   service_role / postgres and are not affected.
--
--   WHO may update a row does not change: "attachments owner update"
--   (20260906) still admits the owner and the order's two parties, and they
--   can still bin, restore and hold as before. Only WHAT they can rewrite is
--   narrowed.
--
-- HOW: one BEFORE UPDATE trigger, trg_02_attachments_session_columns. It sorts
-- after trg_00_ (65: file / owner / request fixed) and trg_01_ (72: folder
-- fixed) — neither changes NEW for a session — and before
-- trg_attachments_archive_stamp (51), which stamps deleted_by after it. The
-- functions of 65 and 72 are NOT re-created (_verify.sql pins their text).
-- A trigger rather than column grants: a re-run of an old migration or a
-- restore of default privileges cannot reopen it.
--
-- A FUTURE COLUMN that sessions must write has to be added to v_allowed below.
--
-- ORDER: any time — before or after the deploy (the deployed code already only
-- writes the four columns). Idempotent: create or replace, drop trigger if
-- exists. Docker: supabase/tests/rls/vault_document_session_columns.test.sql.
--
-- ROLLBACK (manual):
--   drop trigger if exists trg_02_attachments_session_columns on public.attachments;
--   drop function if exists public.guard_attachment_session_columns();
-- =============================================================================

set lock_timeout = '5s';

begin;

do $pre$
begin
  if to_regclass('public.attachments') is null then
    raise notice '20261203_80: public.attachments is missing — nothing to guard here';
  end if;
end
$pre$;

create or replace function public.guard_attachment_session_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allowed constant text[] := array['deleted_at', 'deleted_by', 'legal_hold', 'hold_reason', 'updated_at'];
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if (pg_catalog.to_jsonb(new) operator(pg_catalog.-) v_allowed)
     is distinct from (pg_catalog.to_jsonb(old) operator(pg_catalog.-) v_allowed) then
    raise exception using errcode = '42501',
      message = 'attachments: only the bin and the legal hold of a document can be changed';
  end if;
  return new;
end
$$;

comment on function public.guard_attachment_session_columns() is
  '20261203_80 (l13 vault, Q167): a session updates only deleted_at, deleted_by, legal_hold, hold_reason (and updated_at) of an attachments row; every other column is fixed once registered. Trusted roles pass.';

revoke all on function public.guard_attachment_session_columns() from public;
do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.guard_attachment_session_columns() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.guard_attachment_session_columns() from authenticated;
  end if;
end
$grants$;

do $trg$
begin
  if to_regclass('public.attachments') is null then
    return;
  end if;
  execute 'drop trigger if exists trg_02_attachments_session_columns on public.attachments';
  execute 'create trigger trg_02_attachments_session_columns before update on public.attachments '
          'for each row execute function public.guard_attachment_session_columns()';
  execute $c$comment on trigger trg_02_attachments_session_columns on public.attachments is
    'SESSION COLUMN GUARD since 20261203_80 — read by _verify.sql (verify:l13_vault).'$c$;
end
$trg$;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
begin
  if to_regclass('public.attachments') is null then
    raise notice '20261203_80 verify: OK — public.attachments is not on this database, nothing to guard';
    return;
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.attachments'::regclass
                    and tgname = 'trg_02_attachments_session_columns'
                    and tgenabled <> 'D'
                    and tgfoid = 'public.guard_attachment_session_columns()'::regprocedure) then
    raise exception '20261203_80 verify: the session column guard trigger is missing or disabled';
  end if;
  if coalesce((select prosecdef from pg_proc where oid = 'public.guard_attachment_session_columns()'::regprocedure), true) then
    raise exception '20261203_80 verify: guard_attachment_session_columns must be SECURITY INVOKER (current_user is the session''s role)';
  end if;
  if not coalesce((select proconfig @> array['search_path=""'] from pg_proc
                    where oid = 'public.guard_attachment_session_columns()'::regprocedure), false) then
    raise exception '20261203_80 verify: guard_attachment_session_columns has no empty search_path';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', 'public.guard_attachment_session_columns()', 'EXECUTE') then
    raise exception '20261203_80 verify: sessions can EXECUTE the guard function directly';
  end if;
  raise notice '20261203_80 verify: OK — a session changes only the bin and the legal hold of a document (attachments); trusted roles unaffected';
end
$verify$;

commit;

select '20261203_80 vault: attachments session updates limited to bin + legal hold' as migration,
       (to_regclass('public.attachments') is null
        or exists (select 1 from pg_trigger
                    where tgrelid = 'public.attachments'::regclass
                      and tgname = 'trg_02_attachments_session_columns'
                      and tgenabled <> 'D')) as ok;
