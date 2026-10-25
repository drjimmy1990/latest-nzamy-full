-- =============================================================================
-- Migration: 20261025_20_law_summary_brief.sql
-- =============================================================================
-- PURPOSE (owner-free P3, N2.2 — the outer /laws cards show the law's موجز)
--   The موجز of a law is a `<details><summary>📝 موجز …</summary> … </details>`
--   block inside library.laws.preamble (owner corpus 2026-10-25: 181 of 1,432
--   law files with a preamble; ≈482 of 5,901 live rows). The catalogue cards
--   (/api/library/init) must not ship the whole preamble per law, so this file
--   adds library.laws.summary_brief: the موجز text only.
--
--   It is a STORED GENERATED column, not a column a loader fills:
--     - laws reach production through scripts/seed-library-from-owner.mjs,
--       which streams the owner's JSONL rows straight to PostgREST and never
--       runs scripts/seed-library.ts — a plain column would go NULL or stale
--       on the next owner load. A generated column follows every preamble
--       write, from any loader, with no code in either;
--     - no backfill UPDATE: library.laws has trg_laws_updated_at, and an
--       UPDATE of ≈482 rows would mark them all «updated» today. Adding the
--       column rewrites the table and fills every row without firing it.
--   Loaders must not send summary_brief (a generated column refuses a value);
--   none does.
--
--   library.law_summary_brief(text) is the extraction: the first موجز block,
--   closed by the FIRST `</details>` after its `<summary>` (a regex `.*?` here
--   would run greedy to the LAST `</details>` of the preamble — Postgres takes
--   the whole pattern's greediness from its first quantifier), `\r\n` read as
--   `\n`, the blockquote `>` marks removed, trimmed, capped at 2,000
--   characters + «…», NULL when empty. Its TypeScript twin is lawSummaryBrief()
--   in src/lib/library/lawPreambleBlocks.ts; both are held to the same
--   fixture (supabase/tests/rls/prelude_law_summary_brief_fixture.sql).
--
-- PRIVILEGES — LOCKED LIKE THE PREAMBLE IT COMES FROM
--   The موجز is a subscriber feature until owner question ٢٦٠ is answered
--   (src/lib/library/lawSummaryVisibility.ts, LAW_SUMMARY_AUDIENCE). Since
--   20261004_01 library.laws has no table-level grant for anon /
--   authenticated, so a new column is locked by default: this file grants it
--   to NO API role, and /api/library/init reads it with the service role and
--   sends it per viewer. If ٢٦٠ makes it public, only that flag changes — do
--   NOT grant this column (20261004_01's verify sweep would then fail).
--   The function is EXECUTE for service_role only: the API roles cannot call
--   it as an RPC. (The generated column is computed with the privileges of
--   the role that writes the row — service_role or postgres.)
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   0. Refuses to run unless 20261004_01's lock is in force (anon /
--      authenticated must hold no table-level SELECT on library.laws, or the
--      new column would be readable by the public key).
--   1. create or replace library.law_summary_brief(text): IMMUTABLE, PARALLEL
--      SAFE, search_path = ''. EXECUTE revoked from PUBLIC / anon /
--      authenticated, granted to service_role.
--   2. add column if not exists summary_brief text generated always as
--      (library.law_summary_brief(preamble)) stored — this rewrites
--      library.laws under an ACCESS EXCLUSIVE lock (seconds; /laws waits).
--   3. verify block — RAISES (whole transaction rolls back) unless the column
--      is generated from the function, no API role can read it or run the
--      function, service_role can do both, and the function gives the
--      expected text on two probes (one with a later </details>).
--   4. notify pgrst to reload its schema cache.
--
-- DEPLOY ORDER — ANY TIME (code first or SQL first)
--   The code of this batch reads summary_brief only for subscribers and, when
--   the column is missing (42703), reads the list again without it: the cards
--   then show no موجز, nothing else changes. Old code never names it.
--   After it: run supabase/migrations/_verify.sql (section
--   verify:law_summary_brief).
--
-- ROLLBACK
--   alter table library.laws drop column if exists summary_brief;
--   drop function if exists library.law_summary_brief(text);
-- =============================================================================

begin;

-- 0. the column lock must be in force
do $$
begin
  if to_regclass('library.laws') is null then
    raise exception '20261025_20: library.laws does not exist';
  end if;
  if has_table_privilege('anon', 'library.laws', 'SELECT')
     or has_table_privilege('authenticated', 'library.laws', 'SELECT') then
    raise exception '20261025_20: anon / authenticated still hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or summary_brief would be readable with the public key';
  end if;
end $$;

-- 1. the extraction
create or replace function library.law_summary_brief(p_preamble text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $fn$
declare
  t    text;
  tail text;
  body text;
  cut  integer;
begin
  if p_preamble is null then
    return null;
  end if;
  t := pg_catalog.replace(p_preamble, E'\r\n', E'\n');
  -- Everything after the first موجز <summary>. `[^<]*` keeps the match inside
  -- one <summary> element; the body is cut at the first </details> below.
  tail := (pg_catalog.regexp_match(t, '<details[^>]*>\s*<summary>[^<]*📝[^<]*موجز[^<]*</summary>(.*)$'))[1];
  if tail is null then
    return null;
  end if;
  cut := pg_catalog.strpos(tail, '</details>');
  if cut = 0 then
    return null; -- an unclosed موجز is not read
  end if;
  body := pg_catalog.substr(tail, 1, cut - 1);
  body := pg_catalog.regexp_replace(body, '^[ \t]*>[ \t]?', '', 'gn');
  body := pg_catalog.btrim(body, E' \t\n\r');
  if body = '' then
    return null;
  end if;
  if pg_catalog.char_length(body) > 2000 then
    body := pg_catalog.left(body, 2000) || '…';
  end if;
  return body;
end
$fn$;

comment on function library.law_summary_brief(text) is
  'N2.2 (20261025_20): the موجز text of a law preamble for library.laws.summary_brief. Twin of lawSummaryBrief() in src/lib/library/lawPreambleBlocks.ts.';

revoke all on function library.law_summary_brief(text) from public, anon, authenticated;
grant execute on function library.law_summary_brief(text) to service_role;

-- 2. the column
alter table library.laws
  add column if not exists summary_brief text
  generated always as (library.law_summary_brief(preamble)) stored;

comment on column library.laws.summary_brief is
  'N2.2 (20261025_20): the موجز of the preamble, generated. Locked for anon / authenticated like preamble (subscribers only until owner ٢٦٠); /api/library/init reads it with the service role.';

-- 3. verify
do $$
declare
  r       text;
  gen     text;
  expr    text;
  probe   text;
begin
  select a.attgenerated::text, pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    into gen, expr
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.laws'::regclass and a.attname = 'summary_brief' and not a.attisdropped;
  if gen is distinct from 's' or expr !~ 'law_summary_brief\(preamble\)' then
    raise exception '20261025_20 verify: library.laws.summary_brief exists but is not generated from library.law_summary_brief(preamble) (generated=%, expr=%) — drop that column and re-run', gen, expr;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.laws', 'summary_brief', 'SELECT') then
      raise exception '20261025_20 verify: % can read library.laws.summary_brief', r;
    end if;
    if has_function_privilege(r, 'library.law_summary_brief(text)', 'EXECUTE') then
      raise exception '20261025_20 verify: % can EXECUTE library.law_summary_brief', r;
    end if;
  end loop;
  if not has_column_privilege('service_role', 'library.laws', 'summary_brief', 'SELECT')
     or not has_function_privilege('service_role', 'library.law_summary_brief(text)', 'EXECUTE') then
    raise exception '20261025_20 verify: service_role cannot read summary_brief or run law_summary_brief';
  end if;
  probe := library.law_summary_brief(E'<details open>\r\n<summary>📝 موجز المستند (خلاصة سريعة)</summary>\r\n\r\n> **الموضوع:** نص الموجز.\r\n\r\n</details>\r\n\r\n<details>\r\n<summary>📜 ديباجة</summary>\r\nنص\r\n</details>');
  if probe is distinct from '**الموضوع:** نص الموجز.' then
    raise exception '20261025_20 verify: law_summary_brief probe gave %', coalesce(probe, 'NULL');
  end if;
  if library.law_summary_brief('# نظام بلا موجز') is not null then
    raise exception '20261025_20 verify: law_summary_brief found a موجز where there is none';
  end if;
  raise notice '20261025_20 verify: OK';
end $$;

-- 4.
notify pgrst, 'reload schema';

commit;
