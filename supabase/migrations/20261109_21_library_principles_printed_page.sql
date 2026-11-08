-- =============================================================================
-- Migration: 20261109_21_library_principles_printed_page.sql
-- =============================================================================
-- PURPOSE (owner package 2026-11-06, item 25 / file 10 §ب1)
--   A principle or ruling is cited by its printed volume AND page
--   («المبدأ رقم …، المجلد …، ص …»). The owner's files will carry an optional
--   text field `printed_page` ("45" or "45-47") on the principle / ruling card.
--   The parser (scripts/parsers/parse-precedents.ts printedPageOf) keeps it as
--   written and the seeder writes it on EVERY principles row (NULL when the
--   source has none), so the column must exist before any library load made
--   with this code — and in any case before the owner's export carries the
--   field. The owner loader checks the column before its first write
--   (src/lib/library/ownerLoaderTables.ts requiredColumns) and stops with
--   exit 1 when it is missing, so a wrong order fails safe, before any row.
--
-- PRIVILEGES — SERVER-ONLY, LIKE THE PRINCIPLE TEXT
--   library.principles is column-locked (20261004_01, narrowed by 20261016_01):
--   the API roles read an explicit catalogue list, and _verify.sql fails on any
--   other column they can read. A new column is not in that list, so anon /
--   authenticated cannot read it; the precedent reader reads it with the
--   service role (as it reads the text). This file revokes it explicitly too,
--   in case someone granted it by hand, and the verify block checks it.
--
-- RUN ORDER
--   BEFORE the deploy of this batch's code (the seeder writes the key), and
--   BEFORE the owner's next library load. No backfill: today no principle has
--   a printed page (file 10 §ج) — values come with his export.
--
-- IDEMPOTENT — safe to run any number of times.
--
-- ROLLBACK (only after a code rollback — the seeder writes the key)
--   alter table library.principles drop column if exists printed_page;
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. preconditions: the table, and the column lock in force (else a new column
--    would be readable with the public key through a table-level grant).
do $$
begin
  if to_regclass('library.principles') is null then
    raise exception '20261109_21: library.principles does not exist';
  end if;
  if has_table_privilege('anon', 'library.principles', 'SELECT')
     or has_table_privilege('authenticated', 'library.principles', 'SELECT') then
    raise exception '20261109_21: anon / authenticated hold table-level SELECT on library.principles — apply 20261004_01 and 20261016_01 (the column lock) first';
  end if;
end $$;

-- 1. the column (nullable, no default: no table rewrite, no backfill)
alter table library.principles
  add column if not exists printed_page text;

comment on column library.principles.printed_page is
  'Owner 2026-11-06 (item 25, 20261109_21): the printed page of this principle / ruling in its printed volume, kept as written in the source ("45", "45-47"); NULL when the source has none. Written by the seeder from the anchor / frontmatter printed_page. Server-only (no API-role grant).';

-- 2. never readable by the API roles
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute format('revoke select (printed_page) on library.principles from %I', r);
    end if;
  end loop;
end $$;

-- 3. verify (raises, the transaction rolls back)
do $$
declare
  typ text;
  r   text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod) into typ
    from pg_catalog.pg_attribute a
   where a.attrelid = 'library.principles'::regclass and a.attname = 'printed_page' and not a.attisdropped;
  if typ is distinct from 'text' then
    raise exception '20261109_21 verify: library.principles.printed_page is %, not text', coalesce(typ, 'missing');
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r)
       and has_column_privilege(r, 'library.principles', 'printed_page', 'SELECT') then
      raise exception '20261109_21 verify: % can read library.principles.printed_page', r;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_column_privilege('service_role', 'library.principles', 'printed_page', 'SELECT') then
    raise exception '20261109_21 verify: service_role cannot read library.principles.printed_page';
  end if;
end $$;

-- 4. PostgREST: see the new column now
notify pgrst, 'reload schema';

commit;

-- 5. CHECK — the SQL editor shows only this last result. Expect ok = true.
select 'principles.printed_page exists, server-only' as check,
       exists (select 1 from information_schema.columns
                where table_schema = 'library' and table_name = 'principles'
                  and column_name = 'printed_page' and data_type = 'text')
       and not has_column_privilege('anon', 'library.principles', 'printed_page', 'SELECT')
       and not has_column_privilege('authenticated', 'library.principles', 'printed_page', 'SELECT') as ok;
