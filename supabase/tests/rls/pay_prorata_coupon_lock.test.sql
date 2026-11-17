-- pay_prorata_coupon_lock.test.sql — proves 20261126_60 (batch l6-pay: the
-- limited-coupon lock and the one-prorated-upgrade-order guard) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE (idempotent). The _verify section is extracted from
-- _verify.sql between its markers and runs before the migration (its checks
-- print f, never raise) and after the second run. From the repo root, in
-- Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l6_pay_block.sql
--   sed -n '/^-- >>> verify:l6_pay/,/^-- <<< verify:l6_pay/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     "$B" \
--     $M/20261126_60_pay_prorata_coupon_lock.sql \
--     $M/20261126_60_pay_prorata_coupon_lock.sql \
--     "$B" \
--     $R/pay_prorata_coupon_lock.test.sql
--
-- NEGATIVE CONTROL: the chain without the two 20261126_60 files → "T0 FAIL".
-- Every assertion RAISES on failure.

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000006a1'), ('00000000-0000-0000-0000-0000000006a2'),
  ('00000000-0000-0000-0000-0000000006a3'), ('00000000-0000-0000-0000-0000000006a4'),
  ('00000000-0000-0000-0000-0000000006a5'), ('00000000-0000-0000-0000-0000000006a6');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000006a1', 'lawyer', 'a1'), ('00000000-0000-0000-0000-0000000006a2', 'lawyer', 'a2'),
  ('00000000-0000-0000-0000-0000000006a3', 'lawyer', 'a3'), ('00000000-0000-0000-0000-0000000006a4', 'lawyer', 'a4'),
  ('00000000-0000-0000-0000-0000000006a5', 'lawyer', 'a5'), ('00000000-0000-0000-0000-0000000006a6', 'lawyer', 'a6');

insert into public.coupons (code, discount_type, discount_value, max_uses, used_count, active, metadata) values
  ('LIM1', 'fixed', 50, 1, 0, true, '{"created_by_admin": "test"}'),
  ('LIM2', 'fixed', 50, 2, 0, true, '{"created_by_admin": "test"}'),
  ('UNL',  'fixed', 50, null, 0, true, '{"created_by_admin": "test"}');

-- an open couponed order of `u` for `code`
create or replace function pg_temp.order_with(u uuid, code text, st text default 'initiated') returns uuid
language sql as $$
  insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
  values (u, 'library', 'lib-q1', 'once', 100000, 15000, 115000, 'exclusive', st,
          jsonb_build_object('coupon', jsonb_build_object('id', (select id::text from public.coupons c where c.code = order_with.code), 'code', code)))
  returning id
$$;
create or replace function pg_temp.cid(code text) returns uuid language sql as $$ select id from public.coupons c where c.code = cid.code $$;

-- T0 the objects exist (negative control stops here)
do $$
begin
  if to_regprocedure('public.coupon_reserve(uuid, uuid, uuid)') is null or to_regclass('public.coupon_reservations') is null then
    raise exception 'T0 FAIL: 20261126_60 not applied';
  end if;
  raise notice 'T0 PASS: coupon_reservations + coupon_reserve exist';
end $$;

-- T1 sessions can neither read the reservations nor call the function
set role anon;
do $$ begin
  perform 1 from public.coupon_reservations;
  raise exception 'T1 FAIL: anon read coupon_reservations';
exception when insufficient_privilege then raise notice 'T1 PASS (a): anon refused on coupon_reservations'; end $$;
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-0000000006a1', false);
set role authenticated;
do $$ begin
  perform public.coupon_reserve('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000006a1');
  raise exception 'T1 FAIL: an authenticated session called coupon_reserve';
exception when insufficient_privilege then raise notice 'T1 PASS (b): authenticated cannot EXECUTE coupon_reserve'; end $$;
do $$ begin
  insert into public.coupon_reservations (order_id, coupon_id, user_id, expires_at)
  values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000006a1', now());
  raise exception 'T1 FAIL: an authenticated session wrote a reservation';
exception when insufficient_privilege then raise notice 'T1 PASS (c): authenticated cannot write coupon_reservations'; end $$;
reset role;

-- T2 max_uses = 1: the first buyer holds it, the second is refused; a retry is idempotent
do $$
declare a uuid; b uuid; r text;
begin
  a := pg_temp.order_with('00000000-0000-0000-0000-0000000006a1', 'LIM1');
  b := pg_temp.order_with('00000000-0000-0000-0000-0000000006a2', 'LIM1');
  r := public.coupon_reserve(pg_temp.cid('LIM1'), a, '00000000-0000-0000-0000-0000000006a1');
  if r <> 'reserved' then raise exception 'T2 FAIL: first reserve answered %', r; end if;
  r := public.coupon_reserve(pg_temp.cid('LIM1'), b, '00000000-0000-0000-0000-0000000006a2');
  if r <> 'exhausted' then raise exception 'T2 FAIL: second buyer got % (over-use)', r; end if;
  r := public.coupon_reserve(pg_temp.cid('LIM1'), a, '00000000-0000-0000-0000-0000000006a1');
  if r <> 'reserved' then raise exception 'T2 FAIL: a retry for the same order answered %', r; end if;
  if (select count(*) from public.coupon_reservations where coupon_id = pg_temp.cid('LIM1')) <> 1 then
    raise exception 'T2 FAIL: expected one reservation row';
  end if;

  -- T3 a FAILED payment releases it at once
  update public.payment_orders set status = 'failed' where id = a;
  r := public.coupon_reserve(pg_temp.cid('LIM1'), b, '00000000-0000-0000-0000-0000000006a2');
  if r <> 'reserved' then raise exception 'T3 FAIL: after the failed payment the second buyer got %', r; end if;

  -- T4 an EXPIRED hold (order still open, no payment reached it) releases it
  update public.coupon_reservations set expires_at = now() - interval '1 minute' where order_id = b;
  a := pg_temp.order_with('00000000-0000-0000-0000-0000000006a3', 'LIM1');
  r := public.coupon_reserve(pg_temp.cid('LIM1'), a, '00000000-0000-0000-0000-0000000006a3');
  if r <> 'reserved' then raise exception 'T4 FAIL: after the expired hold the third buyer got %', r; end if;
  -- … but an expired hold whose order a payment reached (3-D Secure) still counts
  update public.coupon_reservations set expires_at = now() - interval '1 minute' where order_id = a;
  update public.payment_orders set moyasar_payment_id = 'pay_3ds' where id = a;
  b := pg_temp.order_with('00000000-0000-0000-0000-0000000006a4', 'LIM1');
  r := public.coupon_reserve(pg_temp.cid('LIM1'), b, '00000000-0000-0000-0000-0000000006a4');
  if r <> 'exhausted' then raise exception 'T4 FAIL: a reached order''s hold was dropped (%)', r; end if;
  raise notice 'T2-T4 PASS: max_uses 1 — held, refused, idempotent; released on failure and on expiry; a reached order keeps it';
end $$;

-- T5 a PAID order not yet recorded still counts; once recorded, used_count carries it (never twice)
do $$
declare d uuid; e uuid; f uuid; r text;
begin
  d := pg_temp.order_with('00000000-0000-0000-0000-0000000006a1', 'LIM2');
  e := pg_temp.order_with('00000000-0000-0000-0000-0000000006a2', 'LIM2');
  f := pg_temp.order_with('00000000-0000-0000-0000-0000000006a3', 'LIM2');
  if public.coupon_reserve(pg_temp.cid('LIM2'), d, '00000000-0000-0000-0000-0000000006a1') <> 'reserved' then raise exception 'T5 FAIL: d'; end if;
  update public.payment_orders set status = 'paid', live = true, moyasar_payment_id = 'pay_d' where id = d;
  if public.coupon_reserve(pg_temp.cid('LIM2'), e, '00000000-0000-0000-0000-0000000006a2') <> 'reserved' then raise exception 'T5 FAIL: e'; end if;
  r := public.coupon_reserve(pg_temp.cid('LIM2'), f, '00000000-0000-0000-0000-0000000006a3');
  if r <> 'exhausted' then raise exception 'T5 FAIL: a paid-not-recorded order was not counted (%)', r; end if;
  -- fulfilment records d: used_count = 1, d's reservation stops counting — still exhausted, not 3 uses
  insert into public.coupon_usage (coupon_id, user_id, order_id, discount_applied)
  values (pg_temp.cid('LIM2'), '00000000-0000-0000-0000-0000000006a1', d::text, 50);
  if (select used_count from public.coupons where code = 'LIM2') <> 1 then raise exception 'T5 FAIL: used_count did not move'; end if;
  r := public.coupon_reserve(pg_temp.cid('LIM2'), f, '00000000-0000-0000-0000-0000000006a3');
  if r <> 'exhausted' then raise exception 'T5 FAIL: after recording, f got % (counted twice or not at all)', r; end if;
  -- e is cancelled (superseded) → f gets the last use
  update public.payment_orders set status = 'cancelled' where id = e;
  r := public.coupon_reserve(pg_temp.cid('LIM2'), f, '00000000-0000-0000-0000-0000000006a3');
  if r <> 'reserved' then raise exception 'T5 FAIL: after e was cancelled f got %', r; end if;
  raise notice 'T5 PASS: paid-not-recorded counts; a recorded use counts once (used_count); a cancelled order releases';
end $$;

-- T6 a test-mode payment (live = false) never consumes a use
do $$
declare g uuid; h uuid; r text;
begin
  update public.coupons set used_count = 0, max_uses = 1 where code = 'UNL';
  g := pg_temp.order_with('00000000-0000-0000-0000-0000000006a5', 'UNL');
  h := pg_temp.order_with('00000000-0000-0000-0000-0000000006a6', 'UNL');
  if public.coupon_reserve(pg_temp.cid('UNL'), g, '00000000-0000-0000-0000-0000000006a5') <> 'reserved' then raise exception 'T6 FAIL: g'; end if;
  update public.payment_orders set status = 'paid', live = false where id = g;
  r := public.coupon_reserve(pg_temp.cid('UNL'), h, '00000000-0000-0000-0000-0000000006a6');
  if r <> 'reserved' then raise exception 'T6 FAIL: a test-mode payment kept the use (%)', r; end if;
  update public.coupons set max_uses = null where code = 'UNL';
  raise notice 'T6 PASS: a test-mode paid order releases its use';
end $$;

-- T7 an unlimited code writes nothing
do $$
declare u uuid; r text;
begin
  u := pg_temp.order_with('00000000-0000-0000-0000-0000000006a4', 'UNL');
  r := public.coupon_reserve(pg_temp.cid('UNL'), u, '00000000-0000-0000-0000-0000000006a4');
  if r <> 'unlimited' then raise exception 'T7 FAIL: unlimited answered %', r; end if;
  if exists (select 1 from public.coupon_reservations where order_id = u) then raise exception 'T7 FAIL: a row was written'; end if;
  raise notice 'T7 PASS: an unlimited code answers unlimited and writes nothing';
end $$;

-- T8 the order must be an OPEN order of the caller's user carrying the coupon
do $$
declare o uuid; closed uuid;
begin
  o := pg_temp.order_with('00000000-0000-0000-0000-0000000006a5', 'LIM1');
  closed := pg_temp.order_with('00000000-0000-0000-0000-0000000006a5', 'LIM1', 'cancelled');
  begin
    perform public.coupon_reserve(pg_temp.cid('LIM1'), o, '00000000-0000-0000-0000-0000000006a6');
    raise exception 'T8 FAIL: another user''s order was reserved';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.coupon_reserve(pg_temp.cid('LIM2'), o, '00000000-0000-0000-0000-0000000006a5');
    raise exception 'T8 FAIL: an order of another coupon was reserved';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.coupon_reserve(pg_temp.cid('LIM1'), closed, '00000000-0000-0000-0000-0000000006a5');
    raise exception 'T8 FAIL: a closed order was reserved';
  exception when invalid_parameter_value then null; end;
  raise notice 'T8 PASS: wrong user / wrong coupon / closed order → 22023';
end $$;

-- T9 Q511: one open / paid prorated order per (buyer, credited plans)
do $$
declare
  u uuid := '00000000-0000-0000-0000-0000000006a1';
  p jsonb := '{"proration": {"key": "sub-a", "credit_halalas": 1000}}';
  first uuid;
begin
  insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
  values (u, 'plan', 'firm-enterprise', 'yearly', 100000, 15000, 115000, 'exclusive', 'initiated', p) returning id into first;
  begin
    insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
    values (u, 'plan', 'firm-enterprise', 'monthly', 100000, 15000, 115000, 'exclusive', 'created', p);
    raise exception 'T9 FAIL: a second open order spent the same remaining days';
  exception when unique_violation then
    if sqlerrm not like '%payment_orders_proration_once_key%' then raise; end if;
  end;
  -- another key, or another user: allowed
  insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
  values (u, 'plan', 'firm-enterprise', 'yearly', 100000, 15000, 115000, 'exclusive', 'created', '{"proration": {"key": "sub-b"}}');
  insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
  values ('00000000-0000-0000-0000-0000000006a2', 'plan', 'firm-enterprise', 'yearly', 100000, 15000, 115000, 'exclusive', 'created', p);
  -- once the first is cancelled, a new one may carry the key
  update public.payment_orders set status = 'cancelled' where id = first;
  insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
  values (u, 'plan', 'firm-enterprise', 'yearly', 100000, 15000, 115000, 'exclusive', 'created', p) returning id into first;
  -- a PAID one still blocks
  update public.payment_orders set status = 'paid', live = true where id = first;
  begin
    insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
    values (u, 'plan', 'firm-enterprise', 'yearly', 100000, 15000, 115000, 'exclusive', 'created', p);
    raise exception 'T9 FAIL: a paid prorated order did not block a second credit';
  exception when unique_violation then null; end;
  raise notice 'T9 PASS: payment_orders_proration_once_key — one open / paid order per credited plan set';
end $$;

select 'pay_prorata_coupon_lock: all assertions passed' as result;
