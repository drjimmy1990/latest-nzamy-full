-- prelude_grant_plan_atomic_between_runs.sql — runs BETWEEN the two
-- 20261025_10 runs in grant_plan_atomic.test.sql's chain.
--   * asserts the first run: the grant exists, service role only;
--   * then grants EXECUTE on it to PUBLIC, anon and authenticated, the shape a
--     self-host schema restore leaves behind. The second run must take all
--     three back (T7 of the test, and the _verify block after it).
do $$
declare
  fn constant text := 'public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)';
begin
  if to_regprocedure(fn) is null then
    raise exception 'BETWEEN FAIL: the first 20261025_10 run did not create %', fn;
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
     or not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'BETWEEN FAIL: after the first run the grant is not service-role-only';
  end if;
  raise notice 'BETWEEN PASS: the first run created the grant, service role only';
end $$;

grant execute on function public.grant_plan_subscription(uuid, uuid, text, text, text, timestamptz, timestamptz, text, timestamptz, jsonb)
  to public, anon, authenticated;
