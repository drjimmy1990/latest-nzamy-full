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
  specialty text,
  scheduled_at timestamptz,
  status text not null default 'pending_assignment',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reminder_sent boolean not null default false,      -- 20260706
  reminder_1h_sent boolean not null default false    -- 20260706
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
  status text not null default 'draft',
  document_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.contracts enable row level security;
create policy "participants read contracts" on public.contracts for select
  using (client_user_id = auth.uid() or assigned_user_id = auth.uid());


-- 20260903_phase1 helper (repeated so stub policies can reference it)
create or replace function public.can_access_case_row(p_owner uuid, p_firm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_owner is not null and p_owner = auth.uid())
      or (p_firm is not null and exists (
            select 1 from public.firm_members fm
             where fm.firm_id = p_firm and fm.user_id = auth.uid() and fm.status = 'active'));
$$;

-- Phase 1 tables the Phase 5 migration references (minimal shapes; RLS as in
-- 20260903_phase1: owner-or-firm read, owner insert).
create table public.case_stages (
  id uuid primary key default gen_random_uuid(),
  case_request_id text not null references public.service_requests(id) on delete cascade,
  firm_id uuid references public.firm_profiles(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  degree text not null default 'first_instance',
  closed_on date,
  outcome text
);
alter table public.case_stages enable row level security;
create policy "case stages readable by owner or firm" on public.case_stages for select
  using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());
create policy "case stages insertable by owner" on public.case_stages for insert
  with check (owner_user_id = auth.uid());

create table public.hearings (
  id uuid primary key default gen_random_uuid(),
  case_request_id text references public.service_requests(id) on delete cascade,
  firm_id uuid references public.firm_profiles(id) on delete set null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'appointment',
  title text not null,
  hearing_date date not null
);
alter table public.hearings enable row level security;
create policy "hearings readable by owner or firm" on public.hearings for select
  using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());
create policy "hearings insertable by owner" on public.hearings for insert
  with check (owner_user_id = auth.uid());

-- 20260603_phase1_001 + 20260705 (minimal shape; live policies)
create table public.lawyer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  license_number text,
  specialties text[] not null default '{}',
  years_experience int not null default 0,
  bio_ar text not null default '',
  hourly_rate numeric(12,2),
  marketplace_visible boolean not null default false,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected','suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.lawyer_profiles enable row level security;
create policy "lawyers read own profile" on public.lawyer_profiles for select using (user_id = auth.uid());
create policy "public read verified lawyers" on public.lawyer_profiles for select
  using (verification_status = 'verified' and marketplace_visible = true);
create policy "lawyers update own profile" on public.lawyer_profiles for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 20260603_phase1_005 (live shape + live policies; Phase 7 replaces the insert policy)
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  request_id text references public.service_requests(id) on delete set null,
  rating int not null check (rating >= 1 and rating <= 5),
  title text not null default '',
  body text not null default '',
  is_anonymous boolean not null default false,
  status text not null default 'active' check (status in ('pending','active','moderated','deleted')),
  response text,
  response_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.reviews enable row level security;
create policy "anyone reads active reviews" on public.reviews for select using (status = 'active');
create policy "reviewers create reviews" on public.reviews for insert with check (reviewer_id = auth.uid());
create policy "reviewers update own reviews" on public.reviews for update
  using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
create policy "reviewees respond to reviews" on public.reviews for update
  using (reviewee_id = auth.uid()) with check (reviewee_id = auth.uid());

-- 20260626 legal library (minimal) — Phase 6 adds is_pinned
create schema if not exists library;
create table library.smart_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 20260603_phase1_004 research (live shape + live owner policies)
create table public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.research_sessions enable row level security;
create policy "users read their own research sessions" on public.research_sessions for select using (user_id = auth.uid());
create policy "users create their own research sessions" on public.research_sessions for insert with check (user_id = auth.uid());
create table public.research_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.research_sessions(id) on delete cascade,
  content text not null,
  source text not null default '',
  item_type text not null default 'fact'
    check (item_type in ('fact', 'source', 'note', 'highlight', 'bookmark', 'ai_output')),
  position int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.research_items enable row level security;
create policy "users manage items of their own sessions" on public.research_items for all
  using (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.research_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- 20260518 attachments (live shape + live select/insert policies)
create table public.attachments (
  id bigserial primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
alter table public.attachments enable row level security;
create policy "participants read attachments" on public.attachments for select
  using (exists (select 1 from public.service_requests sr where sr.id = attachments.request_id and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())));
create policy "participants insert attachments" on public.attachments for insert
  with check (exists (select 1 from public.service_requests sr where sr.id = attachments.request_id and sr.requester_user_id = auth.uid()));

-- A non-superuser role: RLS does NOT apply to superusers, so every test
-- below would silently pass as postgres.
create role app_user login;
grant usage on schema public, auth to app_user;
grant all on all tables in schema public to app_user;
grant all on all sequences in schema public to app_user;
alter default privileges for role postgres in schema public grant all on tables to app_user;
alter default privileges for role postgres in schema public grant all on sequences to app_user;
