-- library_amendment_cards_summaries.test.sql — proves 20261129_70 (owner file
-- 18, our reply «خامساً» 2 + 3; batch l9-parser) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the chain of
-- law_summary_brief.test.sql up to 20261025_20 (with its fixture rows), the
-- l9 _verify block BEFORE the file (must answer false, not fail), 20261129_70
-- TWICE (idempotent: the second run rewrites nothing), 20261025_20 AGAIN (the
-- re-run hazard: it must keep the new column and pass its own verify), the
-- _verify block again, then this file. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l9_parser_block.sql
--   sed -n '/^-- >>> verify:l9_parser/,/^-- <<< verify:l9_parser/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $R/prelude_law_summary_brief_fixture.sql \
--     $M/20261025_20_law_summary_brief.sql "$B" \
--     $M/20261129_70_library_amendment_cards_summaries.sql $M/20261129_70_library_amendment_cards_summaries.sql \
--     $M/20261025_20_law_summary_brief.sql "$B" \
--     $M/20261004_01_library_column_lock.sql \
--     $R/library_amendment_cards_summaries.test.sql
-- (20261004_01 runs again at the end: its own sweep — no column outside its
-- allow-list readable — must still pass with the four new law columns.)
--
-- NEGATIVE CONTROLS (must FAIL):
--   - the chain without the two 20261129_70 files → "T1 FAIL: … missing";
--   - 20261129_70 placed BEFORE 20261025_20 → "20261129_70: library.law_summary_brief(text) missing".
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the columns and their types
do $$
declare c record; typ text;
begin
  for c in select * from (values
    ('library.article_amendments', 'decree_id', 'text'),
    ('library.article_amendments', 'paragraphs', 'text'),
    ('library.article_amendments', 'text_status', 'text'),
    ('library.article_amendments', 'position', 'integer'),
    ('library.laws', 'summary', 'text'),
    ('library.laws', 'summary_card', 'text'),
    ('library.laws', 'summary_status', 'text'),
    ('library.laws', 'summary_reviewed_at', 'date')) as v(t, col, want)
  loop
    select format_type(a.atttypid, a.atttypmod) into typ
      from pg_attribute a where a.attrelid = c.t::regclass and a.attname = c.col and not a.attisdropped;
    if typ is null then raise exception 'T1 FAIL: %.% missing', c.t, c.col; end if;
    if typ <> c.want then raise exception 'T1 FAIL: %.% is % (want %)', c.t, c.col, typ, c.want; end if;
  end loop;
  raise notice 'T1 PASS: 4 amendment columns + 4 law summary columns with their types';
end $$;

-- T2 the rewrite kept every existing brief: no row has a reviewed card yet,
-- so summary_brief is still the preamble's 📝 block (the 20261025_20 fixture)
do $$
declare f record; got text; want text; n int := 0;
begin
  for f in select * from public._sb_fixture order by slug loop
    select summary_brief into got from library.laws where slug = f.slug;
    want := nullif(replace(f.expected, E'\r\n', E'\n'), '');
    if got is distinct from want then
      raise exception 'T2 FAIL: % → % (want %)', f.slug, coalesce(left(got, 80), 'NULL'), coalesce(left(want, 80), 'NULL');
    end if;
    n := n + 1;
  end loop;
  if n < 10 then raise exception 'T2 FAIL: only % fixture rows', n; end if;
  raise notice 'T2 PASS: % existing rows keep their موجز after the column was re-created', n;
end $$;

-- T3 the service role (the loader): a draft card never reaches summary_brief,
-- a reviewed one replaces the preamble block, and clearing it brings the block back
set role service_role;
update library.laws set summary = 'موجز المستند.', summary_card = 'سطر البطاقة المراجع.', summary_status = 'draft'
 where slug = 'sb-01';
do $$
declare before_brief text := (select expected from public._sb_fixture where slug = 'sb-01');
begin
  if (select summary_brief from library.laws where slug = 'sb-01') is distinct from nullif(replace(before_brief, E'\r\n', E'\n'), '') then
    raise exception 'T3 FAIL: a DRAFT card changed summary_brief';
  end if;
end $$;
update library.laws set summary_status = 'reviewed', summary_reviewed_at = '2026-11-20' where slug = 'sb-01';
do $$
begin
  if (select summary_brief from library.laws where slug = 'sb-01') is distinct from 'سطر البطاقة المراجع.' then
    raise exception 'T3 FAIL: a REVIEWED card did not become summary_brief';
  end if;
end $$;
update library.laws set summary_card = null where slug = 'sb-01';
do $$
declare before_brief text := (select expected from public._sb_fixture where slug = 'sb-01');
begin
  if (select summary_brief from library.laws where slug = 'sb-01') is distinct from nullif(replace(before_brief, E'\r\n', E'\n'), '') then
    raise exception 'T3 FAIL: a reviewed row with no card did not fall back to the preamble block';
  end if;
  begin
    update library.laws set summary_status = 'approved' where slug = 'sb-01';
    raise exception 'T3 FAIL: summary_status accepted «approved»';
  exception when check_violation then null;
  end;
  begin
    insert into library.article_amendments (article_id, text_status) values ('no-such-article', 'missing');
    raise exception 'T3 FAIL: text_status accepted «missing»';
  exception when check_violation then null;
  end;
  raise notice 'T3 PASS: draft never shown, reviewed card first, preamble block as fallback; both CHECKs hold';
end $$;
reset role;

-- T4 privileges: no API role reads the new columns or runs the function
do $$
declare r text; c text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    foreach c in array array['summary', 'summary_card', 'summary_status', 'summary_reviewed_at', 'summary_brief'] loop
      if has_column_privilege(r, 'library.laws', c, 'SELECT') then
        raise exception 'T4 FAIL: % can read library.laws.%', r, c;
      end if;
    end loop;
    if has_table_privilege(r, 'library.article_amendments', 'SELECT') then
      raise exception 'T4 FAIL: % can read library.article_amendments', r;
    end if;
    if has_function_privilege(r, 'library.law_reviewed_summary_card(text, text)', 'EXECUTE') then
      raise exception 'T4 FAIL: % can EXECUTE law_reviewed_summary_card', r;
    end if;
    if not has_column_privilege(r, 'library.laws', 'title', 'SELECT') then
      raise exception 'T4 FAIL: % lost SELECT on library.laws.title', r;
    end if;
  end loop;
  raise notice 'T4 PASS: anon / authenticated / app_user read none of the new columns; title stays public';
end $$;

set role anon;
do $$
begin
  begin
    perform summary_card from library.laws limit 1;
    raise exception 'T5 FAIL: anon read summary_card';
  exception when insufficient_privilege then null;
  end;
  begin
    perform library.law_reviewed_summary_card('x', 'reviewed');
    raise exception 'T5 FAIL: anon ran law_reviewed_summary_card';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T5 PASS: anon gets 42501 on the new column and on the function';
end $$;
reset role;

-- T6 the second run of 20261129_70 rewrote nothing, and the re-run of
-- 20261025_20 kept the new expression
do $$
declare expr text;
begin
  select pg_get_expr(d.adbin, d.adrelid) into expr
    from pg_attribute a join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
   where a.attrelid = 'library.laws'::regclass and a.attname = 'summary_brief';
  if expr !~ 'law_reviewed_summary_card\(summary_card, summary_status\)' or expr !~ 'law_summary_brief\(preamble\)' then
    raise exception 'T6 FAIL: summary_brief expression is %', expr;
  end if;
  raise notice 'T6 PASS: summary_brief = %', expr;
end $$;
