-- =============================================================================
-- Migration: 20261025_50_profile_visibility.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P6 item N3.8.
-- Owner intent: package 2026-10-22 §٤٣ directive ١ and §٤٥ axis ٣ («حوكمة ظهور
-- ملف المحامي» — the lawyer decides which sections of his public profile a
-- visitor sees).
-- =============================================================================
--
-- WHAT CHANGES (idempotent; one transaction)
--   1. Three switches on public.lawyer_profiles, boolean NOT NULL DEFAULT true
--      — every lawyer keeps today's profile until he turns one off:
--        show_services   «الخدمات» (his lawyer_services price list)
--        show_education  «المؤهلات العلمية» (lawyer_profiles.education)
--        show_courts     «المحاكم التي يترافع أمامها» (lawyer_profiles.courts)
--   2. authenticated may UPDATE the three columns (column grants, next to the
--      20260922_03 / 20261016_05 list). PATCH /api/v1/profile allowlists them
--      for the lawyer's own row; the row policy "lawyers update own profile"
--      is unchanged. anon gets nothing.
--   3. NO SELECT grant to anon/authenticated: like show_contact and
--      show_hourly_rate, the switches are read by the Next routes with the
--      service role (GET /api/v1/profile for the lawyer, GET /api/v1/lawyers/[id]
--      for the public profile). 20261016_10's SELECT column lock is untouched.
--   4. Verify block — raises (and so rolls back) unless the columns exist as
--      NOT NULL DEFAULT true, authenticated can update them and anon cannot,
--      and neither API role can READ them.
--
-- WHAT DOES NOT CHANGE, ON PURPOSE
--   * The licence and bar association keep following show_contact.
--   * Reviews cannot be hidden: they are clients' words about the lawyer, not
--     the lawyer's own content (owner decision on reviews; plan N3.8).
--   * The directory list (/api/v1/lawyers) shows none of the three sections,
--     so it needs no switch.
--
-- KNOWN LIMIT — say it plainly
--   The switches hide the sections in the platform's own API and pages. They
--   do NOT stop a REST client holding the public anon key: lawyer_profiles.
--   education and .courts are among the 13 public columns of 20261016_10, and
--   "lawyer services public read" on lawyer_services is a guest policy. Closing
--   that needs those two column grants revoked and the services policy to read
--   a switch — an owner decision (open question in the P6 report), not done
--   here.
--
-- CODE THAT GOES WITH IT (same branch)
--   * GET /api/v1/lawyers/[id] reads the switches in their OWN query
--     (src/lib/lawyers/profileVisibility.ts) and, for a section switched off,
--     sends an empty list and drops the raw column from the embedded row.
--     Before this file runs the read fails with 42703 and every section shows,
--     which is exactly the default — so the code can deploy first.
--   * The switches: /dashboard/lawyer/profile/edit and Settings → المهنة,
--     shown only when GET /api/v1/profile returns the keys (it reads the own
--     row with select("*")), so the screens keep saving before this file runs.
--
-- PREREQUISITE — 20260922_03 IN FORCE (refused below otherwise)
--
-- NOT AFTER THIS FILE WITHOUT CARE
--   * Re-running 20260922_03_lawyer_provider_column_grants.sql revokes UPDATE
--     on lawyer_profiles and re-grants ITS list, which lacks these columns: the
--     switches would answer «تعذّر حفظ» (42501). Re-run this file after it
--     (and 20261016_05).
--   * Re-running 20261016_10 raises in its own verify («authenticated can
--     UPDATE lawyer_profiles.show_services»): its self-service list predates
--     this file. It never needs a re-run once applied; if it must be re-run,
--     do it before this one. _verify.sql's 20260922_03 section lists the three
--     columns as allowed.
--
-- ROLLBACK
--   alter table public.lawyer_profiles
--     drop column if exists show_services,
--     drop column if exists show_education,
--     drop column if exists show_courts;
-- =============================================================================

begin;

-- ── 0. 20260922_03 must be in force ──────────────────────────────────────────
do $$
begin
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261025_50: public.lawyer_profiles is missing';
  end if;
  if has_table_privilege('authenticated', 'public.lawyer_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.lawyer_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.lawyer_profiles', 'INSERT') then
    raise exception '20261025_50: lawyer_profiles still has table-level INSERT/UPDATE for the API roles — run 20260922_03_lawyer_provider_column_grants.sql first, then 20261016_05, then this file';
  end if;
end $$;

-- ── 1. The switches ──────────────────────────────────────────────────────────
alter table public.lawyer_profiles
  add column if not exists show_services  boolean not null default true,
  add column if not exists show_education boolean not null default true,
  add column if not exists show_courts    boolean not null default true;

comment on column public.lawyer_profiles.show_services is
  'N3.8 (20261025_50): the public profile lists the lawyer''s services only when true. Read by the Next routes with the service role.';
comment on column public.lawyer_profiles.show_education is
  'N3.8 (20261025_50): the public profile shows lawyer_profiles.education only when true.';
comment on column public.lawyer_profiles.show_courts is
  'N3.8 (20261025_50): the public profile shows lawyer_profiles.courts only when true.';

-- ── 2. The lawyer may switch them ────────────────────────────────────────────
grant update (show_services, show_education, show_courts) on public.lawyer_profiles to authenticated;
revoke update (show_services, show_education, show_courts) on public.lawyer_profiles from anon;

-- ── 3. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  c       text;
  r       text;
  missing text := '';
begin
  foreach c in array array['show_services', 'show_education', 'show_courts'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'lawyer_profiles'
                      and column_name = c and data_type = 'boolean'
                      and is_nullable = 'NO' and column_default = 'true') then
      missing := missing || format(' lawyer_profiles.%s is missing or not boolean NOT NULL DEFAULT true;', c);
      continue;
    end if;
    if not has_column_privilege('authenticated', 'public.lawyer_profiles', c, 'UPDATE') then
      missing := missing || format(' authenticated cannot UPDATE %s (the switch would fail);', c);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if r = 'anon' and has_column_privilege('anon', 'public.lawyer_profiles', c, 'UPDATE') then
        missing := missing || format(' anon can UPDATE %s;', c);
      end if;
      if has_column_privilege(r, 'public.lawyer_profiles', c, 'SELECT') then
        missing := missing || format(' %s can SELECT %s (the switches are read with the service role only);', r, c);
      end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'public.lawyer_profiles', 'UPDATE') then
    missing := missing || ' authenticated holds table-level UPDATE on lawyer_profiles;';
  end if;
  if missing <> '' then
    raise exception '20261025_50 verify:%', missing;
  end if;
  raise notice '20261025_50 verify: OK — show_services / show_education / show_courts (default true); the lawyer can switch them, anon cannot, and neither API role can read them';
end $$;

commit;

notify pgrst, 'reload schema';
