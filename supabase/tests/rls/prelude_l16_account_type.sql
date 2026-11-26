-- prelude_l16_account_type.sql — live shapes the account-type converter
-- (20261206_80) reads but the RLS stubs lack. Loaded after 20261019_20.
alter table public.admin_audit_events
  add column if not exists actor_type text not null default 'user',
  add column if not exists before_state jsonb,
  add column if not exists after_state jsonb;

alter table public.lawyer_profiles
  add column if not exists practice_kind_confirmed_at timestamptz;

create table if not exists public.provider_profiles (
  user_id uuid not null primary key references public.profiles(id) on delete cascade,
  sub_role text not null check (sub_role in ('notary', 'arbitrator', 'bailiff')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  metadata jsonb not null default '{}'::jsonb
);
alter table public.provider_profiles enable row level security;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  plan_id text,
  tier text not null default 'free',
  status text not null default 'active',
  current_period_end timestamptz
);
alter table public.subscriptions enable row level security;

create table if not exists public.founder_seats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'reserved',
  ends_at timestamptz
);
alter table public.founder_seats enable row level security;

grant all on public.provider_profiles, public.subscriptions, public.founder_seats to anon, authenticated, service_role;

-- wire handle_new_user to auth.users as on live (prelude_accounts_limits.sql does the same)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
