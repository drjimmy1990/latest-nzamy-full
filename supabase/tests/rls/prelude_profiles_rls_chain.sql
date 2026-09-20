-- Chain step (NOT a migration) for profiles_cross_user_read.test.sql.
--
-- Run by run.sh / run-local.sh as the first "migration" in the chain, before
-- the real 20260603_phase1_001_profiles.sql. It does three things the real
-- chain needs and stubs.sql cannot provide:
--
--  1. stubs.sql stubs `public.profiles` itself — a 4-column table with ONE
--     hand-written policy ("own profile"). This test must exercise the REAL
--     policy set, so the stub is dropped here and the real migration (which
--     uses `create table if not exists`, i.e. would otherwise silently keep the
--     stub) creates the live shape. CASCADE takes the stub tables that
--     reference profiles — but CASCADE drops the foreign keys, not the tables,
--     so `public.lawyer_profiles` (also stubbed, with its own copies of the
--     real policy names) must go explicitly or 20260603_phase1_001 stops at
--     `policy "lawyers read own profile" … already exists`. Neither table is
--     used by this test, and the migration recreates both for real.
--
--  2. stubs.sql's `auth.users` has only `id`. 20260603_phase1_001 attaches
--     `handle_new_user()` to it, and that function reads raw_user_meta_data,
--     email and phone. The columns are added here so inserting a user creates
--     its profile exactly as it does live.
--
--  3. 20260625_fix_rls_recursion.sql repairs `public.groups` /
--     `public.group_members` in the same transaction as the profiles fix.
--     Neither table is in stubs.sql, and `create policy` on a missing table is
--     a hard error, so minimal shapes are provided.

drop table if exists public.lawyer_profiles cascade;
drop table if exists public.profiles cascade;

alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists phone text;
alter table auth.users add column if not exists raw_user_meta_data jsonb not null default '{}'::jsonb;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid,
  name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.groups enable row level security;

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
alter table public.group_members enable row level security;
