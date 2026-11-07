-- =============================================================================
-- Migration: 20261107_10_library_merged_regulation_names.sql
-- =============================================================================
-- PURPOSE (owner 2026-11-07, screenshot 1 — q424 / q380)
--   The /laws grid card of a merged law gets a grey line under its title:
--     «يشتمل على: [اسم اللائحة الأولى] • [اسم اللائحة الثانية]»  (at most two)
--   The names were not in the database: library.laws carries only the
--   has_merged_regulation flag. They exist per row in
--   library.article_regulations.ref — the full, stable name of the secondary
--   instrument (20260730_article_regulations.sql §1-1 of the contract).
--
--   This file adds library.laws.merged_regulation_names text[] and fills it:
--   per law, the distinct non-empty ref names (whitespace collapsed, trimmed;
--   a ref of only whitespace — tabs, newlines included — counts as empty),
--   in order of first appearance — the smallest articles.order_index of the
--   نظام article a name is attached under, then its smallest sort_key, then
--   the name. A law with no regulation rows gets NULL.
--
-- WHY A PLAIN COLUMN, AND WHY THE FILL DOES NOT STAMP updated_at
--   The value reads another table, so it cannot be a generated column (the
--   way 20261025_20 / 20261025_40 / 20261030_60 avoided backfill UPDATEs).
--   library.laws has trg_laws_updated_at, and an UPDATE would mark every
--   merged law «updated» today. So the fill runs with that trigger disabled
--   for this transaction only (ALTER TABLE … DISABLE/ENABLE TRIGGER, the
--   table owner's right — the SQL editor's role). If anything fails, the
--   whole transaction rolls back and the trigger is enabled as before.
--   The UPDATE only touches rows whose value changes: a second run is a no-op.
--
-- THE OWNER'S LOADER LEAVES THIS COLUMN STALE — RE-RUN THIS FILE AFTER A LOAD
--   scripts/seed-library-from-owner.mjs upserts his JSONL rows, which do not
--   carry this key: an existing law keeps its old names, a NEW law gets NULL,
--   and a clean wipe + load leaves every row NULL. (A stale or NULL value only
--   hides or dates the grey line; nothing breaks.) The loader cannot compute
--   the names, so its table config has no cheap fix. The fix is to run this
--   same file again after each library load — it is idempotent and touches
--   only the laws whose names changed.
--
-- PRIVILEGES — NOT FOR THE PUBLIC KEY
--   /api/library/init reads library.laws with the service role (the column
--   lock of 20261004_01) and cleans each name of decree numbers and dates for
--   a non-subscriber before it leaves the server. The column is granted to NO
--   API role (a new column of a column-locked table is not readable by anon /
--   authenticated); the verify block below checks it.
--
-- DEPLOY ORDER — ANY TIME (before or after the deploy)
--   The code reads the column as an OPTIONAL feature of /api/library/init
--   (readWithOptionalFeatures): while it does not exist PostgREST answers
--   42703 / PGRST204 naming it, the route reads the page again without it,
--   and no card shows the line. Old code never names the column.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run unless the tables exist and 20261004_01's lock is in
--      force (else the new column would be readable with the public key).
--   1. The column (no default, no rewrite).
--   2. library.refresh_merged_regulation_names(): the fill, as one function
--      (owner-only; no API role may execute it). Returns the rows changed.
--   3. The fill, with trg_laws_updated_at disabled around it.
--   4. Verify — RAISES (the whole transaction rolls back) unless the column is
--      text[], no API role can read it, service_role can, the trigger is
--      enabled again, and every law with regulation rows has names.
--   5. notify pgrst to reload its schema cache.
--   6. A SELECT you can read: how many laws have names, and five samples.
--
-- ROLLBACK
--   drop function if exists library.refresh_merged_regulation_names();
--   alter table library.laws drop column if exists merged_regulation_names;
--   (the code then reads the catalogue without it on its own)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. preconditions
do $$
begin
  if to_regclass('library.laws') is null
     or to_regclass('library.articles') is null
     or to_regclass('library.article_regulations') is null then
    raise exception '20261107_10: library.laws, library.articles and library.article_regulations must exist';
  end if;
  if has_table_privilege('anon', 'library.laws', 'SELECT')
     or has_table_privilege('authenticated', 'library.laws', 'SELECT') then
    raise exception '20261107_10: anon / authenticated still hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or the new column would be readable with the public key';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'library.laws'::regclass
                    and tgname = 'trg_laws_updated_at' and not tgisinternal) then
    raise exception '20261107_10: trigger trg_laws_updated_at is missing on library.laws — this file expects the 20260626 schema';
  end if;
end $$;

-- 1. the column
alter table library.laws
  add column if not exists merged_regulation_names text[];

comment on column library.laws.merged_regulation_names is
  'Owner 2026-11-07 (20261107_10): the distinct library.article_regulations.ref names of this law, in order of first appearance — the /laws card''s «يشتمل على: A • B» line (two shown). Filled by library.refresh_merged_regulation_names(); the owner loader does not write it, so re-run 20261107_10 after a library load. Read by /api/library/init with the service role; granted to no API role.';

-- 2. the fill
create or replace function library.refresh_merged_regulation_names()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  changed integer := 0;
  n       integer;
begin
  with regs as (
    select r.law_slug,
           btrim(regexp_replace(r.ref, '\s+', ' ', 'g')) as name,
           min(coalesce(a.order_index, 2147483647)) as first_article,
           min(r.sort_key) as first_key
      from library.article_regulations r
      left join library.articles a on a.id = r.article_id
     where btrim(regexp_replace(coalesce(r.ref, ''), '\s+', ' ', 'g')) <> ''
     group by r.law_slug, btrim(regexp_replace(r.ref, '\s+', ' ', 'g'))
  ), agg as (
    select law_slug, array_agg(name order by first_article, first_key, name) as names
      from regs
     group by law_slug
  )
  update library.laws l
     set merged_regulation_names = agg.names
    from agg
   where agg.law_slug = l.slug
     and l.merged_regulation_names is distinct from agg.names;
  get diagnostics n = row_count;
  changed := changed + n;

  -- A law whose regulation rows are gone (or were never there) has no names.
  update library.laws l
     set merged_regulation_names = null
   where l.merged_regulation_names is not null
     and not exists (select 1 from library.article_regulations r
                      where r.law_slug = l.slug and btrim(regexp_replace(coalesce(r.ref, ''), '\s+', ' ', 'g')) <> '');
  get diagnostics n = row_count;
  return changed + n;
end;
$$;

comment on function library.refresh_merged_regulation_names() is
  'Owner 2026-11-07 (20261107_10): fills library.laws.merged_regulation_names from library.article_regulations.ref; touches only rows whose value changes; returns the rows changed. Owner-only. Run through 20261107_10 (which keeps trg_laws_updated_at from stamping the rows).';

revoke all on function library.refresh_merged_regulation_names() from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute format('revoke all on function library.refresh_merged_regulation_names() from %I', r);
    end if;
  end loop;
end $$;

-- 3. fill without stamping updated_at
alter table library.laws disable trigger trg_laws_updated_at;
select library.refresh_merged_regulation_names();
alter table library.laws enable trigger trg_laws_updated_at;

-- 4. verify
do $$
declare
  r       text;
  typ     text;
  missing integer;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod) into typ
    from pg_catalog.pg_attribute a
   where a.attrelid = 'library.laws'::regclass and a.attname = 'merged_regulation_names' and not a.attisdropped;
  if typ is distinct from 'text[]' then
    raise exception '20261107_10 verify: library.laws.merged_regulation_names is %, not text[] — drop that column and re-run', coalesce(typ, 'missing');
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.laws', 'merged_regulation_names', 'SELECT') then
      raise exception '20261107_10 verify: % can read library.laws.merged_regulation_names', r;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_column_privilege('service_role', 'library.laws', 'merged_regulation_names', 'SELECT') then
    raise exception '20261107_10 verify: service_role cannot read library.laws.merged_regulation_names — /api/library/init cannot show the names';
  end if;
  if exists (select 1 from pg_catalog.pg_trigger
              where tgrelid = 'library.laws'::regclass
                and tgname = 'trg_laws_updated_at' and tgenabled = 'D') then
    raise exception '20261107_10 verify: trg_laws_updated_at is still disabled';
  end if;
  select count(*) into missing
    from library.laws l
   where coalesce(cardinality(l.merged_regulation_names), 0) = 0
     and exists (select 1 from library.article_regulations x
                  where x.law_slug = l.slug and btrim(regexp_replace(coalesce(x.ref, ''), '\s+', ' ', 'g')) <> '');
  if missing > 0 then
    raise exception '20261107_10 verify: % law(s) have regulation rows but no names after the fill', missing;
  end if;
end $$;

-- 5. PostgREST: see the new column now, not at its next restart
notify pgrst, 'reload schema';

commit;

-- 6. CHECK — the SQL editor shows only this last result.
--    One summary row first (sample_rank 0), then up to five sample laws.
--    Expected: laws_with_names > 0; merged_without_names should be 0 or small
--    (a law flagged merged whose file has no REGULATION rows).
select 0 as sample_rank,
       'summary' as slug,
       format('laws_with_names=%s, merged_flag_laws=%s, merged_without_names=%s',
              count(*) filter (where cardinality(merged_regulation_names) > 0),
              count(*) filter (where has_merged_regulation is true),
              count(*) filter (where has_merged_regulation is true
                                 and coalesce(cardinality(merged_regulation_names), 0) = 0)) as detail
  from library.laws
union all
select * from (
  select (row_number() over (order by cardinality(merged_regulation_names) desc, slug))::int as sample_rank,
         slug::text,
         array_to_string(merged_regulation_names, ' • ') as detail
    from library.laws
   where cardinality(merged_regulation_names) > 0
   order by cardinality(merged_regulation_names) desc, slug
   limit 5
) s
order by sample_rank;
