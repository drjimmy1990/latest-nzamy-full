-- =============================================================================
-- Migration: 20261025_40_law_sort_key.sql
-- =============================================================================
-- PURPOSE (owner-free P5, N2.5 — the default /laws catalogue order)
--   The owner's order for the catalogue (README «٤٧» part ٥): laws that carry
--   their executive regulation merged in (has_merged_regulation) first, then
--   the newest law first. Search keeps its own relevance order (owner ٢٧٧
--   open: catalogue only).
--
--   "Newest" is ONE date per law: the later of its latest legislative
--   amendment and its issue date. A strict "amended first, then by issue"
--   order would put a law amended in 1420 above a law issued in 1447 and
--   never amended; with one combined key the 1447 law comes first, and an
--   amendment still lifts an old law to the date of that amendment.
--
--   Neither source date is sortable as stored:
--     - latest_update->>'date_hijri' (jsonb from the owner's frontmatter) —
--       in the owner corpus of 2026-10-25, 780 of 1,727 law files carry the
--       key, ≈200 with a value: «1440/10/29», «1426-08-02», «1443/5/26»,
--       «1446/11/7», «1444/06/25ه», «1447/07/30هـ», «1446/02»;
--     - issue_date_hijri (varchar, free text): the same shapes plus «1444»,
--       «1446 ه», «17/3/1447هـ» (day first), «1443/10/16 ه  الموافق :
--       17/05/2022 م», «1437/07/04:11/04/2016», and the seeder's 20-character
--       cut of the long ones («1443/10/16 ه  الموا»).
--   Text order on those strings is wrong («1446/11/7» > «1446/11/18»), so
--   this file adds one integer key, YYYYMMDD in the Hijri calendar:
--     library.laws.catalogue_recency_key =
--       greatest(hijri_date_sort_key(latest_update->>'date_hijri'),
--                hijri_date_sort_key(issue_date_hijri))
--   greatest() skips a NULL side, and is NULL only when neither date reads.
--   A month-only date is YYYYMM00, a year-only date YYYY0000 (it sorts after
--   the dated days of its year when newest first). Anything else — empty, a
--   Gregorian-only date, an impossible month or day — is NULL; a law with
--   neither date sorts last.
--
--   A STORED GENERATED column, for the reasons 20261025_20 gives: laws reach
--   production through scripts/seed-library-from-owner.mjs straight from the
--   owner's JSONL, so a plain column would go NULL or stale on the next load,
--   and a backfill UPDATE would fire trg_laws_updated_at on every dated law.
--   (A generated column cannot read another generated column, so the key is
--   computed from the two source columns directly.) Loaders must not send
--   the key (a generated column refuses a value): the owner loader strips it
--   (stripKeys).
--
--   library.hijri_date_sort_key(text) is the parser. It reads the FIRST Hijri
--   date in the text, in this order:
--     1. year first:  (13xx|14xx) [/-] M [ [/-] D ]
--     2. day first:   D [/-] M [/-] (13xx|14xx)
--     3. a bare year: 13xx|14xx
--   Arabic-Indic and Persian digits are read as ASCII digits; quotes, «ه» /
--   «هـ» and any text around the date are ignored. The year is anchored to
--   13xx/14xx, so «الموافق : 17/05/2022» and Gregorian-only text never read
--   as Hijri. Month 1–12 and day 1–30, or NULL.
--
-- PRIVILEGES — LOCKED LIKE THE COLUMNS IT COMES FROM
--   issue_date_hijri and latest_update are column-locked for anon /
--   authenticated (20261004_01; T28-22 masks the issue date for
--   non-subscribers). The key is those dates as an integer, so this file
--   grants it to NO API role. /api/library/init reads the laws section with
--   the service role and only ORDERS by the key — it never selects it, so no
--   viewer receives one.
--   The function is EXECUTE for service_role and postgres only (every role
--   that writes library.laws computes the column; see 20261025_20).
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run unless 20261004_01's lock is in force.
--   1. create or replace library.hijri_date_sort_key(text): IMMUTABLE,
--      PARALLEL SAFE, search_path = ''. EXECUTE revoked from PUBLIC / anon /
--      authenticated, granted to service_role and postgres.
--   2. Removes what an earlier draft of this file added (two separate keys,
--      latest_amendment_key / issue_date_key, and idx_laws_catalogue_order).
--      That draft never reached production: there, these are no-ops.
--   3. The column (one rewrite of library.laws and its indexes, under an
--      ACCESS EXCLUSIVE lock). `lock_timeout = 5s`: behind a long read the
--      file stops with "canceling statement due to lock timeout" — nothing
--      changed, re-run it.
--   4. An index in the catalogue's exact order (merged desc nulls last, key
--      desc nulls last, title, slug), so the route's ORDER BY … LIMIT is an
--      index scan with no sort.
--   5. Verify block — RAISES (whole transaction rolls back) unless the column
--      is generated from the function over both dates, no API role can read
--      it or run the function, service_role and postgres can, the index is in
--      the route's order, and the parser gives the expected key on probes of
--      every format above.
--   6. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY IS BEST, ANY ORDER WORKS
--   The code of this batch orders by the key and, when the database answers
--   that the column does not exist (PostgREST v12.2.3, verified locally:
--   HTTP 400, code 42703, "column laws.catalogue_recency_key does not
--   exist"), reads the page again in the old order (section, title, slug):
--   the catalogue keeps working, in the old order. Old code never names the
--   key. After it: run supabase/migrations/_verify.sql (section
--   verify:law_sort_key).
--
-- ROLLBACK
--   drop index if exists library.idx_laws_catalogue_recency;
--   alter table library.laws drop column if exists catalogue_recency_key;
--   drop function if exists library.hijri_date_sort_key(text);
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. the column lock must be in force
do $$
begin
  if to_regclass('library.laws') is null then
    raise exception '20261025_40: library.laws does not exist';
  end if;
  if has_table_privilege('anon', 'library.laws', 'SELECT')
     or has_table_privilege('authenticated', 'library.laws', 'SELECT') then
    raise exception '20261025_40: anon / authenticated still hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or the date key would be readable with the public key';
  end if;
end $$;

-- 1. the parser
create or replace function library.hijri_date_sort_key(p_text text)
returns integer
language plpgsql
immutable
parallel safe
set search_path = ''
as $fn$
declare
  t text;
  m text[];
  y integer;
  mo integer;
  d integer;
begin
  if p_text is null then
    return null;
  end if;
  -- Arabic-Indic (U+0660..) and Persian (U+06F0..) digits → ASCII.
  t := pg_catalog.translate(p_text, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');

  -- 1. year first: 1443/10/16, 1426-08-02, 1446/02
  m := pg_catalog.regexp_match(t, '(?:^|[^0-9])(1[34][0-9]{2})\s*[/-]\s*([0-9]{1,2})(?![0-9])(?:\s*[/-]\s*([0-9]{1,2})(?![0-9]))?');
  if m is not null then
    y := m[1]::integer; mo := m[2]::integer; d := m[3]::integer;
  else
    -- 2. day first: 17/3/1447
    m := pg_catalog.regexp_match(t, '(?:^|[^0-9])([0-9]{1,2})\s*[/-]\s*([0-9]{1,2})\s*[/-]\s*(1[34][0-9]{2})(?![0-9])');
    if m is not null then
      d := m[1]::integer; mo := m[2]::integer; y := m[3]::integer;
    else
      -- 3. a bare year: 1444, 1446 ه
      m := pg_catalog.regexp_match(t, '(?:^|[^0-9])(1[34][0-9]{2})(?![0-9])');
      if m is null then
        return null;
      end if;
      return m[1]::integer * 10000;
    end if;
  end if;

  if mo < 1 or mo > 12 then
    return null;
  end if;
  if d is not null and (d < 1 or d > 30) then
    return null;
  end if;
  return y * 10000 + mo * 100 + coalesce(d, 0);
end
$fn$;

comment on function library.hijri_date_sort_key(text) is
  'N2.5 (20261025_40): the first Hijri date in a free-text date as YYYYMMDD (month-only YYYYMM00, year-only YYYY0000), NULL when there is none. Feeds library.laws.catalogue_recency_key.';

revoke all on function library.hijri_date_sort_key(text) from public, anon, authenticated;
-- Every role that writes library.laws computes the column (see PRIVILEGES).
grant execute on function library.hijri_date_sort_key(text) to service_role, postgres;

-- 2. an earlier draft of this file (never on production): two separate keys
drop index if exists library.idx_laws_catalogue_order;
alter table library.laws
  drop column if exists latest_amendment_key,
  drop column if exists issue_date_key;

-- 3. the column — one statement, one rewrite
alter table library.laws
  add column if not exists catalogue_recency_key integer
    generated always as (greatest(
      library.hijri_date_sort_key(latest_update ->> 'date_hijri'),
      library.hijri_date_sort_key(issue_date_hijri)
    )) stored;

comment on column library.laws.catalogue_recency_key is
  'N2.5 (20261025_40): the later of latest_update->>''date_hijri'' and issue_date_hijri as a sortable Hijri YYYYMMDD, generated (NULL when neither reads). Locked for anon / authenticated like those dates (T28-22); /api/library/init orders by it with the service role and never selects it.';

-- 4. the catalogue order, exactly as the route asks for it
create index if not exists idx_laws_catalogue_recency
  on library.laws (has_merged_regulation desc nulls last, catalogue_recency_key desc nulls last, title, slug);

-- 5. verify
do $$
declare
  r      text;
  gen    text;
  expr   text;
  def    text;
  probe  record;
  got    integer;
begin
  select a.attgenerated::text, pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    into gen, expr
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.laws'::regclass and a.attname = 'catalogue_recency_key' and not a.attisdropped;
  if gen is distinct from 's'
     or expr !~* '^GREATEST\(library\.hijri_date_sort_key\(.*latest_update.*\), library\.hijri_date_sort_key\(.*issue_date_hijri.*\)\)$' then
    raise exception '20261025_40 verify: library.laws.catalogue_recency_key exists but is not generated as greatest(hijri_date_sort_key(latest_update), hijri_date_sort_key(issue_date_hijri)) (generated=%, expr=%) — drop that column and re-run', gen, expr;
  end if;
  if exists (select 1 from pg_catalog.pg_attribute
              where attrelid = 'library.laws'::regclass and not attisdropped
                and attname in ('latest_amendment_key', 'issue_date_key')) then
    raise exception '20261025_40 verify: a draft key column (latest_amendment_key / issue_date_key) is still on library.laws';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.laws', 'catalogue_recency_key', 'SELECT') then
      raise exception '20261025_40 verify: % can read library.laws.catalogue_recency_key', r;
    end if;
    if has_function_privilege(r, 'library.hijri_date_sort_key(text)', 'EXECUTE') then
      raise exception '20261025_40 verify: % can EXECUTE hijri_date_sort_key', r;
    end if;
  end loop;
  if not has_column_privilege('service_role', 'library.laws', 'catalogue_recency_key', 'SELECT') then
    raise exception '20261025_40 verify: service_role cannot read library.laws.catalogue_recency_key — the catalogue cannot order by it';
  end if;
  if not has_function_privilege('service_role', 'library.hijri_date_sort_key(text)', 'EXECUTE') then
    raise exception '20261025_40 verify: service_role cannot run hijri_date_sort_key — every law write by the loader would fail';
  end if;
  if not has_function_privilege('postgres', 'library.hijri_date_sort_key(text)', 'EXECUTE') then
    raise exception '20261025_40 verify: postgres cannot run hijri_date_sort_key — every write to library.laws as postgres would fail';
  end if;
  if to_regclass('library.idx_laws_catalogue_recency') is null then
    raise exception '20261025_40 verify: index library.idx_laws_catalogue_recency is missing';
  end if;
  def := pg_catalog.pg_get_indexdef('library.idx_laws_catalogue_recency'::regclass);
  if def !~ '\(has_merged_regulation DESC NULLS LAST, catalogue_recency_key DESC NULLS LAST, title, slug\)$' then
    raise exception '20261025_40 verify: index library.idx_laws_catalogue_recency is %, not in the route''s order — drop it and re-run', def;
  end if;
  for probe in
    select * from (values
      ('1440/10/29', 14401029), ('1426-08-02', 14260802), ('1443/5/26', 14430526),
      ('1446/11/7', 14461107), ('1444/06/25ه', 14440625), ('1447/07/30هـ', 14470730),
      ('1446/02', 14460200), ('1444', 14440000), ('1446 ه', 14460000),
      ('17/3/1447هـ', 14470317), ('1443/10/16 ه  الموافق : 17/05/2022 م', 14431016),
      ('1437/07/04:11/04/2016', 14370704), ('1443/10/16 ه  الموا', 14431016),
      ('١٤٤٥/٠١/١٤', 14450114), ('''1441/10/05''', 14411005),
      ('2016-04-11', null), ('1473-13-36', null), ('', null), ('غير محدد', null)
    ) as v(input, want)
  loop
    got := library.hijri_date_sort_key(probe.input);
    if got is distinct from probe.want then
      raise exception '20261025_40 verify: hijri_date_sort_key(%) gave % (want %)', probe.input, coalesce(got::text, 'NULL'), coalesce(probe.want::text, 'NULL');
    end if;
  end loop;
  raise notice '20261025_40 verify: OK';
end $$;

-- 6.
notify pgrst, 'reload schema';

commit;
