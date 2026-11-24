-- prelude_l14_paygate_high_cap.sql — after 20261204_60 in the chain of
-- l14_paygate.test.sql: a 100 % code with its purpose exists BEFORE the two
-- older files are re-run, so their re-run must accept it (20261026_20's own
-- verify used to raise on any cap above 25).
insert into public.coupons (code, discount_type, discount_value, min_order_amount, max_discount_pct, excluded_kinds, purpose)
values ('L14RERUN', 'percentage', 100, 1, 100, '{topup}', 'تعويض عميل عن خلل')
on conflict (code) do nothing;
