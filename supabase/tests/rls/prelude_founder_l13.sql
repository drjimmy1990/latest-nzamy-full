-- prelude_founder_l13.sql — runs right before 20261203_20 in founder_l13.test.sql's
-- chain: public.profiles.created_at as on live (20260603_phase1_001,
-- timestamptz not null default now()); stubs.sql's profiles lacks it, and
-- founder_invite_redeem's «new account» rule reads it.
alter table public.profiles
  add column if not exists created_at timestamptz not null default now();
