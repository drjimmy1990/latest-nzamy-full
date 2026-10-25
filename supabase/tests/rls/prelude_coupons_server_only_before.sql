-- prelude_coupons_server_only_before.sql — the state 20261026_20 starts from
-- (coupons_server_only.test.sql). Runs after 20260603_phase1_003, which seeds
-- NZAMY50 / NEWCLIENT / LAUNCH2026 with the old values and the open policies.
-- Proves the gap (B1, B2) and leaves one legitimate redemption the migration
-- must keep.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'), ('00000000-0000-0000-0000-0000000000c2');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000c1', 'individual', 'c1'),
  ('00000000-0000-0000-0000-0000000000c2', 'individual', 'c2');

-- B1 a visitor lists every live code
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.coupons where code in ('NZAMY50', 'NEWCLIENT', 'LAUNCH2026');
  if n <> 3 then raise exception 'B1 FAIL: expected the old policy to show anon 3 codes, saw %', n; end if;
  raise notice 'B1 (gap proven): anon reads % live coupon codes', n;
end $$;
reset role;

-- B2 a signed-in user writes his own coupon_usage rows
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', false);
set role authenticated;
do $$
begin
  insert into public.coupon_usage (coupon_id, user_id, order_id)
  values ((select id from public.coupons where code = 'NZAMY50'), '00000000-0000-0000-0000-0000000000c2', 'self-written');
  raise notice 'B2 (gap proven): an authenticated session inserted its own coupon_usage row';
end $$;
reset role;
delete from public.coupon_usage where order_id = 'self-written';

-- the redemption the migration must keep
insert into public.coupon_usage (coupon_id, user_id, order_id, discount_applied)
values ((select id from public.coupons where code = 'LAUNCH2026'), '00000000-0000-0000-0000-0000000000c1', 'kept-order', 10);
