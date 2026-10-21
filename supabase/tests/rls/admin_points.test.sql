-- CHAIN (Git Bash, repo root):
-- bash supabase/tests/rls/run.sh \
-- supabase/migrations/20260603_phase1_003_subscriptions_billing.sql \
-- supabase/migrations/20260627_platform_settings.sql \
-- supabase/migrations/20261019_10_library_access_grants.sql \
-- supabase/migrations/20261022_10_payments_core.sql \
-- supabase/tests/rls/prelude_points_lots_fixture.sql \
-- supabase/migrations/20261022_20_points_lots.sql \
-- supabase/migrations/20261022_33_admin_points.sql \
-- supabase/migrations/20261022_33_admin_points.sql \
-- supabase/tests/rls/admin_points.test.sql
-- NEGATIVE: same chain without _33; T0 fails.
do $$ declare result jsonb; before_balance int; observed int; begin
  if to_regprocedure('public.adjust_admin_points(uuid,int,timestamptz,text)') is null then raise exception 'T0 FAIL: adjustment RPC missing'; end if;
  before_balance := public.points_balance('00000000-0000-0000-0000-00000000e002');
  result := public.adjust_admin_points('00000000-0000-0000-0000-00000000e002',100,now()+interval '12 months','admin test');
  if (result ->> 'previous_balance')::int <> before_balance or (result ->> 'new_balance')::int <> before_balance + 100 then raise exception 'T1 FAIL: incorrect actual balances'; end if;
  result := public.adjust_admin_points('00000000-0000-0000-0000-00000000e002',-40,now()+interval '12 months','admin debit');
  if (result ->> 'new_balance')::int <> before_balance + 60 then raise exception 'T2 FAIL: incorrect debit'; end if;
  begin
    perform public.adjust_admin_points('00000000-0000-0000-0000-00000000e002',-2147483647,now()+interval '12 months','insufficient');
    raise exception 'T3 FAIL: insufficient debit accepted';
  exception when raise_exception then
    if sqlerrm <> 'insufficient_points' then raise; end if;
  end;
  if public.points_balance('00000000-0000-0000-0000-00000000e002') <> before_balance + 60 then raise exception 'T4 FAIL: partial debit'; end if;
  select balance into observed from public.admin_points_balances(array['00000000-0000-0000-0000-00000000e002'::uuid]);
  if observed <> before_balance + 60 then raise exception 'T5 FAIL: directory balance differs'; end if;
  raise notice 'admin_points: T0-T5 PASS';
end $$;
