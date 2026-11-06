-- prelude_coupon_business_role_before.sql — part of the chain of
-- coupon_business_role.test.sql (see its header). Runs BEFORE the first
-- 20261103_22 run: three coupons as the old admin page saved them, and a
-- snapshot of the row that has no 'business'.
insert into public.coupons (code, discount_type, discount_value, min_order_amount, eligible_user_types, metadata)
values
  ('T22BIZLAW', 'fixed', 10, 100, '{business,lawyer}', '{"created_by_admin":"t"}'::jsonb),
  ('T22BOTH',   'fixed', 10, 100, '{business,corporate}', '{"created_by_admin":"t"}'::jsonb),
  ('T22INDIV',  'fixed', 10, 100, '{individual}', '{"created_by_admin":"t"}'::jsonb)
on conflict (code) do nothing;

drop table if exists public._t22_before;
create table public._t22_before as
  select code, xmin::text as x, eligible_user_types, updated_at from public.coupons;
