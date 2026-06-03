-- =============================================================================
-- Phase 1 · Migration 001 — User Profile System
-- =============================================================================
-- Depends on: 20260518_client_workflow_backend_ready.sql (service_requests, etc.)
-- Creates:    profiles, lawyer_profiles, provider_profiles, micro_profiles
-- Also:       handle_updated_at() trigger fn, handle_new_user() trigger fn
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function: auto-set updated_at on every UPDATE
-- ---------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.handle_updated_at()
  is 'Sets updated_at = now() before every UPDATE. Attach to any table with an updated_at column.';

-- ---------------------------------------------------------------------------
-- 1. profiles — extended user profile linked to auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  user_type      text         not null check (user_type in (
                   'individual', 'lawyer', 'firm', 'corporate',
                   'micro', 'provider', 'government', 'ngo', 'admin'
                 )),
  display_name   text         not null default '',
  display_name_en text        not null default '',
  email          text,
  phone          text,
  avatar_url     text,
  country_code   text         not null default 'SA',
  language       text         not null default 'ar'
                              check (language in ('ar', 'en')),
  calendar_type  text         not null default 'hijri'
                              check (calendar_type in ('hijri', 'miladi', 'both')),
  theme          text         not null default 'light'
                              check (theme in ('light', 'dark', 'system')),
  verified_at    timestamptz,
  nafath_verified boolean     not null default false,
  onboarding_completed boolean not null default false,
  metadata       jsonb        not null default '{}'::jsonb,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

comment on table public.profiles
  is 'Extended user profile. One row per auth.users entry.';

-- Indexes
create index if not exists idx_profiles_user_type    on public.profiles (user_type);
create index if not exists idx_profiles_country_code on public.profiles (country_code);

-- RLS
alter table public.profiles enable row level security;

create policy "users read own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "admins read all profiles"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );

create policy "users update own profile"
  on public.profiles for update
  using  (id = auth.uid())
  with check (id = auth.uid());

-- Trigger: updated_at
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 2. lawyer_profiles — lawyer-specific data
-- ---------------------------------------------------------------------------
create table if not exists public.lawyer_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  license_number      text,
  license_expiry      date,
  bar_association      text,
  specialties         text[]       not null default '{}',
  years_experience    int          not null default 0,
  bio_ar              text         not null default '',
  bio_en              text         not null default '',
  hourly_rate         numeric(12,2),
  credit_balance      int          not null default 0,
  credit_package      text,                          -- last purchased package ID
  credit_expiry       timestamptz,
  free_briefs_remaining int        not null default 1,  -- promotional free memos
  marketplace_visible boolean      not null default false,
  active_roles        text[]       not null default '{"lawyer"}'::text[],  -- dual-role support
  display_mode        text         not null default 'full'
                                   check (display_mode in ('full', 'light')),
  verification_status text         not null default 'pending'
                                   check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  metadata            jsonb        not null default '{}'::jsonb,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

comment on table public.lawyer_profiles
  is 'Lawyer-specific profile data: credentials, credits, marketplace settings.';

-- Indexes
create index if not exists idx_lawyer_profiles_verification_status
  on public.lawyer_profiles (verification_status);

-- RLS
alter table public.lawyer_profiles enable row level security;

create policy "lawyers read own profile"
  on public.lawyer_profiles for select
  using (user_id = auth.uid());

create policy "public read verified lawyers"
  on public.lawyer_profiles for select
  using (verification_status = 'verified' and marketplace_visible = true);

create policy "admins read all lawyer profiles"
  on public.lawyer_profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );

create policy "lawyers update own profile"
  on public.lawyer_profiles for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger: updated_at
create trigger set_lawyer_profiles_updated_at
  before update on public.lawyer_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 3. provider_profiles — service provider (notary, arbitrator, bailiff)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  sub_role            text         not null
                                   check (sub_role in ('notary', 'arbitrator', 'bailiff')),
  license_number      text,
  license_expiry      date,
  service_areas       text[]       not null default '{}',
  availability        jsonb        not null default
                        '{"days":["sun","mon","tue","wed","thu"],"hours":{"start":"08:00","end":"17:00"}}'::jsonb,
  hourly_rate         numeric(12,2),
  verification_status text         not null default 'pending'
                                   check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  marketplace_visible boolean      not null default false,
  metadata            jsonb        not null default '{}'::jsonb,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

comment on table public.provider_profiles
  is 'Provider-specific profile: notaries, arbitrators, bailiffs.';

-- Indexes
create index if not exists idx_provider_profiles_sub_role
  on public.provider_profiles (sub_role);

-- RLS
alter table public.provider_profiles enable row level security;

create policy "providers read own profile"
  on public.provider_profiles for select
  using (user_id = auth.uid());

create policy "public read verified providers"
  on public.provider_profiles for select
  using (verification_status = 'verified' and marketplace_visible = true);

create policy "admins read all provider profiles"
  on public.provider_profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );

create policy "providers update own profile"
  on public.provider_profiles for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger: updated_at
create trigger set_provider_profiles_updated_at
  before update on public.provider_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 4. micro_profiles — micro / small business
-- ---------------------------------------------------------------------------
create table if not exists public.micro_profiles (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  business_name        text         not null default '',
  business_type        text,
  employee_count       int          not null default 1,
  license_count        int          not null default 0,
  requirements_score   numeric(5,2) not null default 0,
  litigation_boundary  text         not null default 'advisory_only'
                                    check (litigation_boundary in (
                                      'advisory_only', 'marketplace_escalation', 'case_tracking'
                                    )),
  metadata             jsonb        not null default '{}'::jsonb,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

comment on table public.micro_profiles
  is 'Micro/small business profile: employee count, compliance score, litigation boundary.';

-- RLS
alter table public.micro_profiles enable row level security;

create policy "micro owners read own profile"
  on public.micro_profiles for select
  using (user_id = auth.uid());

create policy "admins read all micro profiles"
  on public.micro_profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.user_type = 'admin'
    )
  );

create policy "micro owners update own profile"
  on public.micro_profiles for update
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Trigger: updated_at
create trigger set_micro_profiles_updated_at
  before update on public.micro_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Auto-create profile on auth.users insert
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_type text;
begin
  -- Extract user_type from signup metadata; default to 'individual'
  _user_type := coalesce(
    new.raw_user_meta_data ->> 'user_type',
    'individual'
  );

  -- Validate against allowed types
  if _user_type not in (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo', 'admin'
  ) then
    _user_type := 'individual';
  end if;

  insert into public.profiles (
    id,
    user_type,
    display_name,
    display_name_en,
    email,
    phone
  ) values (
    new.id,
    _user_type,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name_en', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone)
  );

  return new;
end;
$$;

comment on function public.handle_new_user()
  is 'Automatically creates a profiles row when a new auth.users row is inserted.';

-- Attach to auth.users (drop first for idempotency)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- End of migration
-- =============================================================================
