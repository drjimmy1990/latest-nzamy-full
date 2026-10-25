-- prelude_billing_cycles_between_runs.sql — runs BETWEEN the two 20261026_10
-- runs in billing_cycles.test.sql's chain.
--   * asserts the first run: one widened check per column, the two price
--     columns, the markers;
--   * then puts back the shape a schema restore of an older dump leaves: the
--     old narrow checks under their old names PLUS a stray duplicate, and no
--     comments. The second run must collapse them back to the one widened
--     check each (T0 of the test and the _verify block after it).
do $$
begin
  if (select count(*) from pg_constraint
       where conrelid = 'public.payment_orders'::regclass and contype = 'c'
         and conkey = array[(select attnum from pg_attribute where attrelid = 'public.payment_orders'::regclass and attname = 'billing')]) <> 1
     or position('''quarterly''' in pg_get_constraintdef((select oid from pg_constraint
           where conrelid = 'public.payment_orders'::regclass and conname = 'payment_orders_billing_check'))) = 0 then
    raise exception 'BETWEEN FAIL: after the first run payment_orders does not have exactly one widened billing check';
  end if;
  if position('''semiannual''' in pg_get_constraintdef((select oid from pg_constraint
           where conrelid = 'public.subscriptions'::regclass and conname = 'subscriptions_billing_cycle_check'))) = 0 then
    raise exception 'BETWEEN FAIL: after the first run subscriptions_billing_cycle_check does not accept semiannual';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'subscription_plans'
         and column_name in ('price_quarterly', 'price_semiannual')) <> 2 then
    raise exception 'BETWEEN FAIL: after the first run subscription_plans lacks the two price columns';
  end if;
  raise notice 'BETWEEN PASS: the first run widened both checks and added both columns';
end $$;

-- the restore's shape: narrow checks back, plus a stray duplicate, no comments
alter table public.payment_orders drop constraint payment_orders_billing_check;
alter table public.payment_orders add constraint payment_orders_billing_check check (billing in ('monthly', 'yearly', 'once'));
alter table public.payment_orders add constraint payment_orders_billing_check1 check (billing in ('monthly', 'yearly', 'once', 'quarterly'));
alter table public.subscriptions drop constraint subscriptions_billing_cycle_check;
alter table public.subscriptions add constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly', 'yearly', 'custom'));
comment on column public.subscription_plans.price_quarterly is null;
