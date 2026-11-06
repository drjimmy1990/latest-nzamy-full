-- prelude_coupon_business_role_between.sql — part of the chain of
-- coupon_business_role.test.sql (see its header). Runs between the first and
-- the second 20261103_22 run: snapshots every row so the test can prove the
-- second run changed nothing.
drop table if exists public._t22_between;
create table public._t22_between as
  select code, xmin::text as x, eligible_user_types, updated_at from public.coupons;
