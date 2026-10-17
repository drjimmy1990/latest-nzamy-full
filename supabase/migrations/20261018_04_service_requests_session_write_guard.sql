-- =============================================================================
-- Migration: 20261018_04_service_requests_session_write_guard.sql
-- =============================================================================
-- PURPOSE (fix plan 2026-10-16, row N16; owner answers ١٨٧ / ١٨٨)
--   A request's lawyer is chosen by the office — priority to Nezamy's own
--   office, then an approved partner firm (١٨٧) — and its chat room joins the
--   request's two parties only (١٨٨). The database did not hold that:
--
--     * "clients create their own service requests" checks only
--       requester_user_id, so a client could INSERT a request with
--       assigned_to = any lawyer; the API route even copied `assignedTo` from
--       the request body;
--     * "participants update service requests" lets the requester (or the
--       assignee) UPDATE any column of the row, so a client could change
--       assigned_to later — and the chat follows assigned_to, so a client could
--       open a room with any lawyer they "assigned";
--     * the same policy lets a participant rewrite description, metadata
--       (including a delivered order's deliverable pointer), payment, receiver …
--       through raw PostgREST, skipping every check the routes make.
--       20260917 tried to stop description/metadata with
--       `revoke update (description, metadata)`, but a column REVOKE does not
--       narrow a table-level UPDATE grant, and every public table carries
--       GRANT ALL (fix plan N20, the 2026-10-10 dump) — so that lock was
--       ineffective while the table-level grant stood.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   A BEFORE INSERT OR UPDATE trigger, trg_00_service_requests_session_guard
--   (named to fire before the other BEFORE triggers), guards every write made
--   by a role OTHER than the trusted ones — postgres, service_role,
--   supabase_admin. Trusted: the server routes (service role: the admin
--   claim / reassign, the lawyer's convert / finance inserts), the SQL
--   editor, and the SECURITY DEFINER client actions owned by postgres
--   (edit_service_request_description, request_service_order_revision),
--   which run as their owner and make their own checks. Everything else —
--   authenticated, anon, any other role — is guarded (fail-closed):
--     * INSERT: assigned_to must be empty or the caller (a lawyer filing their
--       own case or hearing assigns it to themselves);
--     * UPDATE: only status and updated_at may change (the generic status
--       PATCH, the lawyer's status syncs, cancel_own_service_request, which is
--       SECURITY INVOKER on production and writes status + updated_at), plus
--       lawyer_client_id — and that only by the request's assigned lawyer
--       (src/app/api/v1/lawyer/clients/_link.ts). Any other column change
--       raises 42501.
--   A trigger, not grants: a schema restore or a GRANT ALL cannot undo it.
--   Raising verify; marker.
--
-- WHAT IT DOES NOT DO
--   * It does not restrict which status a participant may set (a requester can
--     still PATCH status through raw REST, as before — the cancel lock of
--     20260917 still applies). Reported, not widened here.
--   * Insert-time payment / status values are not checked (the intake route
--     sets them). Reported.
--
-- DEPLOY ORDER — EITHER ORDER
--   Every write the code makes today passes the guard (verified against
--   every .insert/.update of service_requests in src/: session updates touch
--   status or, for the assigned lawyer, lawyer_client_id; session inserts
--   carry assigned_to = null or the caller). The commit that adds this file
--   also stops the POST route from copying a foreign assignedTo.
--
-- BEFORE APPLYING — writers outside this repo
--   Anything that writes service_requests with a USER's session (a native
--   app, an n8n workflow using a user JWT) is guarded the same way; one using
--   the service-role key is not. If such a writer changes other columns, it
--   gets 42501 after this file.
--
-- ROLLBACK
--   drop trigger if exists trg_00_service_requests_session_guard on public.service_requests;
--   drop function if exists public.guard_service_request_session_writes();
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261018_04: public.service_requests does not exist';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.service_requests'::regclass
                    and attname = 'lawyer_client_id' and not attisdropped) then
    raise exception '20261018_04: service_requests.lawyer_client_id is missing — apply 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
end $$;

create or replace function public.guard_service_request_session_writes()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  free_on_update constant text[] := array['status', 'updated_at', 'lawyer_client_id'];
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.assigned_to is not null and new.assigned_to is distinct from auth.uid() then
      raise exception using errcode = '42501',
        message = 'service_requests: assigned_to is set by the office (claim / admin), not by the requester';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - free_on_update) is distinct from (to_jsonb(old) - free_on_update) then
    raise exception using errcode = '42501',
      message = 'service_requests: a session may change only the status of a request — use the request''s own actions for anything else';
  end if;
  if new.lawyer_client_id is distinct from old.lawyer_client_id
     and (old.assigned_to is null or old.assigned_to is distinct from auth.uid()) then
    raise exception using errcode = '42501',
      message = 'service_requests: only the assigned lawyer links a request to a client card';
  end if;
  return new;
end $$;

comment on function public.guard_service_request_session_writes() is
  'N16 (20261018_04): a session (any role but postgres / service_role / supabase_admin) may insert a request only unassigned or assigned to itself, and may update only status (plus lawyer_client_id by the assigned lawyer).';

revoke all on function public.guard_service_request_session_writes() from public, anon, authenticated;

drop trigger if exists trg_00_service_requests_session_guard on public.service_requests;
create trigger trg_00_service_requests_session_guard
  before insert or update on public.service_requests
  for each row execute function public.guard_service_request_session_writes();

comment on trigger trg_00_service_requests_session_guard on public.service_requests is
  'SESSION-WRITE GUARD since 20261018_04 (fix plan N16) — read by _verify.sql.';

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  first_before text;
begin
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.service_requests'::regclass
                    and tgname = 'trg_00_service_requests_session_guard'
                    and not tgisinternal and tgenabled <> 'D') then
    raise exception '20261018_04 verify: the guard trigger is missing or disabled';
  end if;
  select t.tgname into first_before
    from pg_trigger t
   where t.tgrelid = 'public.service_requests'::regclass
     and not t.tgisinternal
     and (t.tgtype & 2) = 2          -- BEFORE
   order by t.tgname
   limit 1;
  if first_before <> 'trg_00_service_requests_session_guard' then
    raise exception '20261018_04 verify: % fires before the guard', first_before;
  end if;
  if exists (select 1 from pg_proc where oid = 'public.guard_service_request_session_writes()'::regprocedure and prosecdef) then
    raise exception '20261018_04 verify: the guard is SECURITY DEFINER (current_user would always be its owner)';
  end if;
  raise notice '20261018_04 verify: OK — session writes to service_requests: insert unassigned or self-assigned; update status only (+ lawyer_client_id by the assignee)';
end $$;

commit;
