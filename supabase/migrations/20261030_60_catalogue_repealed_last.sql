-- =============================================================================
-- Migration: 20261030_60_catalogue_repealed_last.sql
-- =============================================================================
-- PURPOSE (owner ٣١٧ / note ١٢ item ٨ — repealed laws at the END of the catalogue)
--   The owner's browse order for /laws, as amended on 28-Oct: every law in
--   force first, every repealed law after them — and inside each group the
--   order of 20261025_40 (merged regulation first, then the newest official
--   legislative date, then title, slug). A repealed law used to sit wherever
--   its last amendment put it, often near the top, because a repeal is itself
--   a recent legislative event.
--
--   "Repealed" is exactly the status token 'repealed' (owner schema_manifest
--   enums.status), the same rule as the badge and the red card
--   (src/app/laws/law-status.ts isRepealedLawStatus: trim, then an exact
--   match). suspended, deferred_effective, partially_active and the archival
--   states are NOT repealed and stay in the first group.
--
--   One boolean, generated from status:
--     library.laws.catalogue_is_repealed = coalesce(btrim(status) = 'repealed', false)
--   false (in force / anything else) sorts before true (repealed) in the
--   route's ascending order, and it is never NULL.
--
--   A STORED GENERATED column for the reasons 20261025_20 / 20261025_40 give:
--   laws reach production through the owner loader straight from his JSONL,
--   so a plain column would go stale on the next load, and a backfill UPDATE
--   would fire trg_laws_updated_at on every repealed law. No trigger.
--   Loaders must not send the column (a generated column refuses a value):
--   the owner loader's stripKeys needs "catalogue_is_repealed" added
--   (scripts/seed-library-from-owner.mjs — a follow-up for whoever owns it;
--   until then a load that sends every column of a read-back row would fail).
--
-- PRIVILEGES — LOCKED LIKE THE OTHER SORT KEY
--   status itself is a public card column, so this boolean says nothing new;
--   it is still granted to NO API role, like catalogue_recency_key: a sort key
--   is the route's business, not the client's. /api/library/init reads the
--   laws section with the service role and only ORDERS by it — it never
--   selects it, so no viewer receives one.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run unless 20261004_01's lock is in force and 20261025_40
--      (catalogue_recency_key) is applied.
--   1. The column (one rewrite of library.laws and its indexes, under an
--      ACCESS EXCLUSIVE lock). `lock_timeout = 5s`: behind a long read the
--      file stops with "canceling statement due to lock timeout" — nothing
--      changed, re-run it.
--   2. An index in the catalogue's exact order (repealed last, merged desc
--      nulls last, key desc nulls last, title, slug), so the route's
--      ORDER BY … LIMIT is an index scan with no sort. 20261025_40's
--      idx_laws_catalogue_recency is KEPT (_verify.sql checks it; it still
--      serves the fallback order while the code falls back).
--   3. Verify block — RAISES (whole transaction rolls back) unless the column
--      is generated from status, no API role can read it, service_role can,
--      and the index is in the route's order.
--   4. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY IS BEST, ANY ORDER WORKS
--   The code of this batch orders by catalogue_is_repealed as an OPTIONAL
--   feature of /api/library/init (readWithOptionalFeatures): while the column
--   does not exist the database answers 42703 naming it, and the route reads
--   the page again without that one order — the catalogue keeps working, in
--   20261025_40's order. Old code never names the column.
--
-- CHECK AFTER RUNNING (SQL editor; NOTICEs are hidden there)
--   select catalogue_is_repealed,
--          count(*) as laws,
--          count(*) filter (where btrim(status) = 'repealed') as status_repealed
--     from library.laws group by 1 order by 1;
--   Expected: at most two rows. false → status_repealed = 0;
--             true  → status_repealed = laws.
--
-- ROLLBACK
--   drop index if exists library.idx_laws_catalogue_repealed_last;
--   alter table library.laws drop column if exists catalogue_is_repealed;
--   (the code falls back to 20261025_40's order on its own)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. the column lock and 20261025_40 must be in force
do $$
begin
  if to_regclass('library.laws') is null then
    raise exception '20261030_60: library.laws does not exist';
  end if;
  if has_table_privilege('anon', 'library.laws', 'SELECT')
     or has_table_privilege('authenticated', 'library.laws', 'SELECT') then
    raise exception '20261030_60: anon / authenticated still hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or the new column would be readable with the public key';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'library.laws'::regclass
                    and attname = 'catalogue_recency_key' and not attisdropped) then
    raise exception '20261030_60: library.laws.catalogue_recency_key is missing — apply 20261025_40_law_sort_key.sql first';
  end if;
end $$;

-- 1. the column — one statement, one rewrite
alter table library.laws
  add column if not exists catalogue_is_repealed boolean
    generated always as (coalesce(btrim(status) = 'repealed', false)) stored;

comment on column library.laws.catalogue_is_repealed is
  'Owner ٣١٧ (20261030_60): true exactly when status is ''repealed'' (trimmed), generated, never NULL. /api/library/init orders by it first (in force before repealed) with the service role and never selects it; granted to no API role.';

-- 2. the catalogue order, exactly as the route asks for it
create index if not exists idx_laws_catalogue_repealed_last
  on library.laws (catalogue_is_repealed, has_merged_regulation desc nulls last, catalogue_recency_key desc nulls last, title, slug);

-- 3. verify
do $$
declare
  r     text;
  gen   text;
  expr  text;
  def   text;
begin
  select a.attgenerated::text, pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    into gen, expr
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.laws'::regclass and a.attname = 'catalogue_is_repealed' and not a.attisdropped;
  if gen is distinct from 's'
     or expr !~* '^COALESCE\(\(btrim\(.*status.*\) = ''repealed''::text\), false\)$' then
    raise exception '20261030_60 verify: library.laws.catalogue_is_repealed exists but is not generated as coalesce(btrim(status) = ''repealed'', false) (generated=%, expr=%) — drop that column and re-run', gen, expr;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.laws', 'catalogue_is_repealed', 'SELECT') then
      raise exception '20261030_60 verify: % can read library.laws.catalogue_is_repealed', r;
    end if;
  end loop;
  if not has_column_privilege('service_role', 'library.laws', 'catalogue_is_repealed', 'SELECT') then
    raise exception '20261030_60 verify: service_role cannot read library.laws.catalogue_is_repealed — the catalogue cannot order by it';
  end if;
  if to_regclass('library.idx_laws_catalogue_repealed_last') is null then
    raise exception '20261030_60 verify: index library.idx_laws_catalogue_repealed_last is missing';
  end if;
  def := pg_catalog.pg_get_indexdef('library.idx_laws_catalogue_repealed_last'::regclass);
  if def !~ '\(catalogue_is_repealed, has_merged_regulation DESC NULLS LAST, catalogue_recency_key DESC NULLS LAST, title, slug\)$' then
    raise exception '20261030_60 verify: index library.idx_laws_catalogue_repealed_last is %, not in the route''s order — drop it and re-run', def;
  end if;
  if exists (select 1 from library.laws
              where catalogue_is_repealed is distinct from coalesce(btrim(status) = 'repealed', false)) then
    raise exception '20261030_60 verify: a row''s catalogue_is_repealed disagrees with its status';
  end if;
  raise notice '20261030_60 verify: OK';
end $$;

-- 4.
notify pgrst, 'reload schema';

commit;

-- The check (see CHECK AFTER RUNNING above).
select catalogue_is_repealed,
       count(*) as laws,
       count(*) filter (where btrim(status) = 'repealed') as status_repealed
  from library.laws
 group by 1
 order by 1;
