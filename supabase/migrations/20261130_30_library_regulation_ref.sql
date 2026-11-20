-- =============================================================================
-- Migration: 20261130_30_library_regulation_ref.sql   (verify id: l10_regref)
-- =============================================================================
-- PURPOSE
--   Owner file 19 Nov 2026 §1 item 9 and his answer 3 («المادة الأولى من نظام
--   القضاء» = the law's own article 1; every merged regulation keeps its own
--   index and numbering inside the file). The parser now reads the title of
--   every `<!-- ATTACHED_REGULATION {…} -->` block and stamps it as
--   `regulation_ref` on every chapter and article inside the block
--   (scripts/parsers/parse-laws.ts findAttachedRegulationBlocks /
--   stampRegulationRefs); the seeder writes it. Then (law, regulation_ref,
--   number) names one article: «المادة 1» of a merged regulation no longer
--   collides with the law's own article 1, and the owner's principle → article
--   links that name a merged regulation (to.regulation_ref) can be resolved
--   (20261130_40, library_graph.owner_edges).
--
-- WHAT IT DOES (idempotent — safe to run any number of times, before or after
-- the code deploy)
--   1. alter table library.articles add column if not exists regulation_ref text;
--   2. alter table library.chapters add column if not exists regulation_ref text;
--      Nullable, no default: a catalogue-only change, no table rewrite. NULL =
--      the law's own text (outside every merged-regulation block).
--   3. Grants: none written. library.articles is SERVER-ONLY since 20260929_01
--      (no table or column privilege for anon / authenticated), so the new
--      column is server-only too — the verify block asserts it.
--      library.chapters stays what it is today: a public table (20260929_01
--      "STAYS PUBLIC"), so the merged regulation's NAME on a chapter row is
--      readable like the chapter's own title. No text is exposed by it.
--   4. verify block (raises → whole file rolls back), NOTICE
--      'l10_regref verify: OK'.
--
-- RUN ORDER
--   * BEFORE the next library load with this loader: the owner loader's
--     preflight (src/lib/library/ownerLoaderTables.ts) now REQUIRES
--     chapters.regulation_ref and articles.regulation_ref and stops before the
--     first write without them.
--   * Deploy order is free: no app route reads the columns yet.
--   * The values appear only after the owner re-parses and re-loads the laws
--     (a file with no ATTACHED_REGULATION block keeps NULL everywhere).
--   * Then 20261130_40 (owner edges) can resolve to.regulation_ref.
--
-- RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261130_30_library_regulation_ref.sql
--   → NOTICE  l10_regref verify: OK   and a final row with ok = t.
--   Then supabase/migrations/_verify.sql section verify:l10_regref.
--
-- ROLLBACK (the values come back on the next load):
--   alter table library.articles drop column if exists regulation_ref;
--   alter table library.chapters drop column if exists regulation_ref;
--   notify pgrst, 'reload schema';
--   (then the l10 loader's preflight refuses a load: deploy the previous loader)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. what this file builds on must be in force
do $$
begin
  if to_regclass('library.articles') is null or to_regclass('library.chapters') is null then
    raise exception '20261130_30: library.articles / library.chapters missing — apply the library schema first';
  end if;
  if has_table_privilege('anon', 'library.articles', 'SELECT')
     or has_table_privilege('authenticated', 'library.articles', 'SELECT') then
    raise exception '20261130_30: anon / authenticated can read library.articles — apply 20260929_01 (server-only article tables) first, or the new column would be readable with the public key';
  end if;
end $$;

-- 1 + 2. the columns
alter table library.articles add column if not exists regulation_ref text;
alter table library.chapters add column if not exists regulation_ref text;

comment on column library.articles.regulation_ref is
  'Owner file 19 Nov 2026 §1.9: the title of the merged regulation (ATTACHED_REGULATION block) this article sits in; NULL for the law''s own articles. (law_slug, regulation_ref, number) names one article. Server-only like the table. Added by 20261130_30.';
comment on column library.chapters.regulation_ref is
  'Owner file 19 Nov 2026 §1.9: the title of the merged regulation (ATTACHED_REGULATION block) this chapter sits in; NULL for the law''s own chapters. Added by 20261130_30.';

-- 3. service_role keeps full access (re-asserted; unchanged posture)
grant all on library.articles to service_role;
grant all on library.chapters to service_role;

-- 4. verify
do $verify$
declare
  t text;
  typ text;
  nn boolean;
  r text;
begin
  foreach t in array array['library.articles', 'library.chapters'] loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull into typ, nn
      from pg_catalog.pg_attribute a
     where a.attrelid = t::regclass and a.attname = 'regulation_ref' and not a.attisdropped;
    if typ is null then
      raise exception 'l10_regref verify: %.regulation_ref missing', t;
    end if;
    if typ <> 'text' or nn then
      raise exception 'l10_regref verify: %.regulation_ref is % not-null=% (want nullable text)', t, typ, nn;
    end if;
    if not has_column_privilege('service_role', t, 'regulation_ref', 'SELECT')
       or not has_column_privilege('service_role', t, 'regulation_ref', 'INSERT')
       or not has_column_privilege('service_role', t, 'regulation_ref', 'UPDATE') then
      raise exception 'l10_regref verify: service_role cannot read / write %.regulation_ref — every load would fail', t;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.articles', 'regulation_ref', 'SELECT')
       or has_table_privilege(r, 'library.articles', 'SELECT') then
      raise exception 'l10_regref verify: % can read library.articles(.regulation_ref) — the article tables must stay server-only', r;
    end if;
  end loop;
  raise notice 'l10_regref verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261130_30 regulation_ref (merged regulation name) on library.articles (server-only) and library.chapters' as migration,
       (select pg_catalog.count(*) from pg_catalog.pg_attribute
         where attrelid in ('library.articles'::regclass, 'library.chapters'::regclass)
           and attname = 'regulation_ref' and not attisdropped) = 2
       and not has_column_privilege('anon', 'library.articles', 'regulation_ref', 'SELECT')
       as ok;
