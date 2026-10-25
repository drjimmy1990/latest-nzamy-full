-- prelude_coupons_server_only_between_runs.sql — between the two runs of
-- 20261026_20 (coupons_server_only.test.sql): a schema restore puts the old
-- open policies and grants back and an admin edit loosens the owner's rules.
-- The second run must repair all of it.
create policy "anyone can read active coupons" on public.coupons for select using (active = true);
create policy "users create own coupon usage" on public.coupon_usage for insert with check (user_id = auth.uid());
grant select on public.coupons to anon, authenticated;
grant insert on public.coupon_usage to authenticated;
update public.coupons set min_order_amount = 0, max_uses_per_user = 3 where code = 'NZAMY50';
update public.coupons set excluded_kinds = '{topup}', active = false where code = 'NEWCLIENT';
