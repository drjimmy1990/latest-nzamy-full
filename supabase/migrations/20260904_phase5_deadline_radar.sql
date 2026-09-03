-- =============================================================================
-- Migration: 20260904_phase5_deadline_radar.sql
-- Phase:     5 — رادار المهل  (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §9)
-- Purpose:   Real deadlines computed from real dates: a rules catalogue, the
--            court holidays that roll a deadline forward, the deadlines
--            themselves, and an outbox that cannot send the same reminder
--            twice.
--
-- Closes (matrix rows): 48 · 107 · 180 (the table side; 116 — contract
--                       renewals — waits for Phase 3's contracts tables)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS REPLACES
-- ─────────────────────────────────────────────────────────────────────────────
-- Today a «مهلة» is a diary entry (`hearings.kind = 'deadline'`) typed by hand
-- with a date the lawyer worked out themselves, and the AI «حاسبة المواعيد»
-- (src/app/ai/gov/deadline-calculator) adds days in Gregorian with no weekend,
-- no holiday and no statute behind its presets. Nothing reminds anyone of
-- anything: `20260706_reminder_flags.sql` added two booleans to consultations
-- that no scheduler ever reads.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 1 — DATE ARITHMETIC LIVES IN THE APPLICATION, NOT HERE
-- ─────────────────────────────────────────────────────────────────────────────
-- Saudi filing periods are counted in days from the day AFTER the triggering
-- event, and a period whose last day falls on a weekend or an official holiday
-- runs to the next working day (نظام المرافعات الشرعية، م. ٢٢). Two of the
-- official holidays (الفطر، الأضحى) are Hijri dates that move every Gregorian
-- year — and this database has no Umm al-Qura calendar; the application runtime
-- does (`Intl` `islamic-umalqura`, verified on the server build, and
-- `src/lib/services/hijri.ts` is the one calendar the whole platform uses).
-- So the API computes `due_date`, records HOW it got there (`days_count`,
-- `rolled_from_holiday`), and this file only stores rules, holidays and
-- results. A rule table this file could not evaluate itself is still the
-- right place for the rules: they are data the owner must be able to review.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 2 — SEEDED RULES ARE DEFAULTS, NOT LEGAL ADVICE
-- ─────────────────────────────────────────────────────────────────────────────
-- The five platform rules below carry the article each period comes from, and
-- `verified_by_owner = false`. Every screen must label such a rule «قاعدة
-- افتراضية — تحتاج مراجعتك» until the owner (a practising lawyer) confirms it.
-- A period this file gets wrong must never look authoritative to a lawyer.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 3 — ONE REMINDER PER (deadline, recipient, channel, kind), EVER
-- ─────────────────────────────────────────────────────────────────────────────
-- The plan's «قيد فريد حتى لا يُرسل التنبيه مرتين» is a UNIQUE constraint on
-- the outbox, not application discipline: a scheduler that runs twice, or two
-- schedulers, hit 23505 on the second insert and move on.
--
-- ⚠️ NOTHING IS DROPPED BY THIS FILE.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. Shared helpers (idempotent repeats)
-- ═════════════════════════════════════════════════════════════════════════════
create or replace function public.handle_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.can_access_case_row(p_owner uuid, p_firm uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (p_owner is not null and p_owner = auth.uid())
      or (p_firm is not null and exists (
            select 1 from public.firm_members fm
             where fm.firm_id = p_firm and fm.user_id = auth.uid() and fm.status = 'active'));
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. deadline_rules — قواعد المهل
-- ═════════════════════════════════════════════════════════════════════════════
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
create index if not exists idx_deadline_rules_firm on public.deadline_rules (firm_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. court_holidays — العطل الرسمية
-- ═════════════════════════════════════════════════════════════════════════════
-- Three shapes: a fixed Gregorian day every year, a Hijri day-range every year,
-- or an explicit date range (the yearly royal announcement, when it differs).
-- Weekend (Friday/Saturday) is not stored — it is a constant in the API.
create table if not exists public.court_holidays (
  id             uuid primary key default gen_random_uuid(),
  title_ar       text not null,
  kind           text not null check (kind in ('gregorian_fixed', 'hijri_recurring', 'date_range')),
  greg_month     int check (greg_month between 1 and 12),
  greg_day       int check (greg_day between 1 and 31),
  hijri_month    int check (hijri_month between 1 and 12),
  hijri_day      int check (hijri_day between 1 and 30),
  length_days    int not null default 1 check (length_days between 1 and 30),
  start_date     date,
  end_date       date,
  approximate    boolean not null default false,
  source_ar      text not null default '',
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint court_holidays_shape check (
    (kind = 'gregorian_fixed' and greg_month is not null and greg_day is not null)
    or (kind = 'hijri_recurring' and hijri_month is not null and hijri_day is not null)
    or (kind = 'date_range' and start_date is not null and end_date is not null and end_date >= start_date)
  )
);

comment on table  public.court_holidays is 'العطل الرسمية that roll a deadline forward. Hijri recurrences are resolved by the API with Umm al-Qura (Intl), not here.';
comment on column public.court_holidays.approximate is 'true = the exact days are announced yearly; the API treats the range as best-effort and the UI says so.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. deadlines — المهل
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.deadlines (
  id                    uuid primary key default gen_random_uuid(),
  owner_user_id         uuid not null references auth.users(id) on delete cascade,
  firm_id               uuid references public.firm_profiles(id) on delete set null,
  case_request_id       text references public.service_requests(id) on delete cascade,
  stage_id              uuid references public.case_stages(id) on delete set null,
  hearing_id            uuid references public.hearings(id) on delete set null,
  rule_id               uuid references public.deadline_rules(id) on delete set null,
  title                 text not null check (length(btrim(title)) > 0),
  kind                  text not null default 'statutory'
                          check (kind in ('statutory', 'court_order', 'internal', 'contract')),
  -- the event the clock started from, and where it landed
  trigger_date          date not null,
  due_date              date not null,
  due_date_hijri        text,
  days_count            int check (days_count is null or days_count > 0),
  computed_by_rule      boolean not null default false,
  rolled_from_holiday   boolean not null default false,
  reminder_offsets_days int[] not null default '{7,3,1}',
  priority              text not null default 'high'
                          check (priority in ('urgent', 'high', 'normal')),
  status                text not null default 'open'
                          check (status in ('open', 'done', 'missed', 'cancelled')),
  completed_at          timestamptz,
  notes                 text not null default '',
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint deadlines_due_after_trigger check (due_date >= trigger_date)
);

comment on table  public.deadlines is 'المهل — one row per deadline. due_date is computed by the API from a rule (computed_by_rule) or typed (manual); both are wall-clock dates.';
comment on column public.deadlines.reminder_offsets_days is 'Days before due_date at which a reminder is queued; the scheduler materialises these into notification_outbox rows.';

create index if not exists idx_deadlines_owner   on public.deadlines (owner_user_id);
create index if not exists idx_deadlines_firm    on public.deadlines (firm_id);
create index if not exists idx_deadlines_case    on public.deadlines (case_request_id);
create index if not exists idx_deadlines_due     on public.deadlines (due_date) where status = 'open';


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. notification_outbox — التنبيهات المُجدوَلة (DECISION 3)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.notification_outbox (
  id                 uuid primary key default gen_random_uuid(),
  deadline_id        uuid references public.deadlines(id) on delete cascade,
  recipient_user_id  uuid not null references auth.users(id) on delete cascade,
  channel            text not null default 'in_app'
                       check (channel in ('in_app', 'email', 'whatsapp')),
  kind               text not null,
  scheduled_for      timestamptz not null,
  payload            jsonb not null default '{}'::jsonb,
  status             text not null default 'pending'
                       check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts           int not null default 0,
  last_error         text,
  sent_at            timestamptz,
  created_at         timestamptz not null default now(),
  -- the plan's «قيد فريد حتى لا يُرسل التنبيه مرتين»
  constraint uq_notification_outbox_once unique (deadline_id, recipient_user_id, channel, kind)
);

comment on table public.notification_outbox is 'Reminders waiting to be delivered. UNIQUE (deadline, recipient, channel, kind): a second scheduler run cannot queue the same reminder twice.';

create index if not exists idx_notification_outbox_due
  on public.notification_outbox (scheduled_for) where status = 'pending';
create index if not exists idx_notification_outbox_recipient
  on public.notification_outbox (recipient_user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. updated_at triggers
-- ═════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_deadline_rules_updated_at on public.deadline_rules;
create trigger trg_deadline_rules_updated_at before update on public.deadline_rules
  for each row execute function public.handle_updated_at();
drop trigger if exists trg_court_holidays_updated_at on public.court_holidays;
create trigger trg_court_holidays_updated_at before update on public.court_holidays
  for each row execute function public.handle_updated_at();
drop trigger if exists trg_deadlines_updated_at on public.deadlines;
create trigger trg_deadlines_updated_at before update on public.deadlines
  for each row execute function public.handle_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.deadline_rules      enable row level security;
alter table public.court_holidays      enable row level security;
alter table public.deadlines           enable row level security;
alter table public.notification_outbox enable row level security;

-- ── deadline_rules: platform rules readable by everyone signed in; own/firm rules by their arm ──
drop policy if exists "deadline rules readable"            on public.deadline_rules;
create policy "deadline rules readable" on public.deadline_rules
  for select using (
    (owner_user_id is null and auth.uid() is not null)
    or public.can_access_case_row(owner_user_id, firm_id)
    or public.is_admin()
  );
drop policy if exists "deadline rules insertable by owner" on public.deadline_rules;
create policy "deadline rules insertable by owner" on public.deadline_rules
  for insert with check (
    (owner_user_id = auth.uid())
    or (owner_user_id is null and public.is_admin())
  );
drop policy if exists "deadline rules updatable by owner or firm" on public.deadline_rules;
create policy "deadline rules updatable by owner or firm" on public.deadline_rules
  for update using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin())
          with check (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());
drop policy if exists "deadline rules deletable by owner"  on public.deadline_rules;
create policy "deadline rules deletable by owner" on public.deadline_rules
  for delete using (owner_user_id = auth.uid() or public.is_admin());

-- ── court_holidays: readable by everyone signed in; admin maintains ──
drop policy if exists "holidays readable"      on public.court_holidays;
create policy "holidays readable" on public.court_holidays
  for select using (auth.uid() is not null);
drop policy if exists "holidays admin insert"  on public.court_holidays;
create policy "holidays admin insert" on public.court_holidays
  for insert with check (public.is_admin());
drop policy if exists "holidays admin update"  on public.court_holidays;
create policy "holidays admin update" on public.court_holidays
  for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "holidays admin delete"  on public.court_holidays;
create policy "holidays admin delete" on public.court_holidays
  for delete using (public.is_admin());

-- ── deadlines: the Phase 1 shape ──
drop policy if exists "deadlines readable by owner or firm"  on public.deadlines;
create policy "deadlines readable by owner or firm" on public.deadlines
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());
drop policy if exists "deadlines insertable by owner"        on public.deadlines;
create policy "deadlines insertable by owner" on public.deadlines
  for insert with check (owner_user_id = auth.uid());
drop policy if exists "deadlines updatable by owner or firm" on public.deadlines;
create policy "deadlines updatable by owner or firm" on public.deadlines
  for update using (public.can_access_case_row(owner_user_id, firm_id))
          with check (public.can_access_case_row(owner_user_id, firm_id));
drop policy if exists "deadlines deletable by owner"         on public.deadlines;
create policy "deadlines deletable by owner" on public.deadlines
  for delete using (owner_user_id = auth.uid());

-- ── notification_outbox: the recipient sees their own queue; the deadline's
--    owner/firm may queue and see reminders for it; the scheduler is
--    service-role and bypasses RLS. ──
drop policy if exists "outbox readable by recipient or deadline owner" on public.notification_outbox;
create policy "outbox readable by recipient or deadline owner" on public.notification_outbox
  for select using (
    recipient_user_id = auth.uid()
    or exists (select 1 from public.deadlines d
                where d.id = notification_outbox.deadline_id
                  and public.can_access_case_row(d.owner_user_id, d.firm_id))
    or public.is_admin()
  );
drop policy if exists "outbox insertable for an accessible deadline" on public.notification_outbox;
create policy "outbox insertable for an accessible deadline" on public.notification_outbox
  for insert with check (
    exists (select 1 from public.deadlines d
             where d.id = notification_outbox.deadline_id
               and public.can_access_case_row(d.owner_user_id, d.firm_id))
  );
drop policy if exists "outbox cancellable by deadline owner" on public.notification_outbox;
create policy "outbox cancellable by deadline owner" on public.notification_outbox
  for update using (
    exists (select 1 from public.deadlines d
             where d.id = notification_outbox.deadline_id
               and public.can_access_case_row(d.owner_user_id, d.firm_id))
  ) with check (status in ('pending', 'cancelled'));


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Seeds — platform rules and official holidays (DECISION 2)
-- ═════════════════════════════════════════════════════════════════════════════
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

insert into public.court_holidays (title_ar, kind, greg_month, greg_day, hijri_month, hijri_day, length_days, approximate, source_ar)
values
  ('اليوم الوطني',        'gregorian_fixed', 9,  23, null, null, 1, false, 'أمر ملكي — ٢٣ سبتمبر'),
  ('يوم التأسيس',         'gregorian_fixed', 2,  22, null, null, 1, false, 'أمر ملكي — ٢٢ فبراير'),
  ('عطلة عيد الفطر',      'hijri_recurring', null, null, 10, 1,  4, true,  'تُعلن سنوياً — تقريبية حتى تُحدَّث'),
  ('عطلة عيد الأضحى',     'hijri_recurring', null, null, 12, 9,  5, true,  'تُعلن سنوياً — تقريبية حتى تُحدَّث')
on conflict do nothing;

COMMIT;

-- =============================================================================
-- AFTER THIS RUNS
-- =============================================================================
-- ⛔ NOTHING CHANGES ON SCREEN YET. The radar page, the rules screen, the
--    auto-deadline on a recorded judgment and the scheduler endpoint are the
--    next commit. Deploy order: run THIS, deploy that code, then point a
--    scheduler (n8n cron or pm2) at POST /api/v1/cron/deadlines with the
--    CRON_SECRET header — the endpoint is documented in that commit.
--
-- ── Verify it applied (safe, read-only) ──────────────────────────────────────
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('deadline_rules','court_holidays','deadlines','notification_outbox')
--    order by table_name;                                -- expect 4 rows
--   select count(*) from public.deadline_rules where owner_user_id is null;   -- expect 5
--   select count(*) from public.court_holidays;                               -- expect 4
--   select tablename, count(*) from pg_policies where schemaname='public'
--      and tablename in ('deadline_rules','court_holidays','deadlines','notification_outbox')
--    group by tablename order by tablename;
--   -- expect: court_holidays 4 · deadline_rules 4 · deadlines 4 · notification_outbox 3
-- =============================================================================
