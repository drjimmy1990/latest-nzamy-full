-- =============================================================================
-- Migration: 20260917_service_request_client_actions_rpc.sql
-- Purpose:   Move the enforcement of three client self-service actions on
--            `service_requests` — edit the description before work starts,
--            request a free revision after delivery, cancel your own order —
--            from application code (the ONLY place they were enforced) into
--            the database, so no caller can bypass them regardless of which
--            client hits the API.
--
--            THE HOLE THIS CLOSES: `service_requests`' own UPDATE policy
--            ("participants update service requests",
--            20260518_client_workflow_backend_ready.sql) is
--              using (requester_user_id = auth.uid() or assigned_to = auth.uid())
--              with check (requester_user_id = auth.uid() or assigned_to = auth.uid())
--            — no awareness of status, delivery time, or revision count. The
--            ONLY thing that has ever enforced the 48h/2-revision policy
--            (`REVISION_LIMIT`/`REVISION_WINDOW_HOURS` inline in
--            src/app/api/v1/service-requests/[id]/route.ts), the
--            pending-assignment-only edit window (`orderEditGate.ts`), and
--            the "never cancel a delivered order" lock (`orderTransitions.ts`)
--            is the Next.js route's own TypeScript — and that route's own
--            comments say so ("RLS lets any participant write ANY column on
--            their own row"). Anyone with their own valid Supabase JWT and a
--            REST/PostgREST client — web or native, browser devtools or a
--            hand-rolled fetch — can already skip that route entirely and
--            edit a delivered order's description, submit unlimited
--            revisions, or cancel a completed engagement, today, on
--            production. Native's port of these three actions
--            (native/src/features/cases/orderGates.ts +
--            casesService.ts's updateCaseDescription/requestCaseRevision/
--            cancelCaseRequest) mirrors the same TypeScript-only gate for
--            the same reason web has it that way — it does not make this any
--            worse, but it does not fix it either.
--
-- Design:    Two different mechanisms for two different reasons.
--
--   1. EDIT (`description`) and REVISION (`metadata`) — column-level REVOKE.
--      No other legitimate write path in this codebase (web or native) ever
--      writes `description` or `metadata` on `service_requests` under RLS —
--      verified by grepping every `.update(`/`.upsert(` call against this
--      table across both apps (see the commit message this migration ships
--      with for the full list checked): the admin route uses the service
--      role (bypasses grants entirely, unaffected), and every other
--      RLS-scoped write (the generic status PATCH, the lawyer-consultation
--      status syncs) touches `status` alone, via `ALLOWED_PATCH_FIELDS =
--      new Set(['status'])` on the web side. So revoking UPDATE on exactly
--      these two columns from `authenticated`/`anon` is safe: it cannot
--      break anything that works today, and it makes a raw PATCH physically
--      unable to touch either column — no gate logic to get right, no
--      logic bug possible. `edit_service_request_description` and
--      `request_service_order_revision` below are SECURITY DEFINER so they
--      can still write these columns after doing every check the removed
--      application code did.
--
--   2. CANCEL (`status` → `'cancelled'`) — a trigger, not a column revoke.
--      `status` cannot be revoked the same way: the generic admin/lawyer
--      status-transition path (an admin claiming an order, a lawyer
--      self-tracking their own case, a consultation's opinion-delivery sync)
--      legitimately writes `status` to values OTHER than 'cancelled' via the
--      exact same RLS-scoped client, and must keep working. Postgres grants
--      have no notion of "this column, but only to this value" — that is
--      what `enforce_requester_cancel_lock()` below exists to add: a
--      `BEFORE UPDATE OF status` trigger that only ever intervenes when ALL
--      of (a) the new value is 'cancelled', (b) the old value was not
--      already 'cancelled', (c) the CALLER is the row's requester, and (d)
--      the caller is NOT also the assignee (excludes the legitimate
--      self-tracking case where the same person is both) — and even then
--      only refuses when `service_request_requester_cancellable()` (the
--      SQL mirror of `canRequesterCancel`/`hasBeenDelivered`) says no. Every
--      other status write, by any caller, through any path, is untouched:
--      the trigger fires on every `status` update but its body is a no-op
--      unless that exact combination is met. `auth.uid()` is a session-level
--      GUC PostgREST sets for the whole request, not tied to which function
--      or SECURITY context is executing — so the trigger sees the ORIGINAL
--      caller correctly whether the update came from a raw PATCH, from
--      `cancel_own_service_request` (SECURITY INVOKER — it does not need to
--      bypass anything, the row's own owner already has UPDATE via RLS; the
--      trigger is what actually enforces the policy, not the function), or
--      from the admin/lawyer paths (service-role connections have no JWT,
--      so `auth.uid()` is NULL there and the guard's `auth.uid() is not
--      null` clause exempts them outright).
--
--      This is why `cancel_own_service_request` is a genuinely different
--      shape from the other two: it is a convenience wrapper for a clean
--      error surface (RAISE EXCEPTION with the same reason tokens the web
--      route used to return), not the actual enforcement boundary. The
--      trigger is. A caller who skips the RPC and PATCHes `status` directly
--      hits the same wall.
--
-- Reason tokens: every RAISE EXCEPTION below uses a bare message that is
--      exactly one of the reason strings `orderEditGate.ts`/route.ts already
--      used (not_owner, not_pending, already_assigned, already_delivered,
--      invalid_description, not_applicable, not_delivered, window_expired,
--      quota_exhausted, empty_notes, notes_too_long, conflict, not_found).
--      supabase-js surfaces this as `error.message` on both platforms — the
--      caller maps it to the same Arabic copy the removed TypeScript gate
--      used to produce directly, not to a generic Postgres error string.
--
-- Idempotent: every statement is CREATE OR REPLACE / DROP-then-CREATE /
--      REVOKE-then-GRANT, all repeatable. No DROP TABLE, no DELETE, no data
--      movement, no column type change.
-- =============================================================================

-- ── Shared pure helpers ─────────────────────────────────────────────────────

-- Mirrors route.ts's `deliveredAtMs()`: when the order was delivered, or
-- null when it has never been delivered at all OR the stored value cannot
-- be parsed. Fails closed exactly like the TypeScript version — never
-- defaults to "now", never throws on a malformed value.
create or replace function public.service_request_delivered_at(p_metadata jsonb)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_raw text;
  v_ts timestamptz;
begin
  v_raw := p_metadata #>> '{deliverable,deliveredAt}';
  if v_raw is null or btrim(v_raw) = '' then
    return null;
  end if;
  begin
    v_ts := v_raw::timestamptz;
  exception when others then
    return null;
  end;
  return v_ts;
end;
$$;

revoke all on function public.service_request_delivered_at(jsonb) from public, anon, authenticated;
grant execute on function public.service_request_delivered_at(jsonb) to authenticated;

-- Mirrors `canRequesterCancel` (orderTransitions.ts) + the `!hasBeenDelivered`
-- conjunct route.ts adds on top of it. Non-`ai_workspace` rows are always
-- requester-cancellable from any status — the looser rule the PATCH route's
-- `else` branch already applies to lawyer/firm self-tracked rows.
create or replace function public.service_request_requester_cancellable(
  p_receiver text,
  p_status text,
  p_metadata jsonb
)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if p_receiver is distinct from 'ai_workspace' then
    return true;
  end if;
  if p_status is null or not (p_status = any (array['draft','pending_assignment','pending_payment','assigned','in_review'])) then
    return false;
  end if;
  if public.service_request_delivered_at(p_metadata) is not null then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function public.service_request_requester_cancellable(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.service_request_requester_cancellable(text, text, jsonb) to authenticated;

-- ── 1. Edit description — «تعديل الطلب قبل بدء التنفيذ» ─────────────────────
--
-- Mirrors `evaluateOrderEditability` + `validateEditedDescription` +
-- `appendEditHistory` (orderEditGate.ts) byte-for-byte: `pending_assignment`
-- is the only editable status, an assigned or delivered order is locked, the
-- new description is trimmed/length-capped, an unchanged save is a no-op
-- (not an error, not a write — matches the TypeScript route's own
-- `{success:true, unchanged:true}` branch), and the previous text is kept in
-- `metadata.editHistory` (append-only, oldest dropped past 20 entries).
create or replace function public.edit_service_request_description(
  p_request_id text,
  p_new_description text
)
returns public.service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.service_requests;
  v_trimmed text;
  v_now timestamptz := now();
  v_history jsonb;
begin
  select * into v_row from public.service_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  if v_row.requester_user_id is null or v_row.requester_user_id is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;

  if v_row.status is distinct from 'pending_assignment' then
    if v_row.status = 'completed'
       or ((v_row.metadata -> 'deliverable') is not null and (v_row.metadata -> 'deliverable') <> 'null'::jsonb)
    then
      raise exception 'already_delivered';
    end if;
    raise exception 'not_pending';
  end if;

  if v_row.assigned_to is not null then
    raise exception 'already_assigned';
  end if;

  if (v_row.metadata -> 'deliverable') is not null and (v_row.metadata -> 'deliverable') <> 'null'::jsonb then
    raise exception 'already_delivered';
  end if;

  v_trimmed := btrim(coalesce(p_new_description, ''));
  if v_trimmed = '' or length(v_trimmed) > 5000 then
    raise exception 'invalid_description';
  end if;

  if v_trimmed = v_row.description then
    return v_row;
  end if;

  v_history := coalesce(v_row.metadata -> 'editHistory', '[]'::jsonb);
  if jsonb_typeof(v_history) is distinct from 'array' then
    v_history := '[]'::jsonb;
  end if;
  v_history := v_history || jsonb_build_array(jsonb_build_object('at', v_now, 'previous', v_row.description));
  if jsonb_array_length(v_history) > 20 then
    select coalesce(jsonb_agg(elem order by ord), '[]'::jsonb) into v_history
    from (
      select elem, ord
      from jsonb_array_elements(v_history) with ordinality as t(elem, ord)
      order by ord desc
      limit 20
    ) s;
  end if;

  update public.service_requests
  set description = v_trimmed,
      metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{editHistory}', v_history, true),
      updated_at = v_now
  where id = p_request_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.edit_service_request_description(text, text) from public, anon;
grant execute on function public.edit_service_request_description(text, text) to authenticated;

-- ── 2. Request a revision — «طلب تعديل» ─────────────────────────────────────
--
-- Mirrors route.ts's `request_revision` branch: `ai_workspace` orders only,
-- `completed` with a real `deliverable.deliveredAt`, within
-- `REVISION_WINDOW_HOURS` (exact milliseconds — `now() > deliveredAt +
-- interval`, not floored hours, same reasoning as the removed TypeScript's
-- own comment on the boundary bug that fixed), fewer than `REVISION_LIMIT`
-- revisions already recorded, non-empty notes capped at 2000 chars. The
-- `where id = ... and status = 'completed'` on the UPDATE is the same
-- compare-and-swap the TypeScript route used: two concurrent requests can
-- never both spend the same budget slot, because the loser's UPDATE matches
-- zero rows once the winner has already moved the row to `in_review`.
create or replace function public.request_service_order_revision(
  p_request_id text,
  p_notes text
)
returns public.service_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.service_requests;
  v_delivered_at timestamptz;
  v_revisions jsonb;
  v_trimmed_notes text;
  v_now timestamptz := now();
  v_next_index int;
  v_updated_count int;
begin
  select * into v_row from public.service_requests where id = p_request_id;
  if not found then
    raise exception 'not_found';
  end if;

  if v_row.requester_user_id is null or v_row.requester_user_id is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;

  if v_row.receiver is distinct from 'ai_workspace' then
    raise exception 'not_applicable';
  end if;

  v_delivered_at := public.service_request_delivered_at(v_row.metadata);
  if v_row.status is distinct from 'completed' or v_delivered_at is null then
    raise exception 'not_delivered';
  end if;

  if v_now > v_delivered_at + make_interval(hours => 48) then
    raise exception 'window_expired';
  end if;

  v_revisions := coalesce(v_row.metadata -> 'revisions', '[]'::jsonb);
  if jsonb_typeof(v_revisions) is distinct from 'array' then
    v_revisions := '[]'::jsonb;
  end if;
  if jsonb_array_length(v_revisions) >= 2 then
    raise exception 'quota_exhausted';
  end if;

  v_trimmed_notes := btrim(coalesce(p_notes, ''));
  if v_trimmed_notes = '' then
    raise exception 'empty_notes';
  end if;
  if length(v_trimmed_notes) > 2000 then
    raise exception 'notes_too_long';
  end if;

  v_next_index := jsonb_array_length(v_revisions) + 1;

  update public.service_requests
  set status = 'in_review',
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{revisions}',
        v_revisions || jsonb_build_array(
          jsonb_build_object('requestedAt', v_now, 'notes', v_trimmed_notes, 'index', v_next_index)
        ),
        true
      ),
      updated_at = v_now
  where id = p_request_id
    and status = 'completed'
  returning * into v_row;

  get diagnostics v_updated_count = row_count;
  if v_updated_count = 0 then
    raise exception 'conflict';
  end if;

  return v_row;
end;
$$;

revoke all on function public.request_service_order_revision(text, text) from public, anon;
grant execute on function public.request_service_order_revision(text, text) to authenticated;

-- ── 3. Cancel your own order — the RPC half ─────────────────────────────────
--
-- SECURITY INVOKER, deliberately: the row's own requester already has
-- UPDATE via `service_requests`' existing RLS policy, so this function does
-- not need to bypass anything to perform the write. It exists for the same
-- clean-error-surface reason the other two do (RAISE EXCEPTION with a
-- reason token instead of a raw 42501/permission failure) — the actual
-- enforcement is `enforce_requester_cancel_lock()` below, which applies
-- regardless of whether a caller goes through this function or PATCHes
-- `status` directly.
create or replace function public.cancel_own_service_request(p_request_id text)
returns public.service_requests
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.service_requests;
begin
  select * into v_row from public.service_requests where id = p_request_id;
  if not found then
    raise exception 'not_found';
  end if;

  if v_row.requester_user_id is null or v_row.requester_user_id is distinct from auth.uid() then
    raise exception 'not_owner';
  end if;

  if not public.service_request_requester_cancellable(v_row.receiver, v_row.status, v_row.metadata) then
    raise exception 'conflict';
  end if;

  update public.service_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.cancel_own_service_request(text) from public, anon;
grant execute on function public.cancel_own_service_request(text) to authenticated;

-- ── 3b. Cancel your own order — the actual enforcement ──────────────────────
--
-- See this file's own header for the full reasoning on why `status` cannot
-- be handled by a column-level REVOKE the way `description`/`metadata` are,
-- and why this trigger's guard clause is scoped to fire ONLY for a
-- requester-only (non-assignee) caller setting `status` to `'cancelled'`.
create or replace function public.enforce_requester_cancel_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'cancelled'
     and old.status is distinct from 'cancelled'
     and auth.uid() is not null
     and auth.uid() = old.requester_user_id
     and auth.uid() is distinct from old.assigned_to
     and not public.service_request_requester_cancellable(old.receiver, old.status, old.metadata)
  then
    raise exception 'conflict'
      using detail = format(
        'requester-only cancel refused for service_requests.id=%s: receiver=%s status=%s',
        old.id, old.receiver, old.status
      );
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_requester_cancel_lock() from public, anon, authenticated;

drop trigger if exists trg_enforce_requester_cancel_lock on public.service_requests;
create trigger trg_enforce_requester_cancel_lock
  before update of status on public.service_requests
  for each row
  execute function public.enforce_requester_cancel_lock();

-- ── The column-level REVOKE that makes #1 and #2 the only path ─────────────
--
-- Safe per this file's own header: no other RLS-scoped write in this
-- codebase (web or native) touches `description` or `metadata` on this
-- table today. `anon` never had a legitimate reason to write either column;
-- included for the same belt-and-braces reason
-- `20260908_claim_service_request_atomic.sql` revokes from both roles.
revoke update (description, metadata) on public.service_requests from authenticated, anon;

-- =============================================================================
-- Verification (read-only; run manually against Supabase)
--
--   -- The three action functions exist with the expected security mode:
--   select p.proname, p.prosecdef, pg_get_function_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in (
--       'edit_service_request_description',
--       'request_service_order_revision',
--       'cancel_own_service_request'
--     )
--   order by p.proname;
--   -- Expect prosecdef = true for the first two, false for
--   -- cancel_own_service_request.
--
--   -- The column-level revoke landed (expect FALSE for both):
--   select
--     has_column_privilege('authenticated', 'public.service_requests', 'description', 'UPDATE') as can_update_description,
--     has_column_privilege('authenticated', 'public.service_requests', 'metadata', 'UPDATE') as can_update_metadata,
--     has_column_privilege('authenticated', 'public.service_requests', 'status', 'UPDATE') as can_update_status;
--   -- Expect can_update_description = false, can_update_metadata = false,
--   -- can_update_status = true (status must stay writable for the
--   -- admin/lawyer/self-tracking paths this migration does not touch).
--
--   -- The cancel-lock trigger is installed:
--   select tgname, tgenabled from pg_trigger
--   where tgrelid = 'public.service_requests'::regclass
--     and tgname = 'trg_enforce_requester_cancel_lock';
--   -- Expect one row, tgenabled = 'O' (origin — fires normally).
--
--   -- Manual functional check (run as a real requester's row, or via the
--   -- app): a direct PATCH attempting `description` or `metadata` fails
--   -- with a permission error; `.rpc('edit_service_request_description', …)`
--   -- on the same row succeeds when `pending_assignment`/unassigned/
--   -- undelivered, and fails with the matching reason token otherwise.
-- =============================================================================
