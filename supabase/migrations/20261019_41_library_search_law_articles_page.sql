-- =============================================================================
-- Migration: 20261019_41_library_search_law_articles_page.sql
-- =============================================================================
-- PURPOSE (owner decisions batch of 2026-10-18, W4 — the laws search time limit)
--   The laws section of POST /api/library/search reads library.articles with
--   the SERVICE ROLE since 20260929_01 (T28-21 made the article tables
--   server-only). anon carries a ~3s statement_timeout set on the role;
--   service_role carries none. So a guest's laws search has no limit inside
--   the database: the route's AbortSignal (4.5s) only drops the HTTP request,
--   and Postgres keeps running the query. 20261017_20 (precedents) and
--   20261018_02 (fiqh) closed the same gap for their sections; this file
--   closes it for the laws section.
--
--     library.search_law_articles_page(p_tsquery, p_offset, p_fetch,
--                                      p_status, p_section_code, p_law_type)
--       → jsonb {"rows": [...], "count": <total matches>}
--
--   Each row carries exactly the columns the route selected before — id,
--   number, number_text, status, text, original_text, law_slug — with NO
--   embedded law: the route attaches the laws by slug afterwards (withLaws),
--   as it already does for an unfiltered window. The route keeps every mask
--   as it was: the full `text` comes back to the server only, and the route
--   cuts it to the tier's snippet (100 / 200 characters, a locked hit centred
--   on its opening).
--
-- HOW THE TIME LIMIT WORKS — READ 20261017_20's HEADER BEFORE RELYING ON IT
--   `set statement_timeout = '4s'` is stored on the function (proconfig).
--   A SET attached to a function never bounds the statement that calls it, so
--   a plain `select library.search_law_articles_page(...)` in psql or Studio
--   runs unbounded. PostgREST v12+ (db-hoisted-tx-settings, default list
--   includes statement_timeout) applies it with set_config(..., true) BEFORE
--   the call, so the call through supabase-js .rpc() is cancelled with 57014
--   after 4s. Same PRECONDITION as 20261017_20 (the self-hosted `rest`
--   container runs PostgREST v12+ and still hoists statement_timeout). On an
--   older PostgREST nothing breaks: the function runs unbounded, as the
--   inline query does today. 4s is under the route's 4.5s section budget, so
--   the database cancels first and the section is reported `degraded`.
--
-- THE QUERY
--   * Full-text config 'simple' — the same value as LIBRARY_FTS_CONFIG in
--     src/utils/normalizeArabic.ts. `p_tsquery` is parseSearchQuery's quoted,
--     operator-safe tsquery, passed to to_tsquery exactly as PostgREST's
--     `fts(simple)` filter did. Never the schema's own arabic config (it does not
--     parse on the self-host).
--   * The matches are collected first (MATERIALIZED, ids only, through the GIN
--     index on articles.fts), then sorted by id and windowed. The route's old
--     `laws!inner` embed plus `order(id)` made a rare word («شفعة») walk the
--     whole primary key (f8bafa01); the window never sorts before the
--     matches are collected.
--   * library.laws is consulted ONLY when p_section_code or p_law_type is set
--     (the route's lawWindowNeedsJoin rule): the laws arm of the filter sits
--     behind `(p_section_code is null and p_law_type is null) or …`, whose
--     first arm is decided before any row is read, so an unfiltered search
--     never touches library.laws. With a filter, the article's law
--     (laws.slug = articles.law_slug) must carry that section / type — the
--     same rows the inner join returned (slug is the primary key of laws).
--   * p_status filters articles.status (no join), as the route's .eq did.
--   * `count` is the exact number of matches. The route still treats any
--     count above 1000 as "more than 1000" (searchPlan.isSectionCountExact),
--     as it did with PostgREST's `count=estimated`.
--   * Paging is the same stable window as before: order by articles.id (its
--     own collation, no cast — the inline fallback splits pages at the same
--     rows), offset, and never more than least(p_fetch, 1001) rows.
--
-- SECURITY
--   SECURITY INVOKER, search_path '' (every name schema-qualified). EXECUTE is
--   for service_role only: revoked from PUBLIC, anon and authenticated
--   explicitly, because the self-host's default privileges grant EXECUTE on
--   new functions to the API roles. As INVOKER, a stray grant would still be
--   stopped by the article lock of 20260929_01 (anon holds nothing on
--   library.articles), but the verify below does not rely on that.
--
-- DEPLOY ORDER — EITHER ORDER (any time)
--   The route calls the function first and falls back to its inline query
--   ONLY when the function is missing (PGRST202 / 42883), remembering that for
--   10 minutes. So the code can ship before or after this file. A 57014 from
--   the function fails the section; it is never retried with the unbounded
--   inline query.
--
-- IDEMPOTENT — create or replace + revoke/grant + comment; safe to re-run.
--
-- ROLLBACK (the route falls back to its inline query within 10 minutes)
--   begin;
--     drop function if exists library.search_law_articles_page(text, integer, integer, text, text, text);
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order: the article table and the columns the window returns ───────────
do $$
begin
  if to_regclass('library.articles') is null or to_regclass('library.laws') is null then
    raise exception '20261019_41: library.articles / library.laws are missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.articles'::regclass and attname = 'original_text' and not attisdropped) then
    raise exception '20261019_41: library.articles.original_text is missing — apply 20260729_article_history_columns.sql first';
  end if;
end $$;

-- ── 1. The function ──────────────────────────────────────────────────────────
create or replace function library.search_law_articles_page(
  p_tsquery      text,
  p_offset       integer,
  p_fetch        integer,
  p_status       text default null,
  p_section_code text default null,
  p_law_type     text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
  with matched as materialized (
    select a.id
      from library.articles a
     where a.fts @@ pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)
       and (p_status is null or a.status = p_status)
       and ((p_section_code is null and p_law_type is null)
            or a.law_slug in (select l.slug
                                from library.laws l
                               where (p_section_code is null or l.section_code = p_section_code)
                                 and (p_law_type     is null or l.type         = p_law_type)))
  ),
  page as (
    select m.id
      from matched m
     order by m.id
    offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_fetch, 0), 0), 1001)
  )
  select pg_catalog.jsonb_build_object(
    'count', (select pg_catalog.count(*) from matched),
    'rows', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id',            a.id,
                 'number',        a.number,
                 'number_text',   a.number_text,
                 'status',        a.status,
                 'text',          a.text,
                 'original_text', a.original_text,
                 'law_slug',      a.law_slug)
               order by a.id)
        from page pg
        join library.articles a on a.id = pg.id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_law_articles_page(text, integer, integer, text, text, text) is
  'Laws section of POST /api/library/search (20261019_41): one id-ordered window of full-text matches on library.articles plus the total, with a 4s statement_timeout that PostgREST applies before the call. library.laws is read only for a section / law-type filter. service_role only — returns the server-only article text.';

-- ── 2. Privileges: service_role only ─────────────────────────────────────────
revoke all on function library.search_law_articles_page(text, integer, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function library.search_law_articles_page(text, integer, integer, text, text, text)
  to service_role;

-- ── 3. Verify (raises → the whole transaction rolls back) ────────────────────
do $$
declare
  fn      constant text := 'library.search_law_articles_page(text, integer, integer, text, text, text)';
  cfg     text[];
  definer boolean;
  r       text;
  missing text := '';
begin
  select p.proconfig, p.prosecdef into cfg, definer
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure(fn);
  if not found then
    raise exception '20261019_41 verify: % does not exist', fn;
  end if;
  if definer then
    missing := missing || ' it is SECURITY DEFINER (expected INVOKER);';
  end if;
  if cfg is null or not ('statement_timeout=4s' = any (cfg)) then
    missing := missing || format(' proconfig %s lacks statement_timeout=4s;', coalesce(cfg::text, 'NULL'));
  end if;
  if cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || format(' proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE it (it returns the server-only article text);', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_proc p, pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = to_regprocedure(fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    missing := missing || ' PUBLIC holds EXECUTE on it;';
  end if;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    missing := missing || ' service_role cannot EXECUTE it (the search route calls it with the service role);';
  end if;
  if not has_column_privilege('service_role', 'library.articles', 'text', 'SELECT')
     or not has_column_privilege('service_role', 'library.articles', 'fts', 'SELECT')
     or not has_column_privilege('service_role', 'library.articles', 'original_text', 'SELECT')
     or not has_column_privilege('service_role', 'library.laws', 'section_code', 'SELECT')
     or not has_column_privilege('service_role', 'library.laws', 'type', 'SELECT') then
    missing := missing || ' service_role cannot read articles.text/fts/original_text or laws.section_code/type (SECURITY INVOKER needs them);';
  end if;

  if missing <> '' then
    raise exception '20261019_41 verify:%', missing;
  end if;
  raise notice '20261019_41 verify: OK — library.search_law_articles_page is INVOKER, statement_timeout 4s, search_path empty, service_role only';
end $$;

commit;

notify pgrst, 'reload schema';
