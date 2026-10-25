-- prelude_coupons_server_only_duplicate_trap.sql — NEGATIVE CONTROL for
-- 20261026_20 (coupons_server_only.test.sql): two redemptions of one coupon by
-- one user. The migration must STOP («coupon_usage holds more than one row
-- for …») and change nothing.
insert into public.coupon_usage (coupon_id, user_id, order_id)
values ((select id from public.coupons where code = 'LAUNCH2026'), '00000000-0000-0000-0000-0000000000c1', 'dup-order');
