-- =============================================================================
-- Migration: 20260922_01_library_grants.sql
-- =============================================================================
-- PURPOSE
--   Every law page on the site serves ZERO articles right now. The law-detail
--   route (src/app/api/library/laws/[slug]/route.ts:80-89) reads a law's
--   articles with two PostgREST embeds:
--
--       .from('articles').select('*, article_amendments (*), article_regulations (*)')
--
--   `library.article_regulations` was created by 20260730_article_regulations.sql
--   (applied to production on 2026-09-21) and was never granted to anybody. The
--   only grant the library schema ever received is the one-shot
--
--       grant select on all tables in schema library to anon, authenticated;
--
--   at 20260626_legal_library_schema.sql:885-886, which ran BEFORE that table
--   existed, and no ALTER DEFAULT PRIVILEGES was ever set for the schema. So
--   PostgREST fails the WHOLE embedded query with 42501 (permission denied for
--   table article_regulations) and the route answers 200 with an empty law.
--   Measured live on 2026-09-21:
--       GET /api/library/laws/public-prosecution-law -> 200, articles: 0
--   while the database holds 30 articles for that law.
--
--   Two more library objects created after 20260626 are in the same state and
--   are granted here before they acquire their first reader:
--     * library.cross_section_search    (matview, 20260729_article_history_columns.sql:87)
--     * library.v_laws_enactment_status (view,    20260911_library_laws_enactment_gazette_schema.sql:89)
--   A grep of `create (table|view|materialized view) library.` across every
--   migration after 20260626 returns exactly these three objects.
--
--   The ALTER DEFAULT PRIVILEGES at the end is what closes the class, not just
--   this instance: any future object created in schema `library` by the
--   migration role is readable by anon/authenticated and fully usable by
--   service_role from birth, so the next child table cannot silently blank a
--   page again.
--
--   NOTE FOR FUTURE AUTHORS: because of that default, schema `library` is now
--   PUBLIC-READ BY DEFAULT. It holds reference corpus (laws, articles, decrees,
--   principles, feqh) and that is the correct posture for it. Per-user data put
--   in this schema MUST carry its own RLS policies, exactly as
--   library.smart_folders / smart_folder_items / invitations / issue_reports
--   already do (20260626:747-763) — a grant alone will not protect it.
--
--   RLS on library.article_regulations: 20260730 created this table without
--   `enable row level security` and without a read policy — the ONLY library
--   content table in that state, since 20260626:747-796 enables RLS and adds an
--   "Allow public read on <table>" policy on all 17 siblings. Section 1b below
--   adds both, so the table matches the schema convention and the Supabase
--   advisor's "RLS disabled in exposed schema" finding is cleared for it. The
--   policy is not a write guard — anon/authenticated hold SELECT only and
--   service_role bypasses RLS, so the seeder is unaffected. It is what makes a
--   future per-user column in this table fail closed instead of open.
--
--   OWNER DECISION, STATED PLAINLY — this grant does NOT respect the F13
--   paywall. Schema `library` is an EXPOSED PostgREST schema: the request
--   client (src/lib/supabase/server.ts:12-14) is built from the PUBLIC
--   NEXT_PUBLIC_SUPABASE_ANON_KEY and reaches it with `.schema('library')`.
--   So after section 1,
--       GET {SUPABASE_URL}/rest/v1/article_regulations?select=text
--       Accept-Profile: library          (with the public anon key)
--   returns every executive-regulation text with the paywall untouched, because
--   that paywall lives ONLY in the Next route (route.ts). This is neither new
--   nor specific to this table — library.articles has carried the identical
--   grant and read policy since 20260626, so statutory article text is already
--   readable the same way — and the grant is REQUIRED for any law page to
--   render at all. But it means F13 closes a UI-layer paywall, not a data-layer
--   one. Closing it for real means serving the corpus through a service-role
--   route with no anon grant, or a row-level "free preview" flag. That is an
--   owner decision, not a migration.
--
-- CLOSES
--   A4 / F01 — every law page serves zero articles
--              (docs/audits/2026-09-21-post-profiles-review.md)
--   F26      — scripts/seed-library.ts:813-814 (service-role client) is blocked
--              on this same table, so re-seeding regulations fails today.
--
-- PREREQUISITES
--   * schema library                   — 20260626_legal_library_schema.sql
--   * library.article_regulations      — 20260730_article_regulations.sql
--       REQUIRED. This file fails loudly if the table is absent, because a
--       silent skip here is exactly the outage it is closing.
--   * library.cross_section_search     — 20260729_article_history_columns.sql:87
--   * library.v_laws_enactment_status  — 20260911_library_laws_enactment_gazette_schema.sql:89
--       Both optional: skipped with a notice when the object is not present.
--   * roles anon / authenticated / service_role — always present on a Supabase
--       project; this migration never creates a role.
--   Apply by hand in the SQL Editor (not `db push`), as the whole 20260921_*
--   batch was. Idempotent: safe to run any number of times.
--   ALTER DEFAULT PRIVILEGES applies to the role that RUNS this file, which in
--   the SQL Editor is `postgres` — the same role that runs every migration and
--   therefore the role that will create the future library objects it covers.
--
-- WHAT IT REPLACES / REMOVES
--   Nothing is dropped and nothing is revoked. Purely additive: it repeats the
--   20260626 schema-wide grants as a catch-all, adds the three named objects
--   created after them, and adds the default privileges 20260626 never set.
--
-- ROLLBACK
--   begin;
--     drop policy if exists "Allow public read on library.article_regulations"
--       on library.article_regulations;
--     alter table library.article_regulations disable row level security;
--     revoke select on library.article_regulations     from anon, authenticated;
--     revoke all    on library.article_regulations     from service_role;
--     revoke select on library.cross_section_search    from anon, authenticated, service_role;
--     revoke select on library.v_laws_enactment_status from anon, authenticated, service_role;
--     alter default privileges in schema library revoke select on tables    from anon, authenticated;
--     alter default privileges in schema library revoke all    on tables    from service_role;
--     alter default privileges in schema library revoke all    on sequences from service_role;
--   commit;
--   Rolling back restores the outage measured on 2026-09-21: every law page
--   serves 0 articles with HTTP 200.
-- =============================================================================

begin;

-- ── 0. Schema usage — idempotent repeat of 20260626:884 ──────────────────────
grant usage on schema library to anon, authenticated, service_role;

-- ── 1. library.article_regulations — the table that blanks every law page ────
-- Read-only for the two request roles; the seeder writes with service_role.
grant select on library.article_regulations to anon, authenticated;
grant all    on library.article_regulations to service_role;

-- ── 1b. RLS + public read, exactly as the 17 sibling content tables ──────────
-- 20260730 created this table with neither. Idempotent: `enable row level
-- security` is a no-op when already on, and the policy is dropped by name
-- first, because a bare `create policy` re-run dies with 42710 — the very
-- defect that makes 20260730 itself non-re-runnable.
-- NOTE: with RLS on, the SELECT grant in section 1 is necessary but no longer
-- sufficient — a missing policy reads as ZERO ROWS with no error, which is the
-- same silent blank page this file exists to close. The verify block asserts
-- the policy, and so does the _verify.sql deploy gate.
alter table library.article_regulations enable row level security;

drop policy if exists "Allow public read on library.article_regulations"
  on library.article_regulations;

create policy "Allow public read on library.article_regulations"
  on library.article_regulations
  for select
  to anon, authenticated
  using (true);

-- ── 2. The view and the matview created after the 20260626 catch-all ─────────
-- Guarded: a database where 20260729 / 20260911 have not been applied must not
-- lose section 1 to a "relation does not exist" error.
do $$
begin
  if to_regclass('library.cross_section_search') is not null then
    execute 'grant select on library.cross_section_search to anon, authenticated, service_role';
  else
    raise notice '20260922_01: library.cross_section_search absent — grant skipped (apply 20260729_article_history_columns.sql)';
  end if;

  if to_regclass('library.v_laws_enactment_status') is not null then
    execute 'grant select on library.v_laws_enactment_status to anon, authenticated, service_role';
  else
    raise notice '20260922_01: library.v_laws_enactment_status absent — grant skipped (apply 20260911_library_laws_enactment_gazette_schema.sql)';
  end if;
end $$;

-- ── 3. Catch-all for anything else created since 20260626 ────────────────────
-- The same three statements 20260626:885-887 issued, re-run so that any object
-- added to the schema between then and now is covered even if it is not named
-- above. This grants anon nothing beyond section 2 today (those three objects
-- are the only post-20260626 additions), and every user-scoped table in the
-- schema is RLS-protected, so such a read stays scoped to the caller's rows.
grant select on all tables    in schema library to anon, authenticated;
grant all    on all tables    in schema library to service_role;
grant all    on all sequences in schema library to service_role;

-- ── 4. Default privileges — what stops the next child table from blanking a page ─
alter default privileges in schema library grant select on tables    to anon, authenticated;
alter default privileges in schema library grant all    on tables    to service_role;
alter default privileges in schema library grant all    on sequences to service_role;

-- ── 5. Verify — raises, so a half-applied migration cannot look successful ───
do $$
declare
  missing  text := '';
  n_defacl integer;
begin
  if to_regclass('library.article_regulations') is null then
    raise exception '20260922_01 verify: library.article_regulations does not exist — apply 20260730_article_regulations.sql first';
  end if;

  if not has_table_privilege('anon', 'library.article_regulations', 'SELECT') then
    missing := missing || ' anon/SELECT/article_regulations';
  end if;
  if not has_table_privilege('authenticated', 'library.article_regulations', 'SELECT') then
    missing := missing || ' authenticated/SELECT/article_regulations';
  end if;
  if not has_table_privilege('service_role', 'library.article_regulations', 'SELECT') then
    missing := missing || ' service_role/SELECT/article_regulations';
  end if;
  if not has_table_privilege('service_role', 'library.article_regulations', 'INSERT') then
    missing := missing || ' service_role/INSERT/article_regulations';
  end if;
  if not has_table_privilege('service_role', 'library.article_regulations', 'UPDATE') then
    missing := missing || ' service_role/UPDATE/article_regulations';
  end if;
  if not has_table_privilege('service_role', 'library.article_regulations', 'DELETE') then
    missing := missing || ' service_role/DELETE/article_regulations';
  end if;

  -- The other two relations of the same embedded query: if either ever lost its
  -- grant the page would blank in exactly the same way, so assert them here.
  if not has_table_privilege('anon', 'library.articles', 'SELECT') then
    missing := missing || ' anon/SELECT/articles';
  end if;
  if not has_table_privilege('anon', 'library.article_amendments', 'SELECT') then
    missing := missing || ' anon/SELECT/article_amendments';
  end if;

  if to_regclass('library.cross_section_search') is not null
     and not has_table_privilege('anon', 'library.cross_section_search', 'SELECT') then
    missing := missing || ' anon/SELECT/cross_section_search';
  end if;
  if to_regclass('library.v_laws_enactment_status') is not null
     and not has_table_privilege('anon', 'library.v_laws_enactment_status', 'SELECT') then
    missing := missing || ' anon/SELECT/v_laws_enactment_status';
  end if;

  if missing <> '' then
    raise exception '20260922_01 verify: missing library grant(s):%', missing;
  end if;

  -- count(DISTINCT rolname) and `< 2`, NEVER count(*) with an equality test.
  -- pg_default_acl holds one row per (defaclrole, defaclnamespace,
  -- defaclobjtype) — i.e. one row PER GRANTOR. Once a second role has also set
  -- default SELECT on this schema, aclexplode yields 4 grantee rows for the
  -- same 2 roles, and `<> 2` would raise on a database that is MORE correctly
  -- granted — rolling this transaction back and undoing every grant above,
  -- i.e. re-opening the outage. Reproduced before the fix: apply as postgres,
  -- then apply the same file as a second superuser -> "reaches 4 of 2 roles".
  select count(distinct r.rolname) into n_defacl
    from pg_default_acl d
    join pg_namespace  n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    join pg_roles      r on r.oid = a.grantee
   where n.nspname        = 'library'
     and d.defaclobjtype  = 'r'
     and a.privilege_type = 'SELECT'
     and r.rolname        in ('anon', 'authenticated');
  if n_defacl < 2 then
    raise exception '20260922_01 verify: default SELECT on future library tables reaches only % of the 2 request roles (anon, authenticated)', n_defacl;
  end if;

  -- With RLS enabled in section 1b, the grant alone no longer proves the rows
  -- are readable: a table with RLS on and no policy returns zero rows to anon
  -- with NO error, which is byte-for-byte the outage this file closes.
  if (select relrowsecurity from pg_class where oid = 'library.article_regulations'::regclass)
     and not exists (
       select 1
         from pg_policies
        where schemaname = 'library'
          and tablename  = 'article_regulations'
          and cmd in ('SELECT', 'ALL')
          and (roles @> array['anon']::name[] or roles @> array['public']::name[])
     ) then
    raise exception '20260922_01 verify: RLS is on for library.article_regulations with no public-read policy — anon holds SELECT but reads ZERO rows, so every law page would still serve 0 articles with HTTP 200';
  end if;

  select count(*) into n_defacl
    from pg_default_acl d
    join pg_namespace  n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    join pg_roles      r on r.oid = a.grantee
   where n.nspname        = 'library'
     and d.defaclobjtype  in ('r', 'S')
     and a.privilege_type = 'INSERT'
     and r.rolname        = 'service_role';
  if n_defacl < 1 then
    raise exception '20260922_01 verify: default write privilege on future library objects is missing for service_role';
  end if;

  raise notice '20260922_01 verify: OK — article_regulations readable by anon/authenticated (grant + RLS policy) and writable by service_role; schema library has default privileges';
end $$;

commit;

-- Read-only re-check after applying (SQL Editor):
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'library'
--      and table_name in ('article_regulations', 'cross_section_search', 'v_laws_enactment_status')
--    order by 1, 2, 3;
--   select d.defaclobjtype, d.defaclacl
--     from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
--    where n.nspname = 'library';
-- And the app-side fact this migration exists to restore:
--   curl -s https://nezamy.sa/api/library/laws/public-prosecution-law | jq '.paywall.totalArticles'
