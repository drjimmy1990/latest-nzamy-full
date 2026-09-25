-- =============================================================================
-- Migration: 20260925_04_law_facet_counts.sql
-- =============================================================================
-- PURPOSE
--   Section × doc-type counts for the /laws index chips (finding LIB-03,
--   library scale review 2026-09-25).
--
--   The chips counted only the laws already loaded in the browser (50 of
--   5,901), so 28 of 30 sections read «قريباً». GET /api/library/facets now
--   counts the whole table. PostgREST aggregates are disabled on this instance
--   (PGRST123 "Use of aggregate functions is not allowed"), so without this
--   function the route walks section_code/type/has_merged_regulation for every
--   law in 1,000-row windows (6 round trips today, growing with the table).
--   This function does the same count as one GROUP BY: ~200 rows back.
--
-- HOW THE APP USES IT (no hard deploy-order dependency)
--   src/app/api/library/facets/route.ts calls it first. If it is missing
--   (PGRST202 / 42883) or fails, the route falls back to the paged scan and
--   returns the same numbers. Applying this migration only makes it faster.
--
-- SECURITY
--   SECURITY INVOKER + STABLE: runs with the caller's grants and RLS on
--   library.laws (anon/authenticated already hold SELECT). Returns codes,
--   type labels and counts only; no law text.
--
-- ROLLBACK
--   drop function if exists library.law_facet_counts();
-- =============================================================================

create or replace function library.law_facet_counts()
returns table (
  section_code text,
  type text,
  has_merged_regulation boolean,
  n bigint
)
language sql
stable
security invoker
set search_path = library, pg_temp
as $$
  select l.section_code::text,
         l.type::text,
         coalesce(l.has_merged_regulation, false),
         count(*)
    from library.laws l
   group by 1, 2, 3
$$;

comment on function library.law_facet_counts() is
  'Law counts grouped by section_code, type and has_merged_regulation for the /laws index chips (GET /api/library/facets). Counts only.';

revoke all on function library.law_facet_counts() from public;
grant execute on function library.law_facet_counts() to anon, authenticated, service_role;

-- PostgREST caches the schema; make the new function visible without a restart.
notify pgrst, 'reload schema';
