-- prelude_deadline_rules_seeded.sql — public.deadline_rules exactly as 20260904_phase5_deadline_radar.sql
-- creates and seeds it (its lines 76-117 and 331-359, copied verbatim by the
-- generator in the 20261016 batch), plus a minimal public.deadlines with three
-- rows, so 20261016_04 can be tested without the whole case-table chain.

-- owner_user_id NULL = a platform rule everyone can read. Set = a lawyer's own
-- rule (or, with firm_id, the firm's), governed by the usual owner-or-firm arm.
create table if not exists public.deadline_rules (
  id                       uuid primary key default gen_random_uuid(),
  code                     text not null,
  owner_user_id            uuid references auth.users(id) on delete cascade,
  firm_id                  uuid references public.firm_profiles(id) on delete set null,
  title_ar                 text not null check (length(btrim(title_ar)) > 0),
  description_ar           text not null default '',
  source_ar                text not null default '',
  -- what starts the clock
  trigger_kind             text not null default 'judgment'
                             check (trigger_kind in ('judgment', 'notification', 'hearing', 'stage_closed', 'manual')),
  -- the period
  period_days              int not null check (period_days > 0 and period_days <= 3660),
  calendar                 text not null default 'gregorian'
                             check (calendar in ('gregorian', 'hijri')),
  count_from_next_day      boolean not null default true,
  roll_forward_if_holiday  boolean not null default true,
  -- scope (NULL/empty = any)
  applies_to_degrees       text[] not null default '{}'
                             check (applies_to_degrees <@ array['first_instance','appeal','cassation','execution']::text[]),
  applies_to_case_types    text[] not null default '{}',
  -- governance
  is_platform_default      boolean not null default false,
  verified_by_owner        boolean not null default false,
  verified_at              timestamptz,
  active                   boolean not null default true,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on table  public.deadline_rules is 'قواعد المهل — platform defaults (owner_user_id null) plus a lawyer''s/firm''s own. The API evaluates them; this table only stores them.';
comment on column public.deadline_rules.verified_by_owner is 'false = «قاعدة افتراضية — تحتاج مراجعتك» on every screen. Only the owner flips it.';
comment on column public.deadline_rules.count_from_next_day is 'نظام المرافعات: the period starts the day after the event.';

-- One platform rule per code; a lawyer may override the same code once.
create unique index if not exists uq_deadline_rules_platform_code
  on public.deadline_rules (code) where owner_user_id is null;
create unique index if not exists uq_deadline_rules_owner_code
  on public.deadline_rules (owner_user_id, code) where owner_user_id is not null;

insert into public.deadline_rules
  (code, title_ar, description_ar, source_ar, trigger_kind, period_days, applies_to_degrees, is_platform_default)
values
  ('appeal_general',
   'الاعتراض بطلب الاستئناف',
   'ثلاثون يوماً من اليوم التالي لتسلّم صورة الحكم أو التبليغ به.',
   'نظام المرافعات الشرعية — المادة (١٨٧)',
   'judgment', 30, '{first_instance}', true),
  ('appeal_urgent',
   'الاعتراض بطلب الاستئناف — الدعاوى المستعجلة',
   'خمسة عشر يوماً من اليوم التالي لتسلّم صورة الحكم في الدعاوى المستعجلة.',
   'نظام المرافعات الشرعية — المادة (١٨٧)',
   'judgment', 15, '{first_instance}', true),
  ('cassation',
   'الاعتراض بطلب النقض',
   'ثلاثون يوماً من اليوم التالي لتسلّم صورة حكم محكمة الاستئناف.',
   'نظام المرافعات الشرعية — المادة (١٩٣)',
   'judgment', 30, '{appeal}', true),
  ('reconsideration',
   'التماس إعادة النظر',
   'ثلاثون يوماً من اليوم التالي لثبوت الواقعة المبرِّرة للالتماس.',
   'نظام المرافعات الشرعية — المادة (٢٠٠)',
   'manual', 30, '{}', true),
  ('criminal_objection',
   'الاعتراض على الحكم الجزائي',
   'ثلاثون يوماً من اليوم التالي لتسلّم صورة الحكم.',
   'نظام الإجراءات الجزائية — المادة (١٩٤)',
   'judgment', 30, '{first_instance,appeal}', true)
on conflict do nothing;

create table public.deadlines (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid,
  case_request_id text,
  rule_id       uuid references public.deadline_rules(id) on delete set null,
  trigger_date  date not null default current_date,
  due_date      date not null default current_date,
  days_count    int,
  status        text not null default 'open'
);
insert into public.deadlines (rule_id, days_count, status)
  select id, 15, 'open' from public.deadline_rules where code = 'appeal_urgent' and owner_user_id is null;
insert into public.deadlines (rule_id, days_count, status)
  select id, 15, 'done' from public.deadline_rules where code = 'appeal_urgent' and owner_user_id is null;
insert into public.deadlines (rule_id, days_count, status)
  select id, 30, 'open' from public.deadline_rules where code = 'appeal_general' and owner_user_id is null;
