-- prelude_points_lots_fixture.sql — runs BEFORE the first 20261022_20 in
-- points_lots.test.sql's chain.
--   * lawyer_profiles.credit_balance as on live (20260603_phase1_001:102,
--     integer not null default 0); stubs.sql's lawyer_profiles lacks it.
--   * L1 …e001 lawyer, credit_balance 250 — must get one 250-point migrated
--     lot, and NOT a second one from its (later, 999) credit_transactions row:
--     a lawyer's balance is credit_balance alone.
--   * L0 …e000 lawyer, credit_balance 0 — must get none.
--   * N1 …e002 no lawyer profile, credit_transactions balance_after 100 then
--     40 — must get one 40-point lot (the latest balance).
--   * N0 …e003 no lawyer profile, balance_after 100 then 0 — must get none.
--   * N2 …e004 no lawyer profile, two rows with ONE created_at: 70 (lower id)
--     then 25 (higher id) — must get one 25-point lot (ties go by id).
alter table public.lawyer_profiles
  add column if not exists credit_balance integer not null default 0;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-00000000e000'),
  ('00000000-0000-0000-0000-00000000e002'),
  ('00000000-0000-0000-0000-00000000e003'),
  ('00000000-0000-0000-0000-00000000e004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000e001', 'lawyer', 'L1'),
  ('00000000-0000-0000-0000-00000000e000', 'lawyer', 'L0'),
  ('00000000-0000-0000-0000-00000000e002', 'individual', 'N1'),
  ('00000000-0000-0000-0000-00000000e003', 'individual', 'N0'),
  ('00000000-0000-0000-0000-00000000e004', 'individual', 'N2');
insert into public.lawyer_profiles (user_id, credit_balance) values
  ('00000000-0000-0000-0000-00000000e001', 250),
  ('00000000-0000-0000-0000-00000000e000', 0);

insert into public.credit_transactions (user_id, amount, kind, balance_after, created_at) values
  ('00000000-0000-0000-0000-00000000e001', 250, 'purchase', 250, now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000000e001', 749, 'promo',    999, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000000e002', 100, 'purchase', 100, now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000e002', -60, 'usage',     40, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000e003', 100, 'purchase', 100, now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000000e003', -100, 'usage',     0, now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000e004', 70, 'purchase',   70, '2026-10-01 10:00:00+03'),
  ('00000000-0000-0000-0000-00000000e004', -45, 'usage',     25, '2026-10-01 10:00:00+03');
