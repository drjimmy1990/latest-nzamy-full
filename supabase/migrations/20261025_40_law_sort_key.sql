-- =============================================================================
-- Migration: 20261025_40_law_sort_key.sql
-- =============================================================================
-- PURPOSE (owner-free P5, N2.5 — the default /laws catalogue order)
--   The owner's order for the catalogue (README «٤٧» part ٥): laws that carry
--   their executive regulation merged in (has_merged_regulation) first, then
--   the latest legislative amendment, newest first, then the issue date,
--   newest first. Search keeps its own relevance order (owner ٢٧٧ open:
--   catalogue only).
--
--   Neither date is sortable as stored:
--     - latest_update->>'date_hijri' (jsonb from the owner's frontmatter) —
--       in the owner corpus of 2026-10-25, 780 of 1,727 law files carry the
--       key, ≈200 with a value: «1440/10/29», «1426-08-02», «1443/5/26»,
--       «1446/11/7», «1444/06/25ه», «1447/07/30هـ», «1446/02»;
--     - issue_date_hijri (varchar, free text): the same shapes plus «1444»,
--       «1446 ه», «17/3/1447هـ» (day first), «1443/10/16 ه  الموافق :
--       17/05/2022 م», «1437/07/04:11/04/2016», and the seeder's 20-character
--       cut of the long ones («1443/10/16 ه  الموا»).
--   Text order on those strings is wrong («1446/11/7» > «1446/11/18»), so
--   this file adds two integer keys, YYYYMMDD in the Hijri calendar:
--     library.laws.latest_amendment_key  from latest_update->>'date_hijri'
--     library.laws.issue_date_key        from issue_date_hijri
--   A month-only date is YYYYMM00, a year-only date YYYY0000 (it sorts after
--   the dated days of its year when newest first). Anything else — empty, a
--   Gregorian-only date, an impossible month or day — is NULL and sorts last.
--
--   STORED GENERATED columns, for the reasons 20261025_20 gives: laws reach
--   production through scripts/seed-library-from-owner.mjs straight from the
--   owner's JSONL, so a plain column would go NULL or stale on the next load,
--   and a backfill UPDATE would fire trg_laws_updated_at on every dated law.
--   Loaders must not send these keys (a generated column refuses a value):
--   the owner loader strips them (stripKeys).
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
-- PRIVILEGES — LOCKED LIKE THE COLUMNS THEY COME FROM
--   issue_date_hijri and latest_update are column-locked for anon /
--   authenticated (20261004_01; T28-22 masks the issue date for
--   non-subscribers). A key is the same date as an integer, so this file
--   grants the two columns to NO API role. /api/library/init reads the laws
--   section with the service role and only ORDERS by the keys — it never
--   selects them, so no viewer receives one.
--   The function is EXECUTE for service_role and postgres only (every role
--   that writes library.laws computes the columns; see 20261025_20).
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run unless 20261004_01's lock is in force.
--   1. create or replace library.hijri_date_sort_key(text): IMMUTABLE,
--      PARALLEL SAFE, search_path = ''. EXECUTE revoked from PUBLIC / anon /
--      authenticated, granted to service_role and postgres.
--   2. Both columns in ONE alter table (one rewrite of library.laws and its
--      indexes, under an ACCESS EXCLUSIVE lock). `lock_timeout = 5s`: behind
--      a long read the file stops with "canceling statement due to lock
--      timeout" — nothing changed, re-run it.
--   3. An index in the catalogue's order (merged, amendment, issue — each
--      desc nulls last, as the route asks for them).
--   4. Verify block — RAISES (whole transaction rolls back) unless both
--      columns are generated from the function, no API role can read them or
--      run it, service_role and postgres can, the index exists, and the
--      parser gives the expected key on probes of every format above.
--   5. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY IS BEST, ANY ORDER WORKS
--   The code of this batch orders by the keys and, when the database answers
--   42703 for one of them, reads the page again in the old order (section,
--   title, slug): the catalogue keeps working, in the old order. Old code
--   never names the keys. After it: run supabase/migrations/_verify.sql
--   (section verify:law_sort_key).
--
-- ROLLBACK
--   drop index if exists library.idx_laws_catalogue_order;
--   alter table library.laws drop column if exists latest_amendment_key,
--                            drop column if exists issue_date_key;
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
    raise exception '20261025_40: anon / authenticated still hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or the date keys would be readable with the public key';
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
  'N2.5 (20261025_40): the first Hijri date in a free-text date as YYYYMMDD (month-only YYYYMM00, year-only YYYY0000), NULL when there is none. Feeds library.laws.latest_amendment_key / issue_date_key.';

revoke all on function library.hijri_date_sort_key(text) from public, anon, authenticated;
-- Every role that writes library.laws computes the columns (see PRIVILEGES).
grant execute on function library.hijri_date_sort_key(text) to service_role, postgres;

-- 2. the columns — one statement, one rewrite
alter table library.laws
  add column if not exists latest_amendment_key integer
    generated always as (library.hijri_date_sort_key(latest_update ->> 'date_hijri')) stored,
  add column if not exists issue_date_key integer
    generated always as (library.hijri_date_sort_key(issue_date_hijri)) stored;

comment on column library.laws.latest_amendment_key is
  'N2.5 (20261025_40): latest_update->>''date_hijri'' as a sortable Hijri YYYYMMDD, generated. Locked for anon / authenticated like latest_update; /api/library/init orders by it with the service role and never selects it.';
comment on column library.laws.issue_date_key is
  'N2.5 (20261025_40): issue_date_hijri as a sortable Hijri YYYYMMDD, generated. Locked for anon / authenticated like issue_date_hijri (T28-22); ordered by, never selected, by /api/library/init.';

-- 3. the catalogue order
create index if not exists idx_laws_catalogue_order
  on library.laws (has_merged_regulation desc nulls last, latest_amendment_key desc nulls last, issue_date_key desc nulls last);

-- 4. verify
do $$
declare
  r      text;
  c      text;
  gen    text;
  expr   text;
  probe  record;
  got    integer;
begin
  foreach c in array array['latest_amendment_key', 'issue_date_key'] loop
    select a.attgenerated::text, pg_catalog.pg_get_expr(d.adbin, d.adrelid)
      into gen, expr
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = 'library.laws'::regclass and a.attname = c and not a.attisdropped;
    if gen is distinct from 's' or expr !~ 'hijri_date_sort_key\(' then
      raise exception '20261025_40 verify: library.laws.% exists but is not generated from library.hijri_date_sort_key (generated=%, expr=%) — drop that column and re-run', c, gen, expr;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_column_privilege(r, 'library.laws', c, 'SELECT') then
        raise exception '20261025_40 verify: % can read library.laws.%', r, c;
      end if;
    end loop;
    if not has_column_privilege('service_role', 'library.laws', c, 'SELECT') then
      raise exception '20261025_40 verify: service_role cannot read library.laws.% — the catalogue cannot order by it', c;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'library.hijri_date_sort_key(text)', 'EXECUTE') then
      raise exception '20261025_40 verify: % can EXECUTE hijri_date_sort_key', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'library.hijri_date_sort_key(text)', 'EXECUTE') then
    raise exception '20261025_40 verify: service_role cannot run hijri_date_sort_key — every law write by the loader would fail';
  end if;
  if not has_function_privilege('postgres', 'library.hijri_date_sort_key(text)', 'EXECUTE') then
    raise exception '20261025_40 verify: postgres cannot run hijri_date_sort_key — every write to library.laws as postgres would fail';
  end if;
  if to_regclass('library.idx_laws_catalogue_order') is null then
    raise exception '20261025_40 verify: index library.idx_laws_catalogue_order is missing';
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

-- 5.
notify pgrst, 'reload schema';

commit;
