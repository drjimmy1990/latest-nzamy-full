-- Client workflow backend-ready schema for Nzamy.
-- Run after Supabase Auth is enabled. RLS policies assume authenticated users.

create table if not exists public.service_requests (
  id text primary key,
  requester_user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('service', 'consultation', 'business_case', 'ngo_volunteer', 'ai_draft')),
  title text not null,
  description text not null default '',
  requester jsonb not null default '{}'::jsonb,
  receiver text not null check (receiver in ('lawyer', 'firm', 'provider', 'business_legal', 'ngo_admin', 'government_reviewer', 'ai_workspace')),
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null check (status in ('draft', 'pending_payment', 'pending_assignment', 'assigned', 'in_review', 'completed', 'cancelled')),
  payment jsonb not null default '{"amount":0,"status":"not_required"}'::jsonb,
  source_path text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_events (
    id bigserial primary key,
    request_id text not null references public.service_requests (id) on delete cascade,
    event text not null,
    actor_user_id uuid references auth.users (id) on delete set null,
    actor_name text not null default 'system',
    created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id text primary key,
  request_id text not null references public.service_requests(id) on delete cascade,
  provider text not null default 'stub',
  amount numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  status text not null check (status in ('not_required', 'requires_payment', 'paid', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attachments (
    id bigserial primary key,
    request_id text not null references public.service_requests (id) on delete cascade,
    owner_user_id uuid references auth.users (id) on delete cascade,
    file_name text not null,
    storage_path text not null,
    mime_type text,
    size_bytes bigint,
    created_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id text primary key,
  request_id text not null unique references public.service_requests(id) on delete cascade,
  requester_user_id uuid references auth.users(id) on delete set null,
  lawyer_user_id uuid references auth.users(id) on delete set null,
  mode text not null check (mode in ('ai', 'video', 'voice', 'text', 'in-person')),
  specialty text,
  scheduled_at timestamptz,
  status text not null default 'pending_assignment',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id text primary key,
  request_id text unique references public.service_requests(id) on delete set null,
  client_user_id uuid references auth.users(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null default 'open',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contracts (
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

create table if not exists public.messages (
    id bigserial primary key,
    request_id text not null references public.service_requests (id) on delete cascade,
    sender_user_id uuid references auth.users (id) on delete set null,
    receiver_user_id uuid references auth.users (id) on delete set null,
    body text not null default '',
    attachment_id bigint references public.attachments (id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.admin_pricing_catalog (
  service_id text primary key,
  audience text not null default 'individual',
  category_id text not null,
  label_ar text not null,
  base_price numeric(12,2) not null default 0,
  price_mode text not null,
  receiver_type text not null,
  beta_visibility text not null default 'public',
  requires_payment boolean not null default true,
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
    id bigserial primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    request_id text references public.service_requests (id) on delete set null,
    amount numeric(12, 2) not null,
    kind text not null check (
        kind in (
            'credit',
            'debit',
            'pending',
            'reversal'
        )
    ),
    description text not null,
    created_at timestamptz not null default now()
);

create table if not exists public.notifications (
    id bigserial primary key,
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null,
    body text not null default '',
    href text,
    read_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.service_requests enable row level security;

alter table public.request_events enable row level security;

alter table public.payments enable row level security;

alter table public.attachments enable row level security;

alter table public.consultations enable row level security;

alter table public.cases enable row level security;

alter table public.contracts enable row level security;

alter table public.messages enable row level security;

alter table public.admin_pricing_catalog enable row level security;

alter table public.wallet_transactions enable row level security;

alter table public.notifications enable row level security;

create policy "clients read their own service requests" on public.service_requests for
select using (
        requester_user_id = auth.uid ()
        or assigned_to = auth.uid ()
    );

create policy "clients create their own service requests" on public.service_requests for
insert
with
    check (
        requester_user_id = auth.uid ()
    );

create policy "participants update service requests" on public.service_requests for
update using (
    requester_user_id = auth.uid ()
    or assigned_to = auth.uid ()
)
with
    check (
        requester_user_id = auth.uid ()
        or assigned_to = auth.uid ()
    );

create policy "participants read request events" on public.request_events for
select using (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = request_events.request_id
                and (
                    sr.requester_user_id = auth.uid ()
                    or sr.assigned_to = auth.uid ()
                )
        )
    );

create policy "participants create request events" on public.request_events for
insert
with
    check (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = request_events.request_id
                and (
                    sr.requester_user_id = auth.uid ()
                    or sr.assigned_to = auth.uid ()
                )
        )
    );

create policy "participants read payments" on public.payments for
select using (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = payments.request_id
                and (
                    sr.requester_user_id = auth.uid ()
                    or sr.assigned_to = auth.uid ()
                )
        )
    );

create policy "participants read attachments" on public.attachments for
select using (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = attachments.request_id
                and (
                    sr.requester_user_id = auth.uid ()
                    or sr.assigned_to = auth.uid ()
                )
        )
    );

create policy "participants create attachments" on public.attachments for
insert
with
    check (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = attachments.request_id
                and sr.requester_user_id = auth.uid ()
        )
    );

create policy "participants read consultations" on public.consultations for
select using (
        requester_user_id = auth.uid ()
        or lawyer_user_id = auth.uid ()
    );

create policy "participants read cases" on public.cases for
select using (
        client_user_id = auth.uid ()
        or assigned_user_id = auth.uid ()
    );

create policy "participants read contracts" on public.contracts for
select using (
        client_user_id = auth.uid ()
        or assigned_user_id = auth.uid ()
    );

create policy "participants read messages" on public.messages for
select using (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = messages.request_id
                and (
                    sr.requester_user_id = auth.uid ()
                    or sr.assigned_to = auth.uid ()
                )
        )
    );

create policy "participants create messages" on public.messages for
insert
with
    check (
        exists (
            select 1
            from public.service_requests sr
            where
                sr.id = messages.request_id
                and (
                    sr.requester_user_id = auth.uid ()
                    or sr.assigned_to = auth.uid ()
                )
        )
    );

create policy "users read own wallet transactions" on public.wallet_transactions for
select using (user_id = auth.uid ());

create policy "users read own notifications" on public.notifications for
select using (user_id = auth.uid ());

create policy "public read enabled individual pricing" on public.admin_pricing_catalog for
select using (
        enabled = true
        and audience = 'individual'
    );

insert into public.admin_pricing_catalog
  (service_id, audience, category_id, label_ar, base_price, price_mode, receiver_type, beta_visibility, requires_payment, enabled, metadata)
values
  ('ai-consult', 'individual', 'consultation', 'سؤال AI فوري', 49, 'free', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/consult","icon":"Robot","requestType":"consultation","priceNote":"لك سؤال واحد مجانا يوميا أو 49 ر.س إضافي","includedByPlan":"free_daily","aiPowered":true}'::jsonb),
  ('video-short', 'individual', 'consultation', 'استشارة مرئية مختصرة (30 دقيقة)', 500, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=video-short","icon":"VideoCamera","requestType":"consultation","priceNote":"مرئية أونلاين - 30 دقيقة","humanService":true}'::jsonb),
  ('video-full', 'individual', 'consultation', 'استشارة مرئية كاملة (60 دقيقة)', 500, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=video-full","icon":"VideoCamera","requestType":"consultation","priceNote":"مرئية أونلاين - 60 دقيقة","tag":"الأشمل","humanService":true}'::jsonb),
  ('in-person', 'individual', 'consultation', 'استشارة حضورية (60 دقيقة)', 700, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=in-person","icon":"Users","requestType":"consultation","priceNote":"حضوري في مكتب المحامي","humanService":true}'::jsonb),
  ('written-opinion', 'individual', 'consultation', 'رأي قانوني مكتوب', 250, 'fixed', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/consultation/new?type=written-opinion","icon":"FileText","requestType":"consultation","priceNote":"يسلم خلال 2-3 أيام عمل","humanService":true}'::jsonb),
  ('contract-draft', 'individual', 'contracts', 'صياغة عقد مخصص', 99, 'included', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/contract-drafter","icon":"PencilSimple","requestType":"ai_draft","priceNote":"أو ابتداء من 99 ر.س للطلب","includedByPlan":"ai_individual","tag":"الأكثر طلبا","aiPowered":true}'::jsonb),
  ('contract-analyze', 'individual', 'contracts', 'تحليل عقد وكشف المخاطر', 79, 'included', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/analyze?mode=doc","icon":"Scan","requestType":"ai_draft","priceNote":"أو 79 ر.س للتحليل المفصل","includedByPlan":"ai_individual","aiPowered":true}'::jsonb),
  ('contract-review', 'individual', 'contracts', 'مراجعة من محام متخصص', 800, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=contract-review","icon":"MagnifyingGlass","requestType":"service","priceNote":"2x سعر مراجعة المحامي","humanService":true}'::jsonb),
  ('ai-case-eval', 'individual', 'case-study', 'تقييم أولي بالذكاء الاصطناعي', 79, 'free', 'ai_workspace', 'public', false, true,
    '{"route":"/ai/analyze?mode=eval","icon":"Robot","requestType":"ai_draft","priceNote":"مشمول في الباقة أو 79 ر.س","includedByPlan":"free_daily","tag":"جديد","aiPowered":true}'::jsonb),
  ('case-study', 'individual', 'case-study', 'دراسة قضية كاملة', 1600, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=case-study","icon":"Scales","requestType":"service","priceNote":"2x سعر المحامي الأساسي","tag":"موصى به","humanService":true}'::jsonb),
  ('second-opinion', 'individual', 'case-study', 'رأي ثان في قضية قائمة', 600, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=second-opinion","icon":"Users","requestType":"service","priceNote":"2x سعر الرأي القانوني المكتوب","humanService":true}'::jsonb),
  ('legal-research', 'individual', 'case-study', 'بحث قانوني متخصص', 800, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=legal-research","icon":"MagnifyingGlass","requestType":"service","priceNote":"2x سعر البحث القانوني","humanService":true}'::jsonb),
  ('file-lawsuit', 'individual', 'legal-filing', 'لائحة دعوى ابتدائية', 1600, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=file-lawsuit","icon":"Gavel","requestType":"service","priceNote":"2x سعر المحامي الأساسي","humanService":true}'::jsonb),
  ('appeal', 'individual', 'legal-filing', 'مذكرة استئناف', 2000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=appeal","icon":"Scales","requestType":"service","priceNote":"2x سعر المحامي","tag":"شائع","humanService":true}'::jsonb),
  ('cassation', 'individual', 'legal-filing', 'مذكرة نقض / التماس', 3000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=cassation","icon":"Scales","requestType":"service","priceNote":"2x سعر المحامي","humanService":true}'::jsonb),
  ('defense', 'individual', 'legal-filing', 'مذكرة رد أو دفاع', 1000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=defense","icon":"FileText","requestType":"service","priceNote":"2x سعر المحامي","humanService":true}'::jsonb),
  ('admin-objection', 'individual', 'legal-filing', 'اعتراض على قرار إداري', 800, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=admin-objection","icon":"Buildings","requestType":"service","priceNote":"حسب تعقيد الاعتراض","humanService":true}'::jsonb),
  ('mediation', 'individual', 'arbitration', 'جلسة وساطة', 800, 'starting_from', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=mediation","icon":"Users","requestType":"service","priceNote":"يشمل جلستين + وثيقة التسوية","tag":"موصى به","humanService":true}'::jsonb),
  ('full-arbitration', 'individual', 'arbitration', 'تحكيم تجاري كامل', 3000, 'custom', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=full-arbitration","icon":"Gavel","requestType":"service","priceNote":"حسب تقييم المحكم","humanService":true}'::jsonb),
  ('settlement', 'individual', 'arbitration', 'صياغة اتفاقية تسوية', 399, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=settlement","icon":"CheckCircle","requestType":"service","humanService":true}'::jsonb),
  ('ai-letter', 'individual', 'special', 'صياغة خطاب رسمي بالذكاء الاصطناعي', 49, 'free', 'ai_workspace', 'beta_hidden', false, false,
    '{"route":"/dashboard/client/letters","icon":"Envelope","requestType":"ai_draft","priceNote":"مشمول في الباقة أو 49 ر.س بالعمل القانوني","includedByPlan":"ai_individual","tag":"الأسرع","aiPowered":true}'::jsonb),
  ('legal-notice', 'individual', 'special', 'إنذار قانوني رسمي', 400, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=legal-notice","icon":"Receipt","requestType":"service","tag":"الأسرع","humanService":true}'::jsonb),
  ('power-of-attorney', 'individual', 'special', 'توثيق وكالة قانونية', 600, 'starting_from', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=power-of-attorney","icon":"Stamp","requestType":"service","humanService":true}'::jsonb),
  ('inheritance', 'individual', 'special', 'قسمة تركة وحصر الورثة', 1000, 'starting_from', 'lawyer', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=inheritance","icon":"Users","requestType":"service","humanService":true}'::jsonb),
  ('enforce-judgment', 'individual', 'special', 'متابعة تنفيذ حكم', 1200, 'starting_from', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=enforce-judgment","icon":"Gavel","requestType":"service","priceNote":"إجراء تنفيذي - يختلف عن الصياغة","humanService":true}'::jsonb),
  ('translation', 'individual', 'special', 'ترجمة قانونية معتمدة', 300, 'per_page', 'provider', 'beta_hidden', true, false,
    '{"route":"/dashboard/client/requests/new?type=translation","icon":"Translate","requestType":"service","priceNote":"يبدأ من 150 ر.س / صفحة","humanService":true}'::jsonb),
  ('general', 'individual', 'special', 'طلب عام', 500, 'starting_from', 'lawyer', 'internal', true, false,
    '{"route":"/dashboard/client/requests/new?type=general","icon":"ShieldStar","requestType":"service","humanService":true}'::jsonb)
on conflict (service_id) do update set
  audience = excluded.audience,
  category_id = excluded.category_id,
  label_ar = excluded.label_ar,
  base_price = excluded.base_price,
  price_mode = excluded.price_mode,
  receiver_type = excluded.receiver_type,
  beta_visibility = excluded.beta_visibility,
  requires_payment = excluded.requires_payment,
  enabled = excluded.enabled,
  metadata = excluded.metadata,
  updated_at = now();

-- =============================================================================
-- Phase 1 · Migration 001 — User Profile System
-- =============================================================================
-- Depends on: 20260518_client_workflow_backend_ready.sql (service_requests, etc.)
-- Creates:    profiles, lawyer_profiles, provider_profiles, micro_profiles
-- Also:       handle_updated_at() trigger fn, handle_new_user() trigger fn
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function: auto-set updated_at on every UPDATE
-- ---------------------------------------------------------------------------
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

comment on function public.handle_updated_at () is 'Sets updated_at = now() before every UPDATE. Attach to any table with an updated_at column.';

-- ---------------------------------------------------------------------------
-- 1. profiles — extended user profile linked to auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  user_type      text         not null check (user_type in (
                   'individual', 'lawyer', 'firm', 'corporate',
                   'micro', 'provider', 'government', 'ngo', 'admin'
                 )),
  display_name   text         not null default '',
  display_name_en text        not null default '',
  email          text,
  phone          text,
  avatar_url     text,
  country_code   text         not null default 'SA',
  language       text         not null default 'ar'
                              check (language in ('ar', 'en')),
  calendar_type  text         not null default 'hijri'
                              check (calendar_type in ('hijri', 'miladi', 'both')),
  theme          text         not null default 'light'
                              check (theme in ('light', 'dark', 'system')),
  verified_at    timestamptz,
  nafath_verified boolean     not null default false,
  onboarding_completed boolean not null default false,
  metadata       jsonb        not null default '{}'::jsonb,
  created_at     timestamptz  not null default now(),
  updated_at     timestamptz  not null default now()
);

comment on
table public.profiles is 'Extended user profile. One row per auth.users entry.';

-- Indexes
create index if not exists idx_profiles_user_type on public.profiles (user_type);

create index if not exists idx_profiles_country_code on public.profiles (country_code);

-- RLS
alter table public.profiles enable row level security;

create policy "users read own profile" on public.profiles for
select using (id = auth.uid ());

create policy "admins read all profiles" on public.profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

create policy "users update own profile" on public.profiles for
update using (id = auth.uid ())
with
    check (id = auth.uid ());

-- Trigger: updated_at
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 2. lawyer_profiles — lawyer-specific data
-- ---------------------------------------------------------------------------
create table if not exists public.lawyer_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  license_number      text,
  license_expiry      date,
  bar_association      text,
  specialties         text[]       not null default '{}',
  years_experience    int          not null default 0,
  bio_ar              text         not null default '',
  bio_en              text         not null default '',
  hourly_rate         numeric(12,2),
  credit_balance      int          not null default 0,
  credit_package      text,                          -- last purchased package ID
  credit_expiry       timestamptz,
  free_briefs_remaining int        not null default 1,  -- promotional free memos
  marketplace_visible boolean      not null default false,
  active_roles        text[]       not null default '{"lawyer"}'::text[],  -- dual-role support
  display_mode        text         not null default 'full'
                                   check (display_mode in ('full', 'light')),
  verification_status text         not null default 'pending'
                                   check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  metadata            jsonb        not null default '{}'::jsonb,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

comment on
table public.lawyer_profiles is 'Lawyer-specific profile data: credentials, credits, marketplace settings.';

-- Indexes
create index if not exists idx_lawyer_profiles_verification_status on public.lawyer_profiles (verification_status);

-- RLS
alter table public.lawyer_profiles enable row level security;

create policy "lawyers read own profile" on public.lawyer_profiles for
select using (user_id = auth.uid ());

create policy "public read verified lawyers" on public.lawyer_profiles for
select using (
        verification_status = 'verified'
        and marketplace_visible = true
    );

create policy "admins read all lawyer profiles" on public.lawyer_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

create policy "lawyers update own profile" on public.lawyer_profiles for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- Trigger: updated_at
create trigger set_lawyer_profiles_updated_at
  before update on public.lawyer_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 3. provider_profiles — service provider (notary, arbitrator, bailiff)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_profiles (
  user_id             uuid primary key references public.profiles(id) on delete cascade,
  sub_role            text         not null
                                   check (sub_role in ('notary', 'arbitrator', 'bailiff')),
  license_number      text,
  license_expiry      date,
  service_areas       text[]       not null default '{}',
  availability        jsonb        not null default
                        '{"days":["sun","mon","tue","wed","thu"],"hours":{"start":"08:00","end":"17:00"}}'::jsonb,
  hourly_rate         numeric(12,2),
  verification_status text         not null default 'pending'
                                   check (verification_status in ('pending', 'verified', 'rejected', 'suspended')),
  marketplace_visible boolean      not null default false,
  metadata            jsonb        not null default '{}'::jsonb,
  created_at          timestamptz  not null default now(),
  updated_at          timestamptz  not null default now()
);

comment on
table public.provider_profiles is 'Provider-specific profile: notaries, arbitrators, bailiffs.';

-- Indexes
create index if not exists idx_provider_profiles_sub_role on public.provider_profiles (sub_role);

-- RLS
alter table public.provider_profiles enable row level security;

create policy "providers read own profile" on public.provider_profiles for
select using (user_id = auth.uid ());

create policy "public read verified providers" on public.provider_profiles for
select using (
        verification_status = 'verified'
        and marketplace_visible = true
    );

create policy "admins read all provider profiles" on public.provider_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

create policy "providers update own profile" on public.provider_profiles for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- Trigger: updated_at
create trigger set_provider_profiles_updated_at
  before update on public.provider_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 4. micro_profiles — micro / small business
-- ---------------------------------------------------------------------------
create table if not exists public.micro_profiles (
  user_id              uuid primary key references public.profiles(id) on delete cascade,
  business_name        text         not null default '',
  business_type        text,
  employee_count       int          not null default 1,
  license_count        int          not null default 0,
  requirements_score   numeric(5,2) not null default 0,
  litigation_boundary  text         not null default 'advisory_only'
                                    check (litigation_boundary in (
                                      'advisory_only', 'marketplace_escalation', 'case_tracking'
                                    )),
  metadata             jsonb        not null default '{}'::jsonb,
  created_at           timestamptz  not null default now(),
  updated_at           timestamptz  not null default now()
);

comment on
table public.micro_profiles is 'Micro/small business profile: employee count, compliance score, litigation boundary.';

-- RLS
alter table public.micro_profiles enable row level security;

create policy "micro owners read own profile" on public.micro_profiles for
select using (user_id = auth.uid ());

create policy "admins read all micro profiles" on public.micro_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

create policy "micro owners update own profile" on public.micro_profiles for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- Trigger: updated_at
create trigger set_micro_profiles_updated_at
  before update on public.micro_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Auto-create profile on auth.users insert
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_type text;
begin
  -- Extract user_type from signup metadata; default to 'individual'
  _user_type := coalesce(
    new.raw_user_meta_data ->> 'user_type',
    'individual'
  );

  -- Validate against allowed types
  if _user_type not in (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo', 'admin'
  ) then
    _user_type := 'individual';
  end if;

  insert into public.profiles (
    id,
    user_type,
    display_name,
    display_name_en,
    email,
    phone
  ) values (
    new.id,
    _user_type,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name_en', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone)
  );

  return new;
end;
$$;

comment on function public.handle_new_user () is 'Automatically creates a profiles row when a new auth.users row is inserted.';

-- Attach to auth.users (drop first for idempotency)
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- End of migration
-- =============================================================================

-- =============================================================================
-- Phase 1 — Migration 002: Entity Profile Tables
-- =============================================================================
-- Creates organization entity profiles (firm, business, government, NGO)
-- and their corresponding member/RBAC tables.
--
-- Depends on:
--   - public.profiles(id)           — from phase1_001
--   - handle_updated_at() trigger   — from phase1_001
--
-- Does NOT recreate: service_requests, request_events, payments, attachments,
--   consultations, cases, contracts, messages, admin_pricing_catalog,
--   wallet_transactions, notifications, profiles, lawyer_profiles,
--   provider_profiles, micro_profiles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Safety: ensure handle_updated_at() exists (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. firm_profiles — Law firm entity
-- ---------------------------------------------------------------------------
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

-- Indexes
create index if not exists idx_firm_profiles_owner on public.firm_profiles (owner_user_id);

create index if not exists idx_firm_profiles_verification on public.firm_profiles (verification_status);

create index if not exists idx_firm_profiles_size on public.firm_profiles (size);

-- RLS
alter table public.firm_profiles enable row level security;

create policy "firm_profiles: owner can read own firm" on public.firm_profiles for
select using (owner_user_id = auth.uid ());

create policy "firm_profiles: members can read their firm" on public.firm_profiles for
select using (
        exists (
            select 1
            from public.firm_members fm
            where
                fm.firm_id = firm_profiles.id
                and fm.user_id = auth.uid ()
                and fm.status = 'active'
        )
    );

create policy "firm_profiles: owner can insert" on public.firm_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "firm_profiles: owner can update" on public.firm_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "firm_profiles: admin full read" on public.firm_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_firm_profiles_updated_at
  before update on public.firm_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 2. firm_members — Firm membership and RBAC
-- ---------------------------------------------------------------------------
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

-- Indexes
create index if not exists idx_firm_members_firm on public.firm_members (firm_id);

create index if not exists idx_firm_members_user on public.firm_members (user_id);

create index if not exists idx_firm_members_role on public.firm_members (role);

create index if not exists idx_firm_members_status on public.firm_members (status);

-- RLS
alter table public.firm_members enable row level security;

create policy "firm_members: member can read own membership" on public.firm_members for
select using (user_id = auth.uid ());

create policy "firm_members: firm owner can read all members" on public.firm_members for
select using (
        exists (
            select 1
            from public.firm_profiles fp
            where
                fp.id = firm_members.firm_id
                and fp.owner_user_id = auth.uid ()
        )
    );

create policy "firm_members: active members can read co-members" on public.firm_members for
select using (
        exists (
            select 1
            from public.firm_members self
            where
                self.firm_id = firm_members.firm_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "firm_members: firm owner can insert" on public.firm_members for
insert
with
    check (
        exists (
            select 1
            from public.firm_profiles fp
            where
                fp.id = firm_members.firm_id
                and fp.owner_user_id = auth.uid ()
        )
    );

create policy "firm_members: firm owner can update" on public.firm_members for
update using (
    exists (
        select 1
        from public.firm_profiles fp
        where
            fp.id = firm_members.firm_id
            and fp.owner_user_id = auth.uid ()
    )
);

create policy "firm_members: admin full read" on public.firm_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_firm_members_updated_at
  before update on public.firm_members
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 3. business_profiles — Corporate entity
-- ---------------------------------------------------------------------------
create table if not exists public.business_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  company_name_ar text not null,
  company_name_en text not null default '',
  cr_number text,  -- Commercial Registration number
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

-- Indexes
create index if not exists idx_business_profiles_owner on public.business_profiles (owner_user_id);

create index if not exists idx_business_profiles_verification on public.business_profiles (verification_status);

create index if not exists idx_business_profiles_size on public.business_profiles (size);

create index if not exists idx_business_profiles_cr on public.business_profiles (cr_number);

-- RLS
alter table public.business_profiles enable row level security;

create policy "business_profiles: owner can read own" on public.business_profiles for
select using (owner_user_id = auth.uid ());

create policy "business_profiles: members can read their org" on public.business_profiles for
select using (
        exists (
            select 1
            from public.business_members bm
            where
                bm.business_id = business_profiles.id
                and bm.user_id = auth.uid ()
                and bm.status = 'active'
        )
    );

create policy "business_profiles: owner can insert" on public.business_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "business_profiles: owner can update" on public.business_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "business_profiles: admin full read" on public.business_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_business_profiles_updated_at
  before update on public.business_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 4. business_members — Corporate membership
-- ---------------------------------------------------------------------------
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

-- Indexes
create index if not exists idx_business_members_business on public.business_members (business_id);

create index if not exists idx_business_members_user on public.business_members (user_id);

create index if not exists idx_business_members_role on public.business_members (role);

create index if not exists idx_business_members_status on public.business_members (status);

-- RLS
alter table public.business_members enable row level security;

create policy "business_members: member can read own membership" on public.business_members for
select using (user_id = auth.uid ());

create policy "business_members: org owner can read all members" on public.business_members for
select using (
        exists (
            select 1
            from public.business_profiles bp
            where
                bp.id = business_members.business_id
                and bp.owner_user_id = auth.uid ()
        )
    );

create policy "business_members: active members can read co-members" on public.business_members for
select using (
        exists (
            select 1
            from public.business_members self
            where
                self.business_id = business_members.business_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "business_members: org owner can insert" on public.business_members for
insert
with
    check (
        exists (
            select 1
            from public.business_profiles bp
            where
                bp.id = business_members.business_id
                and bp.owner_user_id = auth.uid ()
        )
    );

create policy "business_members: org owner can update" on public.business_members for
update using (
    exists (
        select 1
        from public.business_profiles bp
        where
            bp.id = business_members.business_id
            and bp.owner_user_id = auth.uid ()
    )
);

create policy "business_members: admin full read" on public.business_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_business_members_updated_at
  before update on public.business_members
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 5. government_profiles — Government entity
-- ---------------------------------------------------------------------------
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
  restricted_from text[] not null default '{}',  -- Chinese walls
  plan_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_government_profiles_owner on public.government_profiles (owner_user_id);

create index if not exists idx_government_profiles_verification on public.government_profiles (verification_status);

create index if not exists idx_government_profiles_entity_type on public.government_profiles (entity_type);

create index if not exists idx_government_profiles_role on public.government_profiles (role);

-- RLS
alter table public.government_profiles enable row level security;

create policy "government_profiles: owner can read own" on public.government_profiles for
select using (owner_user_id = auth.uid ());

create policy "government_profiles: members can read their entity" on public.government_profiles for
select using (
        exists (
            select 1
            from public.government_members gm
            where
                gm.gov_id = government_profiles.id
                and gm.user_id = auth.uid ()
                and gm.status = 'active'
        )
    );

create policy "government_profiles: owner can insert" on public.government_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "government_profiles: owner can update" on public.government_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "government_profiles: admin full read" on public.government_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_government_profiles_updated_at
  before update on public.government_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 6. government_members — Government membership
-- ---------------------------------------------------------------------------
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

-- Indexes
create index if not exists idx_government_members_gov on public.government_members (gov_id);

create index if not exists idx_government_members_user on public.government_members (user_id);

create index if not exists idx_government_members_role on public.government_members (role);

create index if not exists idx_government_members_status on public.government_members (status);

-- RLS
alter table public.government_members enable row level security;

create policy "government_members: member can read own membership" on public.government_members for
select using (user_id = auth.uid ());

create policy "government_members: entity owner can read all" on public.government_members for
select using (
        exists (
            select 1
            from public.government_profiles gp
            where
                gp.id = government_members.gov_id
                and gp.owner_user_id = auth.uid ()
        )
    );

create policy "government_members: active members can read co-members" on public.government_members for
select using (
        exists (
            select 1
            from public.government_members self
            where
                self.gov_id = government_members.gov_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "government_members: entity owner can insert" on public.government_members for
insert
with
    check (
        exists (
            select 1
            from public.government_profiles gp
            where
                gp.id = government_members.gov_id
                and gp.owner_user_id = auth.uid ()
        )
    );

create policy "government_members: entity owner can update" on public.government_members for
update using (
    exists (
        select 1
        from public.government_profiles gp
        where
            gp.id = government_members.gov_id
            and gp.owner_user_id = auth.uid ()
    )
);

create policy "government_members: admin full read" on public.government_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_government_members_updated_at
  before update on public.government_members
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 7. ngo_profiles — NGO / Charity / Waqf
-- ---------------------------------------------------------------------------
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

-- Indexes
create index if not exists idx_ngo_profiles_owner on public.ngo_profiles (owner_user_id);

create index if not exists idx_ngo_profiles_verification on public.ngo_profiles (verification_status);

create index if not exists idx_ngo_profiles_org_type on public.ngo_profiles (org_type);

create index if not exists idx_ngo_profiles_compliance on public.ngo_profiles (compliance_status);

-- RLS
alter table public.ngo_profiles enable row level security;

create policy "ngo_profiles: owner can read own" on public.ngo_profiles for
select using (owner_user_id = auth.uid ());

create policy "ngo_profiles: members can read their org" on public.ngo_profiles for
select using (
        exists (
            select 1
            from public.ngo_members nm
            where
                nm.ngo_id = ngo_profiles.id
                and nm.user_id = auth.uid ()
                and nm.status = 'active'
        )
    );

create policy "ngo_profiles: owner can insert" on public.ngo_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "ngo_profiles: owner can update" on public.ngo_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "ngo_profiles: admin full read" on public.ngo_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_ngo_profiles_updated_at
  before update on public.ngo_profiles
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 8. ngo_members — NGO membership
-- ---------------------------------------------------------------------------
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

-- Indexes
create index if not exists idx_ngo_members_ngo on public.ngo_members (ngo_id);

create index if not exists idx_ngo_members_user on public.ngo_members (user_id);

create index if not exists idx_ngo_members_role on public.ngo_members (role);

create index if not exists idx_ngo_members_status on public.ngo_members (status);

-- RLS
alter table public.ngo_members enable row level security;

create policy "ngo_members: member can read own membership" on public.ngo_members for
select using (user_id = auth.uid ());

create policy "ngo_members: org owner can read all" on public.ngo_members for
select using (
        exists (
            select 1
            from public.ngo_profiles np
            where
                np.id = ngo_members.ngo_id
                and np.owner_user_id = auth.uid ()
        )
    );

create policy "ngo_members: active members can read co-members" on public.ngo_members for
select using (
        exists (
            select 1
            from public.ngo_members self
            where
                self.ngo_id = ngo_members.ngo_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "ngo_members: org owner can insert" on public.ngo_members for
insert
with
    check (
        exists (
            select 1
            from public.ngo_profiles np
            where
                np.id = ngo_members.ngo_id
                and np.owner_user_id = auth.uid ()
        )
    );

create policy "ngo_members: org owner can update" on public.ngo_members for
update using (
    exists (
        select 1
        from public.ngo_profiles np
        where
            np.id = ngo_members.ngo_id
            and np.owner_user_id = auth.uid ()
    )
);

create policy "ngo_members: admin full read" on public.ngo_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.role = 'admin'
        )
    );

-- Updated-at trigger
create trigger trg_ngo_members_updated_at
  before update on public.ngo_members
  for each row execute function public.handle_updated_at();

-- =============================================================================
-- End of Phase 1 — Migration 002: Entity Profile Tables
-- =============================================================================

-- Phase 1 Migration 003: Subscriptions, Billing, Credits & Coupons
-- Dependencies: 001_profiles (profiles table must exist)
-- Run after: 20260603_phase1_002_entities.sql

-- ============================================================
-- 1. SUBSCRIPTION PLANS — Available plans catalog
-- ============================================================
create table if not exists public.subscription_plans (
  id text primary key,
  tier text not null check (tier in ('free', 'ai', 'pro', 'corp', 'max')),
  audience text not null check (audience in ('individual', 'lawyer', 'firm', 'corporate', 'micro', 'provider', 'government', 'ngo')),
  name_ar text not null,
  name_en text not null default '',
  description_ar text not null default '',
  description_en text not null default '',
  price_monthly numeric(12,2) not null default 0,
  price_yearly numeric(12,2) not null default 0,
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. SUBSCRIPTIONS — Active user/entity subscriptions
-- ============================================================
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entity_id uuid,
  entity_type text check (entity_type in ('firm', 'business', 'government', 'ngo')),
  plan_id text not null references public.subscription_plans(id),
  tier text not null check (tier in ('free', 'ai', 'pro', 'corp', 'max')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'yearly', 'custom')),
  status text not null default 'active' check (status in ('active', 'past_due', 'cancelled', 'expired', 'trialing')),
  started_at timestamptz not null default now(),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at timestamptz,
  cancelled_at timestamptz,
  auto_renew boolean not null default true,
  payment_method_id text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 3. CREDIT PACKAGES — Lawyer credit package catalog
-- ============================================================
create table if not exists public.credit_packages (
  id text primary key,
  name_ar text not null,
  name_en text not null default '',
  price_sar numeric(12,2) not null,
  credits int not null,
  bonus_pct int not null default 0,
  total_credits int not null,
  validity_months int not null default 6,
  sort_order int not null default 0,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. CREDIT TRANSACTIONS — Credit purchase/usage ledger
-- ============================================================
create table if not exists public.credit_transactions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  package_id text references public.credit_packages(id) on delete set null,
  amount int not null,
  kind text not null check (kind in ('purchase', 'usage', 'expiry', 'refund', 'promo', 'admin_adjustment')),
  balance_after int not null,
  service_id text,
  request_id text references public.service_requests(id) on delete set null,
  description text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5. COUPONS — Admin-managed promotional coupons
-- ============================================================
create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage', 'fixed', 'points_grant', 'plan_upgrade')),
  discount_value numeric(12,2) not null default 0,
  points_granted int not null default 0,
  plan_granted text,
  min_order_amount numeric(12,2) not null default 0,
  eligible_user_types text[] not null default '{}',
  eligible_plan_tiers text[] not null default '{}',
  max_uses int,
  max_uses_per_user int not null default 1,
  used_count int not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 6. COUPON USAGE — Track redemptions
-- ============================================================
create table if not exists public.coupon_usage (
    id bigserial primary key,
    coupon_id uuid not null references public.coupons (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    order_id text,
    discount_applied numeric(12, 2) not null default 0,
    created_at timestamptz not null default now()
);

-- ============================================================
-- 7. PROMO LINKS — Provider promotional links
-- ============================================================
create table if not exists public.promo_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  service_id text not null,
  code text not null unique,
  clicks int not null default 0,
  conversions int not null default 0,
  commission_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 8. ESCROW TRANSACTIONS — Marketplace escrow
-- ============================================================
create table if not exists public.escrow_transactions (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(12,2) not null,
  platform_fee numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  status text not null default 'held' check (status in ('held', 'released', 'disputed', 'refunded', 'cancelled')),
  released_at timestamptz,
  disputed_at timestamptz,
  dispute_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================
alter table public.subscription_plans enable row level security;

alter table public.subscriptions enable row level security;

alter table public.credit_packages enable row level security;

alter table public.credit_transactions enable row level security;

alter table public.coupons enable row level security;

alter table public.coupon_usage enable row level security;

alter table public.promo_links enable row level security;

alter table public.escrow_transactions enable row level security;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- subscription_plans: publicly readable
create policy "anyone can read active subscription plans" on public.subscription_plans for
select using (active = true);

-- subscriptions: users read their own
create policy "users read own subscriptions" on public.subscriptions for
select using (user_id = auth.uid ());

create policy "users create own subscriptions" on public.subscriptions for
insert
with
    check (user_id = auth.uid ());

create policy "users update own subscriptions" on public.subscriptions for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- credit_packages: publicly readable
create policy "anyone can read active credit packages" on public.credit_packages for
select using (active = true);

-- credit_transactions: users read their own
create policy "users read own credit transactions" on public.credit_transactions for
select using (user_id = auth.uid ());

create policy "users create own credit transactions" on public.credit_transactions for
insert
with
    check (user_id = auth.uid ());

-- coupons: publicly readable (active only)
create policy "anyone can read active coupons" on public.coupons for
select using (active = true);

-- coupon_usage: users read their own
create policy "users read own coupon usage" on public.coupon_usage for
select using (user_id = auth.uid ());

create policy "users create own coupon usage" on public.coupon_usage for
insert
with
    check (user_id = auth.uid ());

-- promo_links: owners read/manage their own
create policy "owners read own promo links" on public.promo_links for
select using (owner_user_id = auth.uid ());

create policy "owners create own promo links" on public.promo_links for
insert
with
    check (owner_user_id = auth.uid ());

create policy "owners update own promo links" on public.promo_links for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

-- escrow_transactions: buyer and seller can read
create policy "participants read escrow transactions" on public.escrow_transactions for
select using (
        buyer_id = auth.uid ()
        or seller_id = auth.uid ()
    );

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_subscription_plans_tier on public.subscription_plans (tier);

create index if not exists idx_subscription_plans_audience on public.subscription_plans (audience);

create index if not exists idx_subscriptions_user_id on public.subscriptions (user_id);

create index if not exists idx_subscriptions_status on public.subscriptions (status);

create index if not exists idx_subscriptions_entity on public.subscriptions (entity_id, entity_type);

create index if not exists idx_subscriptions_plan_id on public.subscriptions (plan_id);

create index if not exists idx_credit_transactions_user_id on public.credit_transactions (user_id);

create index if not exists idx_credit_transactions_kind on public.credit_transactions (kind);

create index if not exists idx_coupons_code on public.coupons (code);

create index if not exists idx_coupon_usage_user_id on public.coupon_usage (user_id);

create index if not exists idx_coupon_usage_coupon_id on public.coupon_usage (coupon_id);

create index if not exists idx_promo_links_owner on public.promo_links (owner_user_id);

create index if not exists idx_promo_links_code on public.promo_links (code);

create index if not exists idx_escrow_buyer on public.escrow_transactions (buyer_id);

create index if not exists idx_escrow_seller on public.escrow_transactions (seller_id);

create index if not exists idx_escrow_status on public.escrow_transactions (status);

-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================
create trigger set_updated_at_subscription_plans before update on public.subscription_plans
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_subscriptions before update on public.subscriptions
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_credit_packages before update on public.credit_packages
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_coupons before update on public.coupons
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_promo_links before update on public.promo_links
  for each row execute function public.handle_updated_at();

create trigger set_updated_at_escrow_transactions before update on public.escrow_transactions
  for each row execute function public.handle_updated_at();

-- ============================================================
-- SEED DATA: Credit Packages
-- ============================================================
insert into
    public.credit_packages (
        id,
        name_ar,
        name_en,
        price_sar,
        credits,
        bonus_pct,
        total_credits,
        validity_months,
        sort_order,
        active
    )
values (
        'direct',
        'الدفع المباشر',
        'Pay Per Service',
        0,
        0,
        0,
        0,
        0,
        0,
        true
    ),
    (
        'basic',
        'الأساسية',
        'Basic',
        1000,
        1000,
        50,
        1500,
        6,
        1,
        true
    ),
    (
        'advanced',
        'المتقدمة',
        'Advanced',
        2500,
        2500,
        100,
        5000,
        6,
        2,
        true
    ),
    (
        'elite',
        'النخبة',
        'Elite',
        5000,
        5000,
        150,
        12500,
        6,
        3,
        true
    ),
    (
        'royal',
        'الملكية 👑',
        'Royal 👑',
        10000,
        10000,
        200,
        30000,
        12,
        4,
        true
    ) on conflict (id) do
update
set
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    price_sar = excluded.price_sar,
    credits = excluded.credits,
    bonus_pct = excluded.bonus_pct,
    total_credits = excluded.total_credits,
    validity_months = excluded.validity_months,
    sort_order = excluded.sort_order,
    active = excluded.active,
    updated_at = now();

-- ============================================================
-- SEED DATA: Subscription Plans (Basic tiers per audience)
-- ============================================================
insert into public.subscription_plans (id, tier, audience, name_ar, name_en, price_monthly, price_yearly, sort_order, active, features, limits)
values
  -- Individual plans
  ('individual-free', 'free', 'individual', 'المجانية', 'Free', 0, 0, 0, true,
    '[{"key":"ai_daily","label_ar":"سؤال AI يوميا","included":true},{"key":"law_browser","label_ar":"تصفح القوانين","included":true}]'::jsonb,
    '{"ai_queries_per_day":1,"storage_gb":0.5}'::jsonb),
  ('individual-ai', 'ai', 'individual', 'الذكية', 'AI', 49, 470, 1, true,
    '[{"key":"unlimited_ai","label_ar":"أسئلة AI غير محدودة","included":true},{"key":"contract_draft","label_ar":"صياغة العقود","included":true}]'::jsonb,
    '{"ai_queries_per_day":50,"storage_gb":5}'::jsonb),
  ('individual-pro', 'pro', 'individual', 'الاحترافية', 'Pro', 149, 1430, 2, true,
    '[{"key":"all_ai_tools","label_ar":"جميع أدوات AI","included":true},{"key":"priority_support","label_ar":"دعم أولوي","included":true}]'::jsonb,
    '{"ai_queries_per_day":200,"storage_gb":20}'::jsonb),

-- Lawyer plans
('lawyer-free', 'free', 'lawyer', 'المجانية', 'Free', 0, 0, 0, true,
    '[{"key":"profile","label_ar":"ملف تعريفي","included":true}]'::jsonb,
    '{"ai_queries_per_day":3,"storage_gb":1}'::jsonb),
  ('lawyer-ai', 'ai', 'lawyer', 'الذكية', 'AI', 99, 950, 1, true,
    '[{"key":"ai_tools","label_ar":"أدوات AI القانونية","included":true},{"key":"case_management","label_ar":"إدارة القضايا","included":true}]'::jsonb,
    '{"ai_queries_per_day":100,"storage_gb":10}'::jsonb),
  ('lawyer-pro', 'pro', 'lawyer', 'الاحترافية', 'Pro', 249, 2390, 2, true,
    '[{"key":"marketplace","label_ar":"سوق الخدمات","included":true},{"key":"analytics","label_ar":"التحليلات","included":true}]'::jsonb,
    '{"ai_queries_per_day":500,"storage_gb":50}'::jsonb),

-- Firm plans
('firm-pro', 'pro', 'firm', 'الاحترافية', 'Pro', 499, 4790, 0, true,
    '[{"key":"team_management","label_ar":"إدارة الفريق","included":true},{"key":"5_seats","label_ar":"5 مقاعد","included":true}]'::jsonb,
    '{"ai_queries_per_day":500,"storage_gb":100,"team_seats":5}'::jsonb),
  ('firm-corp', 'corp', 'firm', 'المؤسسية', 'Corporate', 999, 9590, 1, true,
    '[{"key":"unlimited_seats","label_ar":"مقاعد غير محدودة","included":true},{"key":"branding","label_ar":"هوية بصرية","included":true}]'::jsonb,
    '{"ai_queries_per_day":2000,"storage_gb":500,"team_seats":50}'::jsonb),
  ('firm-max', 'max', 'firm', 'الحد الأقصى', 'Max', 1999, 19190, 2, true,
    '[{"key":"everything","label_ar":"كل المميزات","included":true},{"key":"api_access","label_ar":"وصول API","included":true}]'::jsonb,
    '{"ai_queries_per_day":-1,"storage_gb":2000,"team_seats":-1}'::jsonb),

-- Corporate plans
('corporate-pro', 'pro', 'corporate', 'الاحترافية', 'Pro', 399, 3830, 0, true,
    '[{"key":"legal_dept","label_ar":"إدارة قانونية","included":true}]'::jsonb,
    '{"ai_queries_per_day":200,"storage_gb":50,"team_seats":10}'::jsonb),
  ('corporate-corp', 'corp', 'corporate', 'المؤسسية', 'Corporate', 799, 7670, 1, true,
    '[{"key":"compliance","label_ar":"الامتثال","included":true},{"key":"governance","label_ar":"الحوكمة","included":true}]'::jsonb,
    '{"ai_queries_per_day":1000,"storage_gb":200,"team_seats":50}'::jsonb),

-- Micro plans
('micro-free', 'free', 'micro', 'المجانية', 'Free', 0, 0, 0, true,
    '[{"key":"basic_tools","label_ar":"أدوات أساسية","included":true}]'::jsonb,
    '{"ai_queries_per_day":3,"storage_gb":1}'::jsonb),
  ('micro-ai', 'ai', 'micro', 'الذكية', 'AI', 79, 760, 1, true,
    '[{"key":"ai_contracts","label_ar":"عقود AI","included":true}]'::jsonb,
    '{"ai_queries_per_day":30,"storage_gb":5}'::jsonb),

-- Provider plans
('provider-free', 'free', 'provider', 'المجانية', 'Free', 0, 0, 0, true,
    '[{"key":"profile","label_ar":"ملف تعريفي","included":true}]'::jsonb,
    '{"ai_queries_per_day":3,"storage_gb":1}'::jsonb),
  ('provider-pro', 'pro', 'provider', 'الاحترافية', 'Pro', 199, 1910, 1, true,
    '[{"key":"marketplace","label_ar":"سوق الخدمات","included":true}]'::jsonb,
    '{"ai_queries_per_day":100,"storage_gb":20}'::jsonb),

-- Government plans
('government-pro', 'pro', 'government', 'الاحترافية', 'Pro', 0, 0, 0, true,
    '[{"key":"gov_tools","label_ar":"أدوات حكومية","included":true}]'::jsonb,
    '{"ai_queries_per_day":500,"storage_gb":100,"team_seats":20}'::jsonb),

-- NGO plans
('ngo-free', 'free', 'ngo', 'المجانية', 'Free', 0, 0, 0, true,
    '[{"key":"basic_compliance","label_ar":"امتثال أساسي","included":true}]'::jsonb,
    '{"ai_queries_per_day":5,"storage_gb":2}'::jsonb),
  ('ngo-pro', 'pro', 'ngo', 'الاحترافية', 'Pro', 99, 950, 1, true,
    '[{"key":"full_compliance","label_ar":"امتثال كامل","included":true}]'::jsonb,
    '{"ai_queries_per_day":100,"storage_gb":20}'::jsonb)
on conflict (id) do update set
  tier = excluded.tier,
  audience = excluded.audience,
  name_ar = excluded.name_ar,
  name_en = excluded.name_en,
  price_monthly = excluded.price_monthly,
  price_yearly = excluded.price_yearly,
  sort_order = excluded.sort_order,
  active = excluded.active,
  features = excluded.features,
  limits = excluded.limits,
  updated_at = now();

-- ============================================================
-- SEED DATA: Initial Coupons
-- ============================================================
insert into
    public.coupons (
        code,
        discount_type,
        discount_value,
        max_uses,
        max_uses_per_user,
        valid_until,
        active
    )
values (
        'NZAMY50',
        'fixed',
        50,
        null,
        1,
        '2027-12-31T23:59:59Z',
        true
    ),
    (
        'NEWCLIENT',
        'fixed',
        75,
        null,
        1,
        '2027-12-31T23:59:59Z',
        true
    ),
    (
        'LAUNCH2026',
        'percentage',
        25,
        500,
        1,
        '2026-12-31T23:59:59Z',
        true
    ) on conflict (code) do nothing;

-- =============================================================================
-- Phase 1 · Migration 004 — Community, Research, Chat, Groups & Settings
-- =============================================================================
-- Creates 14 tables:  community_posts, community_answers, community_votes,
--   groups, group_members, group_invitations, research_sessions, research_items,
--   law_draft_carts, user_settings, chat_rooms, chat_participants,
--   chat_messages, team_invitations
--
-- Depends on:  public.profiles(id), public.subscription_plans(id),
--              public.service_requests(id), public.cases(id)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared trigger function — set updated_at = now() on every UPDATE
-- ---------------------------------------------------------------------------
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

comment on function public.handle_updated_at () is 'Trigger function: auto-sets updated_at to now() on row UPDATE.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. community_posts — Q&A forum questions
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general'
    check (category in (
      'general', 'labor', 'commercial', 'criminal', 'family',
      'real_estate', 'administrative', 'intellectual_property',
      'international', 'other'
    )),
  visibility text not null default 'public'
    check (visibility in ('public', 'lawyers_only', 'private')),
  status text not null default 'active'
    check (status in ('active', 'closed', 'moderated', 'deleted')),
  is_pinned boolean not null default false,
  vote_count int not null default 0,
  answer_count int not null default 0,
  view_count int not null default 0,
  accepted_answer_id uuid,  -- FK added after community_answers exists
  tags text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_community_posts_author on public.community_posts (author_id);

create index if not exists idx_community_posts_category on public.community_posts (category);

create index if not exists idx_community_posts_visibility on public.community_posts (visibility);

create index if not exists idx_community_posts_status on public.community_posts (status);

create index if not exists idx_community_posts_created on public.community_posts (created_at desc);

create index if not exists idx_community_posts_pinned on public.community_posts (is_pinned)
where
    is_pinned = true;

create index if not exists idx_community_posts_tags on public.community_posts using gin (tags);

-- updated_at trigger
create trigger trg_community_posts_updated_at
  before update on public.community_posts
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. community_answers — Answers to community posts
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.community_answers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  is_lawyer_verified boolean not null default false,
  vote_count int not null default 0,
  status text not null default 'active'
    check (status in ('active', 'moderated', 'deleted')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Now add the deferred FK from community_posts → community_answers
alter table public.community_posts
add constraint fk_community_posts_accepted_answer foreign key (accepted_answer_id) references public.community_answers (id) on delete set null;

-- Indexes
create index if not exists idx_community_answers_post on public.community_answers (post_id);

create index if not exists idx_community_answers_author on public.community_answers (author_id);

create index if not exists idx_community_answers_status on public.community_answers (status);

create index if not exists idx_community_answers_verified on public.community_answers (is_lawyer_verified)
where
    is_lawyer_verified = true;

-- updated_at trigger
create trigger trg_community_answers_updated_at
  before update on public.community_answers
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. community_votes — Up/down votes on posts and answers
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.community_votes (
    id bigserial primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    target_type text not null check (
        target_type in ('post', 'answer')
    ),
    target_id uuid not null,
    value int not null check (value in (-1, 1)),
    created_at timestamptz not null default now(),
    unique (
        user_id,
        target_type,
        target_id
    )
);

-- Indexes
create index if not exists idx_community_votes_user on public.community_votes (user_id);

create index if not exists idx_community_votes_target on public.community_votes (target_type, target_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. groups — Shared subscription groups
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text not null default '',
  plan_id text references public.subscription_plans(id) on delete set null,
  max_members int not null default 5,
  join_code text unique,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_groups_owner on public.groups (owner_id);

create index if not exists idx_groups_plan on public.groups (plan_id);

create index if not exists idx_groups_status on public.groups (status);

-- updated_at trigger
create trigger trg_groups_updated_at
  before update on public.groups
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. group_members — Members within a group
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.group_members (
    id uuid primary key default gen_random_uuid (),
    group_id uuid not null references public.groups (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role text not null default 'member' check (
        role in ('owner', 'admin', 'member')
    ),
    status text not null default 'active' check (
        status in (
            'invited',
            'active',
            'removed'
        )
    ),
    joined_at timestamptz not null default now(),
    unique (group_id, user_id)
);

-- Indexes
create index if not exists idx_group_members_group on public.group_members (group_id);

create index if not exists idx_group_members_user on public.group_members (user_id);

create index if not exists idx_group_members_status on public.group_members (status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. group_invitations — Invitations to join a group
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.group_invitations (
    id uuid primary key default gen_random_uuid (),
    group_id uuid not null references public.groups (id) on delete cascade,
    inviter_id uuid not null references public.profiles (id) on delete cascade,
    invitee_email text,
    invitee_phone text,
    status text not null default 'pending' check (
        status in (
            'pending',
            'accepted',
            'rejected',
            'expired'
        )
    ),
    expires_at timestamptz not null default(now() + interval '7 days'),
    created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_group_invitations_group on public.group_invitations (group_id);

create index if not exists idx_group_invitations_inviter on public.group_invitations (inviter_id);

create index if not exists idx_group_invitations_status on public.group_invitations (status);

create index if not exists idx_group_invitations_email on public.group_invitations (invitee_email)
where
    invitee_email is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. research_sessions — AI Research Workspace sessions
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.research_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '',
  tool_id text not null default 'general',
  status text not null default 'active'
    check (status in ('active', 'archived', 'deleted')),
  progress numeric(5,2) not null default 0,  -- 0.00 – 100.00
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_research_sessions_user on public.research_sessions (user_id);

create index if not exists idx_research_sessions_status on public.research_sessions (status);

create index if not exists idx_research_sessions_tool on public.research_sessions (tool_id);

-- updated_at trigger
create trigger trg_research_sessions_updated_at
  before update on public.research_sessions
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. research_items — Items within a research session
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.research_items (
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

-- Indexes
create index if not exists idx_research_items_session on public.research_items (session_id);

create index if not exists idx_research_items_type on public.research_items (item_type);

create index if not exists idx_research_items_position on public.research_items (session_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. law_draft_carts — Legal library draft collection
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.law_draft_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  law_slug text not null,
  article_number text not null,
  article_text text not null default '',
  is_exec_reg_added boolean not null default false,
  exec_reg_text text not null default '',
  position int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, law_slug, article_number)
);

-- Indexes
create index if not exists idx_law_draft_carts_user on public.law_draft_carts (user_id);

create index if not exists idx_law_draft_carts_slug on public.law_draft_carts (law_slug);

create index if not exists idx_law_draft_carts_position on public.law_draft_carts (user_id, position);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. user_settings — User preferences (1-to-1 with profiles)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notifications_enabled boolean not null default true,
  email_notifications boolean not null default true,
  whatsapp_notifications boolean not null default false,
  push_notifications boolean not null default false,
  newsletter boolean not null default false,
  marketing_emails boolean not null default false,
  two_factor_enabled boolean not null default false,
  session_timeout_minutes int not null default 60,
  data_sharing_consent boolean not null default false,
  analytics_consent boolean not null default false,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. chat_rooms — Real-time chat rooms
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  request_id text references public.service_requests(id) on delete set null,
  case_id text references public.cases(id) on delete set null,
  name text not null default '',
  room_type text not null default 'direct'
    check (room_type in ('direct', 'group', 'service', 'case', 'consultation')),
  status text not null default 'active'
    check (status in ('active', 'archived', 'closed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_chat_rooms_request on public.chat_rooms (request_id)
where
    request_id is not null;

create index if not exists idx_chat_rooms_case on public.chat_rooms (case_id)
where
    case_id is not null;

create index if not exists idx_chat_rooms_type on public.chat_rooms (room_type);

create index if not exists idx_chat_rooms_status on public.chat_rooms (status);

-- updated_at trigger
create trigger trg_chat_rooms_updated_at
  before update on public.chat_rooms
  for each row execute function public.handle_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. chat_participants — Users in a chat room
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_participants (
    id uuid primary key default gen_random_uuid (),
    room_id uuid not null references public.chat_rooms (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role text not null default 'member' check (
        role in (
            'owner',
            'admin',
            'member',
            'observer'
        )
    ),
    last_read_at timestamptz,
    muted boolean not null default false,
    joined_at timestamptz not null default now(),
    unique (room_id, user_id)
);

-- Indexes
create index if not exists idx_chat_participants_room on public.chat_participants (room_id);

create index if not exists idx_chat_participants_user on public.chat_participants (user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. chat_messages — Real-time chat messages
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.chat_messages (
  id bigserial primary key,
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text'
    check (message_type in ('text', 'file', 'image', 'audio', 'system', 'ai_response')),
  file_url text,
  file_name text,
  file_size bigint,
  reply_to bigint references public.chat_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_chat_messages_room on public.chat_messages (room_id);

create index if not exists idx_chat_messages_sender on public.chat_messages (sender_id);

create index if not exists idx_chat_messages_room_created on public.chat_messages (room_id, created_at desc);

create index if not exists idx_chat_messages_reply on public.chat_messages (reply_to)
where
    reply_to is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. team_invitations — Entity team invitations
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  entity_id uuid not null,
  entity_type text not null
    check (entity_type in ('firm', 'business', 'government', 'ngo')),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_email text,
  invitee_phone text,
  role text not null,
  department text,
  seat_type text not null default 'member'
    check (seat_type in ('assistant', 'member', 'professional')),
  scope text not null default 'entity'
    check (scope in ('personal', 'entity', 'department', 'case')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired', 'cancelled')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists idx_team_invitations_entity on public.team_invitations (entity_id, entity_type);

create index if not exists idx_team_invitations_inviter on public.team_invitations (inviter_id);

create index if not exists idx_team_invitations_email on public.team_invitations (invitee_email)
where
    invitee_email is not null;

create index if not exists idx_team_invitations_token on public.team_invitations (token);

create index if not exists idx_team_invitations_status on public.team_invitations (status);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Enable on all tables
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.community_posts enable row level security;

alter table public.community_answers enable row level security;

alter table public.community_votes enable row level security;

alter table public.groups enable row level security;

alter table public.group_members enable row level security;

alter table public.group_invitations enable row level security;

alter table public.research_sessions enable row level security;

alter table public.research_items enable row level security;

alter table public.law_draft_carts enable row level security;

alter table public.user_settings enable row level security;

alter table public.chat_rooms enable row level security;

alter table public.chat_participants enable row level security;

alter table public.chat_messages enable row level security;

alter table public.team_invitations enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- ---------------------------------------------------------------------------
-- community_posts
-- ---------------------------------------------------------------------------
-- Anyone authenticated can read public posts; lawyers_only filtered by app
create policy "anyone reads public community posts" on public.community_posts for
select using (
        status in ('active', 'closed')
        and (
            visibility = 'public'
            or author_id = auth.uid ()
        )
    );

create policy "users create their own community posts" on public.community_posts for
insert
with
    check (author_id = auth.uid ());

create policy "authors update their own community posts" on public.community_posts for
update using (author_id = auth.uid ())
with
    check (author_id = auth.uid ());

create policy "authors delete their own community posts" on public.community_posts for delete using (author_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- community_answers
-- ---------------------------------------------------------------------------
create policy "anyone reads active community answers" on public.community_answers for
select using (status = 'active');

create policy "users create community answers" on public.community_answers for
insert
with
    check (author_id = auth.uid ());

create policy "authors update their own community answers" on public.community_answers for
update using (author_id = auth.uid ())
with
    check (author_id = auth.uid ());

create policy "authors delete their own community answers" on public.community_answers for delete using (author_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- community_votes
-- ---------------------------------------------------------------------------
create policy "users read their own votes" on public.community_votes for
select using (user_id = auth.uid ());

create policy "users create their own votes" on public.community_votes for
insert
with
    check (user_id = auth.uid ());

create policy "users update their own votes" on public.community_votes for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

create policy "users delete their own votes" on public.community_votes for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
create policy "group members read their groups" on public.groups for
select using (
        owner_id = auth.uid ()
        or exists (
            select 1
            from public.group_members gm
            where
                gm.group_id = groups.id
                and gm.user_id = auth.uid ()
                and gm.status = 'active'
        )
    );

create policy "users create groups" on public.groups for
insert
with
    check (owner_id = auth.uid ());

create policy "owners update their groups" on public.groups for
update using (owner_id = auth.uid ())
with
    check (owner_id = auth.uid ());

create policy "owners delete their groups" on public.groups for delete using (owner_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
create policy "group members read membership" on public.group_members for
select using (
        user_id = auth.uid ()
        or exists (
            select 1
            from public.groups g
            where
                g.id = group_members.group_id
                and g.owner_id = auth.uid ()
        )
    );

create policy "group owners manage members" on public.group_members for
insert
with
    check (
        exists (
            select 1
            from public.groups g
            where
                g.id = group_members.group_id
                and g.owner_id = auth.uid ()
        )
    );

create policy "group owners update members" on public.group_members for
update using (
    exists (
        select 1
        from public.groups g
        where
            g.id = group_members.group_id
            and g.owner_id = auth.uid ()
    )
);

create policy "group owners remove members" on public.group_members for delete using (
    user_id = auth.uid ()
    or exists (
        select 1
        from public.groups g
        where
            g.id = group_members.group_id
            and g.owner_id = auth.uid ()
    )
);

-- ---------------------------------------------------------------------------
-- group_invitations
-- ---------------------------------------------------------------------------
create policy "inviters and invitees read group invitations" on public.group_invitations for
select using (inviter_id = auth.uid ());

create policy "group owners create invitations" on public.group_invitations for
insert
with
    check (
        exists (
            select 1
            from public.groups g
            where
                g.id = group_invitations.group_id
                and g.owner_id = auth.uid ()
        )
    );

create policy "inviters update invitations" on public.group_invitations for
update using (inviter_id = auth.uid ())
with
    check (inviter_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- research_sessions
-- ---------------------------------------------------------------------------
create policy "users read their own research sessions" on public.research_sessions for
select using (user_id = auth.uid ());

create policy "users create their own research sessions" on public.research_sessions for
insert
with
    check (user_id = auth.uid ());

create policy "users update their own research sessions" on public.research_sessions for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

create policy "users delete their own research sessions" on public.research_sessions for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- research_items
-- ---------------------------------------------------------------------------
create policy "users read items in their sessions" on public.research_items for
select using (
        exists (
            select 1
            from public.research_sessions rs
            where
                rs.id = research_items.session_id
                and rs.user_id = auth.uid ()
        )
    );

create policy "users create items in their sessions" on public.research_items for
insert
with
    check (
        exists (
            select 1
            from public.research_sessions rs
            where
                rs.id = research_items.session_id
                and rs.user_id = auth.uid ()
        )
    );

create policy "users update items in their sessions" on public.research_items for
update using (
    exists (
        select 1
        from public.research_sessions rs
        where
            rs.id = research_items.session_id
            and rs.user_id = auth.uid ()
    )
);

create policy "users delete items in their sessions" on public.research_items for delete using (
    exists (
        select 1
        from public.research_sessions rs
        where
            rs.id = research_items.session_id
            and rs.user_id = auth.uid ()
    )
);

-- ---------------------------------------------------------------------------
-- law_draft_carts
-- ---------------------------------------------------------------------------
create policy "users read their own draft carts" on public.law_draft_carts for
select using (user_id = auth.uid ());

create policy "users create their own draft carts" on public.law_draft_carts for
insert
with
    check (user_id = auth.uid ());

create policy "users update their own draft carts" on public.law_draft_carts for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

create policy "users delete their own draft carts" on public.law_draft_carts for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- user_settings
-- ---------------------------------------------------------------------------
create policy "users read their own settings" on public.user_settings for
select using (user_id = auth.uid ());

create policy "users create their own settings" on public.user_settings for
insert
with
    check (user_id = auth.uid ());

create policy "users update their own settings" on public.user_settings for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- chat_rooms — participants only
-- ---------------------------------------------------------------------------
create policy "chat participants read their rooms" on public.chat_rooms for
select using (
        exists (
            select 1
            from public.chat_participants cp
            where
                cp.room_id = chat_rooms.id
                and cp.user_id = auth.uid ()
        )
    );

create policy "authenticated users create chat rooms" on public.chat_rooms for
insert
with
    check (auth.uid () is not null);

create policy "chat participants update their rooms" on public.chat_rooms for
update using (
    exists (
        select 1
        from public.chat_participants cp
        where
            cp.room_id = chat_rooms.id
            and cp.user_id = auth.uid ()
            and cp.role in ('owner', 'admin')
    )
);

-- ---------------------------------------------------------------------------
-- chat_participants
-- ---------------------------------------------------------------------------
create policy "participants read room membership" on public.chat_participants for
select using (
        user_id = auth.uid ()
        or exists (
            select 1
            from public.chat_participants cp2
            where
                cp2.room_id = chat_participants.room_id
                and cp2.user_id = auth.uid ()
        )
    );

create policy "room owners add participants" on public.chat_participants for
insert
with
    check (
        user_id = auth.uid ()
        or exists (
            select 1
            from public.chat_participants cp
            where
                cp.room_id = chat_participants.room_id
                and cp.user_id = auth.uid ()
                and cp.role in ('owner', 'admin')
        )
    );

create policy "participants update their own record" on public.chat_participants for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

create policy "participants remove themselves" on public.chat_participants for delete using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------------------------
create policy "room participants read messages" on public.chat_messages for
select using (
        exists (
            select 1
            from public.chat_participants cp
            where
                cp.room_id = chat_messages.room_id
                and cp.user_id = auth.uid ()
        )
    );

create policy "room participants send messages" on public.chat_messages for
insert
with
    check (
        sender_id = auth.uid ()
        and exists (
            select 1
            from public.chat_participants cp
            where
                cp.room_id = chat_messages.room_id
                and cp.user_id = auth.uid ()
        )
    );

create policy "senders update their own messages" on public.chat_messages for
update using (sender_id = auth.uid ())
with
    check (sender_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- team_invitations
-- ---------------------------------------------------------------------------
create policy "inviters read their team invitations" on public.team_invitations for
select using (inviter_id = auth.uid ());

create policy "inviters create team invitations" on public.team_invitations for
insert
with
    check (inviter_id = auth.uid ());

create policy "inviters update team invitations" on public.team_invitations for
update using (inviter_id = auth.uid ())
with
    check (inviter_id = auth.uid ());

create policy "inviters cancel team invitations" on public.team_invitations for delete using (inviter_id = auth.uid ());

-- ═══════════════════════════════════════════════════════════════════════════
-- SUPABASE REALTIME — Publish chat_messages & notifications
-- ═══════════════════════════════════════════════════════════════════════════
alter publication supabase_realtime add table public.chat_messages;

alter publication supabase_realtime add table public.notifications;

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
create policy "anyone reads active marketplace listings" on public.marketplace_listings for
select using (
        status in ('active', 'matched')
    );

create policy "owners create marketplace listings" on public.marketplace_listings for
insert
with
    check (owner_id = auth.uid ());

create policy "owners update own marketplace listings" on public.marketplace_listings for
update using (owner_id = auth.uid ())
with
    check (owner_id = auth.uid ());

-- marketplace_offers: listing owner + offeror can read
create policy "participants read marketplace offers" on public.marketplace_offers for
select using (
        offeror_id = auth.uid ()
        or exists (
            select 1
            from public.marketplace_listings ml
            where
                ml.id = marketplace_offers.listing_id
                and ml.owner_id = auth.uid ()
        )
    );

create policy "users create marketplace offers" on public.marketplace_offers for
insert
with
    check (offeror_id = auth.uid ());

create policy "participants update marketplace offers" on public.marketplace_offers for
update using (
    offeror_id = auth.uid ()
    or exists (
        select 1
        from public.marketplace_listings ml
        where
            ml.id = marketplace_offers.listing_id
            and ml.owner_id = auth.uid ()
    )
);

-- marketplace_workspaces: buyer and seller can read
create policy "participants read marketplace workspaces" on public.marketplace_workspaces for
select using (
        buyer_id = auth.uid ()
        or seller_id = auth.uid ()
    );

-- case_collaborators: case participants
create policy "case participants read collaborators" on public.case_collaborators for
select using (
        user_id = auth.uid ()
        or exists (
            select 1
            from public.cases c
            where
                c.id = case_collaborators.case_id
                and (
                    c.client_user_id = auth.uid ()
                    or c.assigned_user_id = auth.uid ()
                )
        )
    );

create policy "case owners create collaborators" on public.case_collaborators for
insert
with
    check (
        exists (
            select 1
            from public.cases c
            where
                c.id = case_collaborators.case_id
                and c.assigned_user_id = auth.uid ()
        )
    );

-- case_share_tokens: case owners
create policy "case owners manage share tokens" on public.case_share_tokens for
select using (created_by = auth.uid ());

create policy "case owners create share tokens" on public.case_share_tokens for
insert
with
    check (created_by = auth.uid ());

-- secondment_contracts: lawyer and entity members
create policy "lawyers read own secondments" on public.secondment_contracts for
select using (lawyer_id = auth.uid ());

create policy "lawyers create secondments" on public.secondment_contracts for
insert
with
    check (lawyer_id = auth.uid ());

-- secondment_time_entries: contract participants
create policy "contract participants read time entries" on public.secondment_time_entries for
select using (
        exists (
            select 1
            from public.secondment_contracts sc
            where
                sc.id = secondment_time_entries.contract_id
                and sc.lawyer_id = auth.uid ()
        )
    );

create policy "lawyers create time entries" on public.secondment_time_entries for
insert
with
    check (
        exists (
            select 1
            from public.secondment_contracts sc
            where
                sc.id = secondment_time_entries.contract_id
                and sc.lawyer_id = auth.uid ()
        )
    );

-- referrals: referrer reads own
create policy "referrers read own referrals" on public.referrals for
select using (
        referrer_id = auth.uid ()
        or referee_id = auth.uid ()
    );

create policy "users create referrals" on public.referrals for
insert
with
    check (referrer_id = auth.uid ());

-- admin_audit_events: only service role (no user access)
-- No select policy = blocked by default for users

-- login_attempts: only service role
-- No select policy = blocked by default for users

-- feature_flags: publicly readable
create policy "anyone reads feature flags" on public.feature_flags for
select using (true);

-- jurisdictions: publicly readable
create policy "anyone reads jurisdictions" on public.jurisdictions for
select using (active = true);

-- reviews: public reads active, users manage own
create policy "anyone reads active reviews" on public.reviews for
select using (status = 'active');

create policy "reviewers create reviews" on public.reviews for
insert
with
    check (reviewer_id = auth.uid ());

create policy "reviewers update own reviews" on public.reviews for
update using (reviewer_id = auth.uid ())
with
    check (reviewer_id = auth.uid ());

create policy "reviewees respond to reviews" on public.reviews for
update using (reviewee_id = auth.uid ())
with
    check (reviewee_id = auth.uid ());

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_marketplace_listings_owner on public.marketplace_listings (owner_id);

create index if not exists idx_marketplace_listings_status on public.marketplace_listings (status);

create index if not exists idx_marketplace_listings_category on public.marketplace_listings (category);

create index if not exists idx_marketplace_listings_type on public.marketplace_listings (listing_type);

create index if not exists idx_marketplace_offers_listing on public.marketplace_offers (listing_id);

create index if not exists idx_marketplace_offers_offeror on public.marketplace_offers (offeror_id);

create index if not exists idx_marketplace_offers_status on public.marketplace_offers (status);

create index if not exists idx_marketplace_workspaces_buyer on public.marketplace_workspaces (buyer_id);

create index if not exists idx_marketplace_workspaces_seller on public.marketplace_workspaces (seller_id);

create index if not exists idx_case_collaborators_case on public.case_collaborators (case_id);

create index if not exists idx_case_collaborators_user on public.case_collaborators (user_id);

create index if not exists idx_case_share_tokens_case on public.case_share_tokens (case_id);

create index if not exists idx_case_share_tokens_token on public.case_share_tokens (token);

create index if not exists idx_secondment_contracts_lawyer on public.secondment_contracts (lawyer_id);

create index if not exists idx_secondment_contracts_entity on public.secondment_contracts (entity_id, entity_type);

create index if not exists idx_secondment_time_entries_contract on public.secondment_time_entries (contract_id);

create index if not exists idx_referrals_referrer on public.referrals (referrer_id);

create index if not exists idx_referrals_referee on public.referrals (referee_id);

create index if not exists idx_referrals_status on public.referrals (status);

create index if not exists idx_admin_audit_events_actor on public.admin_audit_events (actor_id);

create index if not exists idx_admin_audit_events_target on public.admin_audit_events (target_type, target_id);

create index if not exists idx_admin_audit_events_created on public.admin_audit_events (created_at);

create index if not exists idx_login_attempts_email on public.login_attempts (email);

create index if not exists idx_login_attempts_ip on public.login_attempts (ip_address);

create index if not exists idx_login_attempts_created on public.login_attempts (created_at);

create index if not exists idx_reviews_reviewer on public.reviews (reviewer_id);

create index if not exists idx_reviews_reviewee on public.reviews (reviewee_id);

create index if not exists idx_reviews_request on public.reviews (request_id);

create index if not exists idx_reviews_status on public.reviews (status);

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
insert into
    public.jurisdictions (
        id,
        name_ar,
        name_en,
        flag_emoji,
        legal_system,
        phase,
        readiness,
        currency,
        timezone
    )
values (
        'SA',
        'المملكة العربية السعودية',
        'Saudi Arabia',
        '🇸🇦',
        'islamic',
        1,
        'full_presence',
        'SAR',
        'Asia/Riyadh'
    ),
    (
        'AE',
        'الإمارات العربية المتحدة',
        'United Arab Emirates',
        '🇦🇪',
        'mixed',
        1,
        'live_research',
        'AED',
        'Asia/Dubai'
    ),
    (
        'BH',
        'مملكة البحرين',
        'Bahrain',
        '🇧🇭',
        'mixed',
        1,
        'live_research',
        'BHD',
        'Asia/Bahrain'
    ),
    (
        'OM',
        'سلطنة عمان',
        'Oman',
        '🇴🇲',
        'mixed',
        1,
        'live_research',
        'OMR',
        'Asia/Muscat'
    ),
    (
        'KW',
        'دولة الكويت',
        'Kuwait',
        '🇰🇼',
        'mixed',
        1,
        'live_research',
        'KWD',
        'Asia/Kuwait'
    ),
    (
        'QA',
        'دولة قطر',
        'Qatar',
        '🇶🇦',
        'mixed',
        1,
        'live_research',
        'QAR',
        'Asia/Qatar'
    ),
    (
        'EG',
        'جمهورية مصر العربية',
        'Egypt',
        '🇪🇬',
        'civil',
        2,
        'live_research',
        'EGP',
        'Africa/Cairo'
    ),
    (
        'JO',
        'المملكة الأردنية الهاشمية',
        'Jordan',
        '🇯🇴',
        'civil',
        2,
        'live_research',
        'JOD',
        'Asia/Amman'
    ),
    (
        'MA',
        'المملكة المغربية',
        'Morocco',
        '🇲🇦',
        'civil',
        2,
        'live_research',
        'MAD',
        'Africa/Casablanca'
    ) on conflict (id) do
update
set
    name_ar = excluded.name_ar,
    name_en = excluded.name_en,
    flag_emoji = excluded.flag_emoji,
    legal_system = excluded.legal_system,
    phase = excluded.phase,
    readiness = excluded.readiness,
    currency = excluded.currency,
    timezone = excluded.timezone,
    updated_at = now();

-- =============================================================================
-- Migration: Auto-create role-specific profile rows on user registration
-- =============================================================================
-- Depends on: 20260603_phase1_001_profiles.sql
-- Purpose:    When a new user registers as lawyer/provider, automatically create
--             the corresponding lawyer_profiles or provider_profiles row.
--             Also adds missing INSERT/UPDATE RLS policies for admin operations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update handle_new_user() to also create role-specific profiles
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_type text;
  _sub_role text;
begin
  -- Extract user_type from signup metadata; default to 'individual'
  _user_type := coalesce(
    new.raw_user_meta_data ->> 'user_type',
    'individual'
  );

  -- Validate against allowed types
  if _user_type not in (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo', 'admin'
  ) then
    _user_type := 'individual';
  end if;

  -- Create the base profiles row
  insert into public.profiles (
    id,
    user_type,
    display_name,
    display_name_en,
    email,
    phone
  ) values (
    new.id,
    _user_type,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name_en', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone)
  );

  -- Auto-create lawyer_profiles row for lawyers
  if _user_type = 'lawyer' then
    insert into public.lawyer_profiles (
      user_id,
      license_number,
      specialties,
      years_experience,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      coalesce(
        (select array_agg(x)::text[]
         from jsonb_array_elements_text(
           case when jsonb_typeof(new.raw_user_meta_data -> 'provider_specialties') = 'array'
                then new.raw_user_meta_data -> 'provider_specialties'
                else '[]'::jsonb
           end
         ) as x),
        '{}'::text[]
      ),
      coalesce((new.raw_user_meta_data ->> 'experience_years')::int, 0),
      'pending',
      false,
      jsonb_build_object(
        'provider_type', coalesce(new.raw_user_meta_data ->> 'provider_type', 'lawyer'),
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  -- Auto-create provider_profiles row for providers (notary, arbitrator, bailiff)
  if _user_type = 'provider' then
    _sub_role := coalesce(new.raw_user_meta_data ->> 'sub_role', 'notary');
    if _sub_role not in ('notary', 'arbitrator', 'bailiff') then
      _sub_role := 'notary';
    end if;

    insert into public.provider_profiles (
      user_id,
      sub_role,
      license_number,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      _sub_role,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      'pending',
      false,
      jsonb_build_object(
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user () is 'Creates profiles + role-specific profile rows (lawyer_profiles, provider_profiles) on auth.users insert.';

-- ---------------------------------------------------------------------------
-- 2. Add missing RLS policies for admin operations on lawyer_profiles
-- ---------------------------------------------------------------------------

-- Admin can update any lawyer profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'admins update all lawyer profiles'
  ) then
    create policy "admins update all lawyer profiles"
      on public.lawyer_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Admin can update any provider profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'admins update all provider profiles'
  ) then
    create policy "admins update all provider profiles"
      on public.provider_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Self-insert for lawyer_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'users insert own lawyer profile'
  ) then
    create policy "users insert own lawyer profile"
      on public.lawyer_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- Self-insert for provider_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'users insert own provider profile'
  ) then
    create policy "users insert own provider profile"
      on public.provider_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- =============================================================================
-- End of migration
-- =============================================================================

UPDATE public.profiles
SET
    user_type = 'admin'
WHERE
    email = 'admin@nezamy.sa';

-- =============================================================================
-- Migration: Auto-create role-specific profile rows on user registration
-- =============================================================================
-- Depends on: 20260603_phase1_001_profiles.sql
-- Purpose:    When a new user registers as lawyer/provider, automatically create
--             the corresponding lawyer_profiles or provider_profiles row.
--             Also adds missing INSERT/UPDATE RLS policies for admin operations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update handle_new_user() to also create role-specific profiles
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_type text;
  _sub_role text;
  _exp_str text;
  _years_exp int;
begin
  -- Extract user_type from signup metadata; default to 'individual'
  _user_type := coalesce(
    new.raw_user_meta_data ->> 'user_type',
    'individual'
  );

  -- Validate against allowed types
  if _user_type not in (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo', 'admin'
  ) then
    _user_type := 'individual';
  end if;

  -- Create the base profiles row
  insert into public.profiles (
    id,
    user_type,
    display_name,
    display_name_en,
    email,
    phone
  ) values (
    new.id,
    _user_type,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name_en', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone)
  );

  -- Auto-create lawyer_profiles row for lawyers
  if _user_type = 'lawyer' then
    -- Safely extract and parse years of experience from string options
    _exp_str := new.raw_user_meta_data ->> 'experience_years';
    _years_exp := 0;
    if _exp_str is not null and _exp_str <> '' then
      begin
        _years_exp := _exp_str::int;
      exception when others then
        if _exp_str like '%15%' or _exp_str like '%١٥%' then
          _years_exp := 15;
        elsif _exp_str like '%7-15%' or _exp_str like '%٧-١٥%' then
          _years_exp := 10;
        elsif _exp_str like '%3-7%' or _exp_str like '%٣-٧%' then
          _years_exp := 5;
        elsif _exp_str like '%1-3%' or _exp_str like '%١-٣%' then
          _years_exp := 2;
        elsif _exp_str like '%Less%' or _exp_str like '%أقل%' then
          _years_exp := 1;
        else
          begin
            _years_exp := coalesce((substring(_exp_str from '\d+'))::int, 0);
          exception when others then
            _years_exp := 0;
          end;
        end if;
      end;
    end if;

    insert into public.lawyer_profiles (
      user_id,
      license_number,
      specialties,
      years_experience,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      coalesce(
        (select array_agg(x)::text[]
         from jsonb_array_elements_text(
           case when jsonb_typeof(new.raw_user_meta_data -> 'provider_specialties') = 'array'
                then new.raw_user_meta_data -> 'provider_specialties'
                else '[]'::jsonb
           end
         ) as x),
        '{}'::text[]
      ),
      _years_exp,
      'pending',
      false,
      jsonb_build_object(
        'provider_type', coalesce(new.raw_user_meta_data ->> 'provider_type', 'lawyer'),
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  -- Auto-create provider_profiles row for providers (notary, arbitrator, bailiff)
  if _user_type = 'provider' then
    _sub_role := coalesce(new.raw_user_meta_data ->> 'sub_role', 'notary');
    if _sub_role not in ('notary', 'arbitrator', 'bailiff') then
      _sub_role := 'notary';
    end if;

    insert into public.provider_profiles (
      user_id,
      sub_role,
      license_number,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      _sub_role,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      'pending',
      false,
      jsonb_build_object(
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user () is 'Creates profiles + role-specific profile rows (lawyer_profiles, provider_profiles) on auth.users insert.';

-- ---------------------------------------------------------------------------
-- 2. Add missing RLS policies for admin operations on lawyer_profiles
-- ---------------------------------------------------------------------------

-- Admin can update any lawyer profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'admins update all lawyer profiles'
  ) then
    create policy "admins update all lawyer profiles"
      on public.lawyer_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Admin can update any provider profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'admins update all provider profiles'
  ) then
    create policy "admins update all provider profiles"
      on public.provider_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Self-insert for lawyer_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'users insert own lawyer profile'
  ) then
    create policy "users insert own lawyer profile"
      on public.lawyer_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- Self-insert for provider_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'users insert own provider profile'
  ) then
    create policy "users insert own provider profile"
      on public.provider_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- =============================================================================
-- End of migration
-- =============================================================================

-- =============================================================================
-- Migration: Auto-create role-specific profile rows on user registration
-- =============================================================================
-- Depends on: 20260603_phase1_001_profiles.sql
-- Purpose:    When a new user registers as lawyer/provider, automatically create
--             the corresponding lawyer_profiles or provider_profiles row.
--             Also adds missing INSERT/UPDATE RLS policies for admin operations.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Update handle_new_user() to also create role-specific profiles
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _user_type text;
  _sub_role text;
  _exp_str text;
  _years_exp int;
begin
  -- Extract user_type from signup metadata; default to 'individual'
  _user_type := coalesce(
    new.raw_user_meta_data ->> 'user_type',
    'individual'
  );

  -- Validate against allowed types
  if _user_type not in (
    'individual', 'lawyer', 'firm', 'corporate',
    'micro', 'provider', 'government', 'ngo', 'admin'
  ) then
    _user_type := 'individual';
  end if;

  -- Create the base profiles row
  insert into public.profiles (
    id,
    user_type,
    display_name,
    display_name_en,
    email,
    phone,
    onboarding_completed
  ) values (
    new.id,
    _user_type,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name_en', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    coalesce((new.raw_user_meta_data ->> 'onboarding_completed')::boolean, false)
  );

  -- Auto-create lawyer_profiles row for lawyers
  if _user_type = 'lawyer' then
    -- Safely extract and parse years of experience from string options
    _exp_str := new.raw_user_meta_data ->> 'experience_years';
    _years_exp := 0;
    if _exp_str is not null and _exp_str <> '' then
      begin
        _years_exp := _exp_str::int;
      exception when others then
        if _exp_str like '%15%' or _exp_str like '%١٥%' then
          _years_exp := 15;
        elsif _exp_str like '%7-15%' or _exp_str like '%٧-١٥%' then
          _years_exp := 10;
        elsif _exp_str like '%3-7%' or _exp_str like '%٣-٧%' then
          _years_exp := 5;
        elsif _exp_str like '%1-3%' or _exp_str like '%١-٣%' then
          _years_exp := 2;
        elsif _exp_str like '%Less%' or _exp_str like '%أقل%' then
          _years_exp := 1;
        else
          begin
            _years_exp := coalesce((substring(_exp_str from '\d+'))::int, 0);
          exception when others then
            _years_exp := 0;
          end;
        end if;
      end;
    end if;

    insert into public.lawyer_profiles (
      user_id,
      license_number,
      specialties,
      years_experience,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      coalesce(
        (select array_agg(x)::text[]
         from jsonb_array_elements_text(
           case when jsonb_typeof(new.raw_user_meta_data -> 'provider_specialties') = 'array'
                then new.raw_user_meta_data -> 'provider_specialties'
                else '[]'::jsonb
           end
         ) as x),
        '{}'::text[]
      ),
      _years_exp,
      'pending',
      false,
      jsonb_build_object(
        'provider_type', coalesce(new.raw_user_meta_data ->> 'provider_type', 'lawyer'),
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  -- Auto-create provider_profiles row for providers (notary, arbitrator, bailiff)
  if _user_type = 'provider' then
    _sub_role := coalesce(new.raw_user_meta_data ->> 'sub_role', 'notary');
    if _sub_role not in ('notary', 'arbitrator', 'bailiff') then
      _sub_role := 'notary';
    end if;

    insert into public.provider_profiles (
      user_id,
      sub_role,
      license_number,
      verification_status,
      marketplace_visible,
      metadata
    ) values (
      new.id,
      _sub_role,
      coalesce(new.raw_user_meta_data ->> 'license_number', ''),
      'pending',
      false,
      jsonb_build_object(
        'selected_plan', coalesce(new.raw_user_meta_data ->> 'selected_plan', 'ai'),
        'city', coalesce(new.raw_user_meta_data ->> 'city', ''),
        'registered_at', now()
      )
    );
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user () is 'Creates profiles + role-specific profile rows (lawyer_profiles, provider_profiles) on auth.users insert.';

-- ---------------------------------------------------------------------------
-- 2. Add missing RLS policies for admin operations on lawyer_profiles
-- ---------------------------------------------------------------------------

-- Admin can update any lawyer profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'admins update all lawyer profiles'
  ) then
    create policy "admins update all lawyer profiles"
      on public.lawyer_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Admin can update any provider profile (for approve/reject verification)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'admins update all provider profiles'
  ) then
    create policy "admins update all provider profiles"
      on public.provider_profiles for update
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.user_type = 'admin'
        )
      );
  end if;
end $$;

-- Self-insert for lawyer_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'lawyer_profiles'
      and policyname = 'users insert own lawyer profile'
  ) then
    create policy "users insert own lawyer profile"
      on public.lawyer_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- Self-insert for provider_profiles (needed during registration)
do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'provider_profiles'
      and policyname = 'users insert own provider profile'
  ) then
    create policy "users insert own provider profile"
      on public.provider_profiles for insert
      with check (user_id = auth.uid());
  end if;
end $$;

-- =============================================================================
-- End of migration
-- =============================================================================

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
create policy "firm_profiles: owner can read own firm" on public.firm_profiles for
select using (owner_user_id = auth.uid ());

create policy "firm_profiles: members can read their firm" on public.firm_profiles for
select using (
        exists (
            select 1
            from public.firm_members fm
            where
                fm.firm_id = firm_profiles.id
                and fm.user_id = auth.uid ()
                and fm.status = 'active'
        )
    );

create policy "firm_profiles: owner can insert" on public.firm_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "firm_profiles: owner can update" on public.firm_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "admins read firm profiles" on public.firm_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── firm_members policies ───────────────────────────────────────────────────
create policy "firm_members: member can read own membership" on public.firm_members for
select using (user_id = auth.uid ());

create policy "firm_members: firm owner can read all members" on public.firm_members for
select using (
        exists (
            select 1
            from public.firm_profiles fp
            where
                fp.id = firm_members.firm_id
                and fp.owner_user_id = auth.uid ()
        )
    );

create policy "firm_members: active members can read co-members" on public.firm_members for
select using (
        exists (
            select 1
            from public.firm_members self
            where
                self.firm_id = firm_members.firm_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "firm_members: firm owner can insert" on public.firm_members for
insert
with
    check (
        exists (
            select 1
            from public.firm_profiles fp
            where
                fp.id = firm_members.firm_id
                and fp.owner_user_id = auth.uid ()
        )
    );

create policy "firm_members: firm owner can update" on public.firm_members for
update using (
    exists (
        select 1
        from public.firm_profiles fp
        where
            fp.id = firm_members.firm_id
            and fp.owner_user_id = auth.uid ()
    )
);

create policy "admins read firm members" on public.firm_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── business_profiles policies ──────────────────────────────────────────────
create policy "business_profiles: owner can read own" on public.business_profiles for
select using (owner_user_id = auth.uid ());

create policy "business_profiles: members can read their org" on public.business_profiles for
select using (
        exists (
            select 1
            from public.business_members bm
            where
                bm.business_id = business_profiles.id
                and bm.user_id = auth.uid ()
                and bm.status = 'active'
        )
    );

create policy "business_profiles: owner can insert" on public.business_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "business_profiles: owner can update" on public.business_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "admins read business profiles" on public.business_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── business_members policies ───────────────────────────────────────────────
create policy "business_members: member can read own membership" on public.business_members for
select using (user_id = auth.uid ());

create policy "business_members: org owner can read all members" on public.business_members for
select using (
        exists (
            select 1
            from public.business_profiles bp
            where
                bp.id = business_members.business_id
                and bp.owner_user_id = auth.uid ()
        )
    );

create policy "business_members: active members can read co-members" on public.business_members for
select using (
        exists (
            select 1
            from public.business_members self
            where
                self.business_id = business_members.business_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "business_members: org owner can insert" on public.business_members for
insert
with
    check (
        exists (
            select 1
            from public.business_profiles bp
            where
                bp.id = business_members.business_id
                and bp.owner_user_id = auth.uid ()
        )
    );

create policy "business_members: org owner can update" on public.business_members for
update using (
    exists (
        select 1
        from public.business_profiles bp
        where
            bp.id = business_members.business_id
            and bp.owner_user_id = auth.uid ()
    )
);

create policy "admins read business members" on public.business_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── government_profiles policies ────────────────────────────────────────────
create policy "government_profiles: owner can read own" on public.government_profiles for
select using (owner_user_id = auth.uid ());

create policy "government_profiles: members can read their entity" on public.government_profiles for
select using (
        exists (
            select 1
            from public.government_members gm
            where
                gm.gov_id = government_profiles.id
                and gm.user_id = auth.uid ()
                and gm.status = 'active'
        )
    );

create policy "government_profiles: owner can insert" on public.government_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "government_profiles: owner can update" on public.government_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "admins read government profiles" on public.government_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── government_members policies ─────────────────────────────────────────────
create policy "government_members: member can read own membership" on public.government_members for
select using (user_id = auth.uid ());

create policy "government_members: entity owner can read all" on public.government_members for
select using (
        exists (
            select 1
            from public.government_profiles gp
            where
                gp.id = government_members.gov_id
                and gp.owner_user_id = auth.uid ()
        )
    );

create policy "government_members: active members can read co-members" on public.government_members for
select using (
        exists (
            select 1
            from public.government_members self
            where
                self.gov_id = government_members.gov_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "government_members: entity owner can insert" on public.government_members for
insert
with
    check (
        exists (
            select 1
            from public.government_profiles gp
            where
                gp.id = government_members.gov_id
                and gp.owner_user_id = auth.uid ()
        )
    );

create policy "government_members: entity owner can update" on public.government_members for
update using (
    exists (
        select 1
        from public.government_profiles gp
        where
            gp.id = government_members.gov_id
            and gp.owner_user_id = auth.uid ()
    )
);

create policy "admins read government members" on public.government_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── ngo_profiles policies ───────────────────────────────────────────────────
create policy "ngo_profiles: owner can read own" on public.ngo_profiles for
select using (owner_user_id = auth.uid ());

create policy "ngo_profiles: members can read their org" on public.ngo_profiles for
select using (
        exists (
            select 1
            from public.ngo_members nm
            where
                nm.ngo_id = ngo_profiles.id
                and nm.user_id = auth.uid ()
                and nm.status = 'active'
        )
    );

create policy "ngo_profiles: owner can insert" on public.ngo_profiles for
insert
with
    check (owner_user_id = auth.uid ());

create policy "ngo_profiles: owner can update" on public.ngo_profiles for
update using (owner_user_id = auth.uid ())
with
    check (owner_user_id = auth.uid ());

create policy "admins read ngo profiles" on public.ngo_profiles for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

-- ── ngo_members policies ────────────────────────────────────────────────────
create policy "ngo_members: member can read own membership" on public.ngo_members for
select using (user_id = auth.uid ());

create policy "ngo_members: org owner can read all" on public.ngo_members for
select using (
        exists (
            select 1
            from public.ngo_profiles np
            where
                np.id = ngo_members.ngo_id
                and np.owner_user_id = auth.uid ()
        )
    );

create policy "ngo_members: active members can read co-members" on public.ngo_members for
select using (
        exists (
            select 1
            from public.ngo_members self
            where
                self.ngo_id = ngo_members.ngo_id
                and self.user_id = auth.uid ()
                and self.status = 'active'
        )
    );

create policy "ngo_members: org owner can insert" on public.ngo_members for
insert
with
    check (
        exists (
            select 1
            from public.ngo_profiles np
            where
                np.id = ngo_members.ngo_id
                and np.owner_user_id = auth.uid ()
        )
    );

create policy "ngo_members: org owner can update" on public.ngo_members for
update using (
    exists (
        select 1
        from public.ngo_profiles np
        where
            np.id = ngo_members.ngo_id
            and np.owner_user_id = auth.uid ()
    )
);

create policy "admins read ngo members" on public.ngo_members for
select using (
        exists (
            select 1
            from public.profiles p
            where
                p.id = auth.uid ()
                and p.user_type = 'admin'
        )
    );

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

create policy "users read own attachments" on public.attachments for
select using (owner_user_id = auth.uid ());

drop policy if exists "users insert own attachments" on public.attachments;

create policy "users insert own attachments" on public.attachments for
insert
with
    check (owner_user_id = auth.uid ());

-- Admin audit events: user read own actions
drop policy if exists "users read own audit events" on public.admin_audit_events;

create policy "users read own audit events" on public.admin_audit_events for
select using (actor_id = auth.uid ());

-- Notifications: user read/update own
drop policy if exists "users read own notifications" on public.notifications;

create policy "users read own notifications" on public.notifications for
select using (user_id = auth.uid ());

drop policy if exists "users update own notifications" on public.notifications;

create policy "users update own notifications" on public.notifications for
update using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- =============================================================================
-- Done! All 8 entity tables created, RLS enabled, policies applied, triggers set.
-- =============================================================================
-- ============================================================
-- Migration: 20260616_production_readiness_fixes.sql
-- Purpose:  Production readiness — schema fixes, RLS policy
--           updates, and trigger enhancements.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. ADD MISSING COLUMNS
-- ────────────────────────────────────────────────────────────

-- 1a. lawyer_profiles: add is_accepting_clients (API expects it)
ALTER TABLE public.lawyer_profiles
ADD COLUMN IF NOT EXISTS is_accepting_clients BOOLEAN NOT NULL DEFAULT true;

-- 1b. profiles: add city column (frontend filters by city)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;

-- 1c. lawyer_profiles: add city column
ALTER TABLE public.lawyer_profiles
ADD COLUMN IF NOT EXISTS city TEXT;

-- ────────────────────────────────────────────────────────────
-- 2. FIX CONSTRAINTS
-- ────────────────────────────────────────────────────────────

-- 2a. attachments: make request_id nullable for general doc uploads
ALTER TABLE public.attachments
ALTER COLUMN request_id
DROP NOT NULL;

-- 2b. service_requests: add 'pending' to status constraint
--     (non-breaking: keeps all existing values + adds 'pending')
ALTER TABLE public.service_requests
DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE public.service_requests
ADD CONSTRAINT service_requests_status_check CHECK (
    status IN (
        'draft',
        'pending',
        'pending_payment',
        'pending_assignment',
        'assigned',
        'in_review',
        'completed',
        'cancelled'
    )
);

-- ────────────────────────────────────────────────────────────
-- 3. FIX RLS POLICIES — Service Requests (Marketplace)
-- ────────────────────────────────────────────────────────────

-- Drop old restrictive policy
DROP POLICY IF EXISTS "clients read their own service requests" ON public.service_requests;

DROP POLICY IF EXISTS "service_requests_select_policy" ON public.service_requests;

-- New policy: clients see own + lawyers see assigned OR unassigned (marketplace)
CREATE POLICY "service_requests_select_policy" ON public.service_requests FOR
SELECT USING (
        -- Creator can always read
        requester_user_id = auth.uid ()
        -- Assigned lawyer can read
        OR assigned_to = auth.uid ()
        -- Verified lawyers can browse unassigned requests in marketplace
        OR (
            EXISTS (
                SELECT 1
                FROM public.lawyer_profiles
                WHERE
                    lawyer_profiles.user_id = auth.uid ()
                    AND lawyer_profiles.verification_status = 'verified'
            )
            AND assigned_to IS NULL
            AND status IN (
                'pending', 'pending_assignment'
            )
        )
    );

-- ────────────────────────────────────────────────────────────
-- 4. FIX RLS POLICIES — Attachments (unified)
-- ────────────────────────────────────────────────────────────

-- Drop conflicting attachment policies
DROP POLICY IF EXISTS "participants read attachments" ON public.attachments;

DROP POLICY IF EXISTS "users read own attachments" ON public.attachments;

DROP POLICY IF EXISTS "attachments_select_policy" ON public.attachments;

DROP POLICY IF EXISTS "attachments_insert_policy" ON public.attachments;

-- Unified SELECT: owner OR participant in the linked service request
CREATE POLICY "attachments_select_policy" ON public.attachments FOR
SELECT USING (
        owner_user_id = auth.uid ()
        OR (
            request_id IS NOT NULL
            AND EXISTS (
                SELECT 1
                FROM public.service_requests
                WHERE
                    service_requests.id = attachments.request_id
                    AND (
                        service_requests.requester_user_id = auth.uid ()
                        OR service_requests.assigned_to = auth.uid ()
                    )
            )
        )
    );

-- INSERT: owner must match authenticated user
CREATE POLICY "attachments_insert_policy" ON public.attachments FOR
INSERT
WITH
    CHECK (owner_user_id = auth.uid ());

-- ────────────────────────────────────────────────────────────
-- 5. UPDATE handle_new_user() TRIGGER
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := COALESCE(new.raw_user_meta_data->>'user_type', 'individual');

  -- Create base profile
  INSERT INTO public.profiles (id, display_name, email, user_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
    new.email,
    v_user_type
  )
  ON CONFLICT (id) DO NOTHING;

  -- Provision role-specific profiles
  IF v_user_type = 'lawyer' THEN
    INSERT INTO public.lawyer_profiles (user_id, is_accepting_clients)
    VALUES (new.id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'provider' THEN
    INSERT INTO public.provider_profiles (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type IN ('firm', 'corporate') THEN
    INSERT INTO public.firm_profiles (owner_user_id, name_ar, name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'جهة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Entity')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'micro' THEN
    INSERT INTO public.micro_profiles (user_id, business_name)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'business_name', 'نشاط تجاري جديد')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Create default user settings
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- 6. DONE
-- ────────────────────────────────────────────────────────────
-- Execute this file in Supabase SQL Editor.
-- Then deploy the Next.js application.

-- ============================================================
-- Migration: 20260617_fix_remaining_rls.sql
-- Purpose:   Fix remaining RLS policy issues
--
--   1. Entity admin policies reference p.role instead of p.user_type
--   2. research_items has no direct user access policy (needs user_id column)
--   3. admin_audit_events has no user-facing SELECT policy
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════
-- ISSUE 1: Entity admin READ policies use p.role instead of p.user_type
--
-- The profiles table has `user_type`, not `role`.
-- Drop and recreate on all 8 entity tables.
-- ════════════════════════════════════════════════════════════════

-- firm_profiles
DROP POLICY IF EXISTS "admins read all firm_profiles" ON public.firm_profiles;

CREATE POLICY "admins read all firm_profiles" ON public.firm_profiles FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- firm_members
DROP POLICY IF EXISTS "admins read all firm_members" ON public.firm_members;

CREATE POLICY "admins read all firm_members" ON public.firm_members FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- business_profiles
DROP POLICY IF EXISTS "admins read all business_profiles" ON public.business_profiles;

CREATE POLICY "admins read all business_profiles" ON public.business_profiles FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- business_members
DROP POLICY IF EXISTS "admins read all business_members" ON public.business_members;

CREATE POLICY "admins read all business_members" ON public.business_members FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- government_profiles
DROP POLICY IF EXISTS "admins read all government_profiles" ON public.government_profiles;

CREATE POLICY "admins read all government_profiles" ON public.government_profiles FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- government_members
DROP POLICY IF EXISTS "admins read all government_members" ON public.government_members;

CREATE POLICY "admins read all government_members" ON public.government_members FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- ngo_profiles
DROP POLICY IF EXISTS "admins read all ngo_profiles" ON public.ngo_profiles;

CREATE POLICY "admins read all ngo_profiles" ON public.ngo_profiles FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- ngo_members
DROP POLICY IF EXISTS "admins read all ngo_members" ON public.ngo_members;

CREATE POLICY "admins read all ngo_members" ON public.ngo_members FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

-- ════════════════════════════════════════════════════════════════
-- ISSUE 2: research_items has no direct user access policy
--
-- The table only has session_id (no user_id column).
-- Desktop feature sets session_id to null, so we need a direct
-- user_id column and policies that check both paths.
-- ════════════════════════════════════════════════════════════════

-- Step 1: Add user_id column (nullable, since existing rows don't have it)
ALTER TABLE public.research_items
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Step 2: Backfill user_id from research_sessions for existing rows
UPDATE public.research_items ri
SET
    user_id = rs.user_id
FROM public.research_sessions rs
WHERE
    ri.session_id = rs.id
    AND ri.user_id IS NULL;

-- Step 3: Index for the new column
CREATE INDEX IF NOT EXISTS idx_research_items_user_id ON public.research_items (user_id);

-- Step 4: Drop existing session-only policies and create new dual-path policies
DROP POLICY IF EXISTS "users read own research items" ON public.research_items;

CREATE POLICY "users read own research items" ON public.research_items FOR
SELECT USING (
        user_id = auth.uid ()
        OR EXISTS (
            SELECT 1
            FROM public.research_sessions rs
            WHERE
                rs.id = research_items.session_id
                AND rs.user_id = auth.uid ()
        )
    );

DROP POLICY IF EXISTS "users manage own research items" ON public.research_items;

CREATE POLICY "users manage own research items" ON public.research_items FOR ALL USING (user_id = auth.uid ())
WITH
    CHECK (user_id = auth.uid ());

-- ════════════════════════════════════════════════════════════════
-- ISSUE 3: admin_audit_events has no user-facing SELECT policy
--
-- Column verified: actor_id (uuid, references profiles.id)
-- Allow users to read their own audit events, admins read all.
-- ════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "users read own audit events" ON public.admin_audit_events;

CREATE POLICY "users read own audit events" ON public.admin_audit_events FOR
SELECT USING (
        actor_id = auth.uid ()
        OR EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE
                p.id = auth.uid ()
                AND p.user_type = 'admin'
        )
    );

COMMIT;

-- =============================================================================
-- Migration: 20260625_fix_rls_recursion.sql
-- Purpose:   Resolve infinite recursion in RLS policies for:
--            1. public.profiles (self-referencing admin read policy)
--            2. public.groups and public.group_members (circular references)
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. FIX: public.profiles Infinite Recursion
-- ═════════════════════════════════════════════════════════════════════════════

-- Create a security definer helper to check if a user is an admin.
-- Since it runs with definer security, it bypasses RLS checks on profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND user_type = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_admin () IS 'Bypasses RLS to safely check if the current user is an admin.';

-- Drop the old policy that was self-referential
DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;

-- Create the new non-recursive policy
CREATE POLICY "admins read all profiles" ON public.profiles FOR
SELECT USING (public.is_admin ());

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. FIX: public.groups & public.group_members Circular Reference
-- ═════════════════════════════════════════════════════════════════════════════

-- Create a security definer helper to check group ownership or active membership.
-- This breaks the cycle where groups select checks group_members and vice versa.
CREATE OR REPLACE FUNCTION public.is_group_member_or_owner(p_group_id uuid, p_user_id uuid)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.groups
    WHERE id = p_group_id AND owner_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND status = 'active'
  );
$$;

COMMENT ON FUNCTION public.is_group_member_or_owner (uuid, uuid) IS 'Bypasses RLS to check group ownership or active membership.';

-- Drop old circular policies
DROP POLICY IF EXISTS "group members read their groups" ON public.groups;

DROP POLICY IF EXISTS "group members read membership" ON public.group_members;

-- Recreate with non-recursive security definer function checks
CREATE POLICY "group members read their groups" ON public.groups FOR
SELECT USING (
        public.is_group_member_or_owner (id, auth.uid ())
    );

CREATE POLICY "group members read membership" ON public.group_members FOR
SELECT USING (
        public.is_group_member_or_owner (group_id, auth.uid ())
    );

COMMIT;

-- =============================================================================
-- Legal Library · Full Schema Migration
-- =============================================================================
-- Created:  2026-06-26
-- Schema:   library
-- Tables:   17  (laws, chapters, articles, article_amendments,
--                decrees_circulars, decree_pages,
--                judicial_collections, principles, principle_paragraphs,
--                feqh_books, feqh_chapters, feqh_sections, feqh_blocks,
--                smart_folders, smart_folder_items, invitations, issue_reports)
-- Features: Arabic full-text search, GIN indexes, B-tree indexes,
--           RLS policies, cross-section search materialized view
-- =============================================================================

begin;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  0. SCHEMA                                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create schema if not exists library;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. ARABIC FULL-TEXT SEARCH CONFIGURATION                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Arabic text search config — uses simple dictionary (no stemmer) which works
-- better for Arabic than the default English config. The simple dictionary
-- lower-cases and strips diacritics, giving us workable Arabic FTS.

do $$
begin
  if not exists (
    select 1 from pg_ts_config where cfgname = 'arabic'
      and cfgnamespace = (select oid from pg_namespace where nspname = 'library')
  ) then
    execute 'create text search configuration library.arabic (copy = simple)';
    comment on text search configuration library.arabic
      is 'Arabic full-text search configuration based on simple dictionary — strips diacritics and tokenizes Arabic text.';
  end if;
end;
$$;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. TRIGGER FUNCTION: auto-set updated_at                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function library.handle_updated_at()
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

comment on function library.handle_updated_at () is 'Sets updated_at = now() before every UPDATE. Attached to all library tables.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION A: LAWS & REGULATIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A1. library.laws                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.laws (
  slug                   varchar(200)  primary key,
  title                  text          not null,
  title_en               text,
  type                   varchar(50)   not null default 'law',
  description            text,
  section_code           varchar(20),
  section_name           varchar(200),
  issuing_body           varchar(200),
  issuing_instrument     varchar(200),
  issue_date_hijri       varchar(20),
  publication_date_hijri varchar(20),
  effective_date_hijri   varchar(20),
  boe_source_url         text,
  official_source_url    text,
  total_articles         int           default 0,
  status                 varchar(30)   not null default 'active',
  preamble               text,
  article_status_summary jsonb         default '{}'::jsonb,
  latest_update          jsonb,
  has_merged_regulation  boolean       not null default false,

-- FTS column — auto-populated by trigger
fts                    tsvector      generated always as (
                           to_tsvector('library.arabic', coalesce(title, '') || ' ' || coalesce(description, ''))
                         ) stored,

  created_at             timestamptz   not null default now(),
  updated_at             timestamptz   not null default now()
);

create trigger trg_laws_updated_at
  before update on library.laws
  for each row execute function library.handle_updated_at();

comment on
table library.laws is 'Saudi laws and regulations master table.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A2. library.chapters                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.chapters (
    id uuid primary key default gen_random_uuid (),
    law_slug varchar(200) not null references library.laws (slug) on delete cascade,
    number int not null,
    title text not null,
    order_index int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_chapters_updated_at
  before update on library.chapters
  for each row execute function library.handle_updated_at();

comment on
table library.chapters is 'Chapters within a law, used to group articles.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A3. library.articles                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.articles (
  id                  varchar(150)  primary key,  -- e.g. 'art-1'
  law_slug            varchar(200)  not null references library.laws(slug) on delete cascade,
  chapter_id          uuid          references library.chapters(id) on delete set null,
  number              varchar(20),
  number_text         varchar(50),
  title               text,
  status              varchar(30)   not null default 'active',
  text                text,
  executive_reg_text  text,
  executive_reg_ref   text,
  instrument          varchar(200),
  free                boolean       not null default true,
  order_index         int           not null default 0,

-- FTS column — indexes article body + executive regulation text
fts                 tsvector      generated always as (
                        to_tsvector('library.arabic',
                          coalesce(title, '') || ' ' ||
                          coalesce(text, '')  || ' ' ||
                          coalesce(executive_reg_text, '')
                        )
                      ) stored,

  created_at          timestamptz   not null default now(),
  updated_at          timestamptz   not null default now()
);

create trigger trg_articles_updated_at
  before update on library.articles
  for each row execute function library.handle_updated_at();

comment on
table library.articles is 'Individual articles within a law.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  A4. library.article_amendments                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.article_amendments (
    id uuid primary key default gen_random_uuid (),
    article_id varchar(150) not null references library.articles (id) on delete cascade,
    date text,
    source text,
    type text,
    summary text,
    full_text text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_article_amendments_updated_at
  before update on library.article_amendments
  for each row execute function library.handle_updated_at();

comment on
table library.article_amendments is 'Amendment history for individual articles.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION B: DECREES & CIRCULARS
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  B1. library.decrees_circulars                                          ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.decrees_circulars (
  id            uuid          primary key default gen_random_uuid(),
  title         text          not null,
  type          varchar(30)   not null check (type in ('royal', 'cabinet', 'circular')),
  issuer        text,
  ref           text,
  date          text,
  summary       text,
  summary_brief text,
  category      varchar(100),
  preamble      text,
  hashtags      text[]        default '{}',
  official_url  text,

-- FTS column
fts           tsvector      generated always as (
                  to_tsvector('library.arabic',
                    coalesce(title, '') || ' ' ||
                    coalesce(summary, '') || ' ' ||
                    coalesce(summary_brief, '')
                  )
                ) stored,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_decrees_circulars_updated_at
  before update on library.decrees_circulars
  for each row execute function library.handle_updated_at();

comment on
table library.decrees_circulars is 'Royal decrees, cabinet decisions, and ministerial circulars.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  B2. library.decree_pages                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.decree_pages (
    id uuid primary key default gen_random_uuid (),
    decree_id uuid not null references library.decrees_circulars (id) on delete cascade,
    page_number int not null,
    content text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_decree_pages_updated_at
  before update on library.decree_pages
  for each row execute function library.handle_updated_at();

comment on
table library.decree_pages is 'Paginated content of decrees and circulars.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION C: JUDICIAL PRINCIPLES
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  C1. library.judicial_collections                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.judicial_collections (
    id varchar(100) primary key,
    title text not null,
    court text,
    year_hijri int,
    part int,
    source_id varchar(100),
    track varchar(100),
    description text,
    ruling_count int default 0,
    free boolean not null default false,
    progress int default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_judicial_collections_updated_at
  before update on library.judicial_collections
  for each row execute function library.handle_updated_at();

comment on
table library.judicial_collections is 'Collections of judicial principles organized by court, year, and track.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  C2. library.principles                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.principles (
  id              varchar(150)  primary key,
  collection_id   varchar(100)  not null references library.judicial_collections(id) on delete cascade,
  principle_number varchar(50),
  issuing_body    text,
  session_date    text,
  decision_number text,
  reference       text,
  text            text,
  ruling_basis    text,
  facts           text,
  reasons         text,
  ruling          text,
  year_hijri      int,
  order_index     int           not null default 0,

-- FTS column
fts             tsvector      generated always as (
                    to_tsvector('library.arabic',
                      coalesce(text, '')         || ' ' ||
                      coalesce(ruling_basis, '') || ' ' ||
                      coalesce(facts, '')        || ' ' ||
                      coalesce(reasons, '')      || ' ' ||
                      coalesce(ruling, '')
                    )
                  ) stored,

  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create trigger trg_principles_updated_at
  before update on library.principles
  for each row execute function library.handle_updated_at();

comment on
table library.principles is 'Individual judicial principles within a collection.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  C3. library.principle_paragraphs                                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝


create table if not exists library.principle_paragraphs (
  id            uuid          primary key default gen_random_uuid(),
  principle_id  varchar(150)  not null references library.principles(id) on delete cascade,
  letter        varchar(10),
  text          text,
  keywords      text[]        default '{}',
  order_index   int           not null default 0,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_principle_paragraphs_updated_at
  before update on library.principle_paragraphs
  for each row execute function library.handle_updated_at();

comment on
table library.principle_paragraphs is 'Lettered paragraphs within a judicial principle, with keyword tags.';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION D: FIQH / JURISPRUDENCE BOOKS
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D1. library.feqh_books                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_books (
    id varchar(100) primary key,
    title text not null,
    author text,
    school text,
    type varchar(30) check (
        type in (
            'sharia',
            'comparative',
            'wadi'
        )
    ),
    category varchar(100),
    description text,
    investigator text,
    total_volumes int default 0,
    total_pages int default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_feqh_books_updated_at
  before update on library.feqh_books
  for each row execute function library.handle_updated_at();

comment on
table library.feqh_books is 'Islamic jurisprudence (fiqh) book catalogue.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D2. library.feqh_chapters                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_chapters (
    id uuid primary key default gen_random_uuid (),
    book_id varchar(100) not null references library.feqh_books (id) on delete cascade,
    title text not null,
    volume_number int,
    order_index int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_feqh_chapters_updated_at
  before update on library.feqh_chapters
  for each row execute function library.handle_updated_at();

comment on
table library.feqh_chapters is 'Chapter divisions within a fiqh book.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D3. library.feqh_sections                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_sections (
    id uuid primary key default gen_random_uuid (),
    chapter_id uuid not null references library.feqh_chapters (id) on delete cascade,
    title text not null,
    order_index int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_feqh_sections_updated_at
  before update on library.feqh_sections
  for each row execute function library.handle_updated_at();

comment on
table library.feqh_sections is 'Sections within a fiqh chapter.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  D4. library.feqh_blocks                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.feqh_blocks (
  id            varchar(150)  primary key,
  section_id    uuid          not null references library.feqh_sections(id) on delete cascade,
  topic         text,
  volume_number int,
  page_number   int,
  matn          text,
  sharh         text,
  hashiyah      jsonb,
  order_index   int           not null default 0,

-- FTS column — indexes topic, matn (core text), and sharh (commentary)
fts           tsvector      generated always as (
                  to_tsvector('library.arabic',
                    coalesce(topic, '') || ' ' ||
                    coalesce(matn, '')  || ' ' ||
                    coalesce(sharh, '')
                  )
                ) stored,

  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now()
);

create trigger trg_feqh_blocks_updated_at
  before update on library.feqh_blocks
  for each row execute function library.handle_updated_at();

comment on
table library.feqh_blocks is 'Content blocks within a fiqh section: matn (core text), sharh (commentary), hashiyah (marginal notes).';

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION E: USER FEATURES
-- ═══════════════════════════════════════════════════════════════════════════

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E1. library.smart_folders                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.smart_folders (
    id uuid primary key default gen_random_uuid (),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null,
    color varchar(30),
    icon varchar(50),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_smart_folders_updated_at
  before update on library.smart_folders
  for each row execute function library.handle_updated_at();

comment on
table library.smart_folders is 'User-created folders for organizing saved library items.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E2. library.smart_folder_items                                         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.smart_folder_items (
    id uuid primary key default gen_random_uuid (),
    folder_id uuid not null references library.smart_folders (id) on delete cascade,
    entity_type varchar(50) not null, -- 'article', 'principle', 'decree', 'feqh_block'
    entity_id text not null,
    created_at timestamptz not null default now()
);

comment on
table library.smart_folder_items is 'Polymorphic items saved into a smart folder.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E3. library.invitations                                                ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.invitations (
    id uuid primary key default gen_random_uuid (),
    code varchar(50) not null unique,
    max_uses int not null default 1,
    current_uses int not null default 0,
    expires_at timestamptz,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_invitations_updated_at
  before update on library.invitations
  for each row execute function library.handle_updated_at();

comment on
table library.invitations is 'Invitation codes for gated access to premium library content.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  E4. library.issue_reports                                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists library.issue_reports (
    id uuid primary key default gen_random_uuid (),
    user_id uuid references auth.users (id) on delete set null,
    entity_type varchar(50) not null,
    entity_id text not null,
    report_type varchar(50) not null,
    description text,
    status varchar(30) not null default 'pending',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create trigger trg_issue_reports_updated_at
  before update on library.issue_reports
  for each row execute function library.handle_updated_at();

comment on
table library.issue_reports is 'User-submitted issue reports for library content.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. INDEXES — GIN (full-text + arrays)                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- FTS GIN indexes
create index if not exists idx_laws_fts on library.laws using gin (fts);

create index if not exists idx_articles_fts on library.articles using gin (fts);

create index if not exists idx_decrees_circulars_fts on library.decrees_circulars using gin (fts);

create index if not exists idx_principles_fts on library.principles using gin (fts);

create index if not exists idx_feqh_blocks_fts on library.feqh_blocks using gin (fts);

-- Array GIN indexes (hashtags, keywords)
create index if not exists idx_decrees_circulars_hashtags on library.decrees_circulars using gin (hashtags);

create index if not exists idx_principle_paragraphs_keywords on library.principle_paragraphs using gin (keywords);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  4. INDEXES — B-tree (filter columns)                                   ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- laws
create index if not exists idx_laws_status on library.laws (status);

create index if not exists idx_laws_type
  on library.laws (type);

create index if not exists idx_laws_section_code on library.laws (section_code);

-- articles
create index if not exists idx_articles_law_slug on library.articles (law_slug);

create index if not exists idx_articles_status on library.articles (status);

create index if not exists idx_articles_chapter_id on library.articles (chapter_id);

-- chapters
create index if not exists idx_chapters_law_slug on library.chapters (law_slug);

-- article_amendments
create index if not exists idx_article_amendments_article_id on library.article_amendments (article_id);

-- decrees_circulars
create index if not exists idx_decrees_circulars_type
  on library.decrees_circulars (type);

create index if not exists idx_decrees_circulars_issuer on library.decrees_circulars (issuer);

create index if not exists idx_decrees_circulars_category on library.decrees_circulars (category);

-- judicial_collections
create index if not exists idx_judicial_collections_year_hijri on library.judicial_collections (year_hijri);

create index if not exists idx_judicial_collections_track on library.judicial_collections (track);

create index if not exists idx_judicial_collections_source_id on library.judicial_collections (source_id);

-- principles
create index if not exists idx_principles_collection_id on library.principles (collection_id);

create index if not exists idx_principles_year_hijri on library.principles (year_hijri);

-- principle_paragraphs
create index if not exists idx_principle_paragraphs_principle_id on library.principle_paragraphs (principle_id);

-- feqh_books
create index if not exists idx_feqh_books_type
  on library.feqh_books (type);

create index if not exists idx_feqh_books_category on library.feqh_books (category);

create index if not exists idx_feqh_books_school on library.feqh_books (school);

-- feqh_chapters
create index if not exists idx_feqh_chapters_book_id on library.feqh_chapters (book_id);

-- feqh_sections
create index if not exists idx_feqh_sections_chapter_id on library.feqh_sections (chapter_id);

-- feqh_blocks
create index if not exists idx_feqh_blocks_section_id on library.feqh_blocks (section_id);

-- decree_pages
create index if not exists idx_decree_pages_decree_id on library.decree_pages (decree_id);

-- smart_folders
create index if not exists idx_smart_folders_user_id on library.smart_folders (user_id);

-- smart_folder_items
create index if not exists idx_smart_folder_items_folder_id on library.smart_folder_items (folder_id);

create index if not exists idx_smart_folder_items_entity on library.smart_folder_items (entity_type, entity_id);

-- invitations
create index if not exists idx_invitations_code on library.invitations (code);

-- issue_reports
create index if not exists idx_issue_reports_status on library.issue_reports (status);

create index if not exists idx_issue_reports_entity on library.issue_reports (entity_type, entity_id);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  5. CROSS-SECTION SEARCH — Materialized View                           ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- Unified view across all searchable content for the global search bar.
-- Refresh periodically via cron or after bulk data loads:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY library.cross_section_search;


create materialized view if not exists library.cross_section_search as
select
  'article'::text       as entity_type,
  a.id::text            as entity_id,
  l.title               as parent_title,
  coalesce(a.title, 'مادة ' || a.number) as title,
  left(a.text, 500)     as snippet,
  a.fts                 as fts,
  a.created_at          as created_at
from library.articles a
join library.laws l on l.slug = a.law_slug

union all

select
  'principle'::text     as entity_type,
  p.id::text            as entity_id,
  jc.title              as parent_title,
  'مبدأ رقم ' || coalesce(p.principle_number, '') as title,
  left(p.text, 500)     as snippet,
  p.fts                 as fts,
  p.created_at          as created_at
from library.principles p
join library.judicial_collections jc on jc.id = p.collection_id

union all

select
  'decree'::text        as entity_type,
  dc.id::text           as entity_id,
  null                  as parent_title,
  dc.title              as title,
  left(dc.summary, 500) as snippet,
  dc.fts                as fts,
  dc.created_at         as created_at
from library.decrees_circulars dc

union all

select
  'feqh_block'::text    as entity_type,
  fb.id::text           as entity_id,
  bk.title              as parent_title,
  fb.topic              as title,
  left(fb.matn, 500)    as snippet,
  fb.fts                as fts,
  fb.created_at         as created_at
from library.feqh_blocks fb
join library.feqh_sections fs on fs.id = fb.section_id
join library.feqh_chapters fc on fc.id = fs.chapter_id
join library.feqh_books bk   on bk.id = fc.book_id
with no data;
-- populate on first refresh

-- Unique index required for CONCURRENTLY refresh
create unique index if not exists idx_cross_section_search_pk on library.cross_section_search (entity_type, entity_id);

create index if not exists idx_cross_section_search_fts on library.cross_section_search using gin (fts);

comment on materialized view library.cross_section_search is 'Unified search index across articles, principles, decrees, and fiqh blocks. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY library.cross_section_search;';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  6. ROW LEVEL SECURITY                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ---------------------------------------------------------------------------
-- 6a. Enable RLS on ALL tables
-- ---------------------------------------------------------------------------
alter table library.laws enable row level security;

alter table library.chapters enable row level security;

alter table library.articles enable row level security;

alter table library.article_amendments enable row level security;

alter table library.decrees_circulars enable row level security;

alter table library.decree_pages enable row level security;

alter table library.judicial_collections enable row level security;

alter table library.principles enable row level security;

alter table library.principle_paragraphs enable row level security;

alter table library.feqh_books enable row level security;

alter table library.feqh_chapters enable row level security;

alter table library.feqh_sections enable row level security;

alter table library.feqh_blocks enable row level security;

alter table library.smart_folders enable row level security;

alter table library.smart_folder_items enable row level security;

alter table library.invitations enable row level security;

alter table library.issue_reports enable row level security;

-- ---------------------------------------------------------------------------
-- 6b. PUBLIC READ — content tables (anon + authenticated can SELECT)
-- ---------------------------------------------------------------------------
-- Macro: create read policies for all content tables

do $$
declare
  _tbl text;
begin
  foreach _tbl in array array[
    'library.laws',
    'library.chapters',
    'library.articles',
    'library.article_amendments',
    'library.decrees_circulars',
    'library.decree_pages',
    'library.judicial_collections',
    'library.principles',
    'library.principle_paragraphs',
    'library.feqh_books',
    'library.feqh_chapters',
    'library.feqh_sections',
    'library.feqh_blocks',
    'library.invitations'
  ]
  loop
    execute format(
      'create policy "Allow public read on %1$s" on %1$s for select to anon, authenticated using (true)',
      _tbl
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6c. SMART FOLDERS — owner-only CRUD
-- ---------------------------------------------------------------------------

-- Select: users see only their own folders
create policy "Users can view own folders" on library.smart_folders for
select to authenticated using (user_id = auth.uid ());

-- Insert: users can create folders for themselves
create policy "Users can create own folders" on library.smart_folders for
insert
    to authenticated
with
    check (user_id = auth.uid ());

-- Update: users can update their own folders
create policy "Users can update own folders" on library.smart_folders for
update to authenticated using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- Delete: users can delete their own folders
create policy "Users can delete own folders" on library.smart_folders for delete to authenticated using (user_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- 6d. SMART FOLDER ITEMS — access via folder ownership
-- ---------------------------------------------------------------------------

create policy "Users can view own folder items" on library.smart_folder_items for
select to authenticated using (
        folder_id in (
            select id
            from library.smart_folders
            where
                user_id = auth.uid ()
        )
    );

create policy "Users can add to own folders" on library.smart_folder_items for
insert
    to authenticated
with
    check (
        folder_id in (
            select id
            from library.smart_folders
            where
                user_id = auth.uid ()
        )
    );

create policy "Users can remove from own folders" on library.smart_folder_items for delete to authenticated using (
    folder_id in (
        select id
        from library.smart_folders
        where
            user_id = auth.uid ()
    )
);

-- ---------------------------------------------------------------------------
-- 6e. ISSUE REPORTS — authenticated users can create and view own
-- ---------------------------------------------------------------------------

create policy "Users can view own issue reports" on library.issue_reports for
select to authenticated using (user_id = auth.uid ());

create policy "Users can create issue reports" on library.issue_reports for
insert
    to authenticated
with
    check (user_id = auth.uid ());

create policy "Users can update own issue reports" on library.issue_reports for
update to authenticated using (user_id = auth.uid ())
with
    check (user_id = auth.uid ());

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  7. GRANT USAGE ON SCHEMA                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

grant usage on schema library to anon, authenticated, service_role;

grant select on all tables in schema library to anon, authenticated;

grant all on all tables in schema library to service_role;

grant all on all sequences in schema library to service_role;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  8. HELPER FUNCTION: Refresh cross-section search                       ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create or replace function library.refresh_cross_section_search()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  refresh materialized view concurrently library.cross_section_search;
end;
$$;

comment on function library.refresh_cross_section_search () is 'Refreshes the cross-section search materialized view. Call after bulk data loads or on a scheduled cron.';

-- Grant execute to service_role for cron jobs
grant
execute on function library.refresh_cross_section_search () to service_role;

commit;

-- =============================================================================
-- Platform Settings Migration
-- =============================================================================
-- Created:  2026-06-27
-- Table:    public.platform_settings
-- Purpose:  Admin-controlled platform configuration (library limits, etc.)
-- =============================================================================

begin;

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  1. PLATFORM SETTINGS TABLE                                             ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.platform_settings (
  key         text          primary key,
  value       jsonb         not null default '{}'::jsonb,
  description text,
  updated_by  uuid          references auth.users(id) on delete set null,
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

-- Auto-update timestamp
create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.handle_updated_at();

comment on
table public.platform_settings is 'Admin-controlled platform settings stored as key-value pairs with JSONB values.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. RLS POLICIES                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

alter table public.platform_settings enable row level security;

-- All authenticated users can read settings (needed for paywall checks)
create policy "Anyone can read platform settings" on public.platform_settings for
select using (true);

-- Only admins can modify settings (enforced at API level too)
create policy "Admins can modify platform settings" on public.platform_settings for all using (
    exists (
        select 1
        from public.profiles
        where
            profiles.id = auth.uid ()
            and profiles.user_type = 'admin'
    )
);

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  3. SEED DEFAULT SETTINGS                                               ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

insert into public.platform_settings (key, value, description) values
  (
    'library_free_article_limit',
    '{"default": 5}'::jsonb,
    'عدد المواد المجانية للمستخدمين غير المشتركين في كل نظام (القيمة الافتراضية)'
  ),
  (
    'library_whitelisted_laws',
    '{"slugs": []}'::jsonb,
    'الأنظمة المتاحة بالكامل مجاناً لجميع المستخدمين (نظام المرافعات، الإثبات، المعاملات المدنية)'
  ),
  (
    'library_free_law_overrides',
    '{"overrides": {}}'::jsonb,
    'تجاوزات فردية لعدد المواد المجانية لكل نظام — المفتاح هو slug النظام والقيمة هي العدد'
  ),
  (
    'tier_limits',
    '{
      "free":       {"cases": 5,  "contracts": 3,  "ai_credits": 20},
      "ai":         {"cases": 5,  "contracts": 3,  "ai_credits": 200},
      "pro":        {"cases": -1, "contracts": 20, "ai_credits": 1000},
      "max":        {"cases": -1, "contracts": -1, "ai_credits": 5000},
      "enterprise": {"cases": -1, "contracts": -1, "ai_credits": -1}
    }'::jsonb,
    'حدود الاستخدام لكل مستوى اشتراك — -1 يعني غير محدود'
  )
on conflict (key) do nothing;

commit;

-- Sync user metadata in auth.users table directly via SQL
UPDATE auth.users
SET raw_user_meta_data = 
  COALESCE(raw_user_meta_data, '{}'::jsonb) || '{"user_type": "admin", "tier": "pro"}'::jsonb
WHERE email = 'admin@nezamy.sa';
-- or WHERE id = 'YOUR_USER_ID';

-- 1. Set the role in the public profile table
UPDATE public.profiles
SET
    user_type = 'admin'
WHERE
    email = 'admin@nezamy.sa';
-- 👈 Replace with your email

-- 2. Sync it to Supabase Auth metadata so the frontend detects it
UPDATE auth.users
SET raw_user_meta_data = 
  coalesce(raw_user_meta_data, '{}'::jsonb) || '{"user_type": "admin", "tier": "pro"}'::jsonb
WHERE email = 'admin@nezamy.sa';
-- 👈 Replace with your email

-- Allow standalone documents (not tied to a specific request) so the client
-- "مستنداتي" page can accept general uploads. Previously request_id was NOT NULL
-- with a service_requests FK, which blocked the generic upload UI.
--
-- All statements run inside a single transaction so the migration is atomic and
-- safe to re-run (every create is preceded by a `drop policy if exists`, and the
-- bucket insert uses `on conflict do nothing`).
begin;

alter table public.attachments
alter column request_id
drop not null;

-- Storage bucket for user-uploaded documents. 100 MB per-object limit, private
-- (signed URLs used for download/preview so RLS controls access).
insert into
    storage.buckets (
        id,
        name,
        public,
        file_size_limit
    )
values (
        'documents',
        'documents',
        false,
        104857600
    ) on conflict (id) do nothing;

-- Enable RLS on storage.objects. This is idempotent (a no-op if already enabled)
-- and safe for other buckets: RLS only takes effect when policies exist, and every
-- policy below is scoped to `bucket_id = 'documents'`, so objects in any other
-- bucket remain unaffected (no policy = no access, the existing default).
-- Enable RLS on storage.objects.
-- NOTE: In some hosted environments, standard migration roles (like postgres) do not own storage.objects.
-- If you encounter ownership errors (ERROR: 42501), please comment out the lines below and set these policies
-- up manually in the Supabase Dashboard under Storage -> Policies.
--
-- alter table storage.objects enable row level security;
--
-- drop policy if exists "documents select own" on storage.objects;
-- create policy "documents select own"
--   on storage.objects for select
--   using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- drop policy if exists "documents insert own" on storage.objects;
-- create policy "documents insert own"
--   on storage.objects for insert
--   with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- drop policy if exists "documents update own" on storage.objects;
-- create policy "documents update own"
--   on storage.objects for update
--   using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
--   with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- drop policy if exists "documents delete own" on storage.objects;
-- create policy "documents delete own"
--   on storage.objects for delete
--   using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

commit;

-- 20260629_payments_and_storage_policies.sql
--
-- Payments schema hardening (runs cleanly via `npx supabase db push` OR the
-- Dashboard SQL Editor — public.payments is owned by the standard role).
--
--   1) payments.id: set a default (gen_random_uuid) so inserts that omit id no
--      longer hit NOT NULL-with-no-default 500s. The route still supplies an
--      explicit id via crypto.randomUUID(); the default makes the column robust
--      for any future callers.
--   2) payments.payer_user_id: optional column for future direct use. The
--      current API route stores the payer in `metadata.payer_user_id` for now;
--      this column is added for parity so a later migration can backfill +
--      promote it without a schema change.
--
-- NOTE: the storage.objects RLS policies for the `documents` bucket used to live
--   here but were REMOVED because `storage.objects` is owned by
--   `supabase_storage_admin` and the migration role is not its owner — running
--   them here fails with ERROR 42501 (must be owner of table objects) and, in a
--   single transaction, rolls back the payments changes too.
--   Apply the storage policies separately via:
--     `supabase/storage_policies_documents.sql`  (Dashboard → Storage → Policies)
begin;

-- ─── payments.id default ───────────────────────────────────────────────────
alter table public.payments
alter column id
set default gen_random_uuid ();

-- ─── payments.payer_user_id (optional, for future use) ─────────────────────
alter table public.payments
add column if not exists payer_user_id uuid references auth.users (id) on delete set null;

commit;

select 'gateway' as k, value::text as v from platform_settings where key='payments_gateway'
union all
select 'payments_id_default', column_default::text from information_schema.columns
  where table_name='payments' and column_name='id'
union all
select 'attachments_request_id_nullable', is_nullable
  from information_schema.columns where table_name='attachments' and column_name='request_id';

-- ============================================================
-- Migration: 20260630_handle_new_user_sectors.sql
-- Purpose:  Fix handle_new_user() trigger to provision the
--           missing sector profiles on signup:
--             - government  -> government_profiles
--             - ngo         -> ngo_profiles
--             - corporate   -> business_profiles (was firm_profiles)
--           Keeps lawyer / provider / firm / micro branches and
--           user_settings insert identical to 20260616.
--           Idempotent: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
-- ============================================================

begin;

-- ────────────────────────────────────────────────────────────
-- handle_new_user() — sector-aware version
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_user_type TEXT;
BEGIN
  v_user_type := COALESCE(new.raw_user_meta_data->>'user_type', 'individual');

  -- Create base profile
  INSERT INTO public.profiles (id, display_name, email, user_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
    new.email,
    v_user_type
  )
  ON CONFLICT (id) DO NOTHING;

  -- Provision role-specific profiles
  IF v_user_type = 'lawyer' THEN
    INSERT INTO public.lawyer_profiles (user_id, is_accepting_clients)
    VALUES (new.id, true)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'provider' THEN
    INSERT INTO public.provider_profiles (user_id)
    VALUES (new.id)
    ON CONFLICT (user_id) DO NOTHING;

  ELSIF v_user_type = 'firm' THEN
    INSERT INTO public.firm_profiles (owner_user_id, name_ar, name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'جهة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Entity')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'corporate' THEN
    -- Corporate entities use business_profiles (NOT firm_profiles).
    -- Required NOT NULL column without default: company_name_ar.
    INSERT INTO public.business_profiles (owner_user_id, company_name_ar, company_name_en)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'company_name', 'شركة جديدة'),
      COALESCE(new.raw_user_meta_data->>'company_name_en', 'New Company')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'government' THEN
    -- Required NOT NULL columns without defaults: entity_name_ar, entity_type.
    -- entity_type must satisfy CHECK (court|prosecution|ministry|authority|
    -- commission|municipality|other) -> fallback 'other'.
    INSERT INTO public.government_profiles (owner_user_id, entity_name_ar, entity_type)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'entity_name', 'جهة حكومية جديدة'),
      COALESCE(new.raw_user_meta_data->>'entity_type', 'other')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'ngo' THEN
    -- Required NOT NULL columns without defaults: org_name_ar, org_type.
    -- org_type must satisfy CHECK (charity|waqf|foundation|campaign|
    -- association|other) -> fallback 'other'.
    INSERT INTO public.ngo_profiles (owner_user_id, org_name_ar, org_type)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'org_name', 'منظمة جديدة'),
      COALESCE(new.raw_user_meta_data->>'org_type', 'other')
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_user_type = 'micro' THEN
    INSERT INTO public.micro_profiles (user_id, business_name)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'business_name', 'نشاط تجاري جديد')
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  -- Create default user settings
  INSERT INTO public.user_settings (user_id)
  VALUES (new.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────
-- Rebind the auth trigger (idempotent)
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

commit;

-- ============================================================
-- Execute this file in Supabase SQL Editor.
-- ============================================================