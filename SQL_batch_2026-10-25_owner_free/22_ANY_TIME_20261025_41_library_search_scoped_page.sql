-- =============================================================================
-- Migration: 20261025_41_library_search_scoped_page.sql
-- =============================================================================
-- PURPOSE (owner-free P5, N2.6 — search inside the open law, collection or book)
--   The owner (README «٤٧» part ٦, preview ٤): a search box inside the law
--   reader, the judicial collection reader and the fiqh book reader that
--   searches the WHOLE document — every volume of a multi-volume collection
--   or book — with the library's operators (+ / - "…" *), and stacks the
--   matching texts on the page. POST /api/library/scoped-search serves it.
--
--   library.search_scoped_page(p_kind, p_ids, p_tsquery, p_offset, p_fetch)
--   → jsonb {"count": n, "rows": [...]}:
--     p_kind 'law'        p_ids = {law slug}            → library.articles
--     p_kind 'collection' p_ids = the series' volume ids → library.principles
--     p_kind 'book'       p_ids = the series' volume ids → library.feqh_blocks
--   Rows come in READING order: the order of p_ids (the route passes the
--   volumes in volume order), then order_index, then id — a stable window for
--   offset paging. p_ids is cut to its first 200 entries; p_fetch to 101.
--   The tsquery is the one parseSearchQuery() builds for the global search,
--   matched against the same `fts` columns with the same 'simple' config
--   (LIBRARY_FTS_CONFIG).
--
-- WHY A FUNCTION (the same design as 20261017_20 / 20261018_02 / 20261019_41)
--   The three tables' text and fts are server-only, so the route reads them
--   with the service role, which has no statement_timeout: an inline query
--   keeps running in Postgres after the route stopped waiting. The function
--   carries `set statement_timeout = '4s'`, which PostgREST v12+ applies
--   before the call. SECURITY INVOKER, search_path '', EXECUTE for
--   service_role only — it returns the server-only text; the route applies the
--   paywall (the global search's rules) before anything leaves the server.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run without the columns it reads (articles.original_text,
--      feqh_blocks.book_id / page_label / volume_label).
--   1. create or replace the function; EXECUTE revoked from PUBLIC / anon /
--      authenticated, granted to service_role.
--   2. Verify block — RAISES (the transaction rolls back) unless the function
--      is INVOKER, carries the 4s timeout and the empty search_path, and only
--      service_role can EXECUTE it.
--   3. notify pgrst to reload its schema cache.
--   No table, column, grant or policy changes.
--
-- DEPLOY ORDER — ANY TIME
--   The route calls the function and, while it is missing (PGRST202 / 42883),
--   runs the same window inline as the service role (bounded only by the
--   route's own timer). Old code never calls it. After it: run
--   supabase/migrations/_verify.sql (section verify:search_scoped_page).
--
-- ROLLBACK
--   drop function if exists library.search_scoped_page(text, text[], text, integer, integer);
-- =============================================================================

begin;

do $$
begin
  if to_regclass('library.articles') is null or to_regclass('library.principles') is null
     or to_regclass('library.feqh_blocks') is null then
    raise exception '20261025_41: the library tables are missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.articles'::regclass and attname = 'original_text' and not attisdropped) then
    raise exception '20261025_41: library.articles.original_text is missing — apply 20260729_article_history_columns.sql first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.feqh_blocks'::regclass and attname = 'book_id' and not attisdropped) then
    raise exception '20261025_41: library.feqh_blocks.book_id is missing — apply 20260729_feqh_locator_labels.sql first';
  end if;
end $$;

create or replace function library.search_scoped_page(
  p_kind    text,
  p_ids     text[],
  p_tsquery text,
  p_offset  integer,
  p_fetch   integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $fn$
declare
  v_ids    text[]  := p_ids[1:200];
  v_q      tsquery;
  v_off    integer := greatest(coalesce(p_offset, 0), 0);
  v_lim    integer := least(greatest(coalesce(p_fetch, 0), 0), 101);
  v_result jsonb;
begin
  if p_kind is null or p_kind not in ('law', 'collection', 'book') then
    raise exception 'search_scoped_page: unknown kind %', coalesce(p_kind, 'NULL') using errcode = '22023';
  end if;
  if v_ids is null or pg_catalog.cardinality(v_ids) = 0 or coalesce(pg_catalog.btrim(p_tsquery), '') = '' then
    return pg_catalog.jsonb_build_object('count', 0, 'rows', '[]'::jsonb);
  end if;
  v_q := pg_catalog.to_tsquery('simple'::regconfig, p_tsquery);

  if p_kind = 'law' then
    with matched as materialized (
      select a.id, pg_catalog.array_position(v_ids, a.law_slug::text) as vol, a.order_index
        from library.articles a
       where a.law_slug = any (v_ids)
         and a.fts @@ v_q
    ),
    page as (
      select m.id, pg_catalog.row_number() over (order by m.vol, m.order_index, m.id) as rn
        from matched m
       order by m.vol, m.order_index, m.id
      offset v_off
       limit v_lim
    )
    select pg_catalog.jsonb_build_object(
      'count', (select pg_catalog.count(*) from matched),
      'rows', coalesce((
        select pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object(
                   'id',                 a.id,
                   'volume_id',          a.law_slug,
                   'number',             a.number,
                   'number_text',        a.number_text,
                   'title',              a.title,
                   'status',             a.status,
                   'text',               a.text,
                   'original_text',      a.original_text,
                   'executive_reg_text', a.executive_reg_text,
                   'order_index',        a.order_index)
                 order by pg.rn)
          from page pg
          join library.articles a on a.id = pg.id
      ), '[]'::jsonb))
      into v_result;

  elsif p_kind = 'collection' then
    with matched as materialized (
      select p.id, pg_catalog.array_position(v_ids, p.collection_id::text) as vol, p.order_index
        from library.principles p
       where p.collection_id = any (v_ids)
         and p.fts @@ v_q
    ),
    page as (
      select m.id, pg_catalog.row_number() over (order by m.vol, m.order_index, m.id) as rn
        from matched m
       order by m.vol, m.order_index, m.id
      offset v_off
       limit v_lim
    )
    select pg_catalog.jsonb_build_object(
      'count', (select pg_catalog.count(*) from matched),
      'rows', coalesce((
        select pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object(
                   'id',               p.id,
                   'volume_id',        p.collection_id,
                   'principle_number', p.principle_number,
                   'issuing_body',     p.issuing_body,
                   'session_date',     p.session_date,
                   'decision_number',  p.decision_number,
                   'year_hijri',       p.year_hijri,
                   'reference',        p.reference,
                   'text',             p.text,
                   'ruling_basis',     p.ruling_basis,
                   'facts',            p.facts,
                   'reasons',          p.reasons,
                   'ruling',           p.ruling,
                   'order_index',      p.order_index)
                 order by pg.rn)
          from page pg
          join library.principles p on p.id = pg.id
      ), '[]'::jsonb))
      into v_result;

  else
    with matched as materialized (
      select b.id, pg_catalog.array_position(v_ids, b.book_id::text) as vol, b.order_index
        from library.feqh_blocks b
       where b.book_id = any (v_ids)
         and b.fts @@ v_q
    ),
    page as (
      select m.id, pg_catalog.row_number() over (order by m.vol, m.order_index, m.id) as rn
        from matched m
       order by m.vol, m.order_index, m.id
      offset v_off
       limit v_lim
    )
    select pg_catalog.jsonb_build_object(
      'count', (select pg_catalog.count(*) from matched),
      'rows', coalesce((
        select pg_catalog.jsonb_agg(
                 pg_catalog.jsonb_build_object(
                   'id',            b.id,
                   'volume_id',     b.book_id,
                   'topic',         b.topic,
                   'volume_number', b.volume_number,
                   'page_number',   b.page_number,
                   'volume_label',  b.volume_label,
                   'page_label',    b.page_label,
                   'matn',          b.matn,
                   'sharh',         b.sharh,
                   'hashiyah',      b.hashiyah,
                   'order_index',   b.order_index,
                   'section_title', s.title,
                   'chapter_title', c.title)
                 order by pg.rn)
          from page pg
          join library.feqh_blocks b on b.id = pg.id
          left join library.feqh_sections s on s.id = b.section_id
          left join library.feqh_chapters c on c.id = s.chapter_id
      ), '[]'::jsonb))
      into v_result;
  end if;

  return v_result;
end
$fn$;

comment on function library.search_scoped_page(text, text[], text, integer, integer) is
  'N2.6 (20261025_41): POST /api/library/scoped-search — full-text matches inside one law, one judicial collection series or one fiqh book series, in reading order (p_ids order, then order_index, id), one window plus the total, with a 4s statement_timeout that PostgREST applies before the call. service_role only — returns the server-only text; the route applies the paywall.';

revoke all on function library.search_scoped_page(text, text[], text, integer, integer) from public, anon, authenticated;
grant execute on function library.search_scoped_page(text, text[], text, integer, integer) to service_role;

-- verify
do $$
declare
  fn      constant text := 'library.search_scoped_page(text, text[], text, integer, integer)';
  cfg     text[];
  definer boolean;
  r       text;
  missing text := '';
begin
  select p.proconfig, p.prosecdef into cfg, definer
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure(fn);
  if not found then
    raise exception '20261025_41 verify: % does not exist', fn;
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
      missing := missing || format(' %s can EXECUTE it (it returns the server-only text);', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_proc p, pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = to_regprocedure(fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    missing := missing || ' PUBLIC holds EXECUTE on it;';
  end if;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    missing := missing || ' service_role cannot EXECUTE it (the scoped-search route calls it with the service role);';
  end if;
  if missing <> '' then
    raise exception '20261025_41 verify:%', missing;
  end if;
  raise notice '20261025_41 verify: OK — library.search_scoped_page is INVOKER, statement_timeout 4s, search_path empty, service_role only';
end $$;

notify pgrst, 'reload schema';

commit;
