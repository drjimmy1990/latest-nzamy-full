-- =============================================================================
-- Migration: 20260908_claim_service_request_atomic.sql
-- Purpose:   Owner item ٦٩ (concurrency half only) — "قفل التزامن FOR UPDATE".
--            PATCH /api/v1/admin/service-orders/[id] action:"claim" today does
--            a plain `.update({status:'in_review', assigned_to: adminUserId})
--            .eq('id', id)` with no WHERE on the row's current state. Two team
--            members (أشرف ورامي) pressing «استلام» on the same still-open
--            order within the same instant both get a 200; whichever write
--            commits last silently owns it, and the other admin's screen keeps
--            telling them THEY have it. Same shape of bug lets a claim and a
--            concurrent deliver/cancel race: the claim's own read of `order`
--            happens before its write, so a claim that lands between another
--            admin's read and write of `deliver`/`cancel` can flip a completed
--            order back to `in_review`.
--
--            Fix: a single atomic UPDATE — one SQL statement is its own lock —
--            guarded on `assigned_to IS NULL` (or already the caller's own
--            claim, so re-pressing استلام on your own order is not a false
--            conflict) and on the same status/receiver preconditions the route
--            already checks before it patches. Zero rows back = someone else
--            got there first; the route turns that into 409.
--
--            `p_actor_id uuid` is explicit, not `auth.uid()`: the route calls
--            this through `createServiceClient()` (service-role — see the 400
--            block near the top of that file), whose JWT carries no `sub`, so
--            `auth.uid()` inside the function would resolve to NULL and the
--            claim would silently unassign instead of assigning. SECURITY
--            INVOKER is still correct: the service-role connection already
--            bypasses RLS on its own privileges, so INVOKER neither widens nor
--            narrows who can reach the row — it just avoids owning a definer
--            that runs as the function's creator for no reason here. EXECUTE
--            is granted to `service_role` only, matching who actually calls
--            it; not to `authenticated`, because a function that takes an
--            arbitrary `p_actor_id` and writes it into `assigned_to` with no
--            per-caller identity check would be a self-assign primitive for
--            any signed-in user if it were reachable from the RLS-scoped
--            client.
--
--            This does not touch the "claim" doc comment's now-stale premise
--            ("no reassignment route anywhere else") — that comment lives in
--            the route file and is rewritten in the same commit as the route
--            change, not here. The `assign` action (same route, lines ~271-331)
--            already lets an admin explicitly re-route a stuck order to a
--            named team member with no assigned_to precondition, so requiring
--            `assigned_to IS NULL` here does not remove any recovery path —
--            it only closes the accidental double-claim race. `assign` itself
--            is a deliberate, targeted action (one admin picks the target from
--            a list), not a race between two people grabbing the same open
--            work, so it is intentionally left unchanged.
--
-- Does NOT close: the other two halves of owner item ٦٩ — ترحيل مهام الجلسات
--            المؤجلة (AddHearingModal.tsx) and زر الإبلاغ عن المحتوى
--            (community/page.tsx). Both untouched here.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, REVOKE and GRANT are both
--            repeatable. No DROP, no DELETE, no data movement, no
--            table/column change.
-- =============================================================================

-- `p_now timestamptz` is threaded in rather than read from `now()` inside the
-- function: the route computes one `nowIso` at the top and reuses it for
-- `recordEvent`, the row's own `updated_at` on every OTHER action, and
-- `dispatchOrderNotice`'s `messageId` (`${orderId}:${kind}:${nowIso}`). A
-- DB-clock timestamp on the claimed row alone would put it a few ms ahead of
-- the audit event and the dispatch payload for no reason — this keeps the one
-- moment-in-time this route already treats as a single value, single.
create or replace function public.claim_service_request(p_request_id text, p_actor_id uuid, p_now timestamptz)
returns setof public.service_requests
language sql
security invoker
set search_path = ''
as $$
  update public.service_requests
  set assigned_to = p_actor_id,
      status = 'in_review',
      updated_at = p_now
  where id = p_request_id
    and receiver = 'ai_workspace'
    and status not in ('completed', 'cancelled')
    and (assigned_to is null or assigned_to = p_actor_id)
  returning *;
$$;

-- CREATE (OR REPLACE) FUNCTION grants EXECUTE to PUBLIC by default — unlike
-- tables, which default to no access, Postgres auto-grants EXECUTE on every
-- newly created function to PUBLIC unless it is explicitly revoked. Left in
-- place, that default silently overrides the intent below: `authenticated`
-- (and `anon`) would keep EXECUTE on this function even though only the
-- service-role route (admin service-orders PATCH, via createServiceClient())
-- ever calls it, and the function trusts its `p_actor_id` argument completely
-- with no per-caller identity check — reachable from the RLS-scoped client it
-- would be a self-assign primitive for any signed-in user. The revoke has to
-- run every time this file does (CREATE OR REPLACE does not reset privileges
-- on a function that already exists, but re-asserting the revoke is what
-- keeps this migration idempotent against a database where an earlier,
-- pre-revoke run of this same file already left the PUBLIC grant standing).
--
-- The PUBLIC revoke alone is not the whole story: this repo's migrations
-- carry no `alter default privileges ... on functions` for `anon` /
-- `authenticated` (checked — the only default-privilege statements in this
-- tree are supabase/tests/rls/stubs.sql:286-287, on tables/sequences, for a
-- test-only role), but Supabase project bootstraps commonly set exactly such
-- a default OUTSIDE this repo's migration history, in which case `create
-- function` would also stamp `anon`/`authenticated` onto the new function's
-- ACL directly — a grant `revoke ... from public` does not touch. Revoking
-- from them by name is the belt: harmless if no such default exists on this
-- project (revoking a privilege nobody has is a no-op), the only thing that
-- closes the case if it does.
revoke execute on function public.claim_service_request(text, uuid, timestamptz) from public;
revoke execute on function public.claim_service_request(text, uuid, timestamptz) from anon, authenticated;
grant execute on function public.claim_service_request(text, uuid, timestamptz) to service_role;

-- ── Verification (read-only; run manually against Supabase) ───────────────
--
--   -- Function exists with the expected signature and owner privileges:
--   select p.proname, p.prosecdef, pg_get_function_arguments(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'claim_service_request';
--   -- Expect prosecdef = false (SECURITY INVOKER) and args
--   -- "p_request_id text, p_actor_id uuid, p_now timestamp with time zone".
--
--   -- Full ACL on the function, PUBLIC's default included — this is the
--   -- check that actually answers "who can execute it", unlike
--   -- information_schema.role_routine_grants, whose rendering of the PUBLIC
--   -- pseudo-role is not the unambiguous signal it looks like:
--   select p.proacl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'claim_service_request';
--   -- Expect an acl list with a "service_role=X/<owner>" entry and NO
--   -- empty-grantee "=.../<owner>" entry (that empty-grantee form is
--   -- PostgreSQL's notation for PUBLIC — its presence means PUBLIC still has
--   -- the privilege that follows the slash, EXECUTE here).
-- =============================================================================
