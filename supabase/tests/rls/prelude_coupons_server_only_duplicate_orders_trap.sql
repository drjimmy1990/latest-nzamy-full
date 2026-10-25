-- prelude_coupons_server_only_duplicate_orders_trap.sql — NEGATIVE CONTROL
-- (d) for 20261026_20 (coupons_server_only.test.sql): one buyer already holds
-- a second open order carrying the same coupon as the "before" prelude's
-- KEPT order. The migration must STOP («payment_orders holds more than one
-- open / paid / refunded order of one buyer carrying one coupon: …») and
-- change nothing.
insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, metadata)
values ('00000000-0000-0000-0000-0000000000c1', 'library', 'lib-q1', 'once', 112500, 16875, 129375, 'exclusive', 'created',
        jsonb_build_object('coupon', jsonb_build_object('id', (select id::text from public.coupons where code = 'LAUNCH2026'), 'code', 'DUP')));
