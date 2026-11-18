-- prelude_open_requests_publish.sql — what 20261127_70 needs that stubs.sql
-- does not create: profiles.is_demo (20261125_50) and public.test_accounts
-- (20261017_44), with the live column shapes. Only what the function reads.
\set ON_ERROR_STOP on

alter table public.profiles add column if not exists is_demo boolean not null default false;

create table if not exists public.test_accounts (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  source     text not null default 'manual',
  created_at timestamptz not null default now()
);
alter table public.test_accounts enable row level security;
