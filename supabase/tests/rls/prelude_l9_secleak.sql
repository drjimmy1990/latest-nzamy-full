-- Chain step (NOT a migration) for l9_secleak.test.sql — runs BEFORE
-- 20261129_20 so the test can prove what the migration does to rows that
-- already exist on production:
--   * public.provider_profiles in a minimal live shape (20260603_phase1_001:
--     user_id, license_number, verification_status) — stubs.sql has none;
--   * two lawyers VERIFIED with the fake test pattern (as the 10 test lawyers
--     are on production: 1448-LAW-001 … 010), one written with Arabic-Indic
--     digits and lower case, one lawyer verified with a real-looking number,
--     and one provider verified with a fake number.
create table if not exists public.provider_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  sub_role            text not null default 'notary',
  license_number      text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  marketplace_visible boolean not null default false,
  updated_at          timestamptz not null default now()
);
alter table public.provider_profiles enable row level security;

insert into auth.users (id) values
  ('f1000000-0000-0000-0000-0000000000f1'),
  ('f2000000-0000-0000-0000-0000000000f2'),
  ('f3000000-0000-0000-0000-0000000000f3'),
  ('f4000000-0000-0000-0000-0000000000f4');
insert into public.profiles (id, user_type, display_name) values
  ('f1000000-0000-0000-0000-0000000000f1', 'lawyer', 'fake one'),
  ('f2000000-0000-0000-0000-0000000000f2', 'lawyer', 'fake two'),
  ('f3000000-0000-0000-0000-0000000000f3', 'lawyer', 'real'),
  ('f4000000-0000-0000-0000-0000000000f4', 'provider', 'fake provider');
insert into public.lawyer_profiles (user_id, license_number, verification_status) values
  ('f1000000-0000-0000-0000-0000000000f1', '1448-LAW-001', 'verified'),
  ('f2000000-0000-0000-0000-0000000000f2', '١٤٤٨-law-٠٠٢', 'verified'),
  ('f3000000-0000-0000-0000-0000000000f3', '45/12345', 'verified');
insert into public.provider_profiles (user_id, license_number, verification_status) values
  ('f4000000-0000-0000-0000-0000000000f4', '1448 LAW 003', 'verified');
