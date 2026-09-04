-- =============================================================================
-- Migration: 20260907_phase7_profile_services_reviews.sql
-- Phase:     7 — الملف المهني والسوق (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §11)
--            — the profile half. The marketplace half (audience column,
--            accept_offer, /api/v1/marketplace) stays parked: the platform runs
--            in single-firm beta mode (BETA_MONOPOLY_MODE) by the owner's
--            decision, and building a market nobody can enter is theatre.
-- Purpose:   Real professional-profile fields, a priced service list a client
--            can order from the profile, and REAL reviews on the reviews table
--            that already exists — one review per completed request, written
--            by the client who paid for it, never free-floating.
--
-- Closes (matrix rows): 128 · 133 · 178 · 192 (table side); 130 (slug half);
--                       179 (the API sanitiser has no table side)
-- Does NOT close: 40 (gamification — no data to award badges from), 55, 58,
--                 144, 145, 185 (marketplace — beta mode).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 1 — NO social_links, EVER (owner decision, plan §11)
-- DECISION 2 — A REVIEW IS A FACT ABOUT A COMPLETED REQUEST
--   The 20260603 policy let any signed-in user insert any review with
--   reviewer_id = auth.uid(). Replaced: the reviewer must be the requester of
--   a COMPLETED service_requests row assigned to the reviewee, and that request
--   can carry exactly one review (partial unique index). Ratings the public
--   sees are computed from those rows only (status = 'active').
-- DECISION 3 — THE SLUG IS THE LAWYER'S CHOICE, UNIQUE, ASCII
--   /lawyers/[slug] currently takes a profiles.id UUID; the slug column lets a
--   verified lawyer pick «/lawyers/ahmad-alghamdi» once. Format-checked here,
--   uniqueness enforced here, resolution done by the API (id OR slug).
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
-- 1. lawyer_profiles — the professional record (item 128 · 133 · 130)
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.lawyer_profiles
  add column if not exists slug          text,
  add column if not exists education     jsonb  not null default '[]'::jsonb,   -- [{degree, institution, year}]
  add column if not exists courts        text[] not null default '{}',          -- المحاكم التي يترافع أمامها
  add column if not exists languages     text[] not null default '{"ar"}',
  add column if not exists headline_ar   text   not null default '',            -- سطر تعريفي قصير
  add column if not exists show_contact  boolean not null default false,        -- exists on production since 20260705; restated for a partial database
  add column if not exists is_accepting_clients boolean not null default true;  -- same

alter table public.lawyer_profiles drop constraint if exists lawyer_profiles_slug_format_check;
alter table public.lawyer_profiles add constraint lawyer_profiles_slug_format_check
  check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');

-- reserved words a slug must not shadow (routes that live beside /lawyers/[slug])
alter table public.lawyer_profiles drop constraint if exists lawyer_profiles_slug_reserved_check;
alter table public.lawyer_profiles add constraint lawyer_profiles_slug_reserved_check
  check (slug is null or slug not in ('browse','new','me','admin','api','search','directory'));

create unique index if not exists uq_lawyer_profiles_slug on public.lawyer_profiles (slug) where slug is not null;

alter table public.lawyer_profiles drop constraint if exists lawyer_profiles_education_is_array_check;
alter table public.lawyer_profiles add constraint lawyer_profiles_education_is_array_check
  check (jsonb_typeof(education) = 'array');

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. lawyer_services — what a client can order from the profile (item 178)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.lawyer_services (
  id              uuid primary key default gen_random_uuid(),
  lawyer_user_id  uuid not null references public.profiles(id) on delete cascade,
  title_ar        text not null check (length(btrim(title_ar)) between 2 and 120),
  description_ar  text not null default '',
  pricing_kind    text not null default 'quote'
                    check (pricing_kind in ('fixed','from','hourly','quote')),
  price_sar       numeric(12,2) check (price_sar is null or price_sar >= 0),
  duration_label  text,                              -- «٣٠ دقيقة» / «٥ أيام عمل» — free text, honest
  category        text not null default 'other'
                    check (category in ('consultation','drafting','review','litigation','representation','other')),
  active          boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- a price is required unless the lawyer quotes case by case
  constraint lawyer_services_price_pair_check check (pricing_kind = 'quote' or price_sar is not null)
);
create index if not exists idx_lawyer_services_lawyer on public.lawyer_services (lawyer_user_id, active, position);
drop trigger if exists trg_lawyer_services_updated_at on public.lawyer_services;
create trigger trg_lawyer_services_updated_at before update on public.lawyer_services
  for each row execute function public.handle_updated_at();

alter table public.lawyer_services enable row level security;
drop policy if exists "lawyer services public read"  on public.lawyer_services;
drop policy if exists "lawyer services owner read"   on public.lawyer_services;
drop policy if exists "lawyer services owner write"  on public.lawyer_services;
-- the public sees an ACTIVE service of a VERIFIED, LISTED lawyer — the same gate the directory uses
create policy "lawyer services public read" on public.lawyer_services for select
  using (active and exists (
    select 1 from public.lawyer_profiles lp
     where lp.user_id = lawyer_user_id
       and lp.verification_status = 'verified'
       and lp.marketplace_visible = true));
create policy "lawyer services owner read" on public.lawyer_services for select
  using (lawyer_user_id = auth.uid());
create policy "lawyer services owner write" on public.lawyer_services for all
  using (lawyer_user_id = auth.uid()) with check (lawyer_user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. reviews — real ones (item 192), on the table that exists since 20260603
-- ═════════════════════════════════════════════════════════════════════════════
-- one review per request
create unique index if not exists uq_reviews_request on public.reviews (request_id) where request_id is not null;

-- the reviewer must be the requester of a COMPLETED request assigned to the reviewee
drop policy if exists "reviewers create reviews" on public.reviews;
create policy "reviewers create reviews" on public.reviews for insert
  with check (
    reviewer_id = auth.uid()
    and request_id is not null
    and reviewee_id <> auth.uid()
    and exists (
      select 1 from public.service_requests sr
       where sr.id = request_id
         and sr.requester_user_id = auth.uid()
         and sr.assigned_to = reviewee_id
         and sr.status = 'completed'));

-- the reviewee may only fill the response fields; the reviewer may only edit
-- their own text/rating while the review is still active. Both existed as
-- blanket UPDATE policies; narrowed via WITH CHECK on the immutable columns
-- is not expressible per-column in RLS, so the API enforces column scope and
-- the policies stay as the row-level gate.
--   ("reviewers update own reviews" / "reviewees respond to reviews" kept.)

-- public rating figures computed from active rows only
create or replace view public.lawyer_review_stats
with (security_invoker = true) as
  select reviewee_id as lawyer_user_id,
         count(*)::int              as review_count,
         round(avg(rating)::numeric, 2) as avg_rating,
         max(created_at)            as last_review_at
    from public.reviews
   where status = 'active'
   group by reviewee_id;

-- =============================================================================
-- NOT DONE HERE, ON PURPOSE
-- • No marketplace tables/columns (audience, accept_offer) — beta monopoly mode.
-- • No gamification/badges — nothing measurable to award them from.
-- • Blocking off-platform contact in bios/reviews/messages (item 179) is an
--   application sanitiser, not a constraint; it ships with the routes.
-- • The slug resolves in the API (id OR slug); existing UUID links keep working.
-- =============================================================================
