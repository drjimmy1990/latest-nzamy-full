-- =============================================================================
-- Migration: 20261018_02_library_feqh_decree_text_lock.sql
-- =============================================================================
-- PURPOSE
--   Owner answer ١٨٣ (approved answers of 2026-10-16): «نعم، تُغلق كلياً ونهائياً
--   من جهة الخادم» — the full text of the fiqh books (feqh_blocks) and of the
--   decree and circular pages (decree_pages) goes behind the subscription wall
--   on the server, and the free preview is the metadata plus the first two
--   pages only, «لحماية الثروة الفقهية والتشريعية للمنصة من الكشط».
--
--   Until this file the PUBLIC anon key read both in full, straight from
--   PostgREST (verified on production 2026-10-17):
--
--       GET {SUPABASE_URL}/rest/v1/feqh_blocks?select=matn,sharh,hashiyah,fts   (Accept-Profile: library)
--       GET {SUPABASE_URL}/rest/v1/decree_pages?select=content
--
--   because 20260929_01 left both tables public («STAYS PUBLIC») and
--   20260922_01 / 20260626 §7 gave them table-level SELECT and a `using (true)`
--   read policy. The route-side paywall (5 free blocks / pages) was a UI
--   paywall, not a data one.
--
-- WHAT IS LOCKED
--   library.feqh_blocks    matn (the text), sharh (the commentary), hashiyah
--                          (the notes), and fts — the GENERATED tsvector over
--                          topic, matn and sharh. It goes with them: it holds
--                          every word with its position, so `select=fts`
--                          rebuilds the text (the same reason as principles.fts
--                          in 20261016_01).
--   library.decree_pages   content (the page's text).
--
-- WHAT STAYS PUBLIC (anon + authenticated, SELECT only)
--   library.feqh_blocks    id, section_id, topic, volume_number, page_number,
--                          order_index, created_at, updated_at, page_label,
--                          volume_label, book_id — the block's place in the
--                          book (the reader's page bar, the table of contents,
--                          the section order).
--   library.decree_pages   id, decree_id, page_number, created_at, updated_at,
--                          number_text, order_index.
--   library.decrees_circulars, feqh_books, feqh_chapters, feqh_sections are
--   unchanged (the catalogue). NOTE: decrees_circulars.preamble is decree
--   text and stays public — the owner named decree_pages; asked in the owner
--   report.
--   feqh_blocks.is_synthetic_page (20260821) is not on production; wherever it
--   exists it stays locked (nothing outside the seeder reads it).
--
-- WHO READS THE LOCKED COLUMNS AFTER THIS FILE (all with the service role,
-- masking per tier — commit adding this file):
--   src/app/api/library/books/[slug]/route.ts    the reader's blocks; a locked
--       block carries its place and topic, no text.
--   src/app/api/library/decrees/[id]/route.ts    the pages; a locked page
--       carries no text.
--   src/app/api/library/search/route.ts          the fiqh section, through
--       library.search_feqh_page below (a locked hit carries no snippet).
--   src/app/api/library/autocomplete/route.ts    the fiqh count (fts).
--   The free preview is the first two pages (src/lib/library/freePages.ts).
--   src/app/api/library/library-column-lock.test.ts scans every request-client
--   read in src/ against the allow-lists below.
--
-- library.search_feqh_page — WHY A FUNCTION
--   The fiqh search filters on fts. Through the request client it ran under
--   anon's ~3s statement_timeout; as the service role it would run with none
--   (the route's AbortSignal only drops the HTTP request — Postgres keeps
--   going). The function carries `set statement_timeout = '4s'`, which
--   PostgREST v12+ applies before the call (db-hoisted-tx-settings) — the same
--   design, and the same precondition, as 20261017_20 (read its header). Ids
--   are collected first through the GIN index, then windowed by id; only the
--   page's rows are joined to their text and their book. SECURITY INVOKER,
--   search_path '', EXECUTE for service_role only.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run without the two tables; adds decree_pages.number_text /
--      order_index if missing (production has both — the owner's
--      fix_schema_run_in_studio.sql of 2026-10-15 added them; no migration in
--      this repo does, so a database built from the migrations lacks them).
--   1. feqh_blocks and decree_pages: revoke ALL from anon, authenticated,
--      PUBLIC (a table-level REVOKE also clears every column grant), then grant
--      SELECT on the public allow-lists above. service_role keeps ALL. RLS on.
--      Each keeps (or gets) one `using (true)` read policy for anon and
--      authenticated — without it the public columns read ZERO rows.
--   2. library.search_feqh_page(p_tsquery, p_offset, p_fetch) → jsonb
--      {"rows": [...], "count": n}.
--   3. Marker: the comment on library.feqh_blocks contains
--      'TEXT SERVER-ONLY since 20261018_02' — _verify.sql keys on it.
--   4. Verify block — RAISES (the whole transaction rolls back) unless: the
--      public columns are readable and NO other column is (a pg_attribute
--      sweep); no write privilege for the API roles; RLS on; a read policy
--      exists; service_role reads both; the function is INVOKER, carries the
--      4s timeout and search_path, and only service_role can EXECUTE it.
--   5. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — CODE FIRST, THEN THIS MIGRATION
--   1. Deploy the code of the commit that adds this file. It works identically
--      before and after this migration: the books and decrees routes read the
--      text with the service role, and the fiqh search calls the function and
--      falls back to its old request-client query ONLY while the function is
--      missing (that query keeps anon's 3s limit; after this file it would
--      answer 42501 — the lock and the function ship together).
--   2. Then apply this file by hand in the SQL Editor (as postgres).
--   3. Then run supabase/migrations/_verify.sql.
--   Applying this file BEFORE the code deploy makes every fiqh book and every
--   decree page answer 500 and the fiqh search fail, until the code is
--   deployed.
--
-- BEFORE APPLYING — other readers with the anon key
--   Anything outside this repo that reads fiqh text or decree pages with the
--   public anon key (n8n workflows, the owner's library agent, ad-hoc scripts)
--   gets 42501 after this file. scripts/library-rows-diff.mjs and the loader
--   use the service key.
--
-- WHAT RE-OPENS THE LOCK (do not do these after this file)
--   * Re-running 20260922_01_library_grants.sql or 20260626 §7 (the catch-all
--     `grant select on all tables in schema library`): table-level SELECT on
--     both tables again. Re-run THIS file right after.
--   * Re-importing a schema dump that carries the old grants.
--   * Dropping and re-creating either table (default privileges grant anon
--     SELECT). Re-run this file afterwards.
--   _verify.sql raises in each case (the marker survives the first two).
--
-- ROLLBACK (re-opens the fiqh and decree text to the anon key — owner decision required)
--   begin;
--     grant select on library.feqh_blocks, library.decree_pages to anon, authenticated;
--     drop function if exists library.search_feqh_page(text, integer, integer);
--     comment on table library.feqh_blocks is 'Content blocks within a fiqh section: matn (core text), sharh (commentary), hashiyah (marginal notes).';
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order, and the two decree_pages columns production already has ────────
do $$
begin
  if to_regclass('library.feqh_blocks') is null or to_regclass('library.decree_pages') is null
     or to_regclass('library.feqh_sections') is null or to_regclass('library.feqh_chapters') is null
     or to_regclass('library.feqh_books') is null then
    raise exception '20261018_02: the fiqh / decree tables are missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.feqh_blocks'::regclass and attname = 'book_id' and not attisdropped) then
    raise exception '20261018_02: library.feqh_blocks.book_id is missing — apply 20260729_feqh_locator_labels.sql first';
  end if;
end $$;

alter table library.decree_pages add column if not exists number_text text;
alter table library.decree_pages add column if not exists order_index integer;

-- ── 1. Column locks ──────────────────────────────────────────────────────────
revoke all on library.feqh_blocks from anon, authenticated, public;
grant select (id, section_id, topic, volume_number, page_number, order_index, created_at, updated_at, page_label, volume_label, book_id) on library.feqh_blocks to anon, authenticated;
grant all on library.feqh_blocks to service_role;
alter table library.feqh_blocks enable row level security;

revoke all on library.decree_pages from anon, authenticated, public;
grant select (id, decree_id, page_number, created_at, updated_at, number_text, order_index) on library.decree_pages to anon, authenticated;
grant all on library.decree_pages to service_role;
alter table library.decree_pages enable row level security;

-- The public columns need a read policy (RLS is on); keep the one that
-- exists, create it where none does.
do $$
declare
  t text;
begin
  foreach t in array array['feqh_blocks', 'decree_pages'] loop
    if not exists (select 1 from pg_policies pol
                    where pol.schemaname = 'library' and pol.tablename = t
                      and pol.cmd in ('SELECT', 'ALL')
                      and pol.roles && array['anon', 'public']::name[]) then
      execute format('create policy %I on library.%I for select to anon, authenticated using (true)',
                     'Allow public read on library.' || t, t);
      raise notice '20261018_02: created the public read policy on library.%', t;
    end if;
  end loop;
end $$;

-- ── 2. The fiqh search window, with its own time limit ───────────────────────
create or replace function library.search_feqh_page(
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
               order by b.id)
        from page pg
        join library.feqh_blocks   b  on b.id  = pg.id
        join library.feqh_sections s  on s.id  = b.section_id
        join library.feqh_chapters c  on c.id  = s.chapter_id
        join library.feqh_books    bk on bk.id = c.book_id
    ), '[]'::jsonb)
  )
$$;

comment on function library.search_feqh_page(text, integer, integer) is
  'Fiqh section of POST /api/library/search (20261018_02, owner answer 183): one id-ordered window of full-text matches on library.feqh_blocks plus the total, with a 4s statement_timeout that PostgREST applies before the call. service_role only — returns the server-only fiqh text.';

revoke all on function library.search_feqh_page(text, integer, integer) from public, anon, authenticated;
grant execute on function library.search_feqh_page(text, integer, integer) to service_role;

-- ── 3. Marker (read by _verify.sql) ──────────────────────────────────────────
comment on table library.feqh_blocks is
  'Content blocks within a fiqh section: matn (core text), sharh (commentary), hashiyah (marginal notes). TEXT SERVER-ONLY since 20261018_02 (owner answer 183): anon/authenticated read the block''s place only; matn, sharh, hashiyah and fts — and decree_pages.content — are read by the Next routes with the service role and masked per tier.';

-- ── 4. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  spec    record;
  r       text;
  a       record;
  priv    text;
  fn      constant text := 'library.search_feqh_page(text, integer, integer)';
  cfg     text[];
  definer boolean;
  missing text := '';
begin
  for spec in
    select * from (values
      ('library.feqh_blocks', array['id', 'section_id', 'topic', 'volume_number', 'page_number', 'order_index', 'created_at', 'updated_at', 'page_label', 'volume_label', 'book_id']),
      ('library.decree_pages', array['id', 'decree_id', 'page_number', 'created_at', 'updated_at', 'number_text', 'order_index'])
    ) v(tbl, allowed)
  loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, spec.tbl, 'SELECT') then
        missing := missing || format(' %s holds table-level SELECT on %s;', r, spec.tbl);
      end if;
      foreach priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege(r, spec.tbl, priv) then
          missing := missing || format(' %s holds %s on %s;', r, priv, spec.tbl);
        end if;
      end loop;
      for a in
        select att.attname::text as name
          from pg_attribute att
         where att.attrelid = spec.tbl::regclass and att.attnum > 0 and not att.attisdropped
      loop
        if (a.name = any (spec.allowed)) <> has_column_privilege(r, spec.tbl, a.name, 'SELECT') then
          missing := missing || format(' %s %s SELECT on %s.%s;', r,
            case when a.name = any (spec.allowed) then 'lacks' else 'holds' end, spec.tbl, a.name);
        end if;
      end loop;
    end loop;
    if not exists (select 1 from pg_class where oid = spec.tbl::regclass and relrowsecurity) then
      missing := missing || format(' RLS is off on %s;', spec.tbl);
    end if;
    if not exists (select 1 from pg_policies pol
                    where pol.schemaname || '.' || pol.tablename = spec.tbl
                      and pol.cmd in ('SELECT', 'ALL')
                      and pol.roles && array['anon', 'public']::name[]) then
      missing := missing || format(' %s has no read policy for anon (the public columns would read zero rows);', spec.tbl);
    end if;
    if not has_table_privilege('service_role', spec.tbl, 'SELECT') then
      missing := missing || format(' service_role cannot read %s;', spec.tbl);
    end if;
  end loop;

  select p.proconfig, p.prosecdef into cfg, definer
    from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn);
  if not found then
    missing := missing || format(' %s does not exist;', fn);
  else
    if definer then missing := missing || ' search_feqh_page is SECURITY DEFINER (expected INVOKER);'; end if;
    if cfg is null or not ('statement_timeout=4s' = any (cfg)) then
      missing := missing || format(' search_feqh_page proconfig %s lacks statement_timeout=4s;', coalesce(cfg::text, 'NULL'));
    end if;
    if cfg is null or not ('search_path=""' = any (cfg)) then
      missing := missing || format(' search_feqh_page proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE search_feqh_page (it returns the server-only text);', r);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_proc p, pg_catalog.aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
                where p.oid = to_regprocedure(fn) and x.grantee = 0 and x.privilege_type = 'EXECUTE') then
      missing := missing || ' PUBLIC holds EXECUTE on search_feqh_page;';
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || ' service_role cannot EXECUTE search_feqh_page;';
    end if;
  end if;

  if missing <> '' then
    raise exception '20261018_02 verify:%', missing;
  end if;
  raise notice '20261018_02 verify: OK — fiqh text (matn, sharh, hashiyah, fts) and decree page content are server-only; their place columns stay public; search_feqh_page is INVOKER, 4s, service_role only';
end $$;

commit;

notify pgrst, 'reload schema';
