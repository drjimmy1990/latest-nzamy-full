-- prelude_profiles_live_columns.sql — brings public.profiles (the stubs.sql
-- stub, or the real 20260603 table) up to the production column list of
-- 2026-10-10, so a migration that names production columns (20261016_02's
-- column grant) can load in a short chain. Idempotent; adds nothing that
-- production does not have.
alter table public.profiles
  add column if not exists display_name_en text not null default '',
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists avatar_url text,
  add column if not exists country_code text not null default 'SA',
  add column if not exists language text not null default 'ar',
  add column if not exists calendar_type text not null default 'hijri',
  add column if not exists theme text not null default 'light',
  add column if not exists verified_at timestamptz,
  add column if not exists nafath_verified boolean not null default false,
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists city text,
  add column if not exists nationality text;
