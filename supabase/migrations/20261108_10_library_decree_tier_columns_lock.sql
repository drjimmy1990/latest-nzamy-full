-- =============================================================================
-- Migration: 20261108_10_library_decree_tier_columns_lock.sql
-- =============================================================================
-- PURPOSE
--   Owner decisions ٤٢٤ (2026-11-07, confirming ٣٨٠) and T28-22 / ٣١٩: a
--   decree's or circular's number (`ref`), its date and its official link are
--   for SUBSCRIBERS only, and a non-subscriber's موجز / summary loses every
--   decree number and date. The Next routes mask them per viewer
--   (maskDecreeOfficialFields, summaryForViewer, maskOfficialDates — the
--   decree page, the /laws catalogue, the search, the monitor), but
--   20261019_40 left all of them on the anon allow-list, so anyone holding the
--   PUBLIC anon key read them raw, straight from PostgREST:
--
--       GET {SUPABASE_URL}/rest/v1/decrees_circulars?select=ref,date,official_url,summary,summary_brief,fts
--           (Accept-Profile: library)
--
-- WHAT IS LOCKED (anon + authenticated lose SELECT)
--   library.decrees_circulars
--     ref, date, official_url   owner ٤٢٤ / ٣٨٠ — maskDecreeOfficialFields.
--     summary, summary_brief    owner ٣١٩ rule applied to decrees: a
--                               non-subscriber gets them through
--                               summaryForViewer (numbers and dates removed);
--                               the raw column carries both.
--     fts                       the GENERATED tsvector over title, summary and
--                               summary_brief (20260626 :215; + ref if
--                               20260823 was ever applied). It holds every
--                               word of the summaries WITH its position — the
--                               decree numbers and dates included — so
--                               `select=fts` rebuilds what the mask removes.
--                               Same reasoning as principles.fts (20261016_01).
--     preamble                  already locked by 20261019_40; stays locked.
--   ...and every column added to the table later, until a migration grants it
--   (the lock fails closed: no table-level grant is left).
--
-- WHAT STAYS PUBLIC (anon + authenticated, SELECT only)
--   id, title, type, issuer, category, hashtags, created_at, updated_at,
--   instrument_ar — what every viewer is shown unmasked and what the
--   request-client reads that remain filter on: libraryStats counts `id`,
--   /api/library/folders/titles reads `id, title`.
--   (The title is public by owner decision — the decree route says so — even
--   where it names the instrument.)
--
-- WHO READS THE LOCKED COLUMNS AFTER THIS FILE — all with the service role,
-- each masking per tier exactly as before (the commit that adds this file):
--   src/app/api/library/decrees/[id]/route.ts   the decree header
--   src/app/api/library/init/route.ts           the /laws orders list
--   src/app/api/library/search/route.ts         orders search (fts) + count
--   src/app/api/library/autocomplete/route.ts   decree count + top matches (fts)
--   src/app/api/library/monitor/route.ts        the orders feed (date filter)
--   (already service role: sitemap, libraryDocumentSeo, admin library route,
--   library.search_decrees_relevance — EXECUTE is service_role only.)
--   src/app/api/library/library-decree-tier-lock.test.ts and
--   library-column-lock.test.ts scan every request-client read in src/ against
--   the allow-list below.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run without library.decrees_circulars, its instrument_ar
--      column, and the 20261019_40 marker (this file narrows that one's list).
--   1. revoke ALL from anon, authenticated, PUBLIC (a table-level REVOKE also
--      clears every column grant), then grant SELECT on the allow-list above.
--      service_role keeps ALL. RLS on. The `using (true)` read policy is kept
--      (or created) — without it the public columns read ZERO rows.
--   2. Marker: the table comment keeps 'PREAMBLE SERVER-ONLY since
--      20261019_40' (still true) and adds 'TIER COLUMNS SERVER-ONLY since
--      20261108_10'.
--   3. Verify block — RAISES (the whole transaction rolls back) unless the
--      allow-list is readable and NO other column is (pg_attribute sweep of the
--      EFFECTIVE privilege); no write privilege for the API roles; RLS on; a
--      read policy; service_role reads and writes.
--   4. notify pgrst; then a final SELECT returns one row per (role, column)
--      with an `ok` boolean, for the SQL Editor (which hides NOTICEs).
--
-- DEPLOY ORDER — RUN AFTER THE DEPLOY OF THIS COMMIT (CODE FIRST)
--   1. Deploy the code of the commit that adds this file. Before it the decree
--      page, the catalogue, search, autocomplete and the monitor read these
--      columns with the request client; after this file those reads answer
--      42501 (decree pages 404, the orders section of /laws degraded, the
--      orders search / autocomplete empty, the monitor without orders). The
--      new code works identically before and after this migration.
--   2. Then apply this file by hand (SQL Editor or docker exec … psql, as
--      postgres).
--   3. Then run supabase/migrations/_verify.sql — ONLY once its 20261019_40
--      block skips when the 20261108_10 marker is present (otherwise that
--      block raises «cannot read public column … ref»: it still holds the old
--      15-column list).
--
-- BEFORE APPLYING — readers outside this repo that would break
--   Anything that reads decrees_circulars with the public ANON key and names
--   ref, date, official_url, summary, summary_brief or fts (or `select=*`, or
--   filters / searches on them — a filter needs the same privilege) gets
--   42501 after this file:
--     * live n8n workflows on n8n.asra3.com — the in-repo workflows
--       (n8n/ai/*.json, n8n/workflows/*.json) never REST-read the library
--       (the app retrieves and sends texts); the live instance was NOT checked;
--     * the owner's library agent / ad-hoc scripts on the anon key.
--   In-repo scripts are unaffected: scripts/verify-library.ts counts `id`
--   (allowed); check-counts.mjs, library-rows-diff.mjs and the loader use the
--   service key.
--
-- WHAT RE-OPENS THE LOCK (do not do these after this file)
--   * Re-running 20261019_40_library_decree_preamble_lock.sql: its grant puts
--     ref, date, official_url, summary, summary_brief and fts back. Re-run
--     THIS file right after.
--   * Re-running 20260922_01_library_grants.sql or 20260626 §7 (the catch-all
--     `grant select on all tables in schema library`): table-level SELECT
--     again. Re-run 20261018_02 and THIS file right after.
--   * Re-importing a schema dump that carries the old grants; dropping and
--     re-creating the table (default privileges grant anon SELECT).
--   The verify snippet (docs/plans/2026-11-08-snippets/A1-verify.sql) raises
--   in each case while the marker survives.
--
-- A NOTE ON REVOKE
--   REVOKE removes only grants whose grantor is the object owner (a
--   superuser's REVOKE acts as the owner). A grant recorded under another
--   grantor survives it — the verify block checks the EFFECTIVE privilege, so
--   that case raises instead of passing.
--
-- ROLLBACK (re-opens the number, date, link and raw summaries to the anon
-- key — owner decision required; the preamble stays locked)
--   begin;
--     grant select (ref, date, summary, summary_brief, official_url, fts)
--       on library.decrees_circulars to anon, authenticated;
--     comment on table library.decrees_circulars is 'Royal decrees, cabinet decisions, and ministerial circulars. PREAMBLE SERVER-ONLY since 20261019_40 (owner answer 221).';
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order ─────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('library.decrees_circulars') is null then
    raise exception '20261108_10: library.decrees_circulars is missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.decrees_circulars'::regclass and attname = 'instrument_ar' and not attisdropped) then
    raise exception '20261108_10: library.decrees_circulars.instrument_ar is missing — apply 20260729_decree_instrument_taxonomy.sql first';
  end if;
  if coalesce(obj_description('library.decrees_circulars'::regclass, 'pg_class'), '') not ilike '%preamble server-only since 20261019_40%' then
    raise exception '20261108_10: apply 20261019_40_library_decree_preamble_lock.sql first — this file narrows its allow-list';
  end if;
end $$;

-- ── 1. Column lock ───────────────────────────────────────────────────────────
revoke all on library.decrees_circulars from anon, authenticated, public;
grant select (id, title, type, issuer, category, hashtags, created_at, updated_at, instrument_ar) on library.decrees_circulars to anon, authenticated;
grant all on library.decrees_circulars to service_role;
alter table library.decrees_circulars enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies pol
                  where pol.schemaname = 'library' and pol.tablename = 'decrees_circulars'
                    and pol.cmd in ('SELECT', 'ALL')
                    and pol.roles && array['anon', 'public']::name[]) then
    create policy "Allow public read on library.decrees_circulars" on library.decrees_circulars
      for select to anon, authenticated using (true);
    raise notice '20261108_10: created the public read policy on library.decrees_circulars';
  end if;
end $$;

-- ── 2. Marker ────────────────────────────────────────────────────────────────
comment on table library.decrees_circulars is
  'Royal decrees, cabinet decisions, and ministerial circulars. PREAMBLE SERVER-ONLY since 20261019_40 (owner answer 221). TIER COLUMNS SERVER-ONLY since 20261108_10 (owner 424/380/319): ref, date, official_url, summary, summary_brief and fts are read by the Next routes with the service role and masked per tier; anon/authenticated read id, title, type, issuer, category, hashtags, created_at, updated_at, instrument_ar only.';

-- ── 3. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  tbl     constant text := 'library.decrees_circulars';
  allowed constant text[] := array['id', 'title', 'type', 'issuer', 'category', 'hashtags', 'created_at', 'updated_at', 'instrument_ar'];
  r       text;
  a       record;
  priv    text;
  missing text := '';
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, tbl, 'SELECT') then
      missing := missing || format(' %s holds table-level SELECT on %s;', r, tbl);
    end if;
    foreach priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
      if has_table_privilege(r, tbl, priv) then
        missing := missing || format(' %s holds %s on %s;', r, priv, tbl);
      end if;
    end loop;
    if has_any_column_privilege(r, tbl, 'INSERT') or has_any_column_privilege(r, tbl, 'UPDATE') then
      missing := missing || format(' %s holds a column-level write on %s;', r, tbl);
    end if;
    for a in
      select att.attname::text as name
        from pg_attribute att
       where att.attrelid = tbl::regclass and att.attnum > 0 and not att.attisdropped
    loop
      if (a.name = any (allowed)) <> has_column_privilege(r, tbl, a.name, 'SELECT') then
        missing := missing || format(' %s %s SELECT on %s.%s;', r,
          case when a.name = any (allowed) then 'lacks' else 'holds' end, tbl, a.name);
      end if;
    end loop;
  end loop;
  if not exists (select 1 from pg_class where oid = tbl::regclass and relrowsecurity) then
    missing := missing || format(' RLS is off on %s;', tbl);
  end if;
  if not exists (select 1 from pg_policies pol
                  where pol.schemaname || '.' || pol.tablename = tbl
                    and pol.cmd in ('SELECT', 'ALL')
                    and pol.roles && array['anon', 'public']::name[]) then
    missing := missing || format(' %s has no read policy for anon (the public columns would read zero rows);', tbl);
  end if;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', tbl, priv) then
      missing := missing || format(' service_role lacks %s on %s;', priv, tbl);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261108_10 verify:%', missing;
  end if;
  raise notice '20261108_10 verify: OK — decrees_circulars ref/date/official_url/summary/summary_brief/fts (and preamble) are server-only; 9 catalogue columns stay public; RLS on; service_role keeps ALL';
end $$;

commit;

notify pgrst, 'reload schema';

-- ── 4. Result for the SQL Editor: every row must say ok = true ───────────────
select r.role, a.attname::text as column_name,
       (a.attname::text = any (array['id', 'title', 'type', 'issuer', 'category', 'hashtags', 'created_at', 'updated_at', 'instrument_ar'])) as should_read,
       has_column_privilege(r.role, 'library.decrees_circulars'::regclass, a.attnum, 'SELECT') as can_read,
       (a.attname::text = any (array['id', 'title', 'type', 'issuer', 'category', 'hashtags', 'created_at', 'updated_at', 'instrument_ar']))
         = has_column_privilege(r.role, 'library.decrees_circulars'::regclass, a.attnum, 'SELECT') as ok
  from (values ('anon'), ('authenticated')) as r(role)
  join pg_attribute a on a.attrelid = 'library.decrees_circulars'::regclass and a.attnum > 0 and not a.attisdropped
 order by ok, r.role, a.attnum;
