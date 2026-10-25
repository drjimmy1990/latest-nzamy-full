-- prelude_billing_cycles_before.sql — runs BEFORE the first 20261026_10 in
-- billing_cycles.test.sql's chain. It proves the gap the file closes and
-- leaves rows the file must keep:
--   * B1 a quarterly / semiannual payment_orders row is refused (23514) by
--     20261022_10's payment_orders_billing_check;
--   * B2 grant_plan_subscription (20261025_10) with p_billing 'quarterly'
--     fails on subscriptions' billing_cycle check — the "paid, never
--     fulfilled" hole;
--   * then a monthly order, a yearly order, a monthly and a custom
--     subscription that both runs of 20261026_10 must leave untouched.
-- Users …e001 / …e002 come from prelude_points_lots_fixture.sql.

do $$
declare
  b text;
begin
  foreach b in array array['quarterly', 'semiannual'] loop
    begin
      insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
      values ('00000000-0000-0000-0000-00000000e001', 'plan', 'firm-basic', b, 299000, 44850, 343850, 'exclusive');
      raise exception 'B1 FAIL: a % order was accepted before 20261026_10', b;
    exception when check_violation then
      raise notice 'B1 PASS (before): payment_orders refuses billing %', b;
    end;
  end loop;
end $$;

set role service_role;
do $$
begin
  perform public.grant_plan_subscription(
    '00000000-0000-0000-0000-0000000bc001', '00000000-0000-0000-0000-00000000e002',
    'firm-basic', 'corp', 'quarterly', now(), now() + interval '3 months', null, now(), '[]'::jsonb);
  raise exception 'B2 FAIL: a quarterly plan was granted before 20261026_10';
exception when check_violation then
  raise notice 'B2 PASS (before): grant_plan_subscription cannot write billing_cycle quarterly — a paid quarterly order would never be fulfilled';
end $$;
reset role;

insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode) values
  ('00000000-0000-0000-0000-0000000bc101', '00000000-0000-0000-0000-00000000e001', 'plan',  'lawyer-pro', 'monthly', 39900, 5985,  45885,  'exclusive'),
  ('00000000-0000-0000-0000-0000000bc102', '00000000-0000-0000-0000-00000000e001', 'topup', 'topup-100',  'once',    10000, 1500,  11500,  'exclusive'),
  ('00000000-0000-0000-0000-0000000bc103', '00000000-0000-0000-0000-00000000e002', 'plan',  'ind-ai',     'monthly', 3391,  509,   3900,   'inclusive');
insert into public.subscriptions (id, user_id, plan_id, tier, billing_cycle, status, started_at, current_period_start, current_period_end, auto_renew, metadata) values
  ('00000000-0000-0000-0000-0000000bc201', '00000000-0000-0000-0000-00000000e001', 'lawyer-pro', 'pro', 'monthly', 'active', now(), now(), now() + interval '1 month', false, '{}'),
  ('00000000-0000-0000-0000-0000000bc202', '00000000-0000-0000-0000-00000000e002', 'ind-ai',     'ai',  'custom',  'active', now(), now(), now() + interval '2 months', false, '{}');
