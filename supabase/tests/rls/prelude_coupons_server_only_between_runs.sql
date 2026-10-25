-- prelude_coupons_server_only_between_runs.sql — between the two runs of
-- 20261026_20 (coupons_server_only.test.sql): a schema restore puts the old
-- open policies and grants back, drops the one-order-per-(buyer, coupon)
-- guard and turns the used_count trigger back into an insert-only one; the
-- second run must repair all of it. Admin edits made on the coupons page
-- after the first run must SURVIVE the second run: NZAMY50's minimum raised to
-- 250 and 3 uses per user, NEWCLIENT switched off and opened to every kind
-- but top-ups, LAUNCH2026 switched back on.
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
  -- the seeded owner rows (no minimum) received his rules once, stamped
  if not exists (select 1 from public.coupons where code = 'NZAMY50' and min_order_amount = 200 and discount_value = 50
                  and coalesce(metadata->>'owner_rules', '') like '%20261026_20%')
     or not exists (select 1 from public.coupons where code = 'NEWCLIENT' and min_order_amount = 300 and discount_value = 75
                     and excluded_kinds = '{plan,library,topup}' and coalesce(metadata->>'owner_rules', '') like '%20261026_20%') then
    raise exception 'B3 FAIL: the first run did not write and stamp the owner''s rules on NZAMY50 / NEWCLIENT';
  end if;
  raise notice 'B3: the first run switched off LAUNCH2026 and OLDPROMO (values kept, stamped), left ADMIN10 on, and wrote + stamped the owner''s rules';
end $$;

create policy "anyone can read active coupons" on public.coupons for select using (active = true);
create policy "users create own coupon usage" on public.coupon_usage for insert with check (user_id = auth.uid());
grant select on public.coupons to anon, authenticated;
grant insert on public.coupon_usage to authenticated;
drop index if exists public.payment_orders_coupon_once_key;
create or replace function public.coupon_usage_count()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.coupons set used_count = used_count + 1 where id = new.coupon_id;
  return new;
end $$;
drop trigger if exists trg_coupon_usage_count on public.coupon_usage;
create trigger trg_coupon_usage_count after insert on public.coupon_usage for each row execute function public.coupon_usage_count();
-- admin edits (the coupons page) — the second run must keep them
update public.coupons set min_order_amount = 250, max_uses_per_user = 3 where code = 'NZAMY50';
update public.coupons set excluded_kinds = '{topup}', active = false where code = 'NEWCLIENT';
update public.coupons set active = true where code = 'LAUNCH2026';
