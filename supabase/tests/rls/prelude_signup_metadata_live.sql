-- prelude_signup_metadata_live.sql — chain step for lawyer_practice_kind.test.sql
-- (20261019_20). NOT a migration; it never ships.
--
-- It lets the REAL signup path run in the harness: auth.users insert →
-- handle_new_user() (AFTER INSERT, SECURITY DEFINER, latest body in
-- 20260921_04) → `INSERT INTO public.lawyer_profiles (user_id,
-- is_accepting_clients)` → the BEFORE INSERT trigger under test.
--
-- It loads AFTER prelude_lawyer_profiles_live.sql (the live lawyer_profiles
-- shape and grants) and BEFORE 20260921_04 (which re-creates handle_new_user
-- and, in its backfill, reads profiles.phone / profiles.metadata):
--   * auth.users carries only `id` in stubs.sql. handle_new_user reads email,
--     phone and raw_user_meta_data, and 20261019_20 refuses to run without
--     raw_user_meta_data. It is NULLABLE here, as in GoTrue's live schema, so
--     the test can sign up a user whose metadata is NULL.
--   * public.profiles carries four columns in stubs.sql; handle_new_user
--     (20260827 onwards) also writes phone, display_name_en, city and
--     country_code, and 20260921_04's quarantine step writes metadata.
--   * public.user_settings: handle_new_user inserts a row for every user type.
-- A separate file rather than prelude_profiles_phone.sql: that one drops the
-- three stub lawyer_profiles policies for 20260603 to re-create, and 20260603
-- is not in this chain (it cannot run on top of the live-shape prelude).

alter table auth.users
  add column if not exists email              text,
  add column if not exists phone              text,
  add column if not exists raw_user_meta_data jsonb;

alter table public.profiles
  add column if not exists phone           text,
  add column if not exists display_name_en text not null default '',
  add column if not exists city            text,
  add column if not exists country_code    text not null default 'SA',
  add column if not exists metadata        jsonb not null default '{}'::jsonb;

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade
);
