-- prelude_points_lots_fixture.sql — runs BEFORE the first 20261022_20 in
-- points_lots.test.sql's chain.
--   * lawyer_profiles.credit_balance as on live (20260603_phase1_001:102,
--     integer not null default 0); stubs.sql's lawyer_profiles lacks it.
--   * L1 (credit_balance 250) — the balance the migration must turn into one
--     250-point migrated lot; L0 (credit_balance 0) — must get none.
alter table public.lawyer_profiles
  add column if not exists credit_balance integer not null default 0;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000e001'),
  ('00000000-0000-0000-0000-00000000e000');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000e001', 'lawyer', 'L1'),
  ('00000000-0000-0000-0000-00000000e000', 'lawyer', 'L0');
insert into public.lawyer_profiles (user_id, credit_balance) values
  ('00000000-0000-0000-0000-00000000e001', 250),
  ('00000000-0000-0000-0000-00000000e000', 0);
