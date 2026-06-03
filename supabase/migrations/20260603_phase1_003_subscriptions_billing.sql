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
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id text,
  discount_applied numeric(12,2) not null default 0,
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
create policy "anyone can read active subscription plans"
  on public.subscription_plans for select
  using (active = true);

-- subscriptions: users read their own
create policy "users read own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid());

create policy "users create own subscriptions"
  on public.subscriptions for insert
  with check (user_id = auth.uid());

create policy "users update own subscriptions"
  on public.subscriptions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- credit_packages: publicly readable
create policy "anyone can read active credit packages"
  on public.credit_packages for select
  using (active = true);

-- credit_transactions: users read their own
create policy "users read own credit transactions"
  on public.credit_transactions for select
  using (user_id = auth.uid());

create policy "users create own credit transactions"
  on public.credit_transactions for insert
  with check (user_id = auth.uid());

-- coupons: publicly readable (active only)
create policy "anyone can read active coupons"
  on public.coupons for select
  using (active = true);

-- coupon_usage: users read their own
create policy "users read own coupon usage"
  on public.coupon_usage for select
  using (user_id = auth.uid());

create policy "users create own coupon usage"
  on public.coupon_usage for insert
  with check (user_id = auth.uid());

-- promo_links: owners read/manage their own
create policy "owners read own promo links"
  on public.promo_links for select
  using (owner_user_id = auth.uid());

create policy "owners create own promo links"
  on public.promo_links for insert
  with check (owner_user_id = auth.uid());

create policy "owners update own promo links"
  on public.promo_links for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- escrow_transactions: buyer and seller can read
create policy "participants read escrow transactions"
  on public.escrow_transactions for select
  using (buyer_id = auth.uid() or seller_id = auth.uid());

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_subscription_plans_tier on public.subscription_plans(tier);
create index if not exists idx_subscription_plans_audience on public.subscription_plans(audience);
create index if not exists idx_subscriptions_user_id on public.subscriptions(user_id);
create index if not exists idx_subscriptions_status on public.subscriptions(status);
create index if not exists idx_subscriptions_entity on public.subscriptions(entity_id, entity_type);
create index if not exists idx_subscriptions_plan_id on public.subscriptions(plan_id);
create index if not exists idx_credit_transactions_user_id on public.credit_transactions(user_id);
create index if not exists idx_credit_transactions_kind on public.credit_transactions(kind);
create index if not exists idx_coupons_code on public.coupons(code);
create index if not exists idx_coupon_usage_user_id on public.coupon_usage(user_id);
create index if not exists idx_coupon_usage_coupon_id on public.coupon_usage(coupon_id);
create index if not exists idx_promo_links_owner on public.promo_links(owner_user_id);
create index if not exists idx_promo_links_code on public.promo_links(code);
create index if not exists idx_escrow_buyer on public.escrow_transactions(buyer_id);
create index if not exists idx_escrow_seller on public.escrow_transactions(seller_id);
create index if not exists idx_escrow_status on public.escrow_transactions(status);

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
insert into public.credit_packages (id, name_ar, name_en, price_sar, credits, bonus_pct, total_credits, validity_months, sort_order, active)
values
  ('direct', 'الدفع المباشر', 'Pay Per Service', 0, 0, 0, 0, 0, 0, true),
  ('basic', 'الأساسية', 'Basic', 1000, 1000, 50, 1500, 6, 1, true),
  ('advanced', 'المتقدمة', 'Advanced', 2500, 2500, 100, 5000, 6, 2, true),
  ('elite', 'النخبة', 'Elite', 5000, 5000, 150, 12500, 6, 3, true),
  ('royal', 'الملكية 👑', 'Royal 👑', 10000, 10000, 200, 30000, 12, 4, true)
on conflict (id) do update set
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
insert into public.coupons (code, discount_type, discount_value, max_uses, max_uses_per_user, valid_until, active)
values
  ('NZAMY50', 'fixed', 50, null, 1, '2027-12-31T23:59:59Z', true),
  ('NEWCLIENT', 'fixed', 75, null, 1, '2027-12-31T23:59:59Z', true),
  ('LAUNCH2026', 'percentage', 25, 500, 1, '2026-12-31T23:59:59Z', true)
on conflict (code) do nothing;
