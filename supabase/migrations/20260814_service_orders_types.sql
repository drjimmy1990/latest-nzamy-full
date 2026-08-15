-- ============================================================
-- Migration: 20260814_service_orders_types.sql
-- Purpose:  Allow the four premium services to be ordered as
--           service_requests rows.
--
--           'ai_draft' was already present in the CHECK; the other
--           three are new. 'ai_workspace' already exists in the
--           receiver CHECK and needs no change.
--
--           Idempotent: DROP ... IF EXISTS then ADD.
-- Rollback: re-add the constraint without the three new values
--           (safe only while no rows use them).
-- ============================================================

begin;

alter table public.service_requests
  drop constraint if exists service_requests_type_check;

alter table public.service_requests
  add constraint service_requests_type_check
  check (type in (
    'service', 'consultation', 'business_case', 'ngo_volunteer',
    'ai_draft', 'ai_contracts', 'ai_wargaming', 'ai_legal_opinion'
  ));

commit;

-- ── Verification ────────────────────────────────────────────
-- Expect the definition to contain 'ai_legal_opinion':
--
--   select pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'service_requests_type_check';
--
-- Expect this to FAIL with a check-constraint violation:
--
--   insert into public.service_requests (id, type, title, receiver, status)
--   values ('probe-1', 'not_a_real_type', 't', 'ai_workspace', 'pending_assignment');
