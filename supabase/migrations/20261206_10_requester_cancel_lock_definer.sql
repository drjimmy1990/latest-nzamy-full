-- =============================================================================
-- Migration: 20261206_10_requester_cancel_lock_definer.sql   (verify id: l16_d01)
-- =============================================================================
-- PURPOSE (batch l16, builder «secdb», gap D-01 — owner package 25 Nov §٧.٤)
--
--   Every session-scoped status change on public.service_requests answered
--   500 «تعذّر إتمام العملية» once 20261016_07 had run:
--     * the client's cancel (PATCH /api/v1/service-requests/[id] and the
--       INVOKER RPC cancel_own_service_request), and
--     * the lawyer's status change (the same PATCH, the kanban drag).
--   Cause: the BEFORE UPDATE OF status trigger trg_enforce_requester_cancel_lock
--   runs public.enforce_requester_cancel_lock(), a SECURITY INVOKER function,
--   and its IF calls public.service_request_requester_cancellable(…) — which
--   calls public.service_request_delivered_at(…). 20261016_07 revoked EXECUTE
--   on both helpers from authenticated (correctly: no API role should call
--   them). Firing a trigger does not check EXECUTE on the trigger function,
--   but the functions it CALLS are checked against the session role — and
--   Postgres checks EXECUTE when the expression is initialised, so even the
--   lawyer's path (whose IF short-circuits before the call) raised 42501.
--
--   Fix: the trigger function becomes SECURITY DEFINER (same body, search_path
--   ''), so its helper calls run as its owner. auth.uid() still reads the
--   request's JWT claim, so the rule itself is unchanged: a requester who is
--   not the assignee may cancel only while service_request_requester_
--   cancellable() says so. 20261016_07's posture stays valid — no API role
--   gets EXECUTE on the helpers or on the trigger function.
--
-- HOW TO RUN (any time — before or after the deploy; no code change needs it,
--   and the sooner it runs the sooner cancels and status changes work again):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_10_requester_cancel_lock_definer.sql
--   Expect: NOTICE  l16_d01 verify: OK …  and a row with `t`.
--
-- NOT AFTER THIS FILE WITHOUT CARE: re-running 20260917_service_request_
--   client_actions_rpc.sql re-creates the trigger function as INVOKER (the
--   500 returns) — run this file again right after it. _verify.sql
--   (verify:l16_d01) raises until then.
--
-- Docker: supabase/tests/rls/requester_cancel_lock_definer.test.sql (chain in
--   its header; negative control = the chain without this file).
--
-- ROLLBACK (puts the 500 back — only together with re-granting the helpers):
--   alter function public.enforce_requester_cancel_lock() security invoker;
-- =============================================================================

set lock_timeout = '10s';

begin;

do $pre$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261206_10: public.service_requests is missing';
  end if;
  if to_regprocedure('public.service_request_requester_cancellable(text, text, jsonb)') is null then
    raise exception '20261206_10: public.service_request_requester_cancellable(text, text, jsonb) is missing — run 20260917_service_request_client_actions_rpc.sql first';
  end if;
end
$pre$;

create or replace function public.enforce_requester_cancel_lock()
returns trigger
language plpgsql
security definer
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

comment on function public.enforce_requester_cancel_lock() is
  'Requester-only cancel lock (20260917), SECURITY DEFINER since 20261206_10 (l16 D-01): its helper calls run as the owner, because 20261016_07 closed EXECUTE on them to the API roles and an INVOKER trigger turned every session status change into 42501.';

revoke all on function public.enforce_requester_cancel_lock() from public;
do $grants$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.enforce_requester_cancel_lock() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.enforce_requester_cancel_lock() from authenticated;
  end if;
end
$grants$;

-- The trigger itself (20260917) — re-asserted, same name and event.
drop trigger if exists trg_enforce_requester_cancel_lock on public.service_requests;
create trigger trg_enforce_requester_cancel_lock
  before update of status on public.service_requests
  for each row
  execute function public.enforce_requester_cancel_lock();

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
begin
  if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                     from pg_catalog.pg_proc p
                    where p.oid = 'public.enforce_requester_cancel_lock()'::regprocedure), false) then
    missing := missing || ' enforce_requester_cancel_lock is not SECURITY DEFINER with an empty search_path;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.service_requests'::regclass
                    and tgname = 'trg_enforce_requester_cancel_lock'
                    and tgenabled <> 'D'
                    and tgfoid = 'public.enforce_requester_cancel_lock()'::regprocedure) then
    missing := missing || ' trg_enforce_requester_cancel_lock is missing or disabled;';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.enforce_requester_cancel_lock()', 'EXECUTE')
          or has_function_privilege('authenticated', 'public.service_request_requester_cancellable(text, text, jsonb)', 'EXECUTE')) then
    missing := missing || ' an API role can EXECUTE the cancel-lock function or its helper (20261016_07 posture lost);';
  end if;
  if missing <> '' then
    raise exception 'l16_d01 verify:%', missing;
  end if;
  raise notice 'l16_d01 verify: OK — the requester cancel lock runs as its owner; sessions can change a request status again; the helpers stay closed to API roles';
end
$verify$;

commit;

select '20261206_10 l16 D-01: requester cancel lock is SECURITY DEFINER (session status changes no longer 42501)' as migration,
       coalesce((select p.prosecdef from pg_catalog.pg_proc p
                  where p.oid = to_regprocedure('public.enforce_requester_cancel_lock()')), false) as ok;
