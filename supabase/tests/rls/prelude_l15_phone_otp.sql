-- prelude_l15_phone_otp.sql — chain step (NOT a migration) for
-- l15_phone_otp.test.sql. stubs.sql models profiles as (id, user_type,
-- display_name, email) and auth.users as (id); 20261205_10 also reads
-- profiles.phone / is_demo, auth.users.created_at, platform_settings,
-- test_accounts and platform_staff. This adds exactly those, plus the two
-- live facts the file leans on:
--   * the profiles column lock of 20261016_02 (no table-level UPDATE for the
--     API roles; UPDATE granted column by column — phone among them), so the
--     migration's verify can prove phone_verified_at is not writable;
--   * the "users update own profile" policy (20260603_phase1_001), so a
--     session's own-row UPDATE reaches the trigger.
alter table auth.users add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists phone      text,
  add column if not exists is_demo    boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

revoke insert, update, delete, truncate, references, trigger on public.profiles from anon, authenticated, public;
grant update (display_name, phone) on public.profiles to authenticated;

create table if not exists public.platform_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  description text,
  updated_at  timestamptz not null default now()
);
alter table public.platform_settings enable row level security;

create table if not exists public.test_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  source     text not null default 'manual',
  created_at timestamptz not null default now()
);
alter table public.test_accounts enable row level security;
revoke all on public.test_accounts from public, anon, authenticated;

create table if not exists public.platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  staff_role text not null
);
alter table public.platform_staff enable row level security;
