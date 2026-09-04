-- =============================================================================
-- Migration: 20260906_phase6_settings_out_of_browser.sql
-- Phase:     6 — الإعدادات والخروج من المتصفح (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §10)
-- Purpose:   Every piece of USER DATA the app still keeps only in the browser
--            gets a home in the database. What may stay in the browser after
--            this phase: the theme, the sidebar state, a dismissed banner —
--            nothing a lawyer would miss on a second device.
--
-- Closes (matrix rows, table side): 91 · 92 · 93 (pin) · 97 · 151 · 173 · 186
--                                    · 46 / 156 / 188 (profile columns)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT WE FOUND (2026-09-04, read-only map of 142 localStorage call sites)
-- ─────────────────────────────────────────────────────────────────────────────
-- • Article sticky notes, VOICE MEMOS (base64 in localStorage!) and canvas
--   highlights have no server copy at all — a device change deletes a lawyer's
--   annotations. Pomodoro work sessions, feature requests, reading activity
--   and library issue reports: same.
-- • The plan's "user_law_folders" already exists as library.smart_folders /
--   smart_folder_items (20260626) — it only lacks the pin the UI keeps locally.
-- • research_items.item_type CHECK accepts fact/source/note/highlight/bookmark/
--   ai_output while the Collector sends text/precedent/case/principle/argument/
--   summary/research, and there is no title column: every real save fails.
-- • profiles has no city/nationality; lawyer_profiles has no licence issue
--   date or office address — so the profile tab saved to localStorage.
-- • attachments have no soft delete, no legal hold, no bin (item 186).
--
-- DECISION 1 — REUSE, DO NOT DUPLICATE: folders stay in library.smart_folders;
--   entity-specific settings go into the *_profiles.metadata jsonb that exists.
-- DECISION 2 — NO NATIONAL ID, NO BIRTH DATE IN CLEAR: the profile tab's
--   «رقم الهوية» field is dropped (Phase 2 rule: hash-only, on the client card).
-- DECISION 3 — DELETING A DOCUMENT IS A 30-DAY SOFT DELETE, AND A LEGAL HOLD
--   BLOCKS IT: rows keep deleted_at / deleted_by; the hourly cron purges rows
--   older than 30 days with no hold (row + storage object).
-- DECISION 4 — VOICE MEMOS GO TO STORAGE, NOT TO A COLUMN.
--
-- Idempotent. No DROP of tables, no DELETE, no data movement.
-- =============================================================================

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. smart folders — the pin (item 93)
-- ═════════════════════════════════════════════════════════════════════════════
do $$ begin
  if to_regclass('library.smart_folders') is not null then
    alter table library.smart_folders add column if not exists is_pinned boolean not null default false;
  end if;
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. law_article_notes — sticky notes, voice memos, highlights per page (item 151)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.law_article_notes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  page_id      text not null check (length(page_id) between 1 and 200),   -- the page key the UI already uses
  note_text    text not null default '',
  audio_path   text,                                                       -- object key in the documents bucket, never base64
  strokes      jsonb not null default '[]'::jsonb check (jsonb_typeof(strokes) = 'array'),
  position     jsonb,                                                      -- {x,y} of the note on the page
  is_visible   boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_law_article_notes_page unique (user_id, page_id)
);
create index if not exists idx_law_article_notes_user on public.law_article_notes (user_id, updated_at desc);
drop trigger if exists trg_law_article_notes_updated_at on public.law_article_notes;
create trigger trg_law_article_notes_updated_at before update on public.law_article_notes
  for each row execute function public.handle_updated_at();
alter table public.law_article_notes enable row level security;
drop policy if exists "article notes owner" on public.law_article_notes;
create policy "article notes owner" on public.law_article_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. work_sessions — the pomodoro / time log (item 97)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.work_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  mode          text not null default 'focus' check (mode in ('focus','short_break','long_break')),
  started_at    timestamptz not null,
  ended_at      timestamptz,
  duration_min  int not null check (duration_min between 1 and 600),
  completed     boolean not null default true,
  task_id       uuid,                                  -- public.tasks (Phase 1) when the session was on a task; no FK so a deleted task keeps the log
  label         text not null default '',
  created_at    timestamptz not null default now(),
  constraint work_sessions_span_check check (ended_at is null or ended_at >= started_at)
);
create index if not exists idx_work_sessions_user_started on public.work_sessions (user_id, started_at desc);
alter table public.work_sessions enable row level security;
drop policy if exists "work sessions owner" on public.work_sessions;
create policy "work sessions owner" on public.work_sessions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. research_items — accept what the Collector sends, and keep the title (items 92 · 173 · 91)
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.research_items
  add column if not exists title text not null default '',
  add column if not exists used  boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();
alter table public.research_items drop constraint if exists research_items_item_type_check;
alter table public.research_items add constraint research_items_item_type_check
  check (item_type in ('fact','source','note','highlight','bookmark','ai_output',
                       'text','precedent','case','principle','argument','summary','research'));
drop trigger if exists trg_research_items_updated_at on public.research_items;
create trigger trg_research_items_updated_at before update on public.research_items
  for each row execute function public.handle_updated_at();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. profile columns the settings tab needs (items 46 · 156 · 188)
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists city        text,
  add column if not exists nationality text;
alter table public.lawyer_profiles
  add column if not exists license_issued_on date,
  add column if not exists office_address    text;
-- entity-specific settings (CR, VAT, address, department…) live in the
-- existing *_profiles.metadata jsonb under the key "settings" — no new table.

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. feature_requests — what users ask for, readable by the admin (item 151)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.feature_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  title             text not null check (length(btrim(title)) between 3 and 160),
  description       text not null default '',
  category          text not null default 'other',
  priority          text not null default 'normal' check (priority in ('low','normal','high')),
  status            text not null default 'new' check (status in ('new','planned','implemented','declined')),
  implemented_note  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_feature_requests_user on public.feature_requests (user_id, created_at desc);
create index if not exists idx_feature_requests_status on public.feature_requests (status, created_at desc);
drop trigger if exists trg_feature_requests_updated_at on public.feature_requests;
create trigger trg_feature_requests_updated_at before update on public.feature_requests
  for each row execute function public.handle_updated_at();
alter table public.feature_requests enable row level security;
drop policy if exists "feature requests own read"   on public.feature_requests;
drop policy if exists "feature requests own insert" on public.feature_requests;
drop policy if exists "feature requests admin"      on public.feature_requests;
create policy "feature requests own read" on public.feature_requests for select
  using (user_id = auth.uid() or public.is_admin());
create policy "feature requests own insert" on public.feature_requests for insert
  with check (user_id = auth.uid());
create policy "feature requests admin" on public.feature_requests for update
  using (public.is_admin()) with check (public.is_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. library_issue_reports — «أبلغ عن خطأ في هذه المادة», readable by the admin
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.library_issue_reports (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete set null,
  law_slug     text not null,
  article_ref  text not null default '',
  kind         text not null default 'other'
                 check (kind in ('typo','wrong_text','missing_article','outdated','other')),
  description  text not null check (length(btrim(description)) between 5 and 2000),
  status       text not null default 'new' check (status in ('new','reviewed','fixed','rejected')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_library_issue_reports_status on public.library_issue_reports (status, created_at desc);
drop trigger if exists trg_library_issue_reports_updated_at on public.library_issue_reports;
create trigger trg_library_issue_reports_updated_at before update on public.library_issue_reports
  for each row execute function public.handle_updated_at();
alter table public.library_issue_reports enable row level security;
drop policy if exists "issue reports own read"   on public.library_issue_reports;
drop policy if exists "issue reports own insert" on public.library_issue_reports;
drop policy if exists "issue reports admin"      on public.library_issue_reports;
create policy "issue reports own read" on public.library_issue_reports for select
  using (user_id = auth.uid() or public.is_admin());
create policy "issue reports own insert" on public.library_issue_reports for insert
  with check (user_id = auth.uid());
create policy "issue reports admin" on public.library_issue_reports for update
  using (public.is_admin()) with check (public.is_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. attachments — source, soft delete, legal hold, 30-day bin (item 186)
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.attachments
  add column if not exists source      text not null default 'upload'
                             check (source in ('upload','generated','imported','contract_version')),
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references auth.users(id) on delete set null,
  add column if not exists legal_hold  boolean not null default false,
  add column if not exists hold_reason text;
create index if not exists idx_attachments_deleted on public.attachments (deleted_at) where deleted_at is not null;
-- the owner (or a participant) marks the row: soft delete, hold — 20260518 gave
-- attachments SELECT and INSERT only, so the bin needs an UPDATE policy
alter table public.attachments enable row level security;
drop policy if exists "attachments owner update" on public.attachments;
create policy "attachments owner update" on public.attachments for update
  using (owner_user_id = auth.uid()
         or exists (select 1 from public.service_requests sr
                     where sr.id = attachments.request_id
                       and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())))
  with check (owner_user_id = auth.uid()
         or exists (select 1 from public.service_requests sr
                     where sr.id = attachments.request_id
                       and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())));
-- a row under legal hold cannot be soft-deleted
alter table public.attachments drop constraint if exists attachments_hold_blocks_delete_check;
alter table public.attachments add constraint attachments_hold_blocks_delete_check
  check (not (legal_hold and deleted_at is not null));

-- =============================================================================
-- NOT DONE HERE, ON PURPOSE
-- • The theme, the sidebar, a dismissed onboarding banner stay in the browser.
-- • Admin feature flags stay a demo-scenario switch (their ids are mock ids);
--   production gating reads real entitlements — a code change, not a table.
-- • The library subscription/invitation flow is rewritten server-side in the
--   routes on the existing subscriptions + library.invitations tables.
-- • Purging the 30-day bin is the hourly cron's job (row + storage object),
--   never a database trigger — the object lives outside the database.
-- =============================================================================
