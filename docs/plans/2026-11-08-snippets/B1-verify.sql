-- >>> verify:library_device_limit_1108
-- 2026-11-08 — 20261108_20_library_device_limit.sql (owner ٤٢٧; any time,
-- before or after the deploy): the library device limit. Two settings columns
-- on library_monitor_settings (shipped OFF at 2), public.user_devices (RLS:
-- the owner reads his own rows, never the hash), library_device_check /
-- library_device_revoke (SECURITY DEFINER, search_path '', service_role only).
-- Read-only, safe to repeat. Before the migration: one NOTICE and ok = false
-- rows in the SELECT, which is the truth before it runs.
select '20261108_20 library_monitor_settings has device_limit_enabled + device_limit' as check,
       (select count(*) = 2 from information_schema.columns
         where table_schema = 'public' and table_name = 'library_monitor_settings'
           and column_name in ('device_limit_enabled', 'device_limit')) as ok
union all
select '20261108_20 public.user_devices exists with RLS on',
       coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.user_devices')), false)
union all
select '20261108_20 ' || f.fn || ' is SECURITY DEFINER with search_path ''''',
       exists (select 1 from pg_proc p where p.oid = to_regprocedure(f.fn) and p.prosecdef
                 and p.proconfig @> array['search_path=""'])
  from (values ('public.library_device_check(uuid,text,text)'),
               ('public.library_device_revoke(uuid,uuid,text,text,uuid)')) as f(fn)
union all
select '20261108_20 ' || r.role || ' cannot execute ' || f.fn,
       case when to_regprocedure(f.fn) is null then false
            else not has_function_privilege(r.role, f.fn, 'EXECUTE') end
  from (values ('anon'), ('authenticated')) as r(role)
 cross join (values ('public.library_device_check(uuid,text,text)'),
                    ('public.library_device_revoke(uuid,uuid,text,text,uuid)')) as f(fn)
union all
select '20261108_20 authenticated cannot read user_devices.device_hash nor write the table',
       case when to_regclass('public.user_devices') is null then false
            else not has_column_privilege('authenticated', 'public.user_devices', 'device_hash', 'SELECT')
             and not has_table_privilege('authenticated', 'public.user_devices', 'INSERT')
             and not has_table_privilege('authenticated', 'public.user_devices', 'UPDATE')
             and not has_table_privilege('authenticated', 'public.user_devices', 'DELETE')
             and not has_table_privilege('anon', 'public.user_devices', 'SELECT') end;

-- Informational (not a check): is the limit switched on, and at what number?
-- select device_limit_enabled, device_limit from public.library_monitor_settings where id;

do $$
begin
  if to_regprocedure('public.library_device_check(uuid,text,text)') is null then
    raise notice '_verify: 20261108_20 is not applied yet — no library device limit (the app fails open)';
  end if;
end $$;
-- <<< verify:library_device_limit_1108
