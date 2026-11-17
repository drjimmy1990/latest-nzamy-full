-- =============================================================================
-- Migration: 20261122_31_firm_row_write_check.sql
-- =============================================================================
-- PURPOSE (owner ticket S3, launch batch 2026-11-17)
--   hearings, tasks, case_stages, case_graphs and lawyer_clients carry a
--   nullable firm_id. Their INSERT policies check owner_user_id only, and
--   their UPDATE policies accept any row the caller owns, so the firm_id a
--   row is written with was never compared with the caller's own firm.
--
--   1. public.can_write_firm_row(uuid) (new, SECURITY DEFINER, empty
--      search_path): true when the firm id is null, or the caller is an
--      active member of that firm, or its owner.
--
--   2. On each of the five tables, two RESTRICTIVE policies — one FOR INSERT,
--      one FOR UPDATE — WITH CHECK (public.can_write_firm_row(firm_id)).
--      Restrictive policies are AND-ed with every permissive policy, so the
--      check holds whatever the permissive policies are named or say. The
--      existing policies are not touched.
--
-- EFFECT
--   Writes the API makes today are unchanged: every route sets firm_id from
--   the caller's own active membership (or null). A row whose owner is no
--   longer an active member of the row's firm can still be read and deleted
--   by him, but no longer updated while it carries that firm id.
--
-- BEFORE RUNNING (both should return 0; a non-zero count is not an error,
-- it lists rows that become read-only for their owner):
--   select 'firm owners without an active membership' as check, count(*)
--     from public.firm_profiles fp
--    where not exists (select 1 from public.firm_members fm
--                       where fm.firm_id = fp.id and fm.user_id = fp.owner_user_id
--                         and fm.status = 'active');
--   select 'rows whose owner left the row''s firm' as check, count(*) from (
--     select owner_user_id, firm_id from public.hearings       where firm_id is not null union all
--     select owner_user_id, firm_id from public.tasks          where firm_id is not null union all
--     select owner_user_id, firm_id from public.case_stages    where firm_id is not null union all
--     select owner_user_id, firm_id from public.case_graphs    where firm_id is not null union all
--     select owner_user_id, firm_id from public.lawyer_clients where firm_id is not null) r
--    where not exists (select 1 from public.firm_members fm
--                       where fm.firm_id = r.firm_id and fm.user_id = r.owner_user_id
--                         and fm.status = 'active')
--      and not exists (select 1 from public.firm_profiles fp
--                       where fp.id = r.firm_id and fp.owner_user_id = r.owner_user_id);
--
-- RUN ORDER
--   Any time, before or after the code deploy. Needs 20260903_phase1_case_tables
--   and 20260903_phase2_clients_and_firm_membership (refused below otherwise).
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261122_31_firm_row_write_check.sql
--   Idempotent: safe to run twice.
--
-- ROLLBACK
--   For each table t in the five:
--     drop policy if exists "firm_id is the writer's firm (insert)" on public.t;
--     drop policy if exists "firm_id is the writer's firm (update)" on public.t;
--   then: drop function if exists public.can_write_firm_row(uuid);
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $$
declare t text;
begin
  foreach t in array array['hearings', 'tasks', 'case_stages', 'case_graphs', 'lawyer_clients',
                           'firm_members', 'firm_profiles'] loop
    if to_regclass('public.' || t) is null then
      raise exception '20261122_31: public.% is missing — apply the phase1/phase2 migrations first', t;
    end if;
  end loop;
end $$;

-- 1. The helper
create or replace function public.can_write_firm_row(p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select p_firm is null
      or exists (select 1 from public.firm_members m
                  where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active')
      or exists (select 1 from public.firm_profiles f
                  where f.id = p_firm and f.owner_user_id = auth.uid());
$fn$;

revoke all on function public.can_write_firm_row(uuid) from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.can_write_firm_row(uuid) from %I', r);
    end if;
  end loop;
  -- Policies run the function as the querying role, so authenticated needs EXECUTE.
  foreach r in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('grant execute on function public.can_write_firm_row(uuid) to %I', r);
    end if;
  end loop;
end $$;

-- 2. The restrictive policies
do $$
declare t text;
begin
  foreach t in array array['hearings', 'tasks', 'case_stages', 'case_graphs', 'lawyer_clients'] loop
    execute pg_catalog.format('drop policy if exists %I on public.%I', 'firm_id is the writer''s firm (insert)', t);
    execute pg_catalog.format(
      'create policy %I on public.%I as restrictive for insert with check (public.can_write_firm_row(firm_id))',
      'firm_id is the writer''s firm (insert)', t);
    execute pg_catalog.format('drop policy if exists %I on public.%I', 'firm_id is the writer''s firm (update)', t);
    execute pg_catalog.format(
      'create policy %I on public.%I as restrictive for update using (true) with check (public.can_write_firm_row(firm_id))',
      'firm_id is the writer''s firm (update)', t);
  end loop;
end $$;

-- 3. Verify (raises → the whole file rolls back)
do $verify$
declare
  missing text := '';
  t text;
  c "char";
  pname text;
begin
  if to_regprocedure('public.can_write_firm_row(uuid)') is null then
    missing := missing || ' can_write_firm_row missing;';
  else
    if not (select prosecdef from pg_catalog.pg_proc where oid = 'public.can_write_firm_row(uuid)'::regprocedure) then
      missing := missing || ' can_write_firm_row is not security definer;';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and has_function_privilege('anon', 'public.can_write_firm_row(uuid)', 'EXECUTE') then
      missing := missing || ' anon can EXECUTE can_write_firm_row;';
    end if;
  end if;

  foreach t in array array['hearings', 'tasks', 'case_stages', 'case_graphs', 'lawyer_clients'] loop
    if not (select relrowsecurity from pg_catalog.pg_class where oid = ('public.' || t)::regclass) then
      missing := missing || pg_catalog.format(' RLS is off on %s;', t);
    end if;
    foreach c in array array['a', 'w']::"char"[] loop
      pname := case c when 'a' then 'firm_id is the writer''s firm (insert)' else 'firm_id is the writer''s firm (update)' end;
      if not exists (
        select 1 from pg_catalog.pg_policy
         where polrelid = ('public.' || t)::regclass
           and polname = pname
           and polcmd = c
           and polpermissive = false
           and pg_catalog.pg_get_expr(polwithcheck, polrelid) ilike '%can_write_firm_row(firm_id)%'
      ) then
        missing := missing || pg_catalog.format(' %s: restrictive %s policy missing or wrong;', t, pname);
      end if;
    end loop;
  end loop;

  if missing <> '' then
    raise exception '20261122_31 verify:%', missing;
  end if;
  raise notice '20261122_31 verify: OK';
end $verify$;

commit;

select '20261122_31 firm_id write check on hearings/tasks/case_stages/case_graphs/lawyer_clients' as step,
       to_regprocedure('public.can_write_firm_row(uuid)') is not null
       and (select pg_catalog.count(*) from pg_catalog.pg_policy
             where polname in ('firm_id is the writer''s firm (insert)', 'firm_id is the writer''s firm (update)')
               and polpermissive = false
               and polrelid in ('public.hearings'::regclass, 'public.tasks'::regclass, 'public.case_stages'::regclass,
                                'public.case_graphs'::regclass, 'public.lawyer_clients'::regclass)) = 10 as ok;
