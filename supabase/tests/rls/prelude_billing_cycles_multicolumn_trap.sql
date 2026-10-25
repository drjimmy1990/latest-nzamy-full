-- prelude_billing_cycles_multicolumn_trap.sql — NEGATIVE CONTROL (c) of
-- billing_cycles.test.sql only (never in the main chain): a CHECK over TWO
-- columns that still refuses a quarterly plan order. 20261026_10 replaces
-- single-column checks only, so its verify must catch this one by probing
-- (a rolled-back quarterly row) and roll the whole file back:
--   → "20261026_10 verify: a quarterly order is still refused by a CHECK …".
alter table public.payment_orders
  add constraint payment_orders_no_quarterly_plan_trap check (kind <> 'plan' or billing in ('monthly', 'yearly'));
