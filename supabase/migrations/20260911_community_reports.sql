-- =============================================================================
-- Migration: 20260911_community_reports.sql
-- Purpose:   Owner item ٦٩ remainder — «زر الإبلاغ عن المحتوى». No reports
--            table existed anywhere in the schema: the admin moderation
--            queue (/api/v1/admin/community/moderation) SYNTHESISED a
--            `reportReason` string from the post's own status/category
--            column (see that route's own header comment, lines ~113-120)
--            because there was nothing real to read. A user pressing
--            "report" on a post or an answer had no table to write to.
--
--            This creates that table. One row = one user's report of one
--            piece of community content (a post OR an answer — `target_type`
--            says which; `target_id` is not FK-constrained to either table
--            because it can point at rows in two different tables, the same
--            polymorphic-target shape `admin_audit_events.target_type` /
--            `target_id` already uses in this schema for the same reason).
--
--            UNIQUE (target_type, target_id, reporter_user_id): one user can
--            report the same piece of content once — a second attempt is a
--            23505 the route turns into 409 «سبق أن أبلغت عن هذا المحتوى»,
--            not a second row inflating the count.
--
-- RLS:       insert own (reporter_user_id = auth.uid()) · select own or
--            public.is_admin() · update admin only. No delete policy —
--            reports are never removed, only triaged via `status`.
--
-- Does NOT close: the other half of owner item ٦٩ — ترحيل مهام الجلسات
--            المؤجلة (AddHearingModal.tsx). Untouched here; the concurrency
--            half (claim_service_request) already landed in 20260908.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + inline constraints (a table that
--            already exists is left exactly as it is — the constraints below
--            only ever apply on the row that creates the table); CREATE INDEX
--            IF NOT EXISTS; DROP POLICY IF EXISTS before every CREATE POLICY.
--            No DROP TABLE, no DELETE, no data movement.
-- =============================================================================

create table if not exists public.community_reports (
  id                uuid primary key default gen_random_uuid(),
  target_type       text not null
                      check (target_type in ('post', 'answer')),
  target_id         uuid not null,
  -- Nullable + ON DELETE SET NULL (not CASCADE): matches
  -- `library_issue_reports.user_id` (20260906) — if the reporter's account
  -- is later deleted, the report survives as an orphaned, admin-only-visible
  -- row instead of vanishing along with the moderation signal it carries.
  reporter_user_id  uuid references auth.users(id) on delete set null,
  reason            text not null
                      check (reason in ('spam', 'abuse', 'misleading', 'off_platform_contact', 'other')),
  details           text
                      check (details is null or length(details) <= 1000),
  status            text not null default 'new'
                      check (status in ('new', 'reviewed', 'dismissed', 'actioned')),
  reviewed_by       uuid references auth.users(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  -- One user reports one target once. NULLs (an orphaned reporter_user_id
  -- after account deletion) never conflict with each other under a
  -- standard btree unique index — Postgres' documented NULL-distinct
  -- behaviour — which is exactly what should happen: an orphaned report
  -- does not block a *different* still-live user from reporting the same
  -- target.
  unique (target_type, target_id, reporter_user_id)
);

create index if not exists idx_community_reports_target   on public.community_reports (target_type, target_id);
create index if not exists idx_community_reports_status    on public.community_reports (status, created_at desc);
create index if not exists idx_community_reports_reporter  on public.community_reports (reporter_user_id);

alter table public.community_reports enable row level security;

drop policy if exists "community reports own insert" on public.community_reports;
drop policy if exists "community reports own read"   on public.community_reports;
drop policy if exists "community reports admin update" on public.community_reports;

create policy "community reports own insert" on public.community_reports
  for insert
  with check (reporter_user_id = auth.uid());

create policy "community reports own read" on public.community_reports
  for select
  using (reporter_user_id = auth.uid() or public.is_admin());

create policy "community reports admin update" on public.community_reports
  for update
  using (public.is_admin())
  with check (public.is_admin());

-- No delete policy anywhere, by design — a report is triaged (status), never removed.

-- ── Verification (read-only; run manually against Supabase) ───────────────
--
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_schema = 'public' and table_name = 'community_reports'
--   order by ordinal_position;
--
--   select polname, polcmd, polqual, polwithcheck
--   from pg_policy where polrelid = 'public.community_reports'::regclass;
--   -- Expect 3 policies: insert (own), select (own or admin), update (admin).
--
--   select indexname from pg_indexes where tablename = 'community_reports';
-- =============================================================================
