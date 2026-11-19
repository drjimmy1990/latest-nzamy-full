-- =============================================================================
-- Migration: 20261129_70_library_amendment_cards_summaries.sql
-- =============================================================================
-- PURPOSE (owner file 18 «تكليف وكيل المكتبة», our reply «خامساً» 2 and 3;
--          batch l9-parser)
--
--   1. library.article_amendments — one amendment = one card. The parser now
--      pairs every <!-- AMENDMENT {…} --> anchor with the text that follows it
--      (scripts/parsers/lib/article-history.ts), and the anchor can say more:
--        decree_id    text     the amending instrument's own library id
--                              (the reader can link it); NULL = not stated
--        paragraphs   text     the paragraph(s) it touched, as written («5، 7»)
--        text_status  text     'available' | 'unavailable' (the source keeps
--                              no prior text: the card says so instead of
--                              showing an empty box); NULL = not stated
--        position     integer  the card's place in its article (source
--                              order, 0 first): the reader sorts by it, and
--                              the count shown is the number of cards
--      The table stays server-only (20260929_01): no API role reads it, so
--      the new columns are locked with it.
--
--   2. library.laws — the frontmatter summaries the library agent writes
--      (item 4), loaded by scripts/seed-library.ts:
--        summary              text  the document's موجز (above the document)
--        summary_card         text  the frontmatter `summary_brief`: one to
--                                   three lines for the /laws card
--        summary_status       text  'draft' | 'reviewed' (NULL = none)
--        summary_reviewed_at  date  when it was reviewed
--      Locked like the preamble (20261004_01: library.laws has no table-level
--      grant for anon / authenticated, and this file grants none): the routes
--      read them with the service role.
--
--   3. library.laws.summary_brief (20261025_20, the card's موجز, GENERATED) is
--      re-created as
--        coalesce(library.law_reviewed_summary_card(summary_card, summary_status),
--                 library.law_summary_brief(preamble))
--      — the REVIEWED frontmatter brief first, else the 📝 block of the
--      preamble exactly as before. A draft is stored and never shown. The
--      /api/library/init cards read summary_brief already: no code change.
--      Dropping and adding a STORED generated column rewrites library.laws
--      and rebuilds its indexes (fts GIN among them) under an ACCESS
--      EXCLUSIVE lock — the same cost 20261025_20 measured as acceptable
--      (≈6k rows). Done only when the column is not already in the new form,
--      so a re-run rewrites nothing. `lock_timeout = 5s`: a long read on
--      library.laws stops the file with "canceling statement due to lock
--      timeout" (nothing changed — re-run it) instead of freezing the library.
--      If any view depends on summary_brief the drop fails and the whole file
--      rolls back (none does today).
--
--   No setting value changes here.
--
-- WHO CAN DO WHAT
--   library.law_reviewed_summary_card(text, text): IMMUTABLE, search_path ''.
--   EXECUTE revoked from PUBLIC / anon / authenticated, granted to
--   service_role and postgres — every role that WRITES library.laws computes
--   the generated column (see 20261025_20, PRIVILEGES).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_70_library_amendment_cards_summaries.sql
--   Expect: NOTICE  l9_parser verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261025_20 and 20261004_01 / 20260929_01 (all live);
--   BEFORE the next library load with the l9 loader.
--   * Code first: nothing reads these columns yet; a library load with the new
--     seeder stops in its preflight before the first write (the loader lists
--     them as required columns, src/lib/library/ownerLoaderTables.ts) and
--     names this file.
--   * SQL first with the old code: the old loader never names the new
--     columns; summary_brief gives the same text as before until a reviewed
--     summary is loaded.
--   AFTER THE FIRST LOAD WITH THE l9 LOADER (one time): amendment ids are
--   positional (<article id>__amd-<n>) and the loader only upserts, so an
--   article that now has fewer cards keeps its old extra rows (the 5 → 2 of
--   نظام القضاء art. 1 would still show 5). `npm run library:diff` lists them
--   as article_amendments «left behind» (≈ 440 on the 10-03 corpus), with the
--   «مكرر» articles' old `__art-i<n>` ids. Every row this loader writes has a
--   position, so after a FULL laws load (not --table / --limit / --from):
--     select count(*) from library.article_amendments where position is null;  -- ≈ the diff's count
--     delete from library.article_amendments where position is null;
--   and delete the left-behind `articles` ids the diff lists (their
--   amendments go with them, on delete cascade).
--   RE-RUN HAZARD: none. Re-running 20261025_20 after this file keeps the new
--   column (its `add column if not exists` skips, and its verify still finds
--   law_summary_brief(preamble) in the expression). This file is safe to run
--   any number of times.
--
-- ROLLBACK (in one transaction; the frontmatter summaries are lost, the
-- source files keep them):
--   alter table library.laws drop column if exists summary_brief;
--   alter table library.laws add column summary_brief text
--     generated always as (library.law_summary_brief(preamble)) stored;
--   alter table library.laws drop column if exists summary,
--     drop column if exists summary_card, drop column if exists summary_status,
--     drop column if exists summary_reviewed_at;
--   drop function if exists library.law_reviewed_summary_card(text, text);
--   alter table library.article_amendments drop column if exists decree_id,
--     drop column if exists paragraphs, drop column if exists text_status,
--     drop column if exists position;
--   notify pgrst, 'reload schema';
--   (then the l9 loader's preflight refuses a load: deploy the previous loader)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. what this file builds on must be in force
do $$
begin
  if to_regclass('library.laws') is null or to_regclass('library.article_amendments') is null then
    raise exception '20261129_70: library.laws / library.article_amendments missing — apply the library schema first';
  end if;
  if to_regprocedure('library.law_summary_brief(text)') is null then
    raise exception '20261129_70: library.law_summary_brief(text) missing — apply 20261025_20 first';
  end if;
  if has_table_privilege('anon', 'library.laws', 'SELECT')
     or has_table_privilege('authenticated', 'library.laws', 'SELECT') then
    raise exception '20261129_70: anon / authenticated hold table-level SELECT on library.laws — apply 20261004_01 (the column lock) first, or the new columns would be readable with the public key';
  end if;
  if has_table_privilege('anon', 'library.article_amendments', 'SELECT')
     or has_table_privilege('authenticated', 'library.article_amendments', 'SELECT') then
    raise exception '20261129_70: anon / authenticated can read library.article_amendments — apply 20260929_01 (server-only article tables) first';
  end if;
end $$;

-- 1. the amendment cards
alter table library.article_amendments
  add column if not exists decree_id   text,
  add column if not exists paragraphs  text,
  add column if not exists text_status text,
  add column if not exists position    integer;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'library.article_amendments'::regclass
                    and conname = 'article_amendments_text_status_check') then
    alter table library.article_amendments
      add constraint article_amendments_text_status_check
      check (text_status is null or text_status in ('available', 'unavailable'));
  end if;
end $$;

comment on column library.article_amendments.decree_id is
  'Owner file 18 item 3 (20261129_70): the amending instrument''s library id, from the AMENDMENT anchor; NULL = not stated.';
comment on column library.article_amendments.paragraphs is
  'Owner file 18 item 3 (20261129_70): the paragraph(s) the amendment touched, as the anchor writes them.';
comment on column library.article_amendments.text_status is
  'Owner file 18 item 3 (20261129_70): available | unavailable (the source keeps no prior text); NULL = not stated.';
comment on column library.article_amendments.position is
  'Owner file 18 item 3 (20261129_70): the card''s place in its article, source order, 0 first.';

-- 2. the frontmatter summaries
alter table library.laws
  add column if not exists summary             text,
  add column if not exists summary_card        text,
  add column if not exists summary_status      text,
  add column if not exists summary_reviewed_at date;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'library.laws'::regclass
                    and conname = 'laws_summary_status_check') then
    alter table library.laws
      add constraint laws_summary_status_check
      check (summary_status is null or summary_status in ('draft', 'reviewed'));
  end if;
end $$;

comment on column library.laws.summary is
  'Owner file 18 item 4 (20261129_70): the document موجز from the frontmatter `summary`. Locked like the preamble; shown only when summary_status = reviewed.';
comment on column library.laws.summary_card is
  'Owner file 18 item 4 (20261129_70): the frontmatter `summary_brief` (the /laws card line). Reaches summary_brief only when summary_status = reviewed.';
comment on column library.laws.summary_status is
  'Owner file 18 item 4 (20261129_70): draft | reviewed; NULL = none (a draft).';
comment on column library.laws.summary_reviewed_at is
  'Owner file 18 item 4 (20261129_70): the review date from the frontmatter.';

-- 3. the card's موجز: the reviewed frontmatter brief first
create or replace function library.law_reviewed_summary_card(p_card text, p_status text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $fn$
declare
  t text;
begin
  if p_status is distinct from 'reviewed' or p_card is null then
    return null;
  end if;
  t := pg_catalog.btrim(pg_catalog.replace(p_card, E'\r\n', E'\n'), E' \t\n\r');
  if t = '' then
    return null;
  end if;
  return t;
end
$fn$;

comment on function library.law_reviewed_summary_card(text, text) is
  'Owner file 18 item 4 (20261129_70): the frontmatter card summary when reviewed, else NULL. Part of library.laws.summary_brief.';

revoke all on function library.law_reviewed_summary_card(text, text) from public, anon, authenticated;
grant execute on function library.law_reviewed_summary_card(text, text) to service_role, postgres;

do $$
declare
  expr text;
begin
  select pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    into expr
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.laws'::regclass and a.attname = 'summary_brief' and not a.attisdropped;
  if expr is null or expr !~ 'law_reviewed_summary_card\(summary_card, summary_status\)' then
    -- A view built on summary_brief would make the drop fail: name it.
    if exists (select 1
                 from pg_catalog.pg_depend dep
                 join pg_catalog.pg_attribute att on att.attrelid = dep.refobjid and att.attnum = dep.refobjsubid
                where dep.refobjid = 'library.laws'::regclass and att.attname = 'summary_brief'
                  and dep.classid = 'pg_catalog.pg_rewrite'::regclass) then
      raise exception '20261129_70: a view depends on library.laws.summary_brief (%) — nothing changed; drop / re-create that view around this file',
        (select pg_catalog.string_agg(distinct r.ev_class::regclass::text, ', ')
           from pg_catalog.pg_depend dep
           join pg_catalog.pg_attribute att on att.attrelid = dep.refobjid and att.attnum = dep.refobjsubid
           join pg_catalog.pg_rewrite r on r.oid = dep.objid
          where dep.refobjid = 'library.laws'::regclass and att.attname = 'summary_brief'
            and dep.classid = 'pg_catalog.pg_rewrite'::regclass);
    end if;
    alter table library.laws drop column if exists summary_brief;
    alter table library.laws
      add column summary_brief text
      generated always as (coalesce(library.law_reviewed_summary_card(summary_card, summary_status),
                                    library.law_summary_brief(preamble))) stored;
  end if;
end $$;

comment on column library.laws.summary_brief is
  'N2.2 (20261025_20) + owner file 18 item 4 (20261129_70): the card موجز, generated — the reviewed summary_card, else the 📝 موجز block of the preamble. Locked for anon / authenticated; /api/library/init reads it with the service role.';

-- 4. verify
do $verify$
declare
  r    text;
  c    text;
  gen  text;
  expr text;
begin
  foreach c in array array['decree_id', 'paragraphs', 'text_status', 'position'] loop
    if not exists (select 1 from pg_catalog.pg_attribute
                    where attrelid = 'library.article_amendments'::regclass and attname = c and not attisdropped) then
      raise exception 'l9_parser verify: library.article_amendments.% missing', c;
    end if;
  end loop;
  foreach c in array array['summary', 'summary_card', 'summary_status', 'summary_reviewed_at'] loop
    if not exists (select 1 from pg_catalog.pg_attribute
                    where attrelid = 'library.laws'::regclass and attname = c and not attisdropped) then
      raise exception 'l9_parser verify: library.laws.% missing', c;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_column_privilege(r, 'library.laws', c, 'SELECT') then
        raise exception 'l9_parser verify: % can read library.laws.%', r, c;
      end if;
    end loop;
    if not has_column_privilege('service_role', 'library.laws', c, 'SELECT')
       or not has_column_privilege('service_role', 'library.laws', c, 'UPDATE') then
      raise exception 'l9_parser verify: service_role cannot read / write library.laws.%', c;
    end if;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'library.article_amendments', 'SELECT') then
      raise exception 'l9_parser verify: % can read library.article_amendments', r;
    end if;
    if has_function_privilege(r, 'library.law_reviewed_summary_card(text, text)', 'EXECUTE') then
      raise exception 'l9_parser verify: % can EXECUTE law_reviewed_summary_card', r;
    end if;
    if has_column_privilege(r, 'library.laws', 'summary_brief', 'SELECT') then
      raise exception 'l9_parser verify: % can read library.laws.summary_brief', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'library.law_reviewed_summary_card(text, text)', 'EXECUTE')
     or not has_function_privilege('postgres', 'library.law_reviewed_summary_card(text, text)', 'EXECUTE') then
    raise exception 'l9_parser verify: service_role / postgres cannot run law_reviewed_summary_card — every write to library.laws would fail';
  end if;
  select a.attgenerated::text, pg_catalog.pg_get_expr(d.adbin, d.adrelid)
    into gen, expr
    from pg_catalog.pg_attribute a
    left join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.laws'::regclass and a.attname = 'summary_brief' and not a.attisdropped;
  if gen is distinct from 's'
     or expr !~ 'law_reviewed_summary_card\(summary_card, summary_status\)'
     or expr !~ 'law_summary_brief\(preamble\)' then
    raise exception 'l9_parser verify: summary_brief is not generated from the reviewed card + the preamble (generated=%, expr=%)', gen, expr;
  end if;
  if library.law_reviewed_summary_card(E' سطر البطاقة.\r\n', 'reviewed') is distinct from 'سطر البطاقة.'
     or library.law_reviewed_summary_card('سطر', 'draft') is not null
     or library.law_reviewed_summary_card('سطر', null) is not null
     or library.law_reviewed_summary_card('  ', 'reviewed') is not null then
    raise exception 'l9_parser verify: law_reviewed_summary_card probes failed';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'library.article_amendments'::regclass and conname = 'article_amendments_text_status_check')
     or not exists (select 1 from pg_catalog.pg_constraint
                     where conrelid = 'library.laws'::regclass and conname = 'laws_summary_status_check') then
    raise exception 'l9_parser verify: a check constraint is missing';
  end if;
  raise notice 'l9_parser verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261129_70 amendment cards (decree_id, paragraphs, text_status, position) + law summaries (summary, summary_card, summary_status, summary_reviewed_at; summary_brief = reviewed card first)' as step,
       (select pg_catalog.count(*) from pg_catalog.pg_attribute
         where attrelid = 'library.article_amendments'::regclass and not attisdropped
           and attname in ('decree_id', 'paragraphs', 'text_status', 'position')) = 4
       and (select pg_catalog.count(*) from pg_catalog.pg_attribute
             where attrelid = 'library.laws'::regclass and not attisdropped
               and attname in ('summary', 'summary_card', 'summary_status', 'summary_reviewed_at')) = 4
       and coalesce((select pg_catalog.pg_get_expr(d.adbin, d.adrelid) ~ 'law_reviewed_summary_card'
                       from pg_catalog.pg_attribute a
                       join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                      where a.attrelid = 'library.laws'::regclass and a.attname = 'summary_brief'), false)
       as ok;
