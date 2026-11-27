-- prelude_l19_licence_expiry.sql — chain step for l19_licence_expiry.test.sql
-- (20261209_10). stubs.sql models the three licensed tables without the
-- columns production has: lawyer_profiles.license_expiry and
-- firm_profiles.verification_status / license_expiry
-- (20260603_phase1_001 / _002), and no provider_profiles at all (its live
-- shape: prelude_provider_profiles_live.sql). The registry migration
-- (20261122_40) also needs profiles.phone. Synthetic rows only.
alter table public.profiles add column if not exists phone text;
alter table public.lawyer_profiles add column if not exists license_expiry date;
alter table public.firm_profiles add column if not exists verification_status text not null default 'pending';
alter table public.firm_profiles add column if not exists license_expiry date;
create table if not exists public.provider_profiles (
  user_id uuid not null primary key references public.profiles(id) on delete cascade,
  sub_role text not null default 'notary',
  license_number text,
  license_expiry date,
  verification_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb
);
