-- =============================================================================
-- Migration: 20261122_30_service_requests_open_view.sql
-- =============================================================================
-- PURPOSE (owner ticket M3, launch batch 2026-11-17)
--   service_requests_select_policy (last written by 20260815) has three arms:
--   the requester, the assignee, and a third "marketplace browse" arm that
--   lets every verified lawyer read whole unassigned rows. A whole row is
--   more than a lawyer browsing open work needs to see.
--
--   1. service_requests_select_policy is re-created with the requester and
--      assignee arms only. The other SELECT policies on the table (the firm
--      and business member arms) are not touched.
--
--   2. public.marketplace_open_requests(p_limit, p_offset) (new): the open
--      requests a verified lawyer may browse, with the listing columns only —
--      id, type, receiver, title, status, created_at. It never returns
--      metadata, requester, requester_user_id, description, payment or
--      source_path. Same filter the old arm had: assigned_to is null, status
--      'pending' / 'pending_assignment', receiver other than 'ai_workspace'.
--      A caller who is not a verified lawyer gets no rows. SECURITY DEFINER
--      with an empty search_path; EXECUTE for authenticated only.
--      (A function rather than a view: an owner-rights view is what the
--      platform's advisor flags, see 20260922_04.)
--
-- CODE
--   No screen reads the marketplace arm today: GET /api/v1/service-requests
--   filters every list to the caller's own work (ownRequestsFilter.ts), the
--   lawyer dashboard counts by assigned_to, and the marketplace pages are
--   «قريباً» placeholders. The function is the read path for when they open.
--
-- RUN ORDER
--   Any time, before or after the code deploy. No prerequisite beyond
--   20260815 (the policy it replaces) and lawyer_profiles.
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261122_30_service_requests_open_view.sql
--   Idempotent: safe to run twice.
--
-- ROLLBACK
--   Re-run supabase/migrations/20260815_marketplace_excludes_ai_workspace.sql,
--   then: drop function if exists public.marketplace_open_requests(integer, integer);
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261122_30: public.service_requests is missing';
  end if;
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261122_30: public.lawyer_profiles is missing';
  end if;
end $$;

-- 1. The select policy: requester and assignee only
drop policy if exists "service_requests_select_policy" on public.service_requests;
create policy "service_requests_select_policy" on public.service_requests
  for select
  using (
    requester_user_id = auth.uid()
    or assigned_to = auth.uid()
  );

-- 2. The browse function
create or replace function public.marketplace_open_requests(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id         text,
  type       text,
  receiver   text,
  title      text,
  status     text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.receiver, sr.title, sr.status, sr.created_at
    from public.service_requests sr
   where exists (
           select 1 from public.lawyer_profiles lp
            where lp.user_id = auth.uid()
              and lp.verification_status = 'verified'
         )
     and sr.assigned_to is null
     and sr.status in ('pending', 'pending_assignment')
     and sr.receiver <> 'ai_workspace'
   order by sr.created_at desc, sr.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

revoke all on function public.marketplace_open_requests(integer, integer) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.marketplace_open_requests(integer, integer) from %I', r);
    end if;
  end loop;
  foreach r in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('grant execute on function public.marketplace_open_requests(integer, integer) to %I', r);
    end if;
  end loop;
end $$;

-- 3. Verify (raises → the whole file rolls back)
do $verify$
declare
  missing text := '';
  q text;
  p record;
begin
  select pg_catalog.pg_get_expr(polqual, polrelid) into q
    from pg_catalog.pg_policy
   where polrelid = 'public.service_requests'::regclass
     and polname = 'service_requests_select_policy';
  if q is null then
    missing := missing || ' service_requests_select_policy missing;';
  elsif q ilike '%lawyer_profiles%' or q ilike '%assigned_to IS NULL%' then
    missing := missing || ' service_requests_select_policy still has the browse arm;';
  end if;

  -- no other SELECT policy may carry the same browse arm
  for p in
    select polname, pg_catalog.pg_get_expr(polqual, polrelid) as expr
      from pg_catalog.pg_policy
     where polrelid = 'public.service_requests'::regclass
       and polcmd in ('r', '*')
  loop
    if p.expr ilike '%lawyer_profiles%' then
      missing := missing || pg_catalog.format(' policy %s reads lawyer_profiles;', p.polname);
    end if;
  end loop;

  if to_regprocedure('public.marketplace_open_requests(integer, integer)') is null then
    missing := missing || ' marketplace_open_requests missing;';
  else
    if not (select prosecdef from pg_catalog.pg_proc
             where oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure) then
      missing := missing || ' marketplace_open_requests is not security definer;';
    end if;
    if not exists (select 1 from pg_catalog.pg_proc
                    where oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure
                      and proconfig @> array['search_path=""']) then
      missing := missing || ' marketplace_open_requests has no empty search_path;';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
      missing := missing || ' anon can EXECUTE marketplace_open_requests;';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
      missing := missing || ' authenticated cannot EXECUTE marketplace_open_requests;';
    end if;
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'marketplace_open_requests') <> 1 then
    missing := missing || ' public.marketplace_open_requests is not exactly one function;';
  end if;

  if missing <> '' then
    raise exception '20261122_30 verify:%', missing;
  end if;
  raise notice '20261122_30 verify: OK';
end $verify$;

notify pgrst, 'reload schema';

commit;

select '20261122_30 service_requests select policy (requester/assignee) + marketplace_open_requests' as step,
       to_regprocedure('public.marketplace_open_requests(integer, integer)') is not null
       and not exists (select 1 from pg_catalog.pg_policy
                        where polrelid = 'public.service_requests'::regclass
                          and pg_catalog.pg_get_expr(polqual, polrelid) ilike '%lawyer_profiles%') as ok;
