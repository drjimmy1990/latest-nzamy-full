-- =============================================================================
-- Migration: 20261130_20_library_laws_parent_index.sql
-- =============================================================================
-- PURPOSE (library agent's request of 19 Nov, §1.8; gap report l10 item 1.8 /
--          build-list #6; batch l10-children)
--
--   The owner's rule: a sub-legislation is linked by `parent_law_id`, written
--   in the CHILD's frontmatter (the parent's instrument_id, else its id). The
--   code now lists a law's children and counts them:
--     * the law page (/api/library/laws/[slug]) reads
--         ... where parent_law_id = <the law's instrument_id>
--     * the /laws catalogue (/api/library/init) reads, per page of cards,
--         ... where parent_law_id in (<the page's instrument_ids>)
--
--   20260919_laws_parent_linkage_columns built `laws_parent_law_id_idx` as a
--   PARTIAL index (where parent_law_id is not null and btrim(parent_law_id)
--   <> ''). The planner cannot prove `btrim(parent_law_id) <> ''` from
--   `parent_law_id = 'LAW-…'`, so neither query above can use it (the Docker
--   test of this file shows it with EXPLAIN). This file adds one PLAIN btree
--   on library.laws (parent_law_id) under a new name. The old index is left
--   as it is (nothing else changes; dropping it is not needed).
--
--   No data, grant, column or setting changes. library.laws stays
--   column-locked exactly as 20261004_01 left it.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261130_20_library_laws_parent_index.sql
--   Expect: NOTICE  l10_children verify: OK  and a row with `t`.
--
-- RUN ORDER: any time after 20260919_laws_parent_linkage_columns (live).
--   Before or after the deploy: the code's queries work without the index
--   (≈ 6k rows: a sequential scan, only slower). Re-running is a no-op
--   (`if not exists`).
--   `lock_timeout = 5s`: CREATE INDEX holds a SHARE lock on library.laws
--   (reads continue, writes wait) for the build — well under a second on
--   ≈ 6k rows. A long write on library.laws (a library load) stops this file
--   with "canceling statement due to lock timeout" — nothing changed; run it
--   again after the load.
--
-- ROLLBACK:
--   drop index if exists library.laws_parent_law_id_lookup_idx;
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('library.laws') is null then
    raise exception '20261130_20: library.laws missing — apply the library schema first';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'library.laws'::regclass and attname = 'parent_law_id' and not attisdropped) then
    raise exception '20261130_20: library.laws.parent_law_id missing — apply 20260919_laws_parent_linkage_columns first';
  end if;
end
$$;

create index if not exists laws_parent_law_id_lookup_idx
  on library.laws (parent_law_id);

do $verify$
declare
  idx regclass := to_regclass('library.laws_parent_law_id_lookup_idx');
  ok boolean;
begin
  if idx is null then
    raise exception 'l10_children verify: library.laws_parent_law_id_lookup_idx missing';
  end if;
  select i.indrelid = 'library.laws'::regclass
         and i.indpred is null
         and i.indexprs is null
         and i.indnatts = 1
         and i.indisvalid
         and a.attname = 'parent_law_id'
         and am.amname = 'btree'
    into ok
    from pg_catalog.pg_index i
    join pg_catalog.pg_class c on c.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = c.relam
    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
   where i.indexrelid = idx;
  if not coalesce(ok, false) then
    raise exception 'l10_children verify: laws_parent_law_id_lookup_idx is not a plain, valid btree on library.laws (parent_law_id)';
  end if;
  raise notice 'l10_children verify: OK';
end
$verify$;

commit;

select '20261130_20 library.laws (parent_law_id) plain btree index for the sub-legislation list and counter' as migration,
       coalesce((select i.indpred is null and i.indisvalid
                   from pg_catalog.pg_index i
                  where i.indexrelid = to_regclass('library.laws_parent_law_id_lookup_idx')), false) as ok;
