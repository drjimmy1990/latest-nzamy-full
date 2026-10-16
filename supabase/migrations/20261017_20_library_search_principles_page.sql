-- =============================================================================
-- Migration: 20261017_20_library_search_principles_page.sql
-- =============================================================================
-- PURPOSE (fix plan 2026-10-16, row N18)
--   The precedents section of POST /api/library/search reads library.principles
--   with the SERVICE ROLE since 20261016_01 (owner decision ١٧١ made the text
--   and `fts` columns server-only). anon carries a ~3s statement_timeout set
--   on the role; service_role carries none. So a guest's precedent search has
--   no limit inside the database any more: the route's AbortSignal (4.5s) only
--   drops the HTTP request, and Postgres keeps running the query.
--
--   This file adds one function that runs the same search with its own time
--   limit:
--
--     library.search_principles_page(p_tsquery, p_offset, p_fetch,
--                                    p_track, p_source, p_year, p_court)
--       → jsonb {"rows": [...], "count": <total matches>}
--
--   The rows carry exactly the columns the route selected before, with the
--   collection nested under `judicial_collections` as the PostgREST embed
--   returned it. The route keeps every mask as it was: the full `text` comes
--   back to the server only, and the route cuts it to the tier's snippet
--   (100 / 200 characters, a locked hit centred on its opening).
--
-- HOW THE TIME LIMIT WORKS — READ THIS BEFORE RELYING ON IT
--   `set statement_timeout = '4s'` is stored on the function (proconfig).
--   Postgres arms the statement timer when a statement STARTS, so a SET
--   attached to a function never bounds the statement that calls it: a plain
--   `select library.search_principles_page(...)` in psql or Studio runs
--   unbounded. Proven in Docker (postgres:16, see the test header).
--   PostgREST (v12 and later, setting db-hoisted-tx-settings, whose default
--   list includes statement_timeout) "hoists" the function's statement_timeout:
--   it applies it with set_config(..., true) BEFORE the call, in the same
--   transaction, so the call statement starts with a 4s timer. The route calls
--   the function through PostgREST (supabase-js .rpc()), so on a PostgREST
--   that hoists, the query is cancelled with 57014 after 4s.
--   PRECONDITION (the user checks it once, see the run-order doc): the
--   self-hosted `rest` container runs PostgREST v12 or later and its
--   PGRST_DB_HOISTED_TX_SETTINGS (if set at all) still lists statement_timeout.
--   On an older PostgREST nothing breaks: the function runs, unbounded, as the
--   inline query does today.
--   4s is under the route's 4.5s client budget, so the database cancels first
--   and the route sees 57014 (the section is reported `degraded`) instead of a
--   client abort. Measured on live 2026-10-17 (guest, section=precedents, end
--   to end): «عقد» 3.5s cold / 1.2s warm, «المحكمة» 1.6s, «الدعوى» 1.5s,
--   «حق» 1.3s, «شفعة» 1.1s, «مضاربة» 1.4s.
--
-- THE QUERY
--   * Full-text config 'simple' — the same value as LIBRARY_FTS_CONFIG in
--     src/utils/normalizeArabic.ts. `p_tsquery` is parseSearchQuery's quoted,
--     operator-safe tsquery, passed to to_tsquery exactly as PostgREST's
--     `fts(simple)` filter did. Never 'arabic' / 'library.arabic' (it does not
--     parse on the self-host).
--   * The matches are collected first (MATERIALIZED, ids only, through the GIN
--     index on fts), then sorted by id and windowed. With the old
--     `judicial_collections!inner` embed plus `order(id)` a rare word could
--     make the planner walk the whole primary key (the same trap as f8bafa01
--     on the articles window). Only the page's rows are joined to their text.
--   * `count` is the exact number of matches (it costs nothing once the ids
--     are collected). The route still treats any count above 1000 as "more
--     than 1000" (searchPlan.isSectionCountExact), as it did with PostgREST's
--     `count=estimated`.
--   * Paging is the same stable window as before: order by id, offset, limit.
--
-- SECURITY
--   SECURITY INVOKER, search_path '' (every name schema-qualified). EXECUTE is
--   for service_role only: revoked from PUBLIC, anon and authenticated
--   explicitly, because the self-host's default privileges grant EXECUTE on
--   new functions to the API roles. Granting it to anon would hand the
--   server-only principle text back to the anon key over REST. As INVOKER, a
--   stray grant would still be stopped by the column lock of 20261016_01
--   (anon cannot read text/fts), but the verify below does not rely on that.
--
-- DEPLOY ORDER — EITHER ORDER
--   The route calls the function first and falls back to the inline query
--   ONLY when the function is missing (PGRST202 / 42883), remembering that for
--   10 minutes. So the code can ship before or after this file. A 57014 from
--   the function is never retried with the unbounded inline query.
--
-- IDEMPOTENT — create or replace + revoke/grant + comment; safe to re-run.
--
-- ROLLBACK
--   drop function if exists library.search_principles_page(text, integer, integer, text, text, integer, text);
--   notify pgrst, 'reload schema';
--   (the route falls back to the inline query within 10 minutes)
-- =============================================================================

begin;

-- ── 0. Order: the principles text lock (20261016_01) is the reason for this ──
do $$
begin
  if to_regclass('library.principles') is null or to_regclass('library.judicial_collections') is null then
    raise exception '20261017_20: library.principles / library.judicial_collections are missing — apply the library schema first';
  end if;
end $$;

-- ── 1. The function ──────────────────────────────────────────────────────────
create or replace function library.search_principles_page(
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
               order by p.id)
        from page pg
        join library.principles p on p.id = pg.id
        join library.judicial_collections jc on jc.id = p.collection_id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_principles_page(text, integer, integer, text, text, integer, text) is
  'Precedents section of POST /api/library/search (20261017_20, fix plan N18): one id-ordered window of full-text matches on library.principles plus the total, with a 4s statement_timeout that PostgREST applies before the call. service_role only — returns the server-only principle text.';

-- ── 2. Privileges: service_role only ─────────────────────────────────────────
revoke all on function library.search_principles_page(text, integer, integer, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function library.search_principles_page(text, integer, integer, text, text, integer, text)
  to service_role;

-- ── 3. Verify (raises → the whole transaction rolls back) ────────────────────
do $$
declare
  fn      constant text := 'library.search_principles_page(text, integer, integer, text, text, integer, text)';
  cfg     text[];
  definer boolean;
  r       text;
  missing text := '';
begin
  select p.proconfig, p.prosecdef into cfg, definer
    from pg_catalog.pg_proc p
   where p.oid = to_regprocedure(fn);
  if not found then
    raise exception '20261017_20 verify: % does not exist', fn;
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
      missing := missing || format(' %s can EXECUTE it (it returns the server-only principle text);', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_proc p, pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
              where p.oid = to_regprocedure(fn) and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    missing := missing || ' PUBLIC holds EXECUTE on it;';
  end if;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    missing := missing || ' service_role cannot EXECUTE it (the search route calls it with the service role);';
  end if;
  if not has_column_privilege('service_role', 'library.principles', 'text', 'SELECT')
     or not has_column_privilege('service_role', 'library.principles', 'fts', 'SELECT')
     or not has_table_privilege('service_role', 'library.judicial_collections', 'SELECT') then
    missing := missing || ' service_role cannot read principles.text/fts or judicial_collections (SECURITY INVOKER needs both);';
  end if;
  -- The lock this function exists to respect (20261016_01) still holds.
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.principles', 'text', 'SELECT')
       or has_column_privilege(r, 'library.principles', 'fts', 'SELECT') then
      missing := missing || format(' %s can read principles.text/fts again (re-run 20261016_01);', r);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261017_20 verify failed —%', missing;
  end if;
  raise notice '20261017_20 OK — library.search_principles_page: INVOKER, search_path '''', statement_timeout 4s, service_role only';
end $$;

commit;

-- PostgREST caches the schema; make the new function callable without a restart.
notify pgrst, 'reload schema';
