-- =============================================================================
-- Migration: 20261004_01_library_column_lock.sql
-- =============================================================================
-- PURPOSE
--   Owner question ١٦٢ (approved): the database-level half of T28-22, plus the
--   internal metadata of the judicial collections.
--
--   T28-22 made a law's official metadata — the issuing decree and its date,
--   the official links, the Umm Al-Qura gazette reference and the preamble that
--   carries the decree card — a SUBSCRIBER feature. The Next routes mask it
--   (src/app/api/library/laws/[slug]/_official-meta.ts), but until this file
--   the PUBLIC anon key read it straight from PostgREST:
--
--       GET {SUPABASE_URL}/rest/v1/laws?select=preamble,issuing_instrument    (Accept-Profile: library)
--       GET {SUPABASE_URL}/rest/v1/v_laws_enactment_status?select=gazette_url
--
--   and library.judicial_collections.metadata / library.principles.metadata
--   (the whole source front matter, internal editorial / review notes
--   included) were readable the same way:
--
--       GET {SUPABASE_URL}/rest/v1/principles?select=metadata
--
--   because 20260626_legal_library_schema.sql:885 and
--   20260922_01_library_grants.sql §3 granted table-level SELECT on every
--   library table. (Stripping the keys already stored in `metadata` is a
--   separate one-time SQL; this file makes sure `metadata` is never
--   anon-readable again, whatever lands in it.)
--
--   After this file the three tables are COLUMN-LOCKED: anon / authenticated
--   hold SELECT on an explicit allow-list of columns only — what the public
--   product shows to every visitor, filters or sorts on — and nothing else.
--   The routes read the locked columns with the service role and mask them per
--   tier exactly as before (init, enactments, monitor, laws/[slug]). A FILTER
--   on a column needs the same privilege as selecting it, so every column a
--   request-client read filters, sorts or searches on stays on the list.
--
-- THE ALLOW-LIST (anon + authenticated, SELECT only)
--   library.laws (20 of 41 columns):
--     slug, title, title_en, type, description, section_code, section_name,
--     status, total_articles, has_merged_regulation, effective_date_hijri,
--     effective_date_gregorian, supersedes_law_slug, instrument_id,
--     parent_law_id, parent_law, enabling_article, fts, created_at, updated_at
--     (effective dates, the supersession link and the parent-law link are
--     shown to every visitor: monitor / enactments / laws/[slug] replacedBy,
--     parentLaw*; the laws/[slug] replacedBy and parent lookups filter on
--     supersedes_law_slug and instrument_id with the request client)
--   library.judicial_collections: every column except `metadata`.
--   library.principles: every column except `metadata`.
--     (principles.issuing_body is in every principle's title; collection_id /
--     judicial_collections.id carry the embed in /api/library/init.)
--   `fts` stays readable on laws and principles ON PURPOSE. It is generated
--   only from columns that stay readable (laws: title + description;
--   principles: text, ruling_basis, facts, reasons, ruling and the reference
--   numbers), so locking it would hide nothing — but every public full-text
--   search (/api/library/search and /autocomplete: law titles, principles)
--   filters on it, and locking it would push those guest searches onto the
--   service role, which has no statement_timeout. On the request client
--   anon's ~3s timeout still bounds a broad query.
--
-- WHAT IS LOCKED, AND WHY
--   library.laws
--     issuing_instrument, issue_date_hijri  T28-22: masked for non-subscribers on
--                                 the law page, the catalogue and the countdown.
--     issue_date_gregorian        the same issue date in Gregorian; no reader.
--     publication_date_hijri      masked in enactments and monitor (T28-22).
--     publication_date_gregorian  its Gregorian twin; no reader.
--     boe_source_url, official_source_url   masked (law page `source`,
--                                 `officialSourceUrl`).
--     law_guid                    the BOE id the official link is built from.
--     gazette_issue_number, gazette_publication_date, gazette_url   masked
--                                 (law page `gazette`, countdown).
--     preamble                    masked: it opens with the decree card and the
--                                 decree itself (5,477 laws, 2026-09-28).
--     issuing_body                the issuing authority — part of the issuing
--                                 record; no route reads it for laws.
--     latest_update               jsonb about the latest amendment; amending
--                                 decrees are masked on the law page; no reader.
--     article_status_summary      init strips it from locked rows; no reader.
--     effective_date_note         free-text basis of the effective-date
--                                 computation (cites the publication); no reader.
--     enactment_clause_text       VERBATIM text of the enactment article —
--                                 statutory text, server-only since T28-21.
--     enactment_article_number, enactment_period_days   the rest of that
--                                 enactment record; no reader.
--     supersedes_law_ref          verbatim citation quoted from the preamble.
--     supersedes_law_title        free text from the same citation; no reader
--                                 (replacedBy shows the newer law's own title).
--   library.judicial_collections
--     metadata                    source front matter: internal editorial and
--                                 review notes (editorial_notes, review_*,
--                                 needs_human_review …).
--   library.principles
--     metadata                    the same.
--   (The live column lists hold no `needs_human_review` / `review_reason`
--   COLUMN on either table — those exist only as keys inside `metadata`.)
--
--   library.v_laws_enactment_status (SECURITY INVOKER view over library.laws,
--   no reader in src/): anon / authenticated lose SELECT on it — it projects
--   most of the locked columns, and a closed view is a clean 42501 rather than
--   a per-column surprise.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run before 20260929_01 (see ORDER below).
--   1. revoke ALL on the three tables from anon, authenticated, PUBLIC (a
--      table-level REVOKE also clears every column-level grant on it), then
--      grant SELECT (<allow-list>) to anon, authenticated. A column missing
--      from the database makes the GRANT fail — loudly, on purpose.
--   2. grant ALL on the three to service_role (unchanged, re-asserted).
--   3. RLS stays ENABLED and the existing `using (true)` read policies stay:
--      without them anon would read ZERO rows of the allowed columns.
--   4. revoke ALL on library.v_laws_enactment_status from anon, authenticated,
--      PUBLIC (guarded: absent view → notice).
--   5. marker: comment on table library.laws contains
--      'COLUMN-LOCKED since 20261004_01' (matched case-insensitively) —
--      _verify.sql keys its assertions on it.
--   6. verify block — RAISES (whole transaction rolls back) unless: no
--      table-level privilege for anon/authenticated; every allow-list column
--      readable; NO other column readable (a pg_attribute sweep, so a column
--      the list forgot cannot slip through); no write privilege; a public read
--      policy and RLS on each table; service_role reads and writes all three;
--      the view closed; law_facet_counts() still callable; the article lock of
--      20260929_01 still in place (hence step 0).
--   7. notify pgrst to reload its schema cache.
--
--   A COLUMN ADDED LATER IS LOCKED BY DEFAULT: no table-level grant is left,
--   and ALTER DEFAULT PRIVILEGES covers new tables, not new columns. That
--   fails closed — but a request-client select naming the new column answers
--   42501 until a new migration adds it to the allow-list.
--
-- DEPLOY ORDER — CODE FIRST, THEN THIS MIGRATION
--   1. Deploy the code of the commit that adds this file. It reads the locked
--      columns with the service role, names explicit columns everywhere, and
--      never selects `*` on these tables; it works identically before and
--      after this migration.
--   2. Then apply this file by hand in the SQL Editor (as postgres).
--   3. Then run supabase/migrations/_verify.sql — with the marker present it
--      asserts the lock.
--   Applying this file BEFORE the code deploy (old code: `select('*')` on laws
--   and judicial_collections, the decree / issue / gazette columns read with
--   the anon key) makes every law page answer 404, every precedent page 500,
--   the catalogue's laws section degraded and /api/library/enactments and
--   /api/library/monitor 503, until the code is deployed. Search and
--   autocomplete are unaffected (they read allowed columns only).
--
-- ORDER RELATIVE TO 20260929_01 — 20260929_01 FIRST
--   This file's verify asserts the article lock 20260929_01 leaves, so
--   20260929_01 must be applied BEFORE it (step 0 raises otherwise).
--   Re-running 20260929_01 AFTER this file is safe: its catalogue check uses
--   has_any_column_privilege, which a column grant satisfies.
--
-- BEFORE APPLYING — other readers with the anon key
--   Anything outside this repo that reads these columns (or `select=*`) with
--   the public anon key — n8n workflows on n8n.asra3.com, ad-hoc scripts — gets
--   42501 after this file. In-repo: scripts/verify-library.ts counts every
--   table on its key column (`slug` / `id`, both allowed), so it keeps
--   working with the anon key; the seeders and
--   selfhost/copy-reference-data.mjs use the service key.
--
-- WHAT RE-OPENS THE LOCK (do not do these after this file)
--   * Re-running 20260922_01_library_grants.sql: its §3 catch-all
--     `grant select on all tables in schema library to anon, authenticated`
--     re-grants TABLE-level SELECT on all three tables (every column again)
--     and on the view.
--   * Re-running 20260626_legal_library_schema.sql §7 (same catch-all).
--   * Re-importing scripts/selfhost/run4_delivery/01-schema.sql: it carries
--     the table-level grants explicitly (`GRANT SELECT ON TABLE
--     "library"."laws" TO "anon"` …, :13446-13466, view :13534-13535).
--   * Dropping and re-creating any of the three tables: the schema's default
--     privileges grant anon table-level SELECT on the new table. Re-run this
--     file afterwards.
--   _verify.sql raises in the first three cases (the marker survives them); in
--   the fourth the marker on library.laws may be gone, and _verify.sql only
--   reports 20261004_01 as "not applied" — re-run this file.
--
-- A NOTE ON REVOKE
--   REVOKE removes only grants whose grantor is the object owner (a
--   superuser's REVOKE acts as the owner). A grant recorded under another
--   grantor (e.g. supabase_admin on an imported schema) survives it — the
--   verify block checks the EFFECTIVE privilege, so that case raises instead
--   of passing.
--
-- PREREQUISITES
--   * 20260626_legal_library_schema.sql, 20260722_laws_add_gregorian_guid.sql,
--     20260821_judicial_principles_missing_columns.sql,
--     20260824 / 20260911 (laws date + gazette columns),
--     20260919_laws_parent_linkage_columns.sql,
--     20260922_01_library_grants.sql, 20260929_01_library_text_server_only.sql.
--   * The code deploy described above.
--
-- ROLLBACK (re-opens the official metadata and `metadata` to the anon key —
-- owner decision required)
--   begin;
--     grant select on library.laws, library.judicial_collections,
--                     library.principles to anon, authenticated;
--     grant select on library.v_laws_enactment_status to anon, authenticated;
--     comment on table library.laws is 'Saudi laws and regulations master table.';
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order: 20260929_01 first ──────────────────────────────────────────────
do $$
begin
  if coalesce(obj_description('library.articles'::regclass, 'pg_class'), '') not ilike '%server-only since 20260929_01%' then
    raise exception '20261004_01: apply 20260929_01_library_text_server_only.sql first — the verify below asserts the article lock it leaves';
  end if;
end $$;

-- ── 1 + 2. library.laws: table privilege off, allow-list on ──────────────────
revoke all on library.laws from anon, authenticated, public;
grant select (
  slug, title, title_en, type, description, section_code, section_name,
  status, total_articles, has_merged_regulation,
  effective_date_hijri, effective_date_gregorian,
  supersedes_law_slug, instrument_id, parent_law_id, parent_law, enabling_article,
  fts, created_at, updated_at
) on library.laws to anon, authenticated;
grant all on library.laws to service_role;

-- ── 1 + 2. library.judicial_collections: everything but `metadata` ───────────
revoke all on library.judicial_collections from anon, authenticated, public;
grant select (
  id, title, court, year_hijri, part, source_id, series_id, track, description,
  ruling_count, free, progress, created_at, updated_at
) on library.judicial_collections to anon, authenticated;
grant all on library.judicial_collections to service_role;

-- ── 1 + 2. library.principles: everything but `metadata` ─────────────────────
revoke all on library.principles from anon, authenticated, public;
grant select (
  id, collection_id, principle_number, issuing_body, session_date,
  decision_number, reference, text, ruling_basis, facts, reasons, ruling,
  year_hijri, order_index, classification_keywords, hashtags, is_redacted,
  fts, created_at, updated_at
) on library.principles to anon, authenticated;
grant all on library.principles to service_role;

-- ── 3. RLS stays on (the `using (true)` read policies are left in place) ─────
alter table library.laws                 enable row level security;
alter table library.judicial_collections enable row level security;
alter table library.principles           enable row level security;

-- ── 4. The enactment-status view leaves the API surface ──────────────────────
do $$
begin
  if to_regclass('library.v_laws_enactment_status') is not null then
    revoke all on library.v_laws_enactment_status from anon, authenticated, public;
    grant select on library.v_laws_enactment_status to service_role;
  else
    raise notice '20261004_01: library.v_laws_enactment_status does not exist here — skipped';
  end if;
end $$;

-- ── 5. Marker (read by _verify.sql) ──────────────────────────────────────────
comment on table library.laws is
  'Saudi laws and regulations master table. COLUMN-LOCKED since 20261004_01 (owner question 162): anon/authenticated hold SELECT on an explicit column allow-list only; the official metadata (decree, issue/publication dates, gazette, official links, preamble) is read by the Next routes with the service role and masked per tier.';

-- ── 6. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  spec    record;
  r       text;
  col     text;
  a       record;
  missing text := '';
begin
  for spec in
    select * from (values
      ('library.laws', array[
        'slug', 'title', 'title_en', 'type', 'description', 'section_code', 'section_name',
        'status', 'total_articles', 'has_merged_regulation',
        'effective_date_hijri', 'effective_date_gregorian',
        'supersedes_law_slug', 'instrument_id', 'parent_law_id', 'parent_law', 'enabling_article',
        'fts', 'created_at', 'updated_at']),
      ('library.judicial_collections', array[
        'id', 'title', 'court', 'year_hijri', 'part', 'source_id', 'series_id', 'track', 'description',
        'ruling_count', 'free', 'progress', 'created_at', 'updated_at']),
      ('library.principles', array[
        'id', 'collection_id', 'principle_number', 'issuing_body', 'session_date',
        'decision_number', 'reference', 'text', 'ruling_basis', 'facts', 'reasons', 'ruling',
        'year_hijri', 'order_index', 'classification_keywords', 'hashtags', 'is_redacted',
        'fts', 'created_at', 'updated_at'])
    ) as v(tbl, allowed)
  loop
    foreach r in array array['anon', 'authenticated']
    loop
      if has_table_privilege(r, spec.tbl, 'SELECT') then
        missing := missing || format(' %s holds table-level SELECT on %s;', r, spec.tbl);
      end if;
      if has_table_privilege(r, spec.tbl, 'INSERT') or has_table_privilege(r, spec.tbl, 'UPDATE')
         or has_table_privilege(r, spec.tbl, 'DELETE') or has_table_privilege(r, spec.tbl, 'TRUNCATE')
         or has_any_column_privilege(r, spec.tbl, 'INSERT')
         or has_any_column_privilege(r, spec.tbl, 'UPDATE') then
        missing := missing || format(' %s can write %s;', r, spec.tbl);
      end if;
      foreach col in array spec.allowed
      loop
        if not has_column_privilege(r, spec.tbl, col, 'SELECT') then
          missing := missing || format(' %s cannot read allowed column %s.%s;', r, spec.tbl, col);
        end if;
      end loop;
      -- The sweep: every live column outside the allow-list must be unreadable.
      for a in
        select att.attname::text as name
          from pg_attribute att
         where att.attrelid = spec.tbl::regclass
           and att.attnum > 0
           and not att.attisdropped
      loop
        if not (a.name = any (spec.allowed)) and has_column_privilege(r, spec.tbl, a.name, 'SELECT') then
          missing := missing || format(' %s can read locked column %s.%s;', r, spec.tbl, a.name);
        end if;
      end loop;
    end loop;

    if not has_table_privilege('service_role', spec.tbl, 'SELECT')
       or not has_table_privilege('service_role', spec.tbl, 'INSERT')
       or not has_table_privilege('service_role', spec.tbl, 'UPDATE')
       or not has_table_privilege('service_role', spec.tbl, 'DELETE') then
      missing := missing || format(' service_role lacks read/write on %s;', spec.tbl);
    end if;

    if not (select relrowsecurity from pg_class where oid = spec.tbl::regclass) then
      missing := missing || format(' RLS is off on %s;', spec.tbl);
    end if;
    -- RLS on with no read policy = anon reads ZERO rows of the allowed columns.
    if not exists (
      select 1 from pg_policies pol
       where pol.schemaname || '.' || pol.tablename = spec.tbl
         and pol.cmd in ('SELECT', 'ALL')
         and pol.roles && array['anon', 'public']::name[]
    ) then
      missing := missing || format(' no read policy for anon on %s (every guest read would return 0 rows);', spec.tbl);
    end if;
  end loop;

  if to_regclass('library.v_laws_enactment_status') is not null
     and (has_any_column_privilege('anon', 'library.v_laws_enactment_status', 'SELECT')
          or has_any_column_privilege('authenticated', 'library.v_laws_enactment_status', 'SELECT')) then
    missing := missing || ' an API role can SELECT library.v_laws_enactment_status;';
  end if;

  -- The facets RPC is SECURITY INVOKER over allowed columns only.
  if to_regprocedure('library.law_facet_counts()') is not null
     and not has_function_privilege('anon', 'library.law_facet_counts()', 'EXECUTE') then
    missing := missing || ' anon lost EXECUTE on library.law_facet_counts();';
  end if;

  -- The article lock of 20260929_01 is still in place.
  foreach col in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    if has_any_column_privilege('anon', col, 'SELECT') or has_any_column_privilege('authenticated', col, 'SELECT') then
      missing := missing || format(' an API role can SELECT %s (20260929_01 re-opened);', col);
    end if;
  end loop;

  if coalesce(obj_description('library.laws'::regclass, 'pg_class'), '') not ilike '%column-locked since 20261004_01%' then
    missing := missing || ' the marker comment on library.laws is missing;';
  end if;

  if missing <> '' then
    raise exception '20261004_01 verify:%', missing;
  end if;

  raise notice '20261004_01 verify: OK — laws / judicial_collections / principles are column-locked for anon/authenticated (allow-list readable, official metadata and `metadata` not; no table-level or write privilege; read policies and RLS on); v_laws_enactment_status closed; service_role reads and writes all three; the article tables stay server-only';
end $$;

commit;

-- ── 7. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select c.relname, a.attname,
--          has_column_privilege('anon', c.oid, a.attnum, 'SELECT') as anon_select
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
--    where n.nspname = 'library'
--      and c.relname in ('laws', 'judicial_collections', 'principles')
--    order by 1, 3 desc, 2;
-- And from outside (public anon key) — locked must be 401/403 (42501), allowed 200:
--   curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" \
--     "$SUPABASE_URL/rest/v1/laws?select=preamble&limit=1"          # 401/403
--   curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" \
--     "$SUPABASE_URL/rest/v1/laws?select=slug,title&limit=1"        # 200
