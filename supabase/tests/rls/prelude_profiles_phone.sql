-- ============================================================
-- prelude_profiles_phone.sql — chain step for profiles_phone_e164.test.sql
--
-- NOT a migration. It never ships and it is never applied to a real database.
-- It exists because `stubs.sql` models `public.profiles` with four columns
-- (id, user_type, display_name, email) and `auth.users` with one (id), which is
-- enough for the RLS tests that file was written for but not for
-- 20260921_04_profiles_phone_e164_check.sql, which needs `profiles.phone`,
-- `profiles.metadata` and the `auth.users` columns `handle_new_user()` reads.
--
-- It is a separate file rather than an edit to `stubs.sql` on purpose: several
-- branches are extending that file at the same time and it is a shared fixture.
--
-- Chain:
--   run-local.sh prelude_profiles_phone.sql \
--                ../../migrations/20260603_phase1_001_profiles.sql \
--                ../../migrations/20260827_signup_contact_fields.sql \
--                ../../migrations/20260921_04_profiles_phone_e164_check.sql \
--                profiles_phone_e164.test.sql
--
-- Why each piece is here:
--   * `public.profiles` already exists (stubs.sql), so the `create table if not
--     exists` in 20260603_phase1_001 is a no-op and its columns never appear.
--     The four columns added below are the ones that file declares and this
--     test needs; `city` is deliberately NOT added, because 20260827 adds it and
--     that `add column if not exists` is part of what is under test.
--   * `auth.users` needs raw_user_meta_data / email / phone before
--     `handle_new_user()` can read them, and before 20260827's backfill (which
--     selects raw_user_meta_data) can parse.
--   * `public.user_settings` is inserted into by the 20260827 body for EVERY
--     user type, so without it every auth.users insert fails.
--   * `profiles.created_at` / `updated_at`: 20260603_phase1_001 attaches
--     `set_profiles_updated_at` (handle_updated_at()) to the table, and that
--     function assigns `new.updated_at`, so without the column EVERY update of
--     a profiles row raises 42703 at runtime.
--   * The three `lawyer_profiles` policies are dropped first because stubs.sql
--     creates them under the same names and `create policy` has no
--     `if not exists`. 20260603_phase1_001 re-creates all three immediately
--     afterwards, with the same definitions, so nothing is weakened.
-- ============================================================

alter table public.profiles
  add column if not exists phone           text,
  add column if not exists display_name_en text not null default '',
  add column if not exists country_code    text not null default 'SA',
  add column if not exists metadata        jsonb not null default '{}'::jsonb,
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

drop policy if exists "lawyers read own profile"    on public.lawyer_profiles;
drop policy if exists "public read verified lawyers" on public.lawyer_profiles;
drop policy if exists "lawyers update own profile"  on public.lawyer_profiles;

alter table auth.users
  add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb,
  add column if not exists email              text,
  add column if not exists phone              text;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade
);
