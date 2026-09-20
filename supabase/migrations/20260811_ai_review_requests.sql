-- 20260811_ai_review_requests.sql
-- Records that a beta-gated AI output was "submitted for review" via
-- BetaReviewGate (src/components/BetaReviewGate.tsx). The gate promises the
-- user a human review from the نظامي legal team — this table is where that
-- promise actually lands server-side, instead of the button just flipping a
-- client-only `submitted` flag with nothing recorded anywhere.
--
-- Written by POST /api/v1/ai-review-requests (service-role). This is a queue
-- for the review team to work from manually — no grant/entitlement is
-- applied from this table, and nothing reads user_id back into the app.

create table if not exists public.ai_review_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  user_id         uuid references auth.users(id) on delete set null,
  tool            text not null,
  scope           text not null default 'legal-data',
  payload_summary text,
  status          text not null default 'pending' check (status in ('pending','reviewed','dismissed'))
);

create index if not exists ai_review_requests_status_created_idx
  on public.ai_review_requests (status, created_at desc);

alter table public.ai_review_requests enable row level security;

-- Service-role only (the API route's service client bypasses RLS). No user
-- or admin-dashboard reads this yet, so no policies are defined here —
-- no select/insert policy = blocked by default for anon/authenticated
-- (same convention as admin_audit_events / login_attempts, see
-- 20260603_phase1_005_advanced_features.sql).
