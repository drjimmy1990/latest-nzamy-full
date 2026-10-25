-- =============================================================================
-- Migration: 20261026_52_library_search_relevance.sql
-- =============================================================================
-- PURPOSE (owner decision ٢٧٧ (أ), 2026-10-25)
--   «عند البحث بكلمات: الترتيب حسب الصلة بالكلمات؛ التصفح بلا بحث يبقى بترتيب
--   التاريخ الرسمي». POST /api/library/search listed every section by primary
--   key (laws, precedents and fiqh through 20261019_41 / 20261017_20 /
--   20261018_02, orders inline); only the «الكل» preview of the laws could be
--   ranked, and only through 20260925_01, which is marked DO NOT APPLY (too
--   slow) — so production ranks nothing today. This file adds one window per
--   section, ordered by relevance on EVERY page:
--
--     library.search_law_articles_relevance(p_tsquery, p_offset, p_fetch,
--                                           p_status, p_section_code, p_law_type)
--     library.search_principles_relevance  (p_tsquery, p_offset, p_fetch,
--                                           p_track, p_source, p_year, p_court)
--     library.search_feqh_relevance        (p_tsquery, p_offset, p_fetch)
--     library.search_decrees_relevance     (p_tsquery, p_offset, p_fetch,
--                                           p_issuer, p_type, p_categories)
--       → jsonb {"count": n, "ranked": true|false, "rows": [...]}
--
--   The parameters and the row shape of the first three are their siblings'
--   exactly (the route maps the rows with the same code); the decrees rows
--   carry the columns the route's inline query selected — public catalogue
--   columns only, never decree_pages content. The siblings are NOT replaced:
--   re-running an old file can never silently turn the order back to id.
--
-- THE ORDER
--   relevance = ts_rank_cd(fts, query, 1): cover density, divided by
--   1 + log(document length) so a long scanned page does not outrank a short
--   article only for being long. Ties (and every row of an unranked window)
--   break on the primary key — a total, deterministic order, so offset pages
--   neither repeat nor skip rows, as before.
--
-- WHY A CAP — RANKING IS NOT FREE
--   Collecting the matching ids is a GIN lookup that never reads the
--   tsvectors; ranking reads (de-TOASTs) the tsvector of every match.
--   Measured in Docker (postgres:16, 110,000 synthetic articles, 498 MB with
--   TOAST, warm cache), ranking the whole match set as a plain query:
--   102,325 matches 1.4 s (their ids alone 0.11 s); 58,886 → 0.79 s;
--   21,813 → 0.37 s; 8,062 → 0.18–0.22 s; 2,976 → 0.10 s — about 25 µs a row
--   warm, and a cold cache adds a TOAST read or two per row. Production
--   measured the id collection alone at up to 3.5 s cold for a common word
--   (20261017_20). So a window ranks only when the query matches at most
--   5,000 rows (`ranked: true`); above that it keeps today's id order
--   (`ranked: false`) on EVERY page of that query — never a ranked page 1
--   followed by id-ordered pages. Such a query is one very common word; the
--   count already invites narrowing it. The limit is the literal 5000 in
--   each function below (create or replace with another value to tune it).
--   These functions, same fixture (after a restart, then warm):
--     word        matches  sibling (id)   relevance
--     rare              9   1.4 ms         1.8 ms        ranked
--     uncommon      1,096   6.4 ms         32–37 ms      ranked
--     medium        2,976   7.5 ms         85–101 ms     ranked (page 20: 84 ms)
--     medium+       8,062   12 ms          13 ms         id order (over the cap)
--     common       58,886   39 ms          42–45 ms      id order
--     very common 102,325   64–102 ms      63 ms         id order
--
-- THE PLAN (the traps in the memory of this library)
--   * `matched` collects the ids first (MATERIALIZED, `fts @@` only — the GIN
--     index), with no ORDER BY / LIMIT on the base table, so the planner can
--     never walk the primary key hoping for early hits (f8bafa01: a rare word
--     read all ~93k articles). Proven in Docker on both a rare and a common
--     word: supabase/tests/rls/library_search_relevance.test.sql.
--   * `ranked` joins those ids to their rows by primary key — at most 5,000
--     lookups — and is skipped entirely (a one-time filter) above the cap.
--   * Full-text config 'simple' = LIBRARY_FTS_CONFIG; never library.arabic.
--   * library.laws is read only for a section / law-type filter (as in
--     20261019_41); the principles join their collection as 20261017_20 does.
--
-- TIME LIMIT AND SECURITY — the siblings' (read 20261017_20's header)
--   `set statement_timeout = '4s'`, applied by PostgREST v12+ before the call
--   (a direct `select` in psql runs unbounded). SECURITY INVOKER,
--   search_path ''. EXECUTE for service_role only (revoked from PUBLIC, anon,
--   authenticated): three return server-only text; the decrees one is kept
--   alike so one rule covers all four. The route applies the paywall
--   (snippet length, `locked`, the first two pages) exactly as before.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY preferred, safe in either order
--   Run before the code ships, search ranks from the first request; run
--   after, nothing breaks in between. The route calls these first and, while one is missing (PGRST202 /
--   42883, remembered 10 minutes), uses today's window for that section (its
--   sibling function, or the inline query). Old code never calls them.
--   deploy.sh does not run _verify.sql; after this file, run
--   supabase/migrations/_verify.sql by hand (section 20261026_52).
--
-- IDEMPOTENT — create or replace + revoke/grant + comment; safe to re-run.
--
-- ROLLBACK (the route returns to the id order within 10 minutes)
--   begin;
--     drop function if exists library.search_law_articles_relevance(text, integer, integer, text, text, text);
--     drop function if exists library.search_principles_relevance(text, integer, integer, text, text, integer, text);
--     drop function if exists library.search_feqh_relevance(text, integer, integer);
--     drop function if exists library.search_decrees_relevance(text, integer, integer, text, text, text[]);
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order: the tables and the columns the windows return ──────────────────
do $$
begin
  if to_regclass('library.articles') is null or to_regclass('library.laws') is null
     or to_regclass('library.principles') is null or to_regclass('library.judicial_collections') is null
     or to_regclass('library.feqh_blocks') is null or to_regclass('library.decrees_circulars') is null then
    raise exception '20261026_52: library tables are missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.articles'::regclass and attname = 'original_text' and not attisdropped) then
    raise exception '20261026_52: library.articles.original_text is missing — apply 20260729_article_history_columns.sql first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.decrees_circulars'::regclass and attname = 'summary_brief' and not attisdropped) then
    raise exception '20261026_52: library.decrees_circulars.summary_brief is missing — apply the library schema first';
  end if;
end $$;

-- ── 1. Laws (articles) ───────────────────────────────────────────────────────
create or replace function library.search_law_articles_relevance(
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
  total as materialized (
    select pg_catalog.count(*)::integer as n from matched
  ),
  ranked as materialized (
    select m.id,
           pg_catalog.ts_rank_cd(a.fts, (select pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)), 1) as rank
      from matched m
      join library.articles a on a.id = m.id
     where (select t.n from total t) <= 5000
  ),
  ordered as (
    select r.id, r.rank from ranked r
    union all
    select m.id, null::real from matched m where (select t.n from total t) > 5000
  ),
  page as (
    select o.id, o.rank
      from ordered o
     order by o.rank desc nulls last, o.id
    offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_fetch, 0), 0), 1001)
  )
  select pg_catalog.jsonb_build_object(
    'count',  (select t.n from total t),
    'ranked', (select t.n <= 5000 from total t),
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
               order by pg.rank desc nulls last, pg.id)
        from page pg
        join library.articles a on a.id = pg.id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_law_articles_relevance(text, integer, integer, text, text, text) is
  'Owner ٢٧٧ (20261026_52): laws section of POST /api/library/search — one window of full-text matches on library.articles ordered by ts_rank_cd(fts, q, 1) desc, id (when the query matches at most 5,000 rows; above that by id, "ranked": false), plus the total. Same parameters and rows as search_law_articles_page (20261019_41). 4s statement_timeout applied by PostgREST. service_role only — returns the server-only article text.';

-- ── 2. Precedents (principles) ───────────────────────────────────────────────
create or replace function library.search_principles_relevance(
  p_tsquery text,
  p_offset  integer,
  p_fetch   integer,
  p_track   text    default null,
  p_source  text    default null,
  p_year    integer default null,
  p_court   text    default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
  with matched as materialized (
    select p.id
      from library.principles p
      join library.judicial_collections jc on jc.id = p.collection_id
     where p.fts @@ pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)
       and (p_track  is null or jc.track     = p_track)
       and (p_source is null or jc.source_id = p_source)
       and (p_year   is null or p.year_hijri = p_year)
       and (p_court  is null or jc.court     = p_court)
  ),
  total as materialized (
    select pg_catalog.count(*)::integer as n from matched
  ),
  ranked as materialized (
    select m.id,
           pg_catalog.ts_rank_cd(p.fts, (select pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)), 1) as rank
      from matched m
      join library.principles p on p.id = m.id
     where (select t.n from total t) <= 5000
  ),
  ordered as (
    select r.id, r.rank from ranked r
    union all
    select m.id, null::real from matched m where (select t.n from total t) > 5000
  ),
  page as (
    select o.id, o.rank
      from ordered o
     order by o.rank desc nulls last, o.id
    offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_fetch, 0), 0), 1001)
  )
  select pg_catalog.jsonb_build_object(
    'count',  (select t.n from total t),
    'ranked', (select t.n <= 5000 from total t),
    'rows', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id',               p.id,
                 'principle_number', p.principle_number,
                 'issuing_body',     p.issuing_body,
                 'text',             p.text,
                 'session_date',     p.session_date,
                 'decision_number',  p.decision_number,
                 'year_hijri',       p.year_hijri,
                 'judicial_collections', pg_catalog.jsonb_build_object(
                   'id',        jc.id,
                   'title',     jc.title,
                   'court',     jc.court,
                   'track',     jc.track,
                   'source_id', jc.source_id))
               order by pg.rank desc nulls last, pg.id)
        from page pg
        join library.principles p on p.id = pg.id
        join library.judicial_collections jc on jc.id = p.collection_id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_principles_relevance(text, integer, integer, text, text, integer, text) is
  'Owner ٢٧٧ (20261026_52): precedents section of POST /api/library/search — one window of full-text matches on library.principles ordered by ts_rank_cd(fts, q, 1) desc, id (when the query matches at most 5,000 rows; above that by id, "ranked": false), plus the total. Same parameters and rows as search_principles_page (20261017_20). 4s statement_timeout applied by PostgREST. service_role only — returns the server-only principle text.';

-- ── 3. Fiqh (feqh_blocks) ────────────────────────────────────────────────────
create or replace function library.search_feqh_relevance(
  p_tsquery text,
  p_offset  integer,
  p_fetch   integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
  with matched as materialized (
    select b.id
      from library.feqh_blocks b
     where b.fts @@ pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)
  ),
  total as materialized (
    select pg_catalog.count(*)::integer as n from matched
  ),
  ranked as materialized (
    select m.id,
           pg_catalog.ts_rank_cd(b.fts, (select pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)), 1) as rank
      from matched m
      join library.feqh_blocks b on b.id = m.id
     where (select t.n from total t) <= 5000
  ),
  ordered as (
    select r.id, r.rank from ranked r
    union all
    select m.id, null::real from matched m where (select t.n from total t) > 5000
  ),
  page as (
    select o.id, o.rank
      from ordered o
     order by o.rank desc nulls last, o.id
    offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_fetch, 0), 0), 1001)
  )
  select pg_catalog.jsonb_build_object(
    'count',  (select t.n from total t),
    'ranked', (select t.n <= 5000 from total t),
    'rows', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id',            b.id,
                 'topic',         b.topic,
                 'matn',          b.matn,
                 'sharh',         b.sharh,
                 'volume_number', b.volume_number,
                 'page_number',   b.page_number,
                 'feqh_sections', pg_catalog.jsonb_build_object(
                   'id',    s.id,
                   'title', s.title,
                   'feqh_chapters', pg_catalog.jsonb_build_object(
                     'id',    c.id,
                     'title', c.title,
                     'feqh_books', pg_catalog.jsonb_build_object(
                       'id',     bk.id,
                       'title',  bk.title,
                       'author', bk.author,
                       'school', bk.school,
                       'type',   bk.type))))
               order by pg.rank desc nulls last, pg.id)
        from page pg
        join library.feqh_blocks   b  on b.id  = pg.id
        join library.feqh_sections s  on s.id  = b.section_id
        join library.feqh_chapters c  on c.id  = s.chapter_id
        join library.feqh_books    bk on bk.id = c.book_id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_feqh_relevance(text, integer, integer) is
  'Owner ٢٧٧ (20261026_52): fiqh section of POST /api/library/search — one window of full-text matches on library.feqh_blocks ordered by ts_rank_cd(fts, q, 1) desc, id (when the query matches at most 5,000 rows; above that by id, "ranked": false), plus the total. Same parameters and rows as search_feqh_page (20261018_02). 4s statement_timeout applied by PostgREST. service_role only — returns the server-only fiqh text.';

-- ── 4. Orders (decrees_circulars) ────────────────────────────────────────────
create or replace function library.search_decrees_relevance(
  p_tsquery    text,
  p_offset     integer,
  p_fetch      integer,
  p_issuer     text   default null,
  p_type       text   default null,
  p_categories text[] default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
  with matched as materialized (
    select d.id
      from library.decrees_circulars d
     where d.fts @@ pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)
       and (p_issuer     is null or d.issuer = p_issuer)
       and (p_type       is null or d.type   = p_type)
       and (p_categories is null or d.category = any (p_categories))
  ),
  total as materialized (
    select pg_catalog.count(*)::integer as n from matched
  ),
  ranked as materialized (
    select m.id,
           pg_catalog.ts_rank_cd(d.fts, (select pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)), 1) as rank
      from matched m
      join library.decrees_circulars d on d.id = m.id
     where (select t.n from total t) <= 5000
  ),
  ordered as (
    select r.id, r.rank from ranked r
    union all
    select m.id, null::real from matched m where (select t.n from total t) > 5000
  ),
  page as (
    select o.id, o.rank
      from ordered o
     order by o.rank desc nulls last, o.id
    offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_fetch, 0), 0), 1001)
  )
  select pg_catalog.jsonb_build_object(
    'count',  (select t.n from total t),
    'ranked', (select t.n <= 5000 from total t),
    'rows', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id',            d.id,
                 'title',         d.title,
                 'type',          d.type,
                 'issuer',        d.issuer,
                 'ref',           d.ref,
                 'date',          d.date,
                 'summary_brief', d.summary_brief,
                 'category',      d.category,
                 'hashtags',      d.hashtags)
               order by pg.rank desc nulls last, pg.id)
        from page pg
        join library.decrees_circulars d on d.id = pg.id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_decrees_relevance(text, integer, integer, text, text, text[]) is
  'Owner ٢٧٧ (20261026_52): orders section of POST /api/library/search — one window of full-text matches on library.decrees_circulars ordered by ts_rank_cd(fts, q, 1) desc, id (when the query matches at most 5,000 rows; above that by id, "ranked": false), plus the total. Public catalogue columns only (the route''s former inline select). 4s statement_timeout applied by PostgREST. service_role only, like its three siblings.';

-- ── 5. Privileges: service_role only ─────────────────────────────────────────
revoke all on function library.search_law_articles_relevance(text, integer, integer, text, text, text) from public, anon, authenticated;
revoke all on function library.search_principles_relevance(text, integer, integer, text, text, integer, text) from public, anon, authenticated;
revoke all on function library.search_feqh_relevance(text, integer, integer) from public, anon, authenticated;
revoke all on function library.search_decrees_relevance(text, integer, integer, text, text, text[]) from public, anon, authenticated;
grant execute on function library.search_law_articles_relevance(text, integer, integer, text, text, text) to service_role;
grant execute on function library.search_principles_relevance(text, integer, integer, text, text, integer, text) to service_role;
grant execute on function library.search_feqh_relevance(text, integer, integer) to service_role;
grant execute on function library.search_decrees_relevance(text, integer, integer, text, text, text[]) to service_role;

-- ── 6. Verify (raises → the whole transaction rolls back) ────────────────────
do $$
declare
  fn      text;
  cfg     text[];
  definer boolean;
  r       text;
  missing text := '';
begin
  foreach fn in array array[
    'library.search_law_articles_relevance(text, integer, integer, text, text, text)',
    'library.search_principles_relevance(text, integer, integer, text, text, integer, text)',
    'library.search_feqh_relevance(text, integer, integer)',
    'library.search_decrees_relevance(text, integer, integer, text, text, text[])'
  ] loop
    select p.proconfig, p.prosecdef into cfg, definer
      from pg_catalog.pg_proc p
     where p.oid = to_regprocedure(fn);
    if not found then
      missing := missing || format(' %s does not exist;', fn);
      continue;
    end if;
    if definer then
      missing := missing || format(' %s is SECURITY DEFINER (expected INVOKER);', fn);
    end if;
    if cfg is null or not ('statement_timeout=4s' = any (cfg)) then
      missing := missing || format(' %s: proconfig %s lacks statement_timeout=4s;', fn, coalesce(cfg::text, 'NULL'));
    end if;
    if cfg is null or not ('search_path=""' = any (cfg)) then
      missing := missing || format(' %s: proconfig %s lacks search_path='''';', fn, coalesce(cfg::text, 'NULL'));
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_proc p, pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                where p.oid = to_regprocedure(fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      missing := missing || format(' PUBLIC holds EXECUTE on %s;', fn);
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s (the search route calls it with the service role);', fn);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261026_52 verify:%', missing;
  end if;
  raise notice '20261026_52 verify: OK — four relevance windows (laws, precedents, fiqh, orders): INVOKER, statement_timeout 4s, search_path empty, service_role only';
end $$;

commit;

notify pgrst, 'reload schema';
