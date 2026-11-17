-- prelude_demo_accounts_tables.sql — the tables 20261125_50 guards that the
-- founder chain (and stubs.sql) does not create, each with the owner columns
-- the live schema has (community 20260603_phase1_004, community_reports
-- 20260911, library_issue_reports 20260906, marketplace 20260603_phase1_005,
-- lawyer_clients 20260903_phase2, provider_profiles 20260603_phase1_002).
-- Only the columns the guards read, plus what NOT NULL needs.
\set ON_ERROR_STOP on

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null default ''
);
create table if not exists public.community_answers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default ''
);
create table if not exists public.community_votes (
  id bigserial primary key,
  user_id uuid not null,
  target_type text not null default 'post',
  target_id uuid not null,
  value int not null default 1
);
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reason text not null default 'other'
);
create table if not exists public.library_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  body text not null default ''
);
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default ''
);
create table if not exists public.marketplace_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  offeror_id uuid not null references public.profiles(id) on delete cascade
);
create table if not exists public.lawyer_clients (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_user_id uuid references auth.users(id) on delete set null,
  name text not null default 'موكل'
);
create table if not exists public.provider_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  marketplace_visible boolean not null default false
);

grant all on all tables in schema public to app_user, anon, authenticated, service_role;
grant all on all sequences in schema public to app_user, anon, authenticated, service_role;
