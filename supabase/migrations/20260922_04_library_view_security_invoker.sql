-- =============================================================================
-- Migration: 20260922_04_library_view_security_invoker.sql
-- =============================================================================
-- PURPOSE
--   Supabase Security Advisor, lint `security_definer_view` (Critical):
--   "View library.v_laws_enactment_status is defined with the SECURITY DEFINER
--   property". On PostgreSQL 15+ a view runs with the privileges and RLS of
--   its OWNER unless it carries the reloption `security_invoker = true`.
--   20260911_library_laws_enactment_gazette_schema.sql:89 created the view
--   without it, and 20260922_01_library_grants.sql made the view reachable by
--   `anon`/`authenticated`, which is when the advisor started to care.
--
--   Setting security_invoker is SAFE here: the view reads library.laws only
--   (20260911:89-142, `FROM library.laws l`), and library.laws is readable by
--   anon/authenticated through its own RLS policy (probed 2026-09-22: anon GET
--   /rest/v1/laws → 200 with rows, anon GET /rest/v1/v_laws_enactment_status
--   → 200 with rows). Nothing in src/ reads this view today.
--
--   Second, the same advisor's sibling lint (`materialized_view_in_api`):
--   20260922_01 granted SELECT on the materialized view
--   library.cross_section_search to anon/authenticated. That matview has never
--   been refreshed on production (anon GET → 500 55000 "materialized view has
--   not been populated") and no code under src/ reads it. It has no business in
--   the API surface; this file takes the two API roles' SELECT back (service_role
--   keeps its grant for the seeder / a future refresh).
--
-- CLOSES
--   Supabase advisor: security_definer_view on library.v_laws_enactment_status;
--   pre-empts materialized_view_in_api on library.cross_section_search.
--
-- PREREQUISITES
--   * PostgreSQL 15+ (security_invoker reloption). Production is 17.6.
--   * library.v_laws_enactment_status — 20260911 (applied 2026-09-21).
--   * library.cross_section_search — 20260626 / 20260729 (applied).
--   Every statement is guarded with to_regclass, so the file is a no-op for an
--   object that does not exist (e.g. the batch-C academy views below), and it
--   is idempotent — safe to run twice.
--
-- ALSO COVERED (guarded, batch C — NOT applied on production today)
--   public.academy_questions / public.academy_quizzes from 20260820 are
--   security-definer views too. They are altered here IF they exist, and
--   20260820_academy_schema.sql (unapplied) is corrected in the same commit so
--   that applying it later creates them with security_invoker from the start.
--
-- ROLLBACK
--   alter view library.v_laws_enactment_status reset (security_invoker);
--   grant select on library.cross_section_search to anon, authenticated;
-- =============================================================================

begin;

-- ── 1. security_invoker on every exposed plain view that lacks it ────────────
do $$
declare
  v text;
begin
  foreach v in array array[
    'library.v_laws_enactment_status',
    'public.academy_questions',
    'public.academy_quizzes'
  ]
  loop
    if to_regclass(v) is null then
      raise notice '20260922_04: % does not exist here — skipped', v;
      continue;
    end if;
    execute format('alter view %s set (security_invoker = true)', v);
    raise notice '20260922_04: % now runs with the caller''s privileges (security_invoker = true)', v;
  end loop;
end $$;

-- ── 2. the unpopulated, reader-less matview leaves the API surface ───────────
do $$
begin
  if to_regclass('library.cross_section_search') is null then
    raise notice '20260922_04: library.cross_section_search does not exist here — skipped';
    return;
  end if;
  revoke select on library.cross_section_search from anon, authenticated;
  raise notice '20260922_04: SELECT on library.cross_section_search revoked from anon/authenticated (service_role keeps it)';
end $$;

-- ── 3. Read-only verification — raises, so the transaction rolls back ───────
do $$
declare
  v        text;
  ok       boolean;
begin
  foreach v in array array[
    'library.v_laws_enactment_status',
    'public.academy_questions',
    'public.academy_quizzes'
  ]
  loop
    if to_regclass(v) is null then
      continue;
    end if;
    select exists (
      select 1
        from pg_class c
        cross join lateral pg_options_to_table(c.reloptions) o
       where c.oid = v::regclass
         and o.option_name  = 'security_invoker'
         and lower(o.option_value) in ('true', 'on', '1', 'yes')
    ) into ok;
    if not ok then
      raise exception '20260922_04 verify: % still lacks security_invoker = true', v;
    end if;
  end loop;

  if to_regclass('library.cross_section_search') is not null then
    if has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
       or has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT') then
      raise exception '20260922_04 verify: an API role can still SELECT library.cross_section_search';
    end if;
    if not has_table_privilege('service_role', 'library.cross_section_search', 'SELECT') then
      raise exception '20260922_04 verify: service_role lost SELECT on library.cross_section_search — that was not intended';
    end if;
  end if;

  raise notice '20260922_04 verify: OK — exposed views run as the caller; the matview is out of the API surface';
end $$;

commit;

-- Read-only re-check after applying (SQL Editor):
--   select c.relname, c.reloptions from pg_class c
--    where c.oid in ('library.v_laws_enactment_status'::regclass);
--   select has_table_privilege('anon','library.cross_section_search','SELECT');
-- Then Dashboard → Advisors → Security → refresh: the security_definer_view
-- finding for library.v_laws_enactment_status must be gone.
