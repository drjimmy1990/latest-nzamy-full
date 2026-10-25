-- prelude_coupons_server_only_between_runs.sql — between the two runs of
-- 20261026_20 (coupons_server_only.test.sql): a schema restore puts the old
-- open policies and grants back and an admin edit loosens the owner's rules.
-- The second run must repair all of it — and must NOT switch LAUNCH2026 off
-- again: an admin switched it back on after the first run.
-- B3 what the FIRST run did to the other codes (values kept)
do $$
begin
  if exists (select 1 from public.coupons where code in ('LAUNCH2026', 'OLDPROMO')
              and (active or coalesce(metadata->>'switched_off', '') not like '%20261026_20%')) then
    raise exception 'B3 FAIL: the first run left LAUNCH2026 / OLDPROMO active or unstamped';
  end if;
  if not exists (select 1 from public.coupons where code = 'LAUNCH2026' and discount_type = 'percentage'
                  and discount_value = 25 and max_uses = 500) then
    raise exception 'B3 FAIL: switching LAUNCH2026 off changed its values';
  end if;
  if not (select active from public.coupons where code = 'ADMIN10') then
    raise exception 'B3 FAIL: the first run switched off a coupon an admin created';
  end if;
  raise notice 'B3: the first run switched off LAUNCH2026 and OLDPROMO (values kept, stamped) and left ADMIN10 on';
end $$;

create policy "anyone can read active coupons" on public.coupons for select using (active = true);
create policy "users create own coupon usage" on public.coupon_usage for insert with check (user_id = auth.uid());
grant select on public.coupons to anon, authenticated;
grant insert on public.coupon_usage to authenticated;
update public.coupons set min_order_amount = 0, max_uses_per_user = 3 where code = 'NZAMY50';
update public.coupons set excluded_kinds = '{topup}', active = false where code = 'NEWCLIENT';
update public.coupons set active = true where code = 'LAUNCH2026';
