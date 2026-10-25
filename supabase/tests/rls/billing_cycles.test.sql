-- billing_cycles.test.sql — proves 20261026_10 (owner answers of 25 Oct, P1:
-- quarterly and half-yearly billing) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE, with the narrow checks of an older dump (plus a stray
-- duplicate) put back between the runs; the second run must repair them. The
-- _verify section is extracted from _verify.sql between its markers and runs
-- before the migration (it must only NOTICE "not applied yet") and after the
-- second run (it must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_billing_cycles_block.sql
--   sed -n '/^-- >>> verify:billing_cycles/,/^-- <<< verify:billing_cycles/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261025_10_grant_plan_atomic.sql \
--     "$B" \
--     $R/prelude_billing_cycles_before.sql \
--     $M/20261026_10_billing_cycles.sql \
--     $R/prelude_billing_cycles_between_runs.sql \
--     $M/20261026_10_billing_cycles.sql \
--     "$B" \
--     $R/billing_cycles.test.sql
-- Why each link: 20260603_phase1_003 … 20261022_30 are the payments chain of
-- grant_plan_atomic.test.sql (subscriptions, the sold plans, payment_orders);
-- prelude_points_lots_fixture.sql creates the users …e000–e004;
-- 20261025_10 is grant_plan_subscription, which writes billing_cycle;
-- prelude_billing_cycles_before.sql proves the gap (B1, B2) and leaves the
-- rows the migration must keep.
--
-- NEGATIVE CONTROLS (each must FAIL):
--   (a) the chain without the two 20261026_10 files, the between-runs prelude
--       and the second "$B" → "T0 FAIL: …";
--   (b) the chain cut after prelude_billing_cycles_between_runs.sql, then
--       "$B" → the _verify block raises "… has 2 CHECK constraints …".
--
-- Every assertion RAISES on failure.

-- T0 the migration's state (negative control (a) stops here)
do $$
declare
  defs text;
begin
  select string_agg(pg_get_constraintdef(oid), ' | ') into defs
    from pg_constraint
   where conrelid = 'public.payment_orders'::regclass and contype = 'c'
     and conkey = array[(select attnum from pg_attribute where attrelid = 'public.payment_orders'::regclass and attname = 'billing')];
  if defs is null or position('''quarterly''' in defs) = 0 or position('''semiannual''' in defs) = 0 or position(' | ' in defs) > 0 then
    raise exception 'T0 FAIL: payment_orders billing checks are %, expected one check with quarterly and semiannual (20261026_10 not applied?)', defs;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.payment_orders'::regclass and conname = 'payment_orders_billing_check1') then
    raise exception 'T0 FAIL: the stray duplicate check survived the second run';
  end if;
  if coalesce(obj_description((select oid from pg_constraint where conrelid = 'public.payment_orders'::regclass
                                 and conname = 'payment_orders_billing_check'), 'pg_constraint'), '') not like '%20261026_10%' then
    raise exception 'T0 FAIL: payment_orders_billing_check lacks the 20261026_10 marker';
  end if;
  if coalesce(col_description('public.subscription_plans'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.subscription_plans'::regclass and attname = 'price_quarterly')), '')
     not like '%20261026_10%' then
    raise exception 'T0 FAIL: the second run did not put the price_quarterly comment back';
  end if;
  raise notice 'T0 PASS: one widened billing check per column, markers in place, the restore''s narrow + stray checks repaired';
end $$;

-- T1 payment_orders: the four cycles and once are accepted; anything else refused
do $$
declare
  b text;
  i int := 0;
begin
  foreach b in array array['monthly', 'quarterly', 'semiannual', 'yearly', 'once'] loop
    i := i + 1;
    insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
    values (('00000000-0000-0000-0000-0000000bd10' || i)::uuid, '00000000-0000-0000-0000-00000000e001',
            case when b = 'once' then 'topup' else 'plan' end, case when b = 'once' then 'topup-100' else 'firm-basic' end,
            b, 299000, 44850, 343850, 'exclusive');
  end loop;
  foreach b in array array['weekly', 'custom', 'Quarterly', 'biannual', ''] loop
    begin
      insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
      values ('00000000-0000-0000-0000-00000000e001', 'plan', 'firm-basic', b, 1000, 150, 1150, 'exclusive');
      raise exception 'T1 FAIL: billing «%» was accepted', b;
    exception when check_violation then
      null;
    end;
  end loop;
  -- the rows written before the migration are untouched
  if (select count(*) from public.payment_orders where id in ('00000000-0000-0000-0000-0000000bc101', '00000000-0000-0000-0000-0000000bc102', '00000000-0000-0000-0000-0000000bc103')) <> 3
     or (select vat_mode from public.payment_orders where id = '00000000-0000-0000-0000-0000000bc103') <> 'inclusive' then
    raise exception 'T1 FAIL: an order written before 20261026_10 changed or vanished';
  end if;
  raise notice 'T1 PASS: payment_orders takes monthly / quarterly / semiannual / yearly / once and refuses anything else; older orders (an inclusive one too) kept';
end $$;

-- T2 the fulfilment hole is closed: a quarterly and a half-yearly grant land
set role service_role;
do $$
declare
  t   timestamptz := now();
  res jsonb;
  s   public.subscriptions%rowtype;
begin
  res := public.grant_plan_subscription(
    '00000000-0000-0000-0000-0000000bd201', '00000000-0000-0000-0000-00000000e003',
    'firm-basic', 'corp', 'quarterly', t, t + interval '3 months', null, t, '[]'::jsonb);
  select * into s from public.subscriptions where id = (res ->> 'subscription_id')::uuid;
  if (res ->> 'inserted')::boolean is not true or s.billing_cycle <> 'quarterly'
     or s.current_period_end <> t + interval '3 months' or s.status <> 'active' then
    raise exception 'T2 FAIL: quarterly grant %', row_to_json(s);
  end if;
  res := public.grant_plan_subscription(
    '00000000-0000-0000-0000-0000000bd202', '00000000-0000-0000-0000-00000000e004',
    'firm-enterprise', 'enterprise', 'semiannual', t, t + interval '6 months', null, t, '[]'::jsonb);
  select * into s from public.subscriptions where id = (res ->> 'subscription_id')::uuid;
  if (res ->> 'inserted')::boolean is not true or s.billing_cycle <> 'semiannual' or s.current_period_end <> t + interval '6 months' then
    raise exception 'T2 FAIL: semiannual grant %', row_to_json(s);
  end if;
  raise notice 'T2 PASS: grant_plan_subscription writes quarterly and semiannual periods (the paid-never-fulfilled hole is closed)';
end $$;
reset role;

-- T3 subscriptions: custom (admin grants) still accepted, a non-cycle refused, older rows kept
do $$
declare
  b text;
begin
  foreach b in array array['once', 'weekly', 'biannual'] loop
    begin
      insert into public.subscriptions (user_id, plan_id, tier, billing_cycle, status)
      values ('00000000-0000-0000-0000-00000000e001', 'lawyer-pro', 'pro', b, 'cancelled');
      raise exception 'T3 FAIL: billing_cycle «%» was accepted', b;
    exception when check_violation then
      null;
    end;
  end loop;
  insert into public.subscriptions (user_id, plan_id, tier, billing_cycle, status)
  values ('00000000-0000-0000-0000-00000000e001', 'lawyer-pro', 'pro', 'custom', 'cancelled');
  if (select billing_cycle from public.subscriptions where id = '00000000-0000-0000-0000-0000000bc202') <> 'custom'
     or (select billing_cycle from public.subscriptions where id = '00000000-0000-0000-0000-0000000bc201') <> 'monthly' then
    raise exception 'T3 FAIL: a subscription written before 20261026_10 changed';
  end if;
  raise notice 'T3 PASS: subscriptions keep custom, refuse once / weekly, older rows kept';
end $$;

-- T4 subscription_plans: the two new prices, null everywhere, never negative
do $$
begin
  if exists (select 1 from public.subscription_plans where price_quarterly is not null or price_semiannual is not null) then
    raise exception 'T4 FAIL: 20261026_10 must write no quarterly / half-yearly price (P1 changes no price)';
  end if;
  if (select count(*) from public.subscription_plans
       where id in ('ind-ai', 'ind-preventive', 'ind-litigation', 'lawyer-pro', 'consultant-independent', 'firm-basic', 'firm-enterprise')) <> 7 then
    raise exception 'T4 FAIL: the seven plans sold online are not all there';
  end if;
  if (select price_monthly from public.subscription_plans where id = 'lawyer-pro') <> 399
     or (select price_yearly from public.subscription_plans where id = 'firm-basic') <> 9900 then
    raise exception 'T4 FAIL: an existing price changed';
  end if;
  begin
    update public.subscription_plans set price_quarterly = -1 where id = 'firm-basic';
    raise exception 'T4 FAIL: a negative quarterly price was accepted';
  exception when check_violation then
    null;
  end;
  update public.subscription_plans set price_quarterly = 2990, price_semiannual = 5490 where id = 'firm-basic';
  update public.subscription_plans set price_quarterly = null, price_semiannual = null where id = 'firm-basic';
  raise notice 'T4 PASS: price_quarterly / price_semiannual exist, null for every plan, refuse a negative price; existing prices unchanged';
end $$;
