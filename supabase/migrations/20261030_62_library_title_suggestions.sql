-- =============================================================================
-- Migration: 20261030_62_library_title_suggestions.sql
-- =============================================================================
-- PURPOSE (owner note ١٢-٣, 2026-10-30)
--   «عند عدم وجود نتائج: هل تقصد …؟ + أقرب ١٠ نتائج». A search that finds
--   nothing (a typo: «نضام العمل», «المرافعت») now offers the closest TITLES:
--
--     library.search_title_suggestions(p_query text, p_limit integer default 10)
--       → table(section text, id text, title text, status text, score real)
--
--   It reads three catalogue title columns only — library.laws.title (+ its
--   status, to list a repealed law after the laws in force),
--   library.judicial_collections.title and library.feqh_books.title — never
--   an article, a principle, a passage or any column-locked field. It ranks
--   them by pg_trgm word_similarity(query, title) on hamza / ta-marbuta /
--   alif-maqsura / diacritic-folded text and returns at most p_limit rows
--   (clamped 1..20) with a score of at least 0.4 (in Docker, 0.33 was the
--   noise of a shared «ال» / «نظام»; real typos scored 0.64–1.0).
--
-- PG_TRGM
--   `create extension if not exists pg_trgm with schema extensions`. If the
--   extension is already installed in another schema, it stays there: the
--   function below is created with the schema the extension actually lives in
--   (read from pg_extension), so search_path '' still resolves it.
--   The three tables are small (hundreds of rows): a sequential scan, no
--   trigram index is created.
--
-- ARABIC AND THE DATABASE LOCALE
--   pg_trgm keeps a character in a trigram only if the database's LC_CTYPE
--   calls it alphanumeric. Under LC_CTYPE 'C' Arabic letters are not, and
--   show_trgm('نظام العمل') is EMPTY — the function then returns no rows and
--   the page shows no «هل تقصد» (nothing breaks). Under C.UTF-8 / en_US.UTF-8
--   (Supabase's default) it works. The final SELECT prints show_trgm for an
--   Arabic title so this database's answer is visible. Tested in Docker
--   (postgres:16) under both — see the scratch test in the S4 ledger.
--
-- TIME LIMIT AND SECURITY (as 20261026_52)
--   `set statement_timeout = '3s'` (PostgREST v12+ applies it). SECURITY
--   INVOKER, search_path ''. EXECUTE for service_role only (revoked from
--   PUBLIC, anon, authenticated): /api/library/search/suggest calls it with
--   the service role and returns titles only. No grant is widened.
--
-- DEPLOY ORDER — either order
--   Before the deploy: nothing calls it yet. After: until it runs, the suggest
--   route answers PGRST202 / 42883 as «no suggestions» and the page shows the
--   plain «لا نتائج». deploy.sh does not run _verify.sql; run the SELECT at
--   the end of this file (or the _verify lines in the S4 ledger) by hand.
--
-- IDEMPOTENT — create extension if not exists + create or replace +
--   revoke/grant + comment; safe to re-run.
--
-- ROLLBACK (the page falls back to the plain «لا نتائج»)
--   begin;
--     drop function if exists library.search_title_suggestions(text, integer);
--   commit;
--   notify pgrst, 'reload schema';
--   (pg_trgm is left installed: other objects may use it.)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('library.laws') is null
     or to_regclass('library.judicial_collections') is null
     or to_regclass('library.feqh_books') is null then
    raise exception '20261030_62: library catalogue tables are missing — apply the library schema first';
  end if;
end $$;

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;

do $migration$
declare
  trgm_schema text;
begin
  select n.nspname into trgm_schema
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';
  if trgm_schema is null then
    raise exception '20261030_62: pg_trgm is not installed';
  end if;

  execute format($fn$
    create or replace function library.search_title_suggestions(p_query text, p_limit integer default 10)
    returns table (section text, id text, title text, status text, score real)
    language sql
    stable
    security invoker
    set search_path = ''
    set statement_timeout = '3s'
    as $body$
      with q as (
        select translate(lower(btrim(coalesce(p_query, ''))), 'أإآٱةىًٌٍَُِّْـ', 'ااااهي') as folded,
               least(greatest(coalesce(p_limit, 10), 1), 20) as lim
      ),
      candidates as (
        select 'laws'::text as section, l.slug::text as id, l.title, l.status::text as status
          from library.laws l
        union all
        select 'precedents', c.id::text, c.title, null::text
          from library.judicial_collections c
        union all
        select 'feqh', b.id::text, b.title, null::text
          from library.feqh_books b
      ),
      scored as (
        select c.section, c.id, c.title, c.status,
               %1$I.word_similarity(q.folded, translate(lower(c.title), 'أإآٱةىًٌٍَُِّْـ', 'ااااهي')) as score
          from candidates c, q
         where char_length(q.folded) >= 2
      )
      select s.section, s.id, s.title, s.status, s.score
        from scored s, q
       where s.score >= 0.4
       order by (lower(coalesce(s.status, '')) in ('repealed', 'ملغى', 'ملغي', 'ملغاة')) asc,
                s.score desc,
                char_length(s.title) asc,
                s.id asc
       limit (select lim from q)
    $body$;
  $fn$, trgm_schema);
end
$migration$;

revoke all on function library.search_title_suggestions(text, integer) from public;
revoke all on function library.search_title_suggestions(text, integer) from anon;
revoke all on function library.search_title_suggestions(text, integer) from authenticated;
grant execute on function library.search_title_suggestions(text, integer) to service_role;

comment on function library.search_title_suggestions(text, integer) is
  'Owner note ١٢-٣ (20261030_62): «هل تقصد …؟» — the closest catalogue TITLES (laws, judicial collections, fiqh books) to a query that found nothing, by pg_trgm word_similarity on folded text; laws in force before repealed ones. Titles and public status only. service_role only.';

commit;

notify pgrst, 'reload schema';

-- ── Check (expected output in the S4 ledger) ─────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'library' and p.proname = 'search_title_suggestions')            as function_exists,          -- 1
  (select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm')                                                        as pg_trgm_schema,           -- extensions (or where it already was)
  has_function_privilege('anon', 'library.search_title_suggestions(text, integer)', 'execute')          as anon_can_execute,          -- false
  has_function_privilege('service_role', 'library.search_title_suggestions(text, integer)', 'execute')  as service_role_can_execute,  -- true
  (select datctype from pg_database where datname = current_database())                  as lc_ctype,                 -- C.UTF-8 / en_US.UTF-8 (NOT 'C')
  (select count(*) from library.search_title_suggestions('نضام العمل', 10))            as typo_suggestions;          -- ≥ 1 once the library is loaded

-- Arabic trigrams under this database's locale (pg_trgm_schema above is
-- 'extensions' on Supabase; if it printed another schema, use that one here):
-- expected a non-empty array (multibyte trigrams print hashed, e.g.
-- {0xb65356,0xdf3048,…}); '{}' means LC_CTYPE 'C'
-- and «هل تقصد» will stay silent on this database.
select extensions.show_trgm('نظام العمل') as arabic_trigrams;
