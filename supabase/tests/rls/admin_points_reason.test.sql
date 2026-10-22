-- CHAIN (Git Bash, repo root):
-- bash supabase/tests/rls/run.sh \
-- supabase/migrations/20260603_phase1_003_subscriptions_billing.sql \
-- supabase/migrations/20260627_platform_settings.sql \
-- supabase/migrations/20261019_10_library_access_grants.sql \
-- supabase/migrations/20261022_10_payments_core.sql \
-- supabase/tests/rls/prelude_points_lots_fixture.sql \
-- supabase/migrations/20261022_20_points_lots.sql \
-- supabase/migrations/20261022_33_admin_points.sql \
-- supabase/tests/rls/prelude_admin_points_reason.sql \
-- supabase/migrations/20261022_34_points_admin_adjustment_reason.sql \
-- supabase/migrations/20261022_34_points_admin_adjustment_reason.sql \
-- supabase/tests/rls/admin_points_reason.test.sql
-- _34 runs twice: the second run must change nothing (T1/T2 check the
-- backfilled rows are exactly the prelude's, once).
-- NEGATIVE: same chain without both _34 lines; T0 fails.
do $$
declare u constant uuid := '00000000-0000-0000-0000-00000000e002'; before_balance int; n int; s int; r text;
begin
  if to_regprocedure('public.admin_debit_points(uuid,int,text)') is null then raise exception 'T0 FAIL: admin_debit_points missing (20261022_34 not applied)'; end if;

  -- T1: the backfill relabelled _33's deduction, exactly once, delta intact.
  select count(*), coalesce(sum(delta),0) into n, s from public.points_ledger where ref = 'old admin debit';
  if n = 0 or s <> -30 then raise exception 'T1 FAIL: old admin debit rows changed (% rows, sum %)', n, s; end if;
  if exists (select 1 from public.points_ledger where ref = 'old admin debit' and (reason <> 'admin_adjustment' or tool is not null)) then
    raise exception 'T1 FAIL: old admin debit not relabelled admin_adjustment / tool null';
  end if;
  if exists (select 1 from public.points_ledger where reason = 'usage' and tool = 'admin_adjustment') then
    raise exception 'T1 FAIL: a usage/admin_adjustment row survived the backfill';
  end if;

  -- T2: a genuine usage row is left alone.
  select count(*), coalesce(sum(delta),0) into n, s from public.points_ledger where ref = 'real usage' and reason = 'usage' and tool = 'ai_chat';
  if n = 0 or s <> -5 then raise exception 'T2 FAIL: real usage row was touched (% rows, sum %)', n, s; end if;

  -- T3: a new admin deduction is recorded as admin_adjustment, tool null.
  before_balance := public.points_balance(u);
  perform public.adjust_admin_points(u, -10, now() + interval '12 months', 'new admin debit');
  if public.points_balance(u) <> before_balance - 10 then raise exception 'T3 FAIL: deduction amount wrong'; end if;
  select count(*), coalesce(sum(delta),0) into n, s from public.points_ledger where ref = 'new admin debit' and reason = 'admin_adjustment' and tool is null;
  if n = 0 or s <> -10 then raise exception 'T3 FAIL: new admin deduction not admin_adjustment (% rows, sum %)', n, s; end if;
  if exists (select 1 from public.points_ledger where ref = 'new admin debit' and reason <> 'admin_adjustment') then
    raise exception 'T3 FAIL: new admin deduction has a non-admin row';
  end if;

  -- T4: a normal debit_points is still usage with its tool.
  perform public.debit_points(u, 3, 'ai_draft', 'later usage');
  select count(*) into n from public.points_ledger where ref = 'later usage' and reason = 'usage' and tool = 'ai_draft';
  if n = 0 then raise exception 'T4 FAIL: debit_points no longer writes usage'; end if;

  -- T5: a short admin deduction raises insufficient_points and changes nothing.
  before_balance := public.points_balance(u);
  begin
    perform public.adjust_admin_points(u, -2147483647, now() + interval '12 months', 'too much');
    raise exception 'T5 FAIL: insufficient deduction accepted';
  exception when raise_exception then
    get stacked diagnostics r = message_text;
    if r <> 'insufficient_points' then raise; end if;
  end;
  if public.points_balance(u) <> before_balance or exists (select 1 from public.points_ledger where ref = 'too much') then
    raise exception 'T5 FAIL: partial deduction';
  end if;

  -- T6: only adjust_admin_points (its owner) may call the helper.
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(r,'public.admin_debit_points(uuid,int,text)','EXECUTE') then raise exception 'T6 FAIL: % can execute the helper', r; end if;
  end loop;
  if not has_function_privilege('service_role','public.adjust_admin_points(uuid,int,timestamptz,text)','EXECUTE') then raise exception 'T6 FAIL: service lost adjust_admin_points'; end if;

  raise notice 'admin_points_reason: T0-T6 PASS';
end $$;
