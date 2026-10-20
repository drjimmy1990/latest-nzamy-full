-- prelude_payments_fulfill_once_between_runs.sql — runs BETWEEN the two
-- 20261022_30 runs in payments_fulfill_once.test.sql's chain.
--   * asserts the first run: the claim exists, service role only;
--   * then grants EXECUTE on the claim and on the metadata merge to anon and
--     authenticated, the shape a self-host schema restore leaves behind. The
--     second run must take both back (T7 and T9 of the test).
do $$
declare
  fn constant text := 'public.claim_payment_order(uuid, text, boolean)';
begin
  if to_regprocedure(fn) is null then
    raise exception 'BETWEEN FAIL: the first 20261022_30 run did not create %', fn;
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
     or not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'BETWEEN FAIL: after the first run the claim is not service-role-only';
  end if;
  raise notice 'BETWEEN PASS: the first run created the claim, service role only';
end $$;

grant execute on function public.claim_payment_order(uuid, text, boolean) to anon, authenticated;
grant execute on function public.merge_payment_order_metadata(uuid, jsonb) to anon, authenticated;
