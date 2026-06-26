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

comment on table public.platform_settings
  is 'Admin-controlled platform settings stored as key-value pairs with JSONB values.';

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  2. RLS POLICIES                                                        ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

alter table public.platform_settings enable row level security;

-- All authenticated users can read settings (needed for paywall checks)
create policy "Anyone can read platform settings"
  on public.platform_settings for select
  using (true);

-- Only admins can modify settings (enforced at API level too)
create policy "Admins can modify platform settings"
  on public.platform_settings for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
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
