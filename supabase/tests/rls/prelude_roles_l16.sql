-- prelude_roles_l16.sql — chain step for roles_office_plan_l16.test.sql
-- (20261206_70). NOT a migration; it never ships.
--
-- Loads AFTER 20261126_50 and BEFORE 20261206_70: a stand-in for the part of
-- the Storage schema the quota trigger reads (storage.objects with owner_id,
-- owner and metadata, as on the self-hosted stack), granted to the session
-- roles the way the Storage API reaches it.
\set ON_ERROR_STOP on

create schema if not exists storage;
create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null,
  name       text not null,
  owner      uuid,
  owner_id   text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);
grant usage on schema storage to app_user, anon, authenticated, service_role;
grant select, insert on storage.objects to app_user, authenticated, service_role;

-- public.platform_settings in its live shape (20260627_platform_settings.sql);
-- the migration seeds free_storage_quota into it.
create table if not exists public.platform_settings (
  key         text        primary key,
  value       jsonb       not null default '{}'::jsonb,
  description text,
  updated_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- public.reviews (20260603_phase1_005, only what 20261017_31 reads), so the
-- chain can load 20261017_31 and prove the re-created set_firm_public_reviews.
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  rating      int  not null default 5,
  status      text not null default 'active'
);
alter table public.reviews enable row level security;
grant select on public.reviews to anon, authenticated, app_user;
-- 20260922_03 takes UPDATE on firm_profiles away from the API roles (live);
-- the stubs' blanket grant would fail 20261017_31's own verify.
revoke update on public.firm_profiles from anon, authenticated;
