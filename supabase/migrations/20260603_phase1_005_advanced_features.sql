-- Phase 1 Migration 005: Marketplace, Audit, Jurisdictions, Feature Flags, Secondment, Reviews
-- Dependencies: 001_profiles, 002_entities, 003_subscriptions_billing, 004_community_features
-- Run after: 20260603_phase1_004_community_features.sql

-- ============================================================
-- 1. MARKETPLACE LISTINGS
-- ============================================================
create table if not exists public.marketplace_listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  owner_type text not null check (owner_type in ('lawyer', 'firm', 'corporate')),
  title text not null,
  description text not null default '',
  category text not null,
  specialty text[] not null default '{}',
  listing_type text not null check (listing_type in ('need', 'offer', 'collaboration')),
  budget_min numeric(12,2),
  budget_max numeric(12,2),
  currency text not null default 'SAR',
  deadline timestamptz,
  status text not null default 'active' check (status in ('draft', 'active', 'matched', 'completed', 'cancelled', 'expired')),
  visibility text not null default 'public' check (visibility in ('public', 'verified_only', 'invited_only')),
  views_count int not null default 0,
  offers_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. MARKETPLACE OFFERS
-- ============================================================
create table if not exists public.marketplace_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  offeror_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null,
  currency text not null default 'SAR',
  message text not null default '',
  estimated_days int,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired')),
  commission_pct numeric(5,2) not null default 15.00,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. MARKETPLACE WORKSPACES
-- ============================================================
create table if not exists public.marketplace_workspaces (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.marketplace_listings(id) on delete cascade,
  offer_id uuid not null references public.marketplace_offers(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  escrow_id uuid references public.escrow_transactions(id) on delete set null,
  chat_room_id uuid references public.chat_rooms(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'completed', 'disputed', 'cancelled')),
  deliverables jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. CASE COLLABORATORS
-- ============================================================
create table if not exists public.case_collaborators (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'collaborator' check (role in ('lead', 'collaborator', 'consultant', 'observer')),
  permissions text[] not null default '{"read"}'::text[],
  fee_split_pct numeric(5,2),
  status text not null default 'active' check (status in ('invited', 'active', 'removed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(case_id, user_id)
);

-- ============================================================
-- 5. CASE SHARE TOKENS
-- ============================================================
create table if not exists public.case_share_tokens (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  scope text not null default 'read_only' check (scope in ('read_only', 'read_write', 'full')),
  theme text,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  max_uses int,
  use_count int not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6. SECONDMENT CONTRACTS
-- ============================================================
create table if not exists public.secondment_contracts (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.profiles(id) on delete cascade,
  entity_id uuid not null,
  entity_type text not null check (entity_type in ('business', 'firm', 'government', 'ngo')),
  monthly_hours int not null default 40,
  hourly_rate numeric(12,2) not null,
  currency text not null default 'SAR',
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('draft', 'active', 'completed', 'terminated')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 7. SECONDMENT TIME ENTRIES
-- ============================================================
create table if not exists public.secondment_time_entries (
  id bigserial primary key,
  contract_id uuid not null references public.secondment_contracts(id) on delete cascade,
  date date not null,
  hours numeric(5,2) not null,
  description text not null default '',
  approved boolean not null default false,
  approved_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 8. REFERRALS
-- ============================================================
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid references public.profiles(id) on delete set null,
  referee_email text,
  referee_phone text,
  request_id text references public.service_requests(id) on delete set null,
  commission_pct numeric(5,2),
  commission_amount numeric(12,2),
  status text not null default 'pending' check (status in ('pending', 'contacted', 'converted', 'expired', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 9. ADMIN AUDIT EVENTS
-- ============================================================
create table if not exists public.admin_audit_events (
  id bigserial primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'admin', 'system', 'n8n', 'api')),
  action text not null,
  target_type text not null,
  target_id text,
  before_state jsonb,
  after_state jsonb,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 10. LOGIN ATTEMPTS
-- ============================================================
create table if not exists public.login_attempts (
  id bigserial primary key,
  email text,
  phone text,
  ip_address inet not null,
  user_agent text,
  success boolean not null default false,
  failure_reason text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 11. FEATURE FLAGS
-- ============================================================
create table if not exists public.feature_flags (
  id text primary key,
  category text not null check (category in ('AI', 'Marketplace', 'Beta', 'Core', 'Billing', 'Content', 'Security')),
  label_ar text not null,
  label_en text not null default '',
  enabled_production boolean not null default false,
  enabled_staging boolean not null default true,
  enabled_beta boolean not null default true,
  eligible_user_types text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 12. JURISDICTIONS
-- ============================================================
create table if not exists public.jurisdictions (
  id text primary key,
  name_ar text not null,
  name_en text not null,
  flag_emoji text not null default '',
  legal_system text not null check (legal_system in ('civil', 'common', 'islamic', 'mixed', 'hybrid')),
  phase int not null default 1 check (phase in (1, 2, 3)),
  readiness text not null default 'live_research' check (readiness in ('live_research', 'partial_db', 'full_presence')),
  currency text not null default 'SAR',
  timezone text not null default 'Asia/Riyadh',
  disclaimer_ar text not null default '',
  disclaimer_en text not null default '',
  trusted_sources jsonb not null default '[]'::jsonb,
  sub_jurisdictions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 13. REVIEWS
-- ============================================================
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  reviewee_id uuid not null references public.profiles(id) on delete cascade,
  request_id text references public.service_requests(id) on delete set null,
  rating int not null check (rating >= 1 and rating <= 5),
  title text not null default '',
  body text not null default '',
  is_anonymous boolean not null default false,
  status text not null default 'active' check (status in ('pending', 'active', 'moderated', 'deleted')),
  response text,
  response_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================
alter table public.marketplace_listings enable row level security;
alter table public.marketplace_offers enable row level security;
alter table public.marketplace_workspaces enable row level security;
alter table public.case_collaborators enable row level security;
alter table public.case_share_tokens enable row level security;
alter table public.secondment_contracts enable row level security;
alter table public.secondment_time_entries enable row level security;
alter table public.referrals enable row level security;
alter table public.admin_audit_events enable row level security;
alter table public.login_attempts enable row level security;
alter table public.feature_flags enable row level security;
alter table public.jurisdictions enable row level security;
alter table public.reviews enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- marketplace_listings: public reads active, owners manage
create policy "anyone reads active marketplace listings"
  on public.marketplace_listings for select
  using (status in ('active', 'matched'));

create policy "owners create marketplace listings"
  on public.marketplace_listings for insert
  with check (owner_id = auth.uid());

create policy "owners update own marketplace listings"
  on public.marketplace_listings for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- marketplace_offers: listing owner + offeror can read
create policy "participants read marketplace offers"
  on public.marketplace_offers for select
  using (
    offeror_id = auth.uid() or
    exists (
      select 1 from public.marketplace_listings ml
      where ml.id = marketplace_offers.listing_id
      and ml.owner_id = auth.uid()
    )
  );

create policy "users create marketplace offers"
  on public.marketplace_offers for insert
  with check (offeror_id = auth.uid());

create policy "participants update marketplace offers"
  on public.marketplace_offers for update
  using (
    offeror_id = auth.uid() or
    exists (
      select 1 from public.marketplace_listings ml
      where ml.id = marketplace_offers.listing_id
      and ml.owner_id = auth.uid()
    )
  );

-- marketplace_workspaces: buyer and seller can read
create policy "participants read marketplace workspaces"
  on public.marketplace_workspaces for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- case_collaborators: case participants
create policy "case participants read collaborators"
  on public.case_collaborators for select
  using (
    user_id = auth.uid() or
    exists (
      select 1 from public.cases c
      where c.id = case_collaborators.case_id
      and (c.client_user_id = auth.uid() or c.assigned_user_id = auth.uid())
    )
  );

create policy "case owners create collaborators"
  on public.case_collaborators for insert
  with check (
    exists (
      select 1 from public.cases c
      where c.id = case_collaborators.case_id
      and c.assigned_user_id = auth.uid()
    )
  );

-- case_share_tokens: case owners
create policy "case owners manage share tokens"
  on public.case_share_tokens for select
  using (created_by = auth.uid());

create policy "case owners create share tokens"
  on public.case_share_tokens for insert
  with check (created_by = auth.uid());

-- secondment_contracts: lawyer and entity members
create policy "lawyers read own secondments"
  on public.secondment_contracts for select
  using (lawyer_id = auth.uid());

create policy "lawyers create secondments"
  on public.secondment_contracts for insert
  with check (lawyer_id = auth.uid());

-- secondment_time_entries: contract participants
create policy "contract participants read time entries"
  on public.secondment_time_entries for select
  using (
    exists (
      select 1 from public.secondment_contracts sc
      where sc.id = secondment_time_entries.contract_id
      and sc.lawyer_id = auth.uid()
    )
  );

create policy "lawyers create time entries"
  on public.secondment_time_entries for insert
  with check (
    exists (
      select 1 from public.secondment_contracts sc
      where sc.id = secondment_time_entries.contract_id
      and sc.lawyer_id = auth.uid()
    )
  );

-- referrals: referrer reads own
create policy "referrers read own referrals"
  on public.referrals for select
  using (referrer_id = auth.uid() or referee_id = auth.uid());

create policy "users create referrals"
  on public.referrals for insert
  with check (referrer_id = auth.uid());

-- admin_audit_events: only service role (no user access)
-- No select policy = blocked by default for users

-- login_attempts: only service role
-- No select policy = blocked by default for users

-- feature_flags: publicly readable
create policy "anyone reads feature flags"
  on public.feature_flags for select
  using (true);

-- jurisdictions: publicly readable
create policy "anyone reads jurisdictions"
  on public.jurisdictions for select
  using (active = true);

-- reviews: public reads active, users manage own
create policy "anyone reads active reviews"
  on public.reviews for select
  using (status = 'active');

create policy "reviewers create reviews"
  on public.reviews for insert
  with check (reviewer_id = auth.uid());

create policy "reviewers update own reviews"
  on public.reviews for update
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid());

create policy "reviewees respond to reviews"
  on public.reviews for update
  using (reviewee_id = auth.uid())
  with check (reviewee_id = auth.uid());

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_marketplace_listings_owner on public.marketplace_listings(owner_id);
create index if not exists idx_marketplace_listings_status on public.marketplace_listings(status);
create index if not exists idx_marketplace_listings_category on public.marketplace_listings(category);
create index if not exists idx_marketplace_listings_type on public.marketplace_listings(listing_type);
create index if not exists idx_marketplace_offers_listing on public.marketplace_offers(listing_id);
create index if not exists idx_marketplace_offers_offeror on public.marketplace_offers(offeror_id);
create index if not exists idx_marketplace_offers_status on public.marketplace_offers(status);
create index if not exists idx_marketplace_workspaces_buyer on public.marketplace_workspaces(buyer_id);
create index if not exists idx_marketplace_workspaces_seller on public.marketplace_workspaces(seller_id);
create index if not exists idx_case_collaborators_case on public.case_collaborators(case_id);
create index if not exists idx_case_collaborators_user on public.case_collaborators(user_id);
create index if not exists idx_case_share_tokens_case on public.case_share_tokens(case_id);
create index if not exists idx_case_share_tokens_token on public.case_share_tokens(token);
create index if not exists idx_secondment_contracts_lawyer on public.secondment_contracts(lawyer_id);
create index if not exists idx_secondment_contracts_entity on public.secondment_contracts(entity_id, entity_type);
create index if not exists idx_secondment_time_entries_contract on public.secondment_time_entries(contract_id);
create index if not exists idx_referrals_referrer on public.referrals(referrer_id);
create index if not exists idx_referrals_referee on public.referrals(referee_id);
create index if not exists idx_referrals_status on public.referrals(status);
create index if not exists idx_admin_audit_events_actor on public.admin_audit_events(actor_id);
create index if not exists idx_admin_audit_events_target on public.admin_audit_events(target_type, target_id);
create index if not exists idx_admin_audit_events_created on public.admin_audit_events(created_at);
create index if not exists idx_login_attempts_email on public.login_attempts(email);
create index if not exists idx_login_attempts_ip on public.login_attempts(ip_address);
create index if not exists idx_login_attempts_created on public.login_attempts(created_at);
create index if not exists idx_reviews_reviewer on public.reviews(reviewer_id);
create index if not exists idx_reviews_reviewee on public.reviews(reviewee_id);
create index if not exists idx_reviews_request on public.reviews(request_id);
create index if not exists idx_reviews_status on public.reviews(status);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create trigger set_updated_at_marketplace_listings before update on public.marketplace_listings
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_marketplace_offers before update on public.marketplace_offers
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_marketplace_workspaces before update on public.marketplace_workspaces
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_case_collaborators before update on public.case_collaborators
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_secondment_contracts before update on public.secondment_contracts
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_referrals before update on public.referrals
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_feature_flags before update on public.feature_flags
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_jurisdictions before update on public.jurisdictions
  for each row execute function public.handle_updated_at();
create trigger set_updated_at_reviews before update on public.reviews
  for each row execute function public.handle_updated_at();

-- ============================================================
-- SEED DATA: Jurisdictions (International Expansion Plan)
-- ============================================================
insert into public.jurisdictions (id, name_ar, name_en, flag_emoji, legal_system, phase, readiness, currency, timezone)
values
  ('SA', 'المملكة العربية السعودية', 'Saudi Arabia', '🇸🇦', 'islamic', 1, 'full_presence', 'SAR', 'Asia/Riyadh'),
  ('AE', 'الإمارات العربية المتحدة', 'United Arab Emirates', '🇦🇪', 'mixed', 1, 'live_research', 'AED', 'Asia/Dubai'),
  ('BH', 'مملكة البحرين', 'Bahrain', '🇧🇭', 'mixed', 1, 'live_research', 'BHD', 'Asia/Bahrain'),
  ('OM', 'سلطنة عمان', 'Oman', '🇴🇲', 'mixed', 1, 'live_research', 'OMR', 'Asia/Muscat'),
  ('KW', 'دولة الكويت', 'Kuwait', '🇰🇼', 'mixed', 1, 'live_research', 'KWD', 'Asia/Kuwait'),
  ('QA', 'دولة قطر', 'Qatar', '🇶🇦', 'mixed', 1, 'live_research', 'QAR', 'Asia/Qatar'),
  ('EG', 'جمهورية مصر العربية', 'Egypt', '🇪🇬', 'civil', 2, 'live_research', 'EGP', 'Africa/Cairo'),
  ('JO', 'المملكة الأردنية الهاشمية', 'Jordan', '🇯🇴', 'civil', 2, 'live_research', 'JOD', 'Asia/Amman'),
  ('MA', 'المملكة المغربية', 'Morocco', '🇲🇦', 'civil', 2, 'live_research', 'MAD', 'Africa/Casablanca')
on conflict (id) do update set
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  flag_emoji = excluded.flag_emoji,
  legal_system = excluded.legal_system,
  phase = excluded.phase,
  readiness = excluded.readiness,
  currency = excluded.currency,
  timezone = excluded.timezone,
  updated_at = now();
