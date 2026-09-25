-- =============================================================================
-- Migration: 20260925_01_library_search_law_articles_ranked.sql
-- =============================================================================
-- PURPOSE
--   Relevance ordering for law-article hits in POST /api/library/search
--   (finding LIB-11, library scale review 2026-09-25).
--
--   PostgREST cannot ORDER BY ts_rank, so article hits come back in physical
--   heap order: the top hits for «نظام العمل» were ministerial circulars and
--   «نظام حقوق كبير السن — Page 3», not the Labor Law. This function returns
--   the ids of one page of matching articles, best first:
--     rank = ts_rank_cd(article.fts, query)
--          + 1.0 when the parent law's title/description also matches
--          + 0.5 when the parent law's type is «نظام»
--   The route fetches the rows for those ids through its normal select, so
--   the paywall, snippet and response shape stay in one place.
--
-- WHY A CAPPED CANDIDATE SET
--   «من» matches 69,123 articles. Ranking all of them means reading every
--   matching tsvector, which is exactly the cost that pushed an exact count
--   past the anon role's ~3s statement_timeout. The function ranks at most
--   ~4,000 candidates: up to 2,000 articles of laws whose own title/description
--   matches, plus the first 2,000 matching articles. For a specific query
--   («نظام العمل», 2,172 matches) that is the whole match set; for a stopword
--   it is a sample, which is still better than heap order.
--   Each capped CTE orders before its LIMIT (title_laws by slug, both
--   cand_ids arms by article id), so the sample, and with it the ranked ids,
--   is the same on every call.
--   Note: a function-level `SET statement_timeout` does NOT extend the timeout
--   of the statement that calls it, so this file does not try that.
--
-- HOW THE APP USES IT (no hard deploy-order dependency)
--   src/app/api/library/search/route.ts calls it for the section=all preview
--   only (its first 6 ids). section=laws never uses it: every section=laws
--   page, page 1 included, comes from one PostgREST order (id), because a
--   ranked page 1 followed by id-ordered pages 2+ would repeat and skip rows.
--   If the function is missing
--   (PGRST202 / 42883) the route remembers that for 10 minutes and serves the
--   unranked order; any other error falls back for that one request. The route
--   works identically before and after this migration, only better ordered after.
--
-- SECURITY
--   SECURITY INVOKER + STABLE: runs with the caller's grants and RLS on
--   library.articles / library.laws (anon/authenticated already hold SELECT,
--   20260922_01_library_grants.sql). Returns ids and a rank only; no text.
--   search_path is pinned.
--
-- PREREQUISITES
--   * library.articles.fts, library.laws.fts (generated tsvector, GIN-indexed).
--   * The `simple` text search config — the same config the route passes to
--     PostgREST (LIBRARY_FTS_CONFIG); it yields the lexemes stored by
--     library.arabic.
--   Idempotent (create or replace). No data is written.
--
-- NOT VALIDATED AGAINST THE SELF-HOSTED DB
--   Written without SQL access to the self-hosted instance (only PostgREST).
--   Before relying on it, run as the anon role:
--     set role anon;
--     explain analyze select * from library.search_law_articles_ranked('''من''', null, null, null, 50, 0);
--     explain analyze select * from library.search_law_articles_ranked('(''نظام'' & ''العمل'')', null, null, null, 50, 0);
--   Both must finish well under the anon statement_timeout (~3s). Watch the
--   plans of the cand_ids arms: `order by a.id limit 2000` over an fts filter
--   can switch from a GIN bitmap scan to a primary-key walk that filters on
--   fts, which is fast for a common word and slow for a rare one on the real
--   row counts (a small test database will not show it). The route
--   gives this call its own 1.5s budget and falls back to the plain order, so
--   a slow function degrades ordering, never the search.
--
-- VERIFY AFTER APPLYING (as anon, through PostgREST)
--   POST /rest/v1/rpc/search_law_articles_ranked   (Content-Profile: library)
--   {"p_tsquery":"('نظام' & 'العمل')","p_limit":10}
--   → 200 with [{id, rank}, ...]; the Labor Law's articles near the top.
-- =============================================================================

create or replace function library.search_law_articles_ranked(
  p_tsquery      text,
  p_section_code text    default null,
  p_status       text    default null,
  p_law_type     text    default null,
  p_limit        integer default 20,
  p_offset       integer default 0
)
returns table (id text, rank real)
language sql
stable
security invoker
set search_path = library, pg_catalog
as $$
  with q as (
    select to_tsquery('simple', p_tsquery) as tsq
  ),
  title_laws as (
    select l.slug
    from library.laws l, q
    where l.fts @@ q.tsq
      and (p_section_code is null or l.section_code = p_section_code)
      and (p_law_type     is null or l.type         = p_law_type)
    order by l.slug
    limit 300
  ),
  cand_ids as (
    (
      select a.id
      from library.articles a, q
      where a.fts @@ q.tsq
        and a.law_slug in (select slug from title_laws)
        and (p_status is null or a.status = p_status)
      order by a.id
      limit 2000
    )
    union
    (
      select a.id
      from library.articles a
      join library.laws l on l.slug = a.law_slug, q
      where a.fts @@ q.tsq
        and (p_status       is null or a.status       = p_status)
        and (p_section_code is null or l.section_code = p_section_code)
        and (p_law_type     is null or l.type         = p_law_type)
      order by a.id
      limit 2000
    )
  )
  select
    a.id::text as id,
    (
      ts_rank_cd(a.fts, q.tsq)
      + case when a.law_slug in (select slug from title_laws) then 1.0 else 0.0 end
      + case when l.type = 'نظام' then 0.5 else 0.0 end
    )::real as rank
  from cand_ids c
  join library.articles a on a.id = c.id
  join library.laws l on l.slug = a.law_slug
  cross join q
  order by rank desc, a.id
  limit  least(greatest(coalesce(p_limit, 20), 1), 100)
  offset least(greatest(coalesce(p_offset, 0), 0), 1000);
$$;

comment on function library.search_law_articles_ranked(text, text, text, text, integer, integer) is
  'Ranked page of library.articles ids for a tsquery (simple config): ts_rank_cd + parent-law title match + type نظام boost, over a capped candidate set. Used by POST /api/library/search for the section=all preview; the route falls back to unranked PostgREST order when this function is absent. Migration 20260925_01.';

revoke all on function library.search_law_articles_ranked(text, text, text, text, integer, integer) from public;
grant execute on function library.search_law_articles_ranked(text, text, text, text, integer, integer)
  to anon, authenticated, service_role;

-- Make the new function visible to PostgREST without waiting for its schema
-- cache reload (the route otherwise remembers it as missing for 10 minutes).
notify pgrst, 'reload schema';
