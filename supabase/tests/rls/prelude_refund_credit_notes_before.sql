-- prelude_refund_credit_notes_before.sql — runs BEFORE the first 20261127_30
-- in refund_credit_notes.test.sql's chain: the reversals the backfill must
-- find (made before the migration ran) and the orders it must leave alone.
--   …fc01 refunded in full (platform, receipt NZ-2026-000101) → a 'refund' note
--   …fc02 voided in full (platform, receipt NZ-2026-000102)   → a 'void' note
--   …fc03 refunded, merchant 'office'                          → no note
--   …fc04 paid                                                 → no note
--   …fc05 refunded, no receipt number                          → no note
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000c0101'),
  ('00000000-0000-0000-0000-0000000c0102');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-0000000c0101', 'lawyer'),
  ('00000000-0000-0000-0000-0000000c0102', 'individual');
insert into public.payment_orders
  (id, user_id, merchant, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, live,
   receipt_number, paid_at, fulfilled_at, refunded_halalas, refunded_at) values
  ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-0000000c0101', 'platform', 'plan', 'lawyer-pro', 'yearly',
   299600, 44940, 344540, 'exclusive', 'refunded', true, 'NZ-2026-000101', '2026-11-19 09:00+03', '2026-11-19 09:00+03', 344540, '2026-11-20 10:00+03'),
  ('00000000-0000-0000-0000-00000000fc02', '00000000-0000-0000-0000-0000000c0101', 'platform', 'topup', 'topup-500', 'once',
   50000, 7500, 57500, 'exclusive', 'voided', false, 'NZ-2026-000102', '2026-11-21 09:00+03', '2026-11-21 09:00+03', 57500, '2026-11-21 09:30+03'),
  ('00000000-0000-0000-0000-00000000fc03', '00000000-0000-0000-0000-0000000c0101', 'office', 'topup', 'topup-500', 'once',
   50000, 7500, 57500, 'exclusive', 'refunded', true, 'NZ-2026-000103', '2026-11-21 09:00+03', '2026-11-21 09:00+03', 57500, '2026-11-22 09:30+03'),
  ('00000000-0000-0000-0000-00000000fc04', '00000000-0000-0000-0000-0000000c0101', 'platform', 'topup', 'topup-1000', 'once',
   100000, 15000, 115000, 'exclusive', 'paid', true, 'NZ-2026-000104', '2026-11-22 09:00+03', '2026-11-22 09:00+03', 0, null),
  ('00000000-0000-0000-0000-00000000fc05', '00000000-0000-0000-0000-0000000c0102', 'platform', 'topup', 'topup-100', 'once',
   10000, 1500, 11500, 'exclusive', 'refunded', true, null, '2026-11-22 09:00+03', '2026-11-22 09:00+03', 11500, '2026-11-22 10:00+03');
