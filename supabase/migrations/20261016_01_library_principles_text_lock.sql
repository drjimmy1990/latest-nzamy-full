-- =============================================================================
-- Migration: 20261016_01_library_principles_text_lock.sql
-- =============================================================================
-- PURPOSE
--   Owner decision ١٧١ (answers of 2026-10-06): «نعم، تُغلق بالطريقة نفسها» — the
--   judicial principles are closed the same way the article text was closed by
--   20260929_01. The free interface shows a principle's number, circuit, court
--   and its short opening; the full text (reasoning, facts, ruling) sits behind
--   the sign-in / subscription wall, so the raw data cannot be pulled through
--   the API.
--
--   Until this file the PUBLIC anon key read every principle in full, straight
--   from PostgREST (verified on production 2026-10-16; one row is ~253,000
--   characters):
--
--       GET {SUPABASE_URL}/rest/v1/principles?select=text,facts,reasons,ruling   (Accept-Profile: library)
--       GET {SUPABASE_URL}/rest/v1/principle_paragraphs?select=text
--
--   because 20261004_01 left every principles column except `metadata` on the
--   anon allow-list, and principle_paragraphs kept the table-level grant and
--   the `using (true)` policy of 20260626 / 20260922_01.
--
-- WHAT IS LOCKED
--   library.principles      text, ruling_basis, facts, reasons, ruling — the
--                           principle and its judgment;
--                           fts — the GENERATED tsvector over those same five
--                           columns. It must go with them: it holds every word
--                           with its position, so `select=fts` rebuilds the
--                           text. (20261004_01 kept fts open only because its
--                           source columns were open — that reason is gone.)
--                           metadata — already locked by 20261004_01.
--   library.principle_paragraphs   the whole table (the lettered paragraphs ARE
--                           the principle's text). SERVER-ONLY like articles.
--
-- WHAT STAYS PUBLIC (anon + authenticated, SELECT only) — library.principles:
--     id, collection_id, principle_number, issuing_body, session_date,
--     decision_number, reference, year_hijri, order_index,
--     classification_keywords, hashtags, is_redacted, created_at, updated_at
--   (the catalogue card: number, issuing body, court via the collection, date,
--   decision number, keywords). library.judicial_collections is unchanged.
--
-- WHO READS THE LOCKED COLUMNS AFTER THIS FILE (all with the service role, all
-- masking per tier exactly as before — commit adding this file):
--   src/app/api/library/precedents/[slug]/route.ts   the collection window and
--       its paragraphs; a locked principle gets 150 characters, no paragraphs,
--       no details.
--   src/app/api/library/search/route.ts   the precedents section (fts filter +
--       a capped snippet; a locked hit is centred on the opening, not the query).
--   src/app/api/library/autocomplete/route.ts   the principles count and the
--       two top matches (a 120-character opening).
--   src/app/api/library/init/route.ts   the principles list (text stripped from
--       locked rows).
--   src/app/api/v1/admin/library/route.ts   already the service role.
--   Nothing else in src/ reads these columns; src/app/api/library/
--   library-column-lock.test.ts scans every request-client read in src/.
--   The matview library.cross_section_search (principle snippets) has been
--   closed to the API roles since 20260922_04 / 20260929_01.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run before 20261004_01 (its column lock is the base this
--      narrows; the marker on library.laws says it ran).
--   1. library.principles: revoke ALL from anon, authenticated, PUBLIC (a
--      table-level REVOKE also clears every column grant), then grant SELECT
--      on the public allow-list above. service_role keeps ALL. RLS stays on and
--      the `using (true)` read policy stays — without it anon would read ZERO
--      rows of the public columns.
--   2. library.principle_paragraphs: revoke ALL from anon, authenticated,
--      PUBLIC; service_role keeps ALL; every SELECT/ALL policy for anon /
--      authenticated / public is dropped (by catalogue lookup, not by name);
--      RLS stays ENABLED, so an accidental re-grant still reads zero rows.
--   3. Marker: the comment on library.principles contains
--      'TEXT SERVER-ONLY since 20261016_01' — _verify.sql keys on it.
--   4. Verify block — RAISES (the whole transaction rolls back) unless: the
--      public columns are readable and NO other principles column is (a
--      pg_attribute sweep); no write privilege for the API roles; no
--      privilege and no read policy on principle_paragraphs; RLS on both;
--      service_role reads and writes both; the article lock of 20260929_01
--      and the laws lock of 20261004_01 still hold.
--   5. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — CODE FIRST, THEN THIS MIGRATION
--   1. Deploy the code of the commit that adds this file. It reads the locked
--      columns with the service role and works identically before and after
--      this migration.
--   2. Then apply this file by hand in the SQL Editor (as postgres).
--   3. Then run supabase/migrations/_verify.sql — with the marker present it
--      asserts this lock.
--   Applying this file BEFORE the code deploy makes every precedent page answer
--   500 («تعذّر تحميل مبادئ هذه المجموعة»), the precedents section of search and
--   the library list fail, and autocomplete lose its principle hits, until the
--   code is deployed.
--
-- BEFORE APPLYING — other readers with the anon key
--   Anything outside this repo that reads principle text or paragraphs with the
--   public anon key (n8n workflows, ad-hoc scripts) gets 42501 after this file.
--   The seeders, scripts/check-counts.mjs and selfhost/copy-reference-data.mjs
--   use the service key; scripts/verify-library.ts counts principles on `id`
--   (still public).
--
-- WHAT RE-OPENS THE LOCK (do not do these after this file)
--   * Re-running 20261004_01_library_column_lock.sql: it revokes and re-grants
--     its OLD principles allow-list, which includes text, the four judgment
--     columns and fts. Re-run THIS file right after it.
--   * Re-running 20260922_01_library_grants.sql or 20260626 §7 (the catch-all
--     `grant select on all tables in schema library`): table-level SELECT on
--     principles and principle_paragraphs again (paragraphs then read ZERO rows
--     — their policy is gone and RLS is on — still a regression).
--   * Re-importing scripts/selfhost/run4_delivery/01-schema.sql (explicit
--     grants and the public-read policies).
--   * Dropping and re-creating either table (default privileges grant anon
--     SELECT; a fresh table has RLS off). Re-run this file afterwards.
--   _verify.sql raises in the first three cases (the marker survives them).
--
-- A NOTE ON REVOKE
--   REVOKE removes only grants whose grantor is the object owner; the verify
--   block checks the EFFECTIVE privilege, so a grant under another grantor
--   raises instead of passing.
--
-- PREREQUISITES
--   * 20260626_legal_library_schema.sql, 20260821_judicial_principles_missing_columns.sql,
--     20260922_01_library_grants.sql, 20260929_01_library_text_server_only.sql,
--     20261004_01_library_column_lock.sql (all applied on production).
--   * The code deploy described above.
--
-- ROLLBACK (re-opens the principle text to the anon key — owner decision required)
--   begin;
--     grant select (text, ruling_basis, facts, reasons, ruling, fts)
--       on library.principles to anon, authenticated;
--     grant select on library.principle_paragraphs to anon, authenticated;
--     create policy "Allow public read on library.principle_paragraphs"
--       on library.principle_paragraphs for select to anon, authenticated using (true);
--     comment on table library.principles is 'Individual judicial principles within a collection.';
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 0. Order: 20261004_01 first ──────────────────────────────────────────────
do $$
begin
  if coalesce(obj_description('library.laws'::regclass, 'pg_class'), '') not ilike '%column-locked since 20261004_01%' then
    raise exception '20261016_01: apply 20261004_01_library_column_lock.sql first — this file narrows its principles allow-list';
  end if;
end $$;

-- ── 1. library.principles: the catalogue columns only ───────────────────────
revoke all on library.principles from anon, authenticated, public;
grant select (
  id, collection_id, principle_number, issuing_body, session_date,
  decision_number, reference, year_hijri, order_index,
  classification_keywords, hashtags, is_redacted, created_at, updated_at
) on library.principles to anon, authenticated;
grant all on library.principles to service_role;
alter table library.principles enable row level security;

-- ── 2. library.principle_paragraphs: server-only ─────────────────────────────
revoke all on library.principle_paragraphs from anon, authenticated, public;
grant all on library.principle_paragraphs to service_role;
alter table library.principle_paragraphs enable row level security;

do $$
declare
  p record;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname
      from pg_policies pol
     where pol.schemaname = 'library'
       and pol.tablename = 'principle_paragraphs'
       and pol.cmd in ('SELECT', 'ALL')
       and pol.roles && array['anon', 'authenticated', 'public']::name[]
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice '20261016_01: dropped policy "%" on %.%', p.policyname, p.schemaname, p.tablename;
  end loop;
end $$;

-- ── 3. Marker (read by _verify.sql) ──────────────────────────────────────────
comment on table library.principles is
  'Individual judicial principles within a collection. TEXT SERVER-ONLY since 20261016_01 (owner decision 171): anon/authenticated read the catalogue columns only; text, ruling_basis, facts, reasons, ruling, fts and metadata, and every principle_paragraphs row, are read by the Next routes with the service role and masked per tier.';

-- ── 4. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  allowed text[] := array[
    'id', 'collection_id', 'principle_number', 'issuing_body', 'session_date',
    'decision_number', 'reference', 'year_hijri', 'order_index',
    'classification_keywords', 'hashtags', 'is_redacted', 'created_at', 'updated_at'];
  r       text;
  col     text;
  t       text;
  a       record;
  missing text := '';
begin
  foreach r in array array['anon', 'authenticated']
  loop
    -- principles: the allow-list, nothing more
    if has_table_privilege(r, 'library.principles', 'SELECT') then
      missing := missing || format(' %s holds table-level SELECT on library.principles;', r);
    end if;
    foreach col in array allowed
    loop
      if not has_column_privilege(r, 'library.principles', col, 'SELECT') then
        missing := missing || format(' %s cannot read public column library.principles.%s;', r, col);
      end if;
    end loop;
    for a in
      select att.attname::text as name
        from pg_attribute att
       where att.attrelid = 'library.principles'::regclass
         and att.attnum > 0
         and not att.attisdropped
    loop
      if not (a.name = any (allowed)) and has_column_privilege(r, 'library.principles', a.name, 'SELECT') then
        missing := missing || format(' %s can read locked column library.principles.%s;', r, a.name);
      end if;
    end loop;

    -- principle_paragraphs: nothing at all
    if has_any_column_privilege(r, 'library.principle_paragraphs', 'SELECT') then
      missing := missing || format(' %s can SELECT library.principle_paragraphs;', r);
    end if;

    -- no writes on either
    foreach t in array array['library.principles', 'library.principle_paragraphs']
    loop
      if has_table_privilege(r, t, 'INSERT') or has_table_privilege(r, t, 'UPDATE')
         or has_table_privilege(r, t, 'DELETE') or has_table_privilege(r, t, 'TRUNCATE')
         or has_any_column_privilege(r, t, 'INSERT')
         or has_any_column_privilege(r, t, 'UPDATE') then
        missing := missing || format(' %s can write %s;', r, t);
      end if;
    end loop;
  end loop;

  foreach t in array array['library.principles', 'library.principle_paragraphs']
  loop
    if not has_table_privilege('service_role', t, 'SELECT')
       or not has_table_privilege('service_role', t, 'INSERT')
       or not has_table_privilege('service_role', t, 'UPDATE')
       or not has_table_privilege('service_role', t, 'DELETE') then
      missing := missing || format(' service_role lacks read/write on %s;', t);
    end if;
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      missing := missing || format(' RLS is off on %s;', t);
    end if;
  end loop;

  -- principles keeps its public read policy (else guests read 0 catalogue rows);
  -- principle_paragraphs keeps none.
  if not exists (
    select 1 from pg_policies pol
     where pol.schemaname = 'library' and pol.tablename = 'principles'
       and pol.cmd in ('SELECT', 'ALL')
       and pol.roles && array['anon', 'public']::name[]
  ) then
    missing := missing || ' no read policy for anon on library.principles (every guest read would return 0 rows);';
  end if;
  if exists (
    select 1 from pg_policies pol
     where pol.schemaname = 'library' and pol.tablename = 'principle_paragraphs'
       and pol.cmd in ('SELECT', 'ALL')
       and pol.roles && array['anon', 'authenticated', 'public']::name[]
  ) then
    missing := missing || ' a read policy for the API roles survives on library.principle_paragraphs;';
  end if;

  -- The earlier locks still hold.
  if has_any_column_privilege('anon', 'library.articles', 'SELECT') then
    missing := missing || ' anon can SELECT library.articles again (20260929_01 undone);';
  end if;
  if has_any_column_privilege('anon', 'library.laws', 'SELECT')
     and has_column_privilege('anon', 'library.laws', 'preamble', 'SELECT') then
    missing := missing || ' anon can read library.laws.preamble again (20261004_01 undone);';
  end if;

  if coalesce(obj_description('library.principles'::regclass, 'pg_class'), '') not ilike '%text server-only since 20261016_01%' then
    missing := missing || ' the marker comment on library.principles is missing;';
  end if;

  if missing <> '' then
    raise exception '20261016_01 verify:%', missing;
  end if;

  raise notice '20261016_01 verify: OK — principle text, judgment, fts and paragraphs are server-only; the catalogue columns stay public; service_role reads and writes both tables';
end $$;

commit;

-- ── 5. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select has_column_privilege('anon', 'library.principles', 'text', 'SELECT')          as anon_text,     -- false
--          has_column_privilege('anon', 'library.principles', 'fts', 'SELECT')           as anon_fts,      -- false
--          has_column_privilege('anon', 'library.principles', 'principle_number', 'SELECT') as anon_number, -- true
--          has_any_column_privilege('anon', 'library.principle_paragraphs', 'SELECT')    as anon_paras;    -- false
-- And from outside (public anon key) — must be 401/403 (42501), not 200:
--   curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" \
--     "$SUPABASE_URL/rest/v1/principles?select=text&limit=1"
