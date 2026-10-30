-- prelude_library_grant_admin_between_runs.sql — runs BETWEEN the two
-- 20261030_65 runs in library_grant_admin.test.sql's chain.
--   * asserts the first run created the three functions, service role only;
--   * then grants EXECUTE on them, and SELECT on the admin side table, to
--     PUBLIC, anon and authenticated — the shape a self-host schema restore
--     leaves behind. The second run must take all of it back (T9 of the test).
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)',
    'public.library_grant_revoke(uuid, uuid, text)',
    'public.library_grant_adjust_end(uuid, uuid, timestamptz, text)'] loop
    if to_regprocedure(fn) is null then
      raise exception 'BETWEEN FAIL: the first 20261030_65 run did not create %', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
       or not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'BETWEEN FAIL: after the first run % is not service-role-only', fn;
    end if;
  end loop;
  raise notice 'BETWEEN PASS: the first run created the three functions, service role only';
end $$;

grant execute on function public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text) to public, anon, authenticated;
grant execute on function public.library_grant_revoke(uuid, uuid, text) to public, anon, authenticated;
grant execute on function public.library_grant_adjust_end(uuid, uuid, timestamptz, text) to public, anon, authenticated;
grant select on public.library_access_grant_admin to public, anon, authenticated;
