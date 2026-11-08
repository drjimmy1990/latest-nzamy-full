-- >>> verify:firm_member_points_1108
-- 2026-11-08 — 20261108_30_firm_member_points_usage.sql (owner ٤٤٤ part 2:
-- per-member points counter on /dashboard/firm/finance). Any time — before or
-- after the deploy (the route answers { available: false } until it exists).
-- Read-only, safe to repeat. Every row must say ok = true.
select 'firm_member_points_usage exists' as check_name,
       to_regprocedure('public.firm_member_points_usage(uuid)') is not null as ok;

select 'firm_member_points_usage is SECURITY DEFINER with search_path = ''''' as check_name,
       coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                   from pg_proc p where p.oid = to_regprocedure('public.firm_member_points_usage(uuid)')), false) as ok;

select 'anon cannot EXECUTE firm_member_points_usage' as check_name,
       case when to_regprocedure('public.firm_member_points_usage(uuid)') is null then false
            else not has_function_privilege('anon', 'public.firm_member_points_usage(uuid)', 'EXECUTE') end as ok;

select 'authenticated can EXECUTE firm_member_points_usage' as check_name,
       case when to_regprocedure('public.firm_member_points_usage(uuid)') is null then false
            else has_function_privilege('authenticated', 'public.firm_member_points_usage(uuid)', 'EXECUTE') end as ok;

-- the function's owner must bypass RLS on the three tables it reads for other
-- users, or every member but the caller silently reads «—» and 0
select 'firm_member_points_usage owner bypasses RLS on points_ledger / firm_members / profiles' as check_name,
       coalesce((
         select r.rolsuper or r.rolbypassrls
                or not exists (select 1 from pg_class c
                                where c.oid in ('public.points_ledger'::regclass, 'public.firm_members'::regclass, 'public.profiles'::regclass)
                                  and (c.relowner <> p.proowner or c.relforcerowsecurity))
           from pg_proc p join pg_roles r on r.oid = p.proowner
          where p.oid = to_regprocedure('public.firm_member_points_usage(uuid)')), false) as ok;

-- informational: with points_enforcement off nothing is debited and every counter reads 0
select 'points_enforcement (info — false/no row means every counter reads 0)' as check_name,
       true as ok,
       coalesce((select value::text from public.platform_settings where key = 'points_enforcement'), 'no row') as points_enforcement;
-- <<< verify:firm_member_points_1108
