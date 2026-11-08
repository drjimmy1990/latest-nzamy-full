-- =============================================================================
-- Migration: 20261109_20_library_merged_regulations.sql
-- =============================================================================
-- PURPOSE (owner package 2026-11-06, item 4 / 11-04 message §3, BUG-LIB-06)
--   The /laws card of a merged law shows «يشتمل على: A • B». Since 20261107_10
--   those names come from library.laws.merged_regulation_names, which a
--   function fills from the article_regulations refs — the owner loader never
--   writes it, so it went stale (or NULL) after every load until that file was
--   re-run. The owner's files carry the names themselves, in the frontmatter
--   list merged_regulation_details (2,682 files).
--
--   This file adds library.laws.merged_regulations jsonb. The parser
--   (parse-laws.ts mergedRegulationDetailsOf) keeps each entry's card fields
--   only — {name, type?, status?, total_articles?, issuing_instrument?}, never
--   the editorial status_note / note — and the seeder writes it on EVERY law
--   row (NULL when the file lists none). /api/library/init prefers these names
--   and falls back to merged_regulation_names, so after a load the line is
--   right at once for every law whose file lists its regulations; re-running
--   20261107_10 remains useful only for the few merged laws without the list.
--
-- PRIVILEGES — SERVER-ONLY
--   library.laws is column-locked (20261004_01): a new column is readable by no
--   API role. /api/library/init reads it with the service role and sends only
--   the cleaned names (never the jsonb, which carries issuing instruments).
--   This file revokes it explicitly too and verifies it.
--
-- RUN ORDER
--   BEFORE the deploy of this batch's code and BEFORE the owner's next library
--   load: the seeder writes the key on every law row, and the owner loader's
--   preflight (ownerLoaderTables.ts requiredColumns) stops with exit 1 before
--   the first write when the column is missing. The deployed init route reads
--   the column as an optional feature, so the order SQL → deploy is safe and
--   an old deploy never names the column.
--
-- IDEMPOTENT — safe to run any number of times. No backfill: the values come
--   with the next load.
--
-- ROLLBACK (only after a code rollback — the seeder writes the key)
--   alter table library.laws drop column if exists merged_regulations;
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. preconditions
do $$
begin
  if to_regclass('library.laws') is null then
    raise exception '20261109_20: library.laws does not exist';
  end if;
  if has_table_privilege('anon', 'library.laws', 'SELECT')
     or has_table_privilege('authenticated', 'library.laws', 'SELECT') then
    raise exception '20261109_20: anon / authenticated hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or the new column would be readable with the public key';
  end if;
end $$;

-- 1. the column (nullable, no default: no rewrite)
alter table library.laws
  add column if not exists merged_regulations jsonb;

comment on column library.laws.merged_regulations is
  'Owner 2026-11-06 (item 4, 20261109_20): the card fields of the file''s merged_regulation_details — [{name, type?, status?, total_articles?, issuing_instrument?}] — written by the seeder on every load (NULL when the file lists none). /api/library/init prefers these names for the «يشتمل على» line, falling back to merged_regulation_names. Server-only (no API-role grant).';

-- 2. never readable by the API roles
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute format('revoke select (merged_regulations) on library.laws from %I', r);
    end if;
  end loop;
end $$;

-- 3. verify
do $$
declare
  typ text;
  r   text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod) into typ
    from pg_catalog.pg_attribute a
   where a.attrelid = 'library.laws'::regclass and a.attname = 'merged_regulations' and not a.attisdropped;
  if typ is distinct from 'jsonb' then
    raise exception '20261109_20 verify: library.laws.merged_regulations is %, not jsonb', coalesce(typ, 'missing');
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r)
       and has_column_privilege(r, 'library.laws', 'merged_regulations', 'SELECT') then
      raise exception '20261109_20 verify: % can read library.laws.merged_regulations', r;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_column_privilege('service_role', 'library.laws', 'merged_regulations', 'SELECT') then
    raise exception '20261109_20 verify: service_role cannot read library.laws.merged_regulations — /api/library/init cannot show the names';
  end if;
end $$;

-- 4. PostgREST: see the new column now
notify pgrst, 'reload schema';

commit;

-- 5. CHECK — the SQL editor shows only this last result. Expect ok = true.
select 'laws.merged_regulations exists, server-only' as check,
       exists (select 1 from information_schema.columns
                where table_schema = 'library' and table_name = 'laws'
                  and column_name = 'merged_regulations' and data_type = 'jsonb')
       and not has_column_privilege('anon', 'library.laws', 'merged_regulations', 'SELECT')
       and not has_column_privilege('authenticated', 'library.laws', 'merged_regulations', 'SELECT') as ok;
