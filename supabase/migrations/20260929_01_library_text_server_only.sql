-- =============================================================================
-- Migration: 20260929_01_library_text_server_only.sql
-- =============================================================================
-- PURPOSE
--   Owner decision T28-21 (owner test 2026-09-28): «close direct reads of the
--   text». Until this file, the statutory text of every article, every
--   executive-regulation article and every amendment was readable by anybody
--   holding the PUBLIC anon key, straight from PostgREST:
--
--       GET {SUPABASE_URL}/rest/v1/articles?select=text          (Accept-Profile: library)
--       GET {SUPABASE_URL}/rest/v1/article_regulations?select=text
--       GET {SUPABASE_URL}/rest/v1/article_amendments?select=full_text
--
--   because 20260626_legal_library_schema.sql:774-796/885 and
--   20260922_01_library_grants.sql:123-139 gave anon/authenticated SELECT and a
--   `using (true)` read policy on all three. The paywall (free-article limit,
--   locked previews, withheld regulations — F13) lived ONLY in the Next routes,
--   so it was a UI paywall, not a data one. 20260922_01's header said so and
--   left the call to the owner; this is that call.
--
--   After this file the three tables are SERVER-ONLY: the Next routes read them
--   with the service-role client (src/app/api/library/laws/[slug]/route.ts,
--   search/route.ts, autocomplete/route.ts, stats/route.ts) and the route's
--   masking is the paywall. Nothing else in src/ reads them.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. revoke ALL on library.articles, library.article_regulations,
--      library.article_amendments from anon, authenticated and PUBLIC.
--      (A table-level REVOKE also revokes any column-level grant on it.)
--   2. grant ALL on the three to service_role (unchanged posture, re-asserted).
--   3. drop every SELECT/ALL policy on the three that applies to anon,
--      authenticated or PUBLIC — by catalogue lookup, not by name, so a policy
--      added in the dashboard under another name goes too. RLS stays ENABLED:
--      an accidental re-grant then still reads zero rows instead of the corpus.
--   4. the unpopulated matview library.cross_section_search holds a 500-char
--      snippet of every article; 20260922_04 already took anon/authenticated
--      off it — re-asserted here (guarded) so the text has no side door.
--   5. marker: comment on table library.articles contains
--      'SERVER-ONLY since 20260929_01' (matched case-insensitively) —
--      _verify.sql keys its assertions on it.
--   6. verify block — RAISES (whole transaction rolls back) if anon or
--      authenticated can still read any of the three (table OR column
--      privilege), if a read policy for them survives, if RLS is off, if
--      service_role cannot read them, or if laws / chapters / principles /
--      feqh books / decrees stopped being anon-readable.
--   7. notify pgrst to reload its schema cache.
--
--   STAYS PUBLIC (unchanged): library.laws, chapters, decrees_circulars,
--   decree_pages, judicial_collections, principles, principle_paragraphs,
--   feqh_books/chapters/sections/blocks, v_laws_enactment_status. The schema's
--   default privileges (20260922_01 §4) are NOT changed: a NEW table in schema
--   library is still anon-readable from birth.
--
-- DEPLOY ORDER — CODE FIRST, THEN THIS MIGRATION
--   1. Deploy the code that reads these three tables with the service-role
--      client (commit containing this file). That code works identically
--      before and after this migration.
--   2. Then apply this file by hand in the SQL Editor (as postgres).
--   3. Then run supabase/migrations/_verify.sql — with the marker present it
--      asserts the lock instead of the old "anon must read" rule.
--   Applying this file BEFORE the code deploy makes every law page answer 500
--   («تعذّر تحميل مواد هذا النظام»), search's laws section 503, and
--   /api/library/stats 503, until the code is deployed.
--
-- BEFORE APPLYING — check for other readers with the anon key
--   Anything outside this repo that reads these tables with the public anon
--   key (n8n workflows on n8n.asra3.com, ad-hoc scripts) will get 42501 after
--   this file. In-repo, scripts/verify-library.ts now uses the service key for
--   article reads; scripts/seed-library*.{ts,mjs}, check-counts.mjs and
--   selfhost/copy-reference-data.mjs already use the service key.
--
-- WHAT RE-OPENS THE LOCK (do not do these after this file)
--   * Re-running 20260922_01_library_grants.sql: its §1/§1b re-grant SELECT on
--     article_regulations AND re-create its public-read policy, so every
--     regulation text is readable again; its §3 catch-all re-grants SELECT on
--     articles and article_amendments (those two then read ZERO rows, because
--     their policies are gone and RLS is on — still a regression).
--   * Re-importing scripts/selfhost/run4_delivery/01-schema.sql: it carries the
--     three public-read policies (:10178-10192) and the anon/authenticated
--     grants (:13365-13385) explicitly.
--   * Dropping and re-creating any of the three tables: the schema's default
--     privileges grant anon SELECT to the new table and a fresh table has RLS
--     OFF. Re-run this file afterwards.
--   _verify.sql raises in the first two cases (the marker survives them); in
--   the third the marker is gone with the table, so _verify.sql only notices
--   that 20260929_01 is "not applied" — re-run this file.
--
-- A NOTE ON REVOKE
--   REVOKE removes only grants whose grantor is the object owner (a superuser's
--   REVOKE acts as the owner). A grant recorded under another grantor (e.g.
--   supabase_admin on an imported schema) survives it — the verify block below
--   checks the EFFECTIVE privilege, so that case raises instead of passing.
--
-- PREREQUISITES
--   * 20260626_legal_library_schema.sql, 20260730_article_regulations.sql,
--     20260922_01_library_grants.sql (all applied on production).
--   * The code deploy described above.
--
-- ROLLBACK (re-opens the corpus to the anon key — owner decision required)
--   begin;
--     grant select on library.articles, library.article_regulations,
--                     library.article_amendments to anon, authenticated;
--     create policy "Allow public read on library.articles"
--       on library.articles for select to anon, authenticated using (true);
--     create policy "Allow public read on library.article_amendments"
--       on library.article_amendments for select to anon, authenticated using (true);
--     create policy "Allow public read on library.article_regulations"
--       on library.article_regulations for select to anon, authenticated using (true);
--     comment on table library.articles is 'Individual articles within a law.';
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 1 + 2. Grants: server-only ───────────────────────────────────────────────
revoke all on library.articles            from anon, authenticated, public;
revoke all on library.article_regulations from anon, authenticated, public;
revoke all on library.article_amendments  from anon, authenticated, public;

grant all on library.articles            to service_role;
grant all on library.article_regulations to service_role;
grant all on library.article_amendments  to service_role;

-- ── 3. Read policies for the request roles go; RLS stays on ──────────────────
alter table library.articles            enable row level security;
alter table library.article_regulations enable row level security;
alter table library.article_amendments  enable row level security;

do $$
declare
  p record;
begin
  for p in
    select pol.schemaname, pol.tablename, pol.policyname
      from pg_policies pol
     where pol.schemaname = 'library'
       and pol.tablename in ('articles', 'article_regulations', 'article_amendments')
       and pol.cmd in ('SELECT', 'ALL')
       and pol.roles && array['anon', 'authenticated', 'public']::name[]
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    raise notice '20260929_01: dropped policy "%" on %.%', p.policyname, p.schemaname, p.tablename;
  end loop;
end $$;

-- ── 4. The article-snippet matview stays out of the API surface ──────────────
do $$
begin
  if to_regclass('library.cross_section_search') is not null then
    revoke all on library.cross_section_search from anon, authenticated, public;
  end if;
end $$;

-- ── 5. Marker (read by _verify.sql) ──────────────────────────────────────────
comment on table library.articles is
  'Individual articles within a law. SERVER-ONLY since 20260929_01 (owner decision T28-21): anon/authenticated hold no privilege and no read policy; the Next routes read it with the service role and apply the paywall.';

-- ── 6. Verify — raises, so a half-applied lock cannot look successful ────────
do $$
declare
  t       text;
  r       text;
  missing text := '';
begin
  foreach t in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    foreach r in array array['anon', 'authenticated']
    loop
      -- has_any_column_privilege is true for a table grant OR any column grant.
      if has_any_column_privilege(r, t, 'SELECT') then
        missing := missing || format(' %s can SELECT %s;', r, t);
      end if;
      if has_table_privilege(r, t, 'INSERT') or has_table_privilege(r, t, 'UPDATE')
         or has_table_privilege(r, t, 'DELETE') or has_table_privilege(r, t, 'TRUNCATE') then
        missing := missing || format(' %s can write %s;', r, t);
      end if;
    end loop;

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

  if exists (
    select 1 from pg_policies pol
     where pol.schemaname = 'library'
       and pol.tablename in ('articles', 'article_regulations', 'article_amendments')
       and pol.cmd in ('SELECT', 'ALL')
       and pol.roles && array['anon', 'authenticated', 'public']::name[]
  ) then
    missing := missing || ' a read policy for anon/authenticated/public survives on an article table;';
  end if;

  if to_regclass('library.cross_section_search') is not null
     and (has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
          or has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT')) then
    missing := missing || ' an API role can SELECT library.cross_section_search;';
  end if;

  if coalesce(obj_description('library.articles'::regclass, 'pg_class'), '') not ilike '%server-only since 20260929_01%' then
    missing := missing || ' the marker comment on library.articles is missing;';
  end if;

  -- The catalogue stays public: the lock must not have spread. Any-column, not
  -- table-level: 20261004_01 later narrows laws/principles to column grants,
  -- and a re-run of this file must still pass after it.
  foreach t in array array['library.laws', 'library.chapters', 'library.principles',
                           'library.decrees_circulars', 'library.feqh_books']
  loop
    if to_regclass(t) is not null and not has_any_column_privilege('anon', t, 'SELECT') then
      missing := missing || format(' anon lost SELECT on %s;', t);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20260929_01 verify:%', missing;
  end if;

  raise notice '20260929_01 verify: OK — articles / article_regulations / article_amendments are server-only (no anon/authenticated privilege, no read policy, RLS on); service_role reads and writes them; the catalogue tables stay anon-readable';
end $$;

commit;

-- ── 7. PostgREST schema cache ────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- Read-only re-check after applying (SQL Editor):
--   select c.relname,
--          has_any_column_privilege('anon', c.oid, 'SELECT')          as anon_select,
--          has_any_column_privilege('authenticated', c.oid, 'SELECT') as auth_select,
--          has_table_privilege('service_role', c.oid, 'SELECT')       as service_select,
--          c.relrowsecurity                                           as rls_on
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'library'
--      and c.relname in ('articles', 'article_regulations', 'article_amendments', 'laws');
-- And from outside (public anon key) — must be 401/403 (42501), not 200:
--   curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" \
--     "$SUPABASE_URL/rest/v1/articles?select=id&limit=1"
