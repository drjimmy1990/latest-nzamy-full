-- =============================================================================
-- Migration: Entity Tables + RLS Policies (Corrected Order)
-- Date: 2026-06-16
-- Description:
--   Creates all 8 entity/membership tables FIRST, then applies all RLS
--   policies and triggers AFTER all tables exist. This avoids cross-reference
--   errors where a policy on table A references table B before B is created.
-- =============================================================================

-- Ensure handle_updated_at() trigger function exists
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 1: CREATE ALL TABLES (no policies, no triggers)                    ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- 1. firm_profiles
create table if not exists public.firm_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  name_ar text not null,
  name_en text not null default '',
  license_number text,
  license_expiry date,
  size text not null default 'small'
    check (size in ('solo', 'small', 'medium', 'large', 'enterprise')),
  structure text not null default 'single_office'
    check (structure in ('single_office', 'multi_branch', 'virtual', 'hybrid')),
  practice_model text not null default 'general'
    check (practice_model in ('general', 'specialized', 'boutique', 'full_service')),
  branches jsonb not null default '[]'::jsonb,
  departments jsonb not null default '[]'::jsonb,
  plan_id text,
  annual_points_budget int not null default 0,
  points_spent int not null default 0,
  max_seats int not null default 5,
  display_mode text not null default 'full'
    check (display_mode in ('full', 'light')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  branding jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_firm_profiles_owner on public.firm_profiles (owner_user_id);
create index if not exists idx_firm_profiles_verification on public.firm_profiles (verification_status);
create index if not exists idx_firm_profiles_size on public.firm_profiles (size);


-- 2. firm_members
create table if not exists public.firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firm_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in (
      'managing_partner', 'partner', 'senior_lawyer', 'lawyer', 'trainee',
      'legal_secretary', 'office_admin', 'finance_manager', 'hr_manager',
      'compliance_manager', 'external_of_counsel', 'legal_consultant',
      'in_house_counsel'
    )),
  department text,
  permissions text[] not null default '{}',
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(firm_id, user_id)
);

create index if not exists idx_firm_members_firm on public.firm_members (firm_id);
create index if not exists idx_firm_members_user on public.firm_members (user_id);
create index if not exists idx_firm_members_role on public.firm_members (role);
create index if not exists idx_firm_members_status on public.firm_members (status);


-- 3. business_profiles
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  company_name_ar text not null,
  company_name_en text not null default '',
  cr_number text,
  size text not null default 'medium'
    check (size in ('startup', 'small', 'medium', 'large', 'enterprise')),
  legal_structure text not null default 'llc'
    check (legal_structure in (
      'sole_proprietorship', 'llc', 'closed_jsc', 'listed_jsc',
      'partnership', 'branch_foreign', 'holding', 'government_owned'
    )),
  service_model text not null default 'internal'
    check (service_model in ('internal', 'external', 'hybrid')),
  has_legal_dept boolean not null default false,
  plan_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_business_profiles_owner on public.business_profiles (owner_user_id);
create index if not exists idx_business_profiles_verification on public.business_profiles (verification_status);
create index if not exists idx_business_profiles_size on public.business_profiles (size);
create index if not exists idx_business_profiles_cr on public.business_profiles (cr_number);


-- 4. business_members
create table if not exists public.business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in (
      'owner', 'legal_manager', 'legal_staff', 'compliance_officer',
      'seconded', 'department_head', 'hr_manager', 'finance_manager',
      'employee'
    )),
  department text,
  permissions text[] not null default '{}',
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id, user_id)
);

create index if not exists idx_business_members_business on public.business_members (business_id);
create index if not exists idx_business_members_user on public.business_members (user_id);
create index if not exists idx_business_members_role on public.business_members (role);
create index if not exists idx_business_members_status on public.business_members (status);


-- 5. government_profiles
create table if not exists public.government_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  entity_name_ar text not null,
  entity_name_en text not null default '',
  entity_type text not null
    check (entity_type in (
      'court', 'prosecution', 'ministry', 'authority',
      'commission', 'municipality', 'other'
    )),
  role text not null default 'officer'
    check (role in ('judge', 'prosecutor', 'officer', 'counsel')),
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  integrations jsonb not null default '[]'::jsonb,
  restricted_from text[] not null default '{}',
  plan_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_government_profiles_owner on public.government_profiles (owner_user_id);
create index if not exists idx_government_profiles_verification on public.government_profiles (verification_status);
create index if not exists idx_government_profiles_entity_type on public.government_profiles (entity_type);
create index if not exists idx_government_profiles_role on public.government_profiles (role);


-- 6. government_members
create table if not exists public.government_members (
  id uuid primary key default gen_random_uuid(),
  gov_id uuid not null references public.government_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in ('judge', 'prosecutor', 'officer', 'counsel', 'clerk', 'admin')),
  permissions text[] not null default '{}',
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(gov_id, user_id)
);

create index if not exists idx_government_members_gov on public.government_members (gov_id);
create index if not exists idx_government_members_user on public.government_members (user_id);
create index if not exists idx_government_members_role on public.government_members (role);
create index if not exists idx_government_members_status on public.government_members (status);


-- 7. ngo_profiles
create table if not exists public.ngo_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  org_name_ar text not null,
  org_name_en text not null default '',
  org_type text not null
    check (org_type in ('charity', 'waqf', 'foundation', 'campaign', 'association', 'other')),
  volunteer_count int not null default 0,
  program_count int not null default 0,
  board_seats int not null default 0,
  compliance_status text not null default 'pending'
    check (compliance_status in ('pending', 'compliant', 'warning', 'non_compliant')),
  reporting_cycle text not null default 'quarterly'
    check (reporting_cycle in ('monthly', 'quarterly', 'biannual', 'annual')),
  plan_id text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ngo_profiles_owner on public.ngo_profiles (owner_user_id);
create index if not exists idx_ngo_profiles_verification on public.ngo_profiles (verification_status);
create index if not exists idx_ngo_profiles_org_type on public.ngo_profiles (org_type);
create index if not exists idx_ngo_profiles_compliance on public.ngo_profiles (compliance_status);


-- 8. ngo_members
create table if not exists public.ngo_members (
  id uuid primary key default gen_random_uuid(),
  ngo_id uuid not null references public.ngo_profiles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null
    check (role in (
      'director', 'board_member', 'legal_advisor', 'program_manager',
      'volunteer_coordinator', 'admin', 'volunteer'
    )),
  permissions text[] not null default '{}',
  status text not null default 'active'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ngo_id, user_id)
);

create index if not exists idx_ngo_members_ngo on public.ngo_members (ngo_id);
create index if not exists idx_ngo_members_user on public.ngo_members (user_id);
create index if not exists idx_ngo_members_role on public.ngo_members (role);
create index if not exists idx_ngo_members_status on public.ngo_members (status);


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 2: ENABLE RLS ON ALL TABLES                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

alter table public.firm_profiles enable row level security;
alter table public.firm_members enable row level security;
alter table public.business_profiles enable row level security;
alter table public.business_members enable row level security;
alter table public.government_profiles enable row level security;
alter table public.government_members enable row level security;
alter table public.ngo_profiles enable row level security;
alter table public.ngo_members enable row level security;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 3: DROP OLD POLICIES (clean slate — safe if they don't exist)      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- firm_profiles
drop policy if exists "firm_profiles: owner can read own firm" on public.firm_profiles;
drop policy if exists "firm_profiles: members can read their firm" on public.firm_profiles;
drop policy if exists "firm_profiles: owner can insert" on public.firm_profiles;
drop policy if exists "firm_profiles: owner can update" on public.firm_profiles;
drop policy if exists "firm_profiles: admin full read" on public.firm_profiles;
drop policy if exists "admins read firm profiles" on public.firm_profiles;

-- firm_members
drop policy if exists "firm_members: member can read own membership" on public.firm_members;
drop policy if exists "firm_members: firm owner can read all members" on public.firm_members;
drop policy if exists "firm_members: active members can read co-members" on public.firm_members;
drop policy if exists "firm_members: firm owner can insert" on public.firm_members;
drop policy if exists "firm_members: firm owner can update" on public.firm_members;
drop policy if exists "firm_members: admin full read" on public.firm_members;
drop policy if exists "admins read firm members" on public.firm_members;

-- business_profiles
drop policy if exists "business_profiles: owner can read own" on public.business_profiles;
drop policy if exists "business_profiles: members can read their org" on public.business_profiles;
drop policy if exists "business_profiles: owner can insert" on public.business_profiles;
drop policy if exists "business_profiles: owner can update" on public.business_profiles;
drop policy if exists "business_profiles: admin full read" on public.business_profiles;
drop policy if exists "admins read business profiles" on public.business_profiles;

-- business_members
drop policy if exists "business_members: member can read own membership" on public.business_members;
drop policy if exists "business_members: org owner can read all members" on public.business_members;
drop policy if exists "business_members: active members can read co-members" on public.business_members;
drop policy if exists "business_members: org owner can insert" on public.business_members;
drop policy if exists "business_members: org owner can update" on public.business_members;
drop policy if exists "business_members: admin full read" on public.business_members;
drop policy if exists "admins read business members" on public.business_members;

-- government_profiles
drop policy if exists "government_profiles: owner can read own" on public.government_profiles;
drop policy if exists "government_profiles: members can read their entity" on public.government_profiles;
drop policy if exists "government_profiles: owner can insert" on public.government_profiles;
drop policy if exists "government_profiles: owner can update" on public.government_profiles;
drop policy if exists "government_profiles: admin full read" on public.government_profiles;
drop policy if exists "admins read government profiles" on public.government_profiles;

-- government_members
drop policy if exists "government_members: member can read own membership" on public.government_members;
drop policy if exists "government_members: entity owner can read all" on public.government_members;
drop policy if exists "government_members: active members can read co-members" on public.government_members;
drop policy if exists "government_members: entity owner can insert" on public.government_members;
drop policy if exists "government_members: entity owner can update" on public.government_members;
drop policy if exists "government_members: admin full read" on public.government_members;
drop policy if exists "admins read government members" on public.government_members;

-- ngo_profiles
drop policy if exists "ngo_profiles: owner can read own" on public.ngo_profiles;
drop policy if exists "ngo_profiles: members can read their org" on public.ngo_profiles;
drop policy if exists "ngo_profiles: owner can insert" on public.ngo_profiles;
drop policy if exists "ngo_profiles: owner can update" on public.ngo_profiles;
drop policy if exists "ngo_profiles: admin full read" on public.ngo_profiles;
drop policy if exists "admins read ngo profiles" on public.ngo_profiles;

-- ngo_members
drop policy if exists "ngo_members: member can read own membership" on public.ngo_members;
drop policy if exists "ngo_members: org owner can read all" on public.ngo_members;
drop policy if exists "ngo_members: active members can read co-members" on public.ngo_members;
drop policy if exists "ngo_members: org owner can insert" on public.ngo_members;
drop policy if exists "ngo_members: org owner can update" on public.ngo_members;
drop policy if exists "ngo_members: admin full read" on public.ngo_members;
drop policy if exists "admins read ngo members" on public.ngo_members;


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 4: CREATE ALL POLICIES (all tables now exist)                      ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ── firm_profiles policies ──────────────────────────────────────────────────
create policy "firm_profiles: owner can read own firm"
  on public.firm_profiles for select
  using (owner_user_id = auth.uid());

create policy "firm_profiles: members can read their firm"
  on public.firm_profiles for select
  using (
    exists (
      select 1 from public.firm_members fm
      where fm.firm_id = firm_profiles.id
        and fm.user_id = auth.uid()
        and fm.status = 'active'
    )
  );

create policy "firm_profiles: owner can insert"
  on public.firm_profiles for insert
  with check (owner_user_id = auth.uid());

create policy "firm_profiles: owner can update"
  on public.firm_profiles for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "admins read firm profiles"
  on public.firm_profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── firm_members policies ───────────────────────────────────────────────────
create policy "firm_members: member can read own membership"
  on public.firm_members for select
  using (user_id = auth.uid());

create policy "firm_members: firm owner can read all members"
  on public.firm_members for select
  using (
    exists (
      select 1 from public.firm_profiles fp
      where fp.id = firm_members.firm_id
        and fp.owner_user_id = auth.uid()
    )
  );

create policy "firm_members: active members can read co-members"
  on public.firm_members for select
  using (
    exists (
      select 1 from public.firm_members self
      where self.firm_id = firm_members.firm_id
        and self.user_id = auth.uid()
        and self.status = 'active'
    )
  );

create policy "firm_members: firm owner can insert"
  on public.firm_members for insert
  with check (
    exists (
      select 1 from public.firm_profiles fp
      where fp.id = firm_members.firm_id
        and fp.owner_user_id = auth.uid()
    )
  );

create policy "firm_members: firm owner can update"
  on public.firm_members for update
  using (
    exists (
      select 1 from public.firm_profiles fp
      where fp.id = firm_members.firm_id
        and fp.owner_user_id = auth.uid()
    )
  );

create policy "admins read firm members"
  on public.firm_members for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── business_profiles policies ──────────────────────────────────────────────
create policy "business_profiles: owner can read own"
  on public.business_profiles for select
  using (owner_user_id = auth.uid());

create policy "business_profiles: members can read their org"
  on public.business_profiles for select
  using (
    exists (
      select 1 from public.business_members bm
      where bm.business_id = business_profiles.id
        and bm.user_id = auth.uid()
        and bm.status = 'active'
    )
  );

create policy "business_profiles: owner can insert"
  on public.business_profiles for insert
  with check (owner_user_id = auth.uid());

create policy "business_profiles: owner can update"
  on public.business_profiles for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "admins read business profiles"
  on public.business_profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── business_members policies ───────────────────────────────────────────────
create policy "business_members: member can read own membership"
  on public.business_members for select
  using (user_id = auth.uid());

create policy "business_members: org owner can read all members"
  on public.business_members for select
  using (
    exists (
      select 1 from public.business_profiles bp
      where bp.id = business_members.business_id
        and bp.owner_user_id = auth.uid()
    )
  );

create policy "business_members: active members can read co-members"
  on public.business_members for select
  using (
    exists (
      select 1 from public.business_members self
      where self.business_id = business_members.business_id
        and self.user_id = auth.uid()
        and self.status = 'active'
    )
  );

create policy "business_members: org owner can insert"
  on public.business_members for insert
  with check (
    exists (
      select 1 from public.business_profiles bp
      where bp.id = business_members.business_id
        and bp.owner_user_id = auth.uid()
    )
  );

create policy "business_members: org owner can update"
  on public.business_members for update
  using (
    exists (
      select 1 from public.business_profiles bp
      where bp.id = business_members.business_id
        and bp.owner_user_id = auth.uid()
    )
  );

create policy "admins read business members"
  on public.business_members for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── government_profiles policies ────────────────────────────────────────────
create policy "government_profiles: owner can read own"
  on public.government_profiles for select
  using (owner_user_id = auth.uid());

create policy "government_profiles: members can read their entity"
  on public.government_profiles for select
  using (
    exists (
      select 1 from public.government_members gm
      where gm.gov_id = government_profiles.id
        and gm.user_id = auth.uid()
        and gm.status = 'active'
    )
  );

create policy "government_profiles: owner can insert"
  on public.government_profiles for insert
  with check (owner_user_id = auth.uid());

create policy "government_profiles: owner can update"
  on public.government_profiles for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "admins read government profiles"
  on public.government_profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── government_members policies ─────────────────────────────────────────────
create policy "government_members: member can read own membership"
  on public.government_members for select
  using (user_id = auth.uid());

create policy "government_members: entity owner can read all"
  on public.government_members for select
  using (
    exists (
      select 1 from public.government_profiles gp
      where gp.id = government_members.gov_id
        and gp.owner_user_id = auth.uid()
    )
  );

create policy "government_members: active members can read co-members"
  on public.government_members for select
  using (
    exists (
      select 1 from public.government_members self
      where self.gov_id = government_members.gov_id
        and self.user_id = auth.uid()
        and self.status = 'active'
    )
  );

create policy "government_members: entity owner can insert"
  on public.government_members for insert
  with check (
    exists (
      select 1 from public.government_profiles gp
      where gp.id = government_members.gov_id
        and gp.owner_user_id = auth.uid()
    )
  );

create policy "government_members: entity owner can update"
  on public.government_members for update
  using (
    exists (
      select 1 from public.government_profiles gp
      where gp.id = government_members.gov_id
        and gp.owner_user_id = auth.uid()
    )
  );

create policy "admins read government members"
  on public.government_members for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── ngo_profiles policies ───────────────────────────────────────────────────
create policy "ngo_profiles: owner can read own"
  on public.ngo_profiles for select
  using (owner_user_id = auth.uid());

create policy "ngo_profiles: members can read their org"
  on public.ngo_profiles for select
  using (
    exists (
      select 1 from public.ngo_members nm
      where nm.ngo_id = ngo_profiles.id
        and nm.user_id = auth.uid()
        and nm.status = 'active'
    )
  );

create policy "ngo_profiles: owner can insert"
  on public.ngo_profiles for insert
  with check (owner_user_id = auth.uid());

create policy "ngo_profiles: owner can update"
  on public.ngo_profiles for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "admins read ngo profiles"
  on public.ngo_profiles for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ── ngo_members policies ────────────────────────────────────────────────────
create policy "ngo_members: member can read own membership"
  on public.ngo_members for select
  using (user_id = auth.uid());

create policy "ngo_members: org owner can read all"
  on public.ngo_members for select
  using (
    exists (
      select 1 from public.ngo_profiles np
      where np.id = ngo_members.ngo_id
        and np.owner_user_id = auth.uid()
    )
  );

create policy "ngo_members: active members can read co-members"
  on public.ngo_members for select
  using (
    exists (
      select 1 from public.ngo_members self
      where self.ngo_id = ngo_members.ngo_id
        and self.user_id = auth.uid()
        and self.status = 'active'
    )
  );

create policy "ngo_members: org owner can insert"
  on public.ngo_members for insert
  with check (
    exists (
      select 1 from public.ngo_profiles np
      where np.id = ngo_members.ngo_id
        and np.owner_user_id = auth.uid()
    )
  );

create policy "ngo_members: org owner can update"
  on public.ngo_members for update
  using (
    exists (
      select 1 from public.ngo_profiles np
      where np.id = ngo_members.ngo_id
        and np.owner_user_id = auth.uid()
    )
  );

create policy "admins read ngo members"
  on public.ngo_members for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 5: CREATE ALL TRIGGERS                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

drop trigger if exists trg_firm_profiles_updated_at on public.firm_profiles;
create trigger trg_firm_profiles_updated_at
  before update on public.firm_profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_firm_members_updated_at on public.firm_members;
create trigger trg_firm_members_updated_at
  before update on public.firm_members
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_business_profiles_updated_at on public.business_profiles;
create trigger trg_business_profiles_updated_at
  before update on public.business_profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_business_members_updated_at on public.business_members;
create trigger trg_business_members_updated_at
  before update on public.business_members
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_government_profiles_updated_at on public.government_profiles;
create trigger trg_government_profiles_updated_at
  before update on public.government_profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_government_members_updated_at on public.government_members;
create trigger trg_government_members_updated_at
  before update on public.government_members
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_ngo_profiles_updated_at on public.ngo_profiles;
create trigger trg_ngo_profiles_updated_at
  before update on public.ngo_profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_ngo_members_updated_at on public.ngo_members;
create trigger trg_ngo_members_updated_at
  before update on public.ngo_members
  for each row execute function public.handle_updated_at();


-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  PART 6: EXTRA RLS FIXES (attachments, audit, notifications)             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Attachments: owner-based access
drop policy if exists "users read own attachments" on public.attachments;
create policy "users read own attachments"
  on public.attachments for select using (owner_user_id = auth.uid());

drop policy if exists "users insert own attachments" on public.attachments;
create policy "users insert own attachments"
  on public.attachments for insert with check (owner_user_id = auth.uid());

-- Admin audit events: user read own actions
drop policy if exists "users read own audit events" on public.admin_audit_events;
create policy "users read own audit events"
  on public.admin_audit_events for select using (actor_id = auth.uid());

-- Notifications: user read/update own
drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select using (user_id = auth.uid());

drop policy if exists "users update own notifications" on public.notifications;
create policy "users update own notifications"
  on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- Done! All 8 entity tables created, RLS enabled, policies applied, triggers set.
-- =============================================================================
