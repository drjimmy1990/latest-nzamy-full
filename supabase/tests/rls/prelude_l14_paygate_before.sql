-- prelude_l14_paygate_before.sql — runs BEFORE 20261204_60 in the chain of
-- l14_paygate.test.sql: a device limit the old CHECK (1–10) allowed but the
-- owner's rule does not (5), with the admin's switch ON, so the test proves
-- the migration lowers the number and leaves the switch alone; and a 25 %
-- code saved before (no purpose), which must stay valid.
update public.library_monitor_settings set device_limit = 5, device_limit_enabled = true where id;
insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, active)
values ('L14OLD', 'percentage', 10, 100, 25, '{topup}', true)
on conflict (code) do nothing;
