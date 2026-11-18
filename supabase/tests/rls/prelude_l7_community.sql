-- prelude_l7_community.sql — the parts of the live database 20261127_60 reads
-- that the rest of its chain (stubs.sql, prelude_auth_sessions_live.sql,
-- prelude_community_live_schema.sql, 20261016_06, the library device chain,
-- prelude_platform_settings_min.sql) does not create. Minimal shapes: only
-- the columns the migration's functions read or write.
--   lawyer_profiles.license_expiry  (20260603_phase1_001)
--   platform_settings.description   (20260627)
--   firm_profiles.verification_status (20260603_phase1_002)
--   subscriptions / library_access_grants / founder_seats /
--   membership_credits / points_lots  (their live columns, minimal)
-- Plus ONE library device registered under 20261108_20 BEFORE 20261127_60
-- runs, to prove the grandfathering.
alter table public.lawyer_profiles add column if not exists license_expiry date;
alter table public.platform_settings add column if not exists description text;
alter table public.firm_profiles add column if not exists verification_status text not null default 'pending';

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);
create table if not exists public.library_access_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  revoked_at timestamptz
);
create table if not exists public.founder_seats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved',
  ends_at timestamptz
);
create table if not exists public.membership_credits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  remaining int not null,
  ends_at timestamptz not null
);
create table if not exists public.points_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points_left int not null,
  expires_at timestamptz not null
);

-- G: a library device registered before 20261127_60 (grandfathered).
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e00f');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000e00f', 'individual', 'G');
insert into public.user_devices (user_id, device_hash, label)
values ('00000000-0000-0000-0000-00000000e00f', encode(sha256('old-device'::bytea), 'hex'), 'كمبيوتر');
