-- =============================================================================
-- Migration: 20261017_31_firm_reviews_opt_in.sql
-- =============================================================================
-- PURPOSE
--   Owner decision ٢٠ (answers of 2026-10-06, section ج):
--     «تقييمات المكاتب: لا تُعرض علناً إلا بموافقة مدير المكتب (Opt-in) للحفاظ
--      على سمعة الشركاء أثناء فترة الإطلاق التجريبي.»
--   Lawyer reviews are unchanged.
--
--   Before this file:
--     * firm_profiles has no consent column (Phase 7 noted the gap).
--     * The only SELECT policy on public.reviews is "anyone reads active
--       reviews" (status = 'active', 20260603_phase1_005), with no role list.
--       So a guest can read every active review of a FIRM straight through
--       PostgREST:
--         GET {SUPABASE_URL}/rest/v1/reviews?reviewee_id=eq.<firm account id>
--       GET /api/v1/reviews hides firms only because its gate checks
--       lawyer_profiles; the table itself does not.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. firm_profiles.public_reviews boolean NOT NULL DEFAULT false — the firm
--      manager's opt-in — plus public_reviews_changed_at / _changed_by (who
--      switched it, when). Every existing firm starts at OFF.
--      No column privilege is granted: 20260922_03 revoked the table-level
--      UPDATE, so authenticated cannot write these columns through REST, and
--      its verify allowlist (display_mode, metadata, updated_at) stays exact.
--   2. public.set_firm_public_reviews(boolean) — SECURITY DEFINER, the ONLY
--      writer for the API roles: it updates the firm whose owner_user_id is the
--      caller and refuses anyone else (42501). The firm manager is the firm
--      account itself (firm_profiles.owner_user_id).
--   3. public.review_row_readable(reviewee uuid, reviewer uuid) — SECURITY
--      DEFINER (it reads profiles and firm_profiles, which a guest cannot):
--      true unless the reviewee is a FIRM account that has not opted in; the
--      reviewer, the reviewee and an admin always pass.
--   4. A RESTRICTIVE SELECT policy on public.reviews using it. The permissive
--      "anyone reads active reviews" is left exactly as it is, so lawyer
--      reviews read as before; restrictive policies are AND-ed with it.
--      lawyer_review_stats is security_invoker (20260907), so a hidden firm's
--      rating figures disappear from guests with its rows.
--   5. public.firm_reviews_published(uuid) — SECURITY DEFINER, readable by
--      guests: has this firm account opted in? GET /api/v1/reviews?firm= asks
--      it so a reviewer browsing the public endpoint is not shown their own
--      review of a firm that never published.
--   6. Verify block — RAISES (the transaction rolls back) on any miss.
--   7. notify pgrst.
--
-- BETA_MONOPOLY_MODE still parks the public firm profile pages, so on day one
-- nothing public renders firm reviews either way; the opt-in is in place, and
-- enforced by the database, for when the marketplace opens.
--
-- DEPLOY ORDER — run this BEFORE deploying the code of the same branch.
--   The firm's «التقييمات» page reads/writes the flag through
--   /api/v1/firm/reviews-visibility (column + RPC) and answers an Arabic 503
--   without this file. Running the file first breaks nothing live: no deployed
--   code shows firm reviews publicly, and lawyer reviews are unaffected.
--
-- RE-RUN CLIFFS
--   * Re-running 20260922_03 does not touch these columns (it grants by name
--     and revokes table-level UPDATE; the new columns stay unwritable).
--   * Nothing else re-creates policies on public.reviews.
--
-- ROLLBACK (re-exposes firm reviews to guests through REST)
--   begin;
--     drop policy if exists "reviews: a firm's reviews are public only by its opt-in" on public.reviews;
--     drop function if exists public.review_row_readable(uuid, uuid);
--     drop function if exists public.firm_reviews_published(uuid);
--     drop function if exists public.set_firm_public_reviews(boolean);
--     -- the three columns may stay; dropping them loses the managers' choices
--   commit;
--   notify pgrst, 'reload schema';
--
-- DOCKER PROOF: supabase/tests/rls/firm_reviews_opt_in.test.sql (chain in its
-- header).
-- =============================================================================

begin;

-- ── 1. The opt-in ────────────────────────────────────────────────────────────
alter table public.firm_profiles
  add column if not exists public_reviews            boolean not null default false,
  add column if not exists public_reviews_changed_at timestamptz,
  add column if not exists public_reviews_changed_by uuid references public.profiles(id) on delete set null;

comment on column public.firm_profiles.public_reviews is
  'Owner decision 20: the firm''s reviews are shown publicly only when its manager opts in. Default false. Written only through public.set_firm_public_reviews(boolean) (no column grant). Since 20261017_31.';

-- ── 2. The only writer for the API roles ────────────────────────────────────
create or replace function public.set_firm_public_reviews(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value boolean;
begin
  if auth.uid() is null or p_enabled is null then
    raise exception 'set_firm_public_reviews: sign in as the firm account' using errcode = '42501';
  end if;

  update public.firm_profiles
     set public_reviews            = p_enabled,
         public_reviews_changed_at = now(),
         public_reviews_changed_by = auth.uid()
   where owner_user_id = auth.uid()
  returning public_reviews into v_value;

  if not found then
    raise exception 'set_firm_public_reviews: only the firm account may change its review visibility'
      using errcode = '42501';
  end if;
  return v_value;
end;
$$;

comment on function public.set_firm_public_reviews(boolean) is
  'Owner decision 20: the firm manager (firm_profiles.owner_user_id) switches the public display of the firm''s reviews. The only write path for the API roles. Since 20261017_31.';

revoke execute on function public.set_firm_public_reviews(boolean) from public, anon;
grant execute on function public.set_firm_public_reviews(boolean) to authenticated, service_role;

-- ── 3. Row readability ───────────────────────────────────────────────────────
create or replace function public.review_row_readable(p_reviewee uuid, p_reviewer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- not a firm account: every lawyer (and anyone else) reads as before
    not exists (select 1 from public.profiles p
                  where p.id = p_reviewee and p.user_type = 'firm')
    -- a firm that opted in
    or exists (select 1 from public.firm_profiles f
                where f.owner_user_id = p_reviewee and f.public_reviews)
    -- the two parties to the review, and the platform admin
    or (auth.uid() is not null and (auth.uid() = p_reviewee or auth.uid() = p_reviewer))
    or public.is_admin();
$$;

comment on function public.review_row_readable(uuid, uuid) is
  'Owner decision 20: false only for a review of a FIRM account that has not opted in (firm_profiles.public_reviews), read by someone other than its reviewer, its reviewee or an admin. Used by the restrictive SELECT policy on public.reviews; SECURITY DEFINER because guests cannot read profiles or firm_profiles. Since 20261017_31.';

-- Guests read reviews, so the policy function must be executable by anon.
revoke execute on function public.review_row_readable(uuid, uuid) from public;
grant execute on function public.review_row_readable(uuid, uuid) to anon, authenticated, service_role;

-- ── 4. The restrictive policy ────────────────────────────────────────────────
drop policy if exists "reviews: a firm's reviews are public only by its opt-in" on public.reviews;
create policy "reviews: a firm's reviews are public only by its opt-in" on public.reviews
  as restrictive
  for select
  using (public.review_row_readable(reviewee_id, reviewer_id));

-- ── 5. Has this firm published its reviews? ─────────────────────────────────
create or replace function public.firm_reviews_published(p_firm_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.firm_profiles f
      join public.profiles p on p.id = f.owner_user_id and p.user_type = 'firm'
     where f.owner_user_id = p_firm_user
       and f.public_reviews);
$$;

comment on function public.firm_reviews_published(uuid) is
  'Owner decision 20: true when the firm account has opted in to showing its reviews publicly. Public by design (that is what opting in means). Since 20261017_31.';

revoke execute on function public.firm_reviews_published(uuid) from public;
grant execute on function public.firm_reviews_published(uuid) to anon, authenticated, service_role;

-- ── 6. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  missing text := '';
  c       text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'firm_profiles'
                    and column_name = 'public_reviews' and column_default = 'false'
                    and is_nullable = 'NO') then
    missing := missing || ' firm_profiles.public_reviews is missing or not NOT NULL DEFAULT false;';
  end if;

  -- no REST write path: the RPC is the only writer
  foreach c in array array['public_reviews', 'public_reviews_changed_at', 'public_reviews_changed_by']
  loop
    if has_column_privilege('authenticated', 'public.firm_profiles', c, 'UPDATE')
       or has_column_privilege('anon', 'public.firm_profiles', c, 'UPDATE') then
      missing := missing || format(' an API role can UPDATE firm_profiles.%s directly (20260922_03 not applied?);', c);
    end if;
  end loop;

  if not exists (select 1 from pg_policy
                  where polrelid = 'public.reviews'::regclass
                    and polname = 'reviews: a firm''s reviews are public only by its opt-in'
                    and polcmd = 'r' and not polpermissive) then
    missing := missing || ' the restrictive SELECT policy on reviews is missing;';
  end if;
  if not exists (select 1 from pg_policy
                  where polrelid = 'public.reviews'::regclass
                    and polname = 'anyone reads active reviews' and polcmd = 'r' and polpermissive) then
    missing := missing || ' "anyone reads active reviews" is gone — lawyer reviews would disappear;';
  end if;

  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.review_row_readable(uuid,uuid)') and prosecdef) then
    missing := missing || ' review_row_readable is missing or not SECURITY DEFINER;';
  elsif not has_function_privilege('anon', 'public.review_row_readable(uuid,uuid)', 'EXECUTE') then
    missing := missing || ' anon cannot EXECUTE review_row_readable (every guest review read would fail 42501);';
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.firm_reviews_published(uuid)') and prosecdef) then
    missing := missing || ' firm_reviews_published is missing or not SECURITY DEFINER;';
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.set_firm_public_reviews(boolean)') and prosecdef) then
    missing := missing || ' set_firm_public_reviews is missing or not SECURITY DEFINER;';
  elsif has_function_privilege('anon', 'public.set_firm_public_reviews(boolean)', 'EXECUTE') then
    missing := missing || ' anon can EXECUTE set_firm_public_reviews;';
  end if;

  if missing <> '' then
    raise exception '20261017_31 verify:%', missing;
  end if;

  raise notice '20261017_31 verify: OK — firm reviews are public only by firm_profiles.public_reviews (default off, set through set_firm_public_reviews); lawyer reviews unchanged';
end $$;

commit;

-- ── 7. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select count(*) filter (where public_reviews) as opted_in, count(*) as firms from public.firm_profiles;   -- 0 opted in on day one
--   select polname, polpermissive from pg_policy where polrelid = 'public.reviews'::regclass and polcmd = 'r';
