-- Stubs that stand in for the parts of the live database the Phase 2
-- migration touches but does not create. Policies are copied from the real
-- migrations (20260518, 20260616, 20260625) so the RLS tests mean something.
create schema if not exists auth;
create table auth.users (id uuid primary key);
-- auth.uid() reads a session setting so tests can impersonate any user.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_type text not null,
  display_name text not null default '',
  email text
);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select using (id = auth.uid());

-- 20260625
create or replace function public.is_admin() returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and user_type = 'admin');
$$;

create table public.firm_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name_ar text not null,
  name_en text not null default ''
);
alter table public.firm_profiles enable row level security;
create policy "owner reads firm" on public.firm_profiles for select using (owner_user_id = auth.uid());

-- 20260616 firm_members + its policies, verbatim in substance
create table public.firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firm_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in (
    'managing_partner','partner','senior_lawyer','lawyer','trainee',
    'legal_secretary','office_admin','finance_manager','hr_manager',
    'compliance_manager','external_of_counsel','legal_consultant','in_house_counsel')),
  department text,
  permissions text[] not null default '{}',
  status text not null default 'active' check (status in ('invited','active','suspended','removed')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.firm_members enable row level security;
create policy "firm_members: member can read own membership" on public.firm_members for select using (user_id = auth.uid());
create policy "firm_members: firm owner can read all members" on public.firm_members for select
  using (exists (select 1 from public.firm_profiles fp where fp.id = firm_members.firm_id and fp.owner_user_id = auth.uid()));
create policy "firm_members: active members can read co-members" on public.firm_members for select
  using (exists (select 1 from public.firm_members self where self.firm_id = firm_members.firm_id and self.user_id = auth.uid() and self.status = 'active'));
create policy "firm_members: firm owner can insert" on public.firm_members for insert
  with check (exists (select 1 from public.firm_profiles fp where fp.id = firm_members.firm_id and fp.owner_user_id = auth.uid()));
create policy "firm_members: firm owner can update" on public.firm_members for update
  using (exists (select 1 from public.firm_profiles fp where fp.id = firm_members.firm_id and fp.owner_user_id = auth.uid()));

-- 20260518 service_requests + policies
create table public.service_requests (
  id text primary key,
  requester_user_id uuid references auth.users(id) on delete set null,
  type text not null default 'service',
  title text not null,
  description text not null default '',
  requester jsonb not null default '{}'::jsonb,
  receiver text not null default 'lawyer',
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'assigned',
  payment jsonb not null default '{"amount":0,"status":"not_required"}'::jsonb,
  source_path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_requests enable row level security;
create policy "clients read their own service requests" on public.service_requests for select
  using (requester_user_id = auth.uid() or assigned_to = auth.uid());
create policy "clients create their own service requests" on public.service_requests for insert
  with check (requester_user_id = auth.uid());
create policy "participants update service requests" on public.service_requests for update
  using (requester_user_id = auth.uid() or assigned_to = auth.uid())
  with check (requester_user_id = auth.uid() or assigned_to = auth.uid());

create table public.consultations (
  id text primary key,
  request_id text not null unique references public.service_requests(id) on delete cascade,
  requester_user_id uuid references auth.users(id) on delete set null,
  lawyer_user_id uuid references auth.users(id) on delete set null,
  mode text not null default 'text',
  status text not null default 'pending_assignment'
);
alter table public.consultations enable row level security;
create policy "participants read consultations" on public.consultations for select
  using (requester_user_id = auth.uid() or lawyer_user_id = auth.uid());

create table public.cases (
  id text primary key,
  request_id text unique references public.service_requests(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null default 'open'
);
alter table public.cases enable row level security;
create policy "participants read cases" on public.cases for select
  using (client_user_id = auth.uid() or assigned_user_id = auth.uid());

create table public.contracts (
  id text primary key,
  request_id text unique references public.service_requests(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  contract_type text not null default 'general',
  status text not null default 'draft'
);
alter table public.contracts enable row level security;
create policy "participants read contracts" on public.contracts for select
  using (client_user_id = auth.uid() or assigned_user_id = auth.uid());

-- A non-superuser role: RLS does NOT apply to superusers, so every test
-- below would silently pass as postgres.
create role app_user login;
grant usage on schema public, auth to app_user;
grant all on all tables in schema public to app_user;
grant all on all sequences in schema public to app_user;
alter default privileges for role postgres in schema public grant all on tables to app_user;
alter default privileges for role postgres in schema public grant all on sequences to app_user;
