-- 20260701_client_workflow_rls_assert.sql
-- ---------------------------------------------------------------------------
-- Defensive assertion migration.
--
-- The /api/client-workflow/* routes (service-role, client-supplied
-- requesterUserId = horizontal IDOR) were DELETED and the client repository was
-- repointed to the authed, RLS-scoped /api/v1/service-requests endpoints.
-- Correctness of that repoint depends entirely on the row-level security +
-- ownership policies on service_requests / request_events (first created in
-- 20260518_client_workflow_backend_ready.sql) remaining in force.
--
-- This migration inserts nothing and changes no data — it simply FAILS the
-- deploy if those guardrails are ever missing, so a future migration cannot
-- silently drop them and re-open the hole. Idempotent (assertions only).
-- ---------------------------------------------------------------------------
begin;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.service_requests'::regclass) then
    raise exception 'RLS not enabled on public.service_requests (client-workflow repoint would leak)';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.request_events'::regclass) then
    raise exception 'RLS not enabled on public.request_events';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and cmd = 'SELECT'
  ) then
    raise exception 'service_requests SELECT policy missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and cmd = 'INSERT'
  ) then
    raise exception 'service_requests INSERT policy missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and cmd = 'UPDATE'
  ) then
    raise exception 'service_requests UPDATE policy missing';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'request_events' and cmd = 'INSERT'
  ) then
    raise exception 'request_events INSERT policy missing';
  end if;
end
$$;

commit;
