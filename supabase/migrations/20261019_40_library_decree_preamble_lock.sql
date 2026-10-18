-- =============================================================================
-- Migration: 20261019_40_library_decree_preamble_lock.sql
-- =============================================================================
-- PURPOSE
--   Owner answer ٢٢١ (decisions of 2026-10-18): the preamble of a decree or a
--   circular (library.decrees_circulars.preamble) is for SUBSCRIBERS only.
--   20261018_02 locked the decree PAGES (decree_pages.content) and left the
--   preamble public, with a question in the owner report; ٢٢١ answers it.
--
--   Until this file the PUBLIC anon key read every preamble straight from
--   PostgREST:
--
--       GET {SUPABASE_URL}/rest/v1/decrees_circulars?select=preamble   (Accept-Profile: library)
--
--   because 20260922_01 / 20260626 §7 gave the table table-level SELECT and a
--   `using (true)` read policy, and the decree route sent `decree.preamble` to
--   every reader.
--
-- WHAT IS LOCKED
--   library.decrees_circulars.preamble — and every column added to the table
--   later, until it is granted (a column lock fails closed).
--
-- WHAT STAYS PUBLIC (anon + authenticated, SELECT only)
--   id, title, type, issuer, ref, date, summary, summary_brief, category,
--   hashtags, official_url, fts, created_at, updated_at, instrument_ar — the
--   catalogue: the /laws index, the search and autocomplete cards, the monitor
--   feed and the decree header.
--   `fts` stays public: it is GENERATED from title, summary and summary_brief
--   only (schema dump 2026-10-10 :5175), never from the preamble, so it cannot
--   rebuild the locked text (unlike principles.fts / feqh_blocks.fts).
--
-- WHO READS THE PREAMBLE AFTER THIS FILE
--   src/app/api/library/decrees/[id]/route.ts — with the service role, and it
--   sends the text only to full library access (hasFullLibraryAccess: Pro+,
--   an active library grant, or an admin; never the free-item whitelist, the
--   same rule as a law's official metadata, T28-22). Everyone else gets
--   `preamble: ''` and `preambleLocked: true` when the decree has one, and the
--   reader (src/app/laws/orders/[slug]/page.tsx) shows «الديباجة متاحة
--   للمشتركين». The decree page preview (the first two pages, 20261018_02 /
--   owner ١٨٣) is unchanged.
--   src/app/api/library/library-column-lock.test.ts scans every request-client
--   read in src/ against the allow-list below (no `*`, no preamble).
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run without library.decrees_circulars and its instrument_ar
--      column (20260729_decree_instrument_taxonomy.sql; production has it).
--   1. revoke ALL from anon, authenticated, PUBLIC (a table-level REVOKE also
--      clears every column grant), then grant SELECT on the allow-list above.
--      service_role keeps ALL. RLS on. The table keeps (or gets) one
--      `using (true)` read policy for anon and authenticated — without it the
--      public columns read ZERO rows.
--   2. Marker: the comment on library.decrees_circulars contains
--      'PREAMBLE SERVER-ONLY since 20261019_40' — _verify.sql keys on it.
--   3. Verify block — RAISES (the whole transaction rolls back) unless: the
--      allow-list is readable and NO other column is (a pg_attribute sweep of
--      the EFFECTIVE privilege); no write privilege for the API roles; RLS on;
--      a read policy exists; service_role reads and writes the table.
--   4. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — CODE FIRST, THEN THIS MIGRATION
--   1. Deploy the code of the commit that adds the decree route's explicit
--      column list (the commit after the one adding this file). Before it the
--      route read the decree with `select('*')` through the request client;
--      after this file `*` answers 42501 and EVERY decree page would answer 404.
--      The new code works identically before and after this migration.
--   2. Then apply this file by hand in the SQL Editor (as postgres).
--   3. Then run supabase/migrations/_verify.sql (its 20261019_40 section gives
--      a NOTICE, not an error, while this file is not applied yet).
--
-- BEFORE APPLYING — other readers with the anon key
--   Anything outside this repo that reads decrees_circulars with the public
--   anon key and `select=*` or `select=preamble` (n8n workflows, the owner's
--   library agent, ad-hoc scripts) gets 42501 after this file. A read that
--   names the public columns keeps working. scripts/library-rows-diff.mjs and
--   the loader use the service key; scripts/verify-library.ts selects `id`.
--
-- WHAT RE-OPENS THE LOCK (do not do these after this file)
--   * Re-running 20260922_01_library_grants.sql or 20260626 §7 (the catch-all
--     `grant select on all tables in schema library`): table-level SELECT
--     again. Re-run THIS file right after (and 20261018_02, which it re-opens
--     too).
--   * Re-importing a schema dump that carries the old grants.
--   * Dropping and re-creating the table (default privileges grant anon
--     SELECT). Re-run this file afterwards.
--   _verify.sql raises in each case (the marker survives the first two).
--
-- ROLLBACK (re-opens the preamble to the anon key — owner decision required)
--   begin;
--     grant select on library.decrees_circulars to anon, authenticated;
--     comment on table library.decrees_circulars is 'Royal decrees, cabinet decisions, and ministerial circulars.';
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order ─────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('library.decrees_circulars') is null then
    raise exception '20261019_40: library.decrees_circulars is missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.decrees_circulars'::regclass and attname = 'instrument_ar' and not attisdropped) then
    raise exception '20261019_40: library.decrees_circulars.instrument_ar is missing — apply 20260729_decree_instrument_taxonomy.sql first';
  end if;
end $$;

-- ── 1. Column lock ───────────────────────────────────────────────────────────
revoke all on library.decrees_circulars from anon, authenticated, public;
grant select (id, title, type, issuer, ref, date, summary, summary_brief, category, hashtags, official_url, fts, created_at, updated_at, instrument_ar) on library.decrees_circulars to anon, authenticated;
grant all on library.decrees_circulars to service_role;
alter table library.decrees_circulars enable row level security;

-- The public columns need a read policy (RLS is on); keep the one that
-- exists, create it where none does.
do $$
begin
  if not exists (select 1 from pg_policies pol
                  where pol.schemaname = 'library' and pol.tablename = 'decrees_circulars'
                    and pol.cmd in ('SELECT', 'ALL')
                    and pol.roles && array['anon', 'public']::name[]) then
    create policy "Allow public read on library.decrees_circulars" on library.decrees_circulars
      for select to anon, authenticated using (true);
    raise notice '20261019_40: created the public read policy on library.decrees_circulars';
  end if;
end $$;

-- ── 2. Marker (read by _verify.sql) ──────────────────────────────────────────
comment on table library.decrees_circulars is
  'Royal decrees, cabinet decisions, and ministerial circulars. PREAMBLE SERVER-ONLY since 20261019_40 (owner answer 221): anon/authenticated read the catalogue columns only; the preamble is read by the decree route with the service role and sent to subscribers only.';

-- ── 3. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  tbl     constant text := 'library.decrees_circulars';
  allowed constant text[] := array['id', 'title', 'type', 'issuer', 'ref', 'date', 'summary', 'summary_brief', 'category', 'hashtags', 'official_url', 'fts', 'created_at', 'updated_at', 'instrument_ar'];
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
    raise exception '20261019_40 verify:%', missing;
  end if;
  raise notice '20261019_40 verify: OK — decrees_circulars.preamble is server-only; the 15 catalogue columns (fts included) stay public; RLS on; service_role keeps ALL';
end $$;

commit;

notify pgrst, 'reload schema';
