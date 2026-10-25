-- law_summary_brief.test.sql — proves 20261025_20 (owner-free P3, N2.2) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain of library_column_lock.test.sql up to 20261004_01, the fixture
-- prelude (rows that exist BEFORE the column), the _verify block (must only
-- NOTICE), 20261025_20 TWICE (idempotent), the _verify block again (must
-- pass), then this file. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_law_summary_brief_block.sql
--   sed -n '/^-- >>> verify:law_summary_brief/,/^-- <<< verify:law_summary_brief/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $R/prelude_law_summary_brief_fixture.sql "$B" \
--     $M/20261025_20_law_summary_brief.sql $M/20261025_20_law_summary_brief.sql "$B" \
--     $M/20261004_01_library_column_lock.sql \
--     $R/law_summary_brief.test.sql
-- (20261004_01 runs again AFTER 20261025_20: its own verify sweep — no
-- column outside its allow-list readable — must still pass with the new
-- column.)
--
-- NEGATIVE CONTROLS (must FAIL):
--   - the same chain without the two 20261025_20 files → "T1 FAIL: library.laws.summary_brief is missing";
--   - 20261025_20 placed BEFORE 20261004_01 (anon still holds table SELECT)
--     → "20261025_20: anon / authenticated still hold table-level SELECT …".
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the column: generated, stored, text
do $$
declare gen text; typ text;
begin
  select a.attgenerated::text, format_type(a.atttypid, a.atttypmod) into gen, typ
    from pg_attribute a
   where a.attrelid = 'library.laws'::regclass and a.attname = 'summary_brief' and not a.attisdropped;
  if gen is null then raise exception 'T1 FAIL: library.laws.summary_brief is missing'; end if;
  if gen <> 's' or typ <> 'text' then
    raise exception 'T1 FAIL: summary_brief is generated=% type=% (want s / text)', gen, typ;
  end if;
  raise notice 'T1 PASS: library.laws.summary_brief is a stored generated text column';
end $$;

-- T2 rows that existed before the column were filled by the rewrite, each
-- with the fixture's expected text (the TypeScript twin is held to the same
-- rows by src/lib/library/lawPreambleBlocks.test.ts)
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
  raise notice 'T2 PASS: % pre-existing rows carry the expected موجز (or NULL)', n;
end $$;

-- T3 the column follows every write of the service role (the loaders' role):
-- insert, a preamble update, a preamble cleared — and it cannot be written
set role service_role;
insert into library.laws (slug, title, type, section_code, preamble)
  select 'new-' || slug, title, type, section_code, preamble from library.laws where slug = 'sb-01';
do $$
begin
  if (select summary_brief from library.laws where slug = 'new-sb-01')
     is distinct from '**الموضوع والقرار المتخذ:** يهدف الدليل إلى مساعدة تجار المعادن الثمينة على الامتثال.' then
    raise exception 'T3 FAIL: an inserted row did not get its brief';
  end if;
end $$;
update library.laws set preamble = (select preamble from library.laws where slug = 'sb-04') where slug = 'new-sb-01';
do $$
begin
  if (select summary_brief from library.laws where slug = 'new-sb-01') not like 'دليل إجرائي صادر عن وزارة العدل%' then
    raise exception 'T3 FAIL: a preamble update did not recompute the brief';
  end if;
end $$;
update library.laws set preamble = null where slug = 'new-sb-01';
do $$
begin
  if (select summary_brief from library.laws where slug = 'new-sb-01') is not null then
    raise exception 'T3 FAIL: a cleared preamble kept its brief';
  end if;
  begin
    update library.laws set summary_brief = 'مكتوب يدوياً' where slug = 'new-sb-01';
    raise exception 'T3 FAIL: summary_brief accepted a written value';
  exception when generated_always then null;
  end;
  raise notice 'T3 PASS: the service role''s insert / update / clear recompute summary_brief; it cannot be written';
end $$;
reset role;

-- T4 privileges: no API role reads the column or runs the function
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    if has_column_privilege(r, 'library.laws', 'summary_brief', 'SELECT') then
      raise exception 'T4 FAIL: % can read summary_brief', r;
    end if;
    if has_function_privilege(r, 'library.law_summary_brief(text)', 'EXECUTE') then
      raise exception 'T4 FAIL: % can EXECUTE law_summary_brief', r;
    end if;
    -- the allowed columns are still readable
    if not has_column_privilege(r, 'library.laws', 'title', 'SELECT') then
      raise exception 'T4 FAIL: % lost SELECT on library.laws.title', r;
    end if;
  end loop;
  raise notice 'T4 PASS: anon / authenticated / app_user cannot read summary_brief or run the function; title stays public';
end $$;

set role anon;
do $$
begin
  begin
    perform summary_brief from library.laws limit 1;
    raise exception 'T5 FAIL: anon read summary_brief';
  exception when insufficient_privilege then null;
  end;
  begin
    perform library.law_summary_brief('x');
    raise exception 'T5 FAIL: anon ran law_summary_brief';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from library.laws where slug like 'sb-%') < 10 then
    raise exception 'T5 FAIL: anon no longer reads the public columns of the rows';
  end if;
  raise notice 'T5 PASS: anon gets 42501 on summary_brief and on the function, and still lists the laws';
end $$;
reset role;

-- T6 the extraction itself: the first </details> closes the موجز, CRLF, cap
do $$
begin
  if library.law_summary_brief(E'<details>\n<summary>📝 موجز</summary>\n> أ\n</details>\n<details>\n<summary>📜 ديباجة</summary>\nب\n</details>') is distinct from 'أ' then
    raise exception 'T6 FAIL: the موجز ran past its own </details>';
  end if;
  if library.law_summary_brief(E'<details>\n<summary>📊 بطاقة تعريف</summary>\n| a | b |\n</details>') is not null then
    raise exception 'T6 FAIL: a card <details> read as a موجز';
  end if;
  if char_length(library.law_summary_brief(E'<details open>\n<summary>📝 موجز</summary>\n> ' || repeat('ب', 5000) || E'\n</details>')) <> 2001 then
    raise exception 'T6 FAIL: the brief is not capped at 2,000 characters + «…»';
  end if;
  if library.law_summary_brief(null) is not null then
    raise exception 'T6 FAIL: NULL preamble gave a brief';
  end if;
  raise notice 'T6 PASS: own </details>, card ignored, 2,000-character cap, NULL in → NULL out';
end $$;

-- T7 the writing role computes the column: a role that may write library.laws
-- but not EXECUTE the function cannot write a law row. This is why 20261025_20
-- grants EXECUTE to postgres as well as service_role (on a self-host, the file
-- may run as supabase_admin, which then owns the function). Here postgres is
-- the owner and a superuser, so that grant itself cannot be told apart: the
-- verify block of the file checks it on the real server.
create role nz_t7_writer nologin;
grant usage on schema library to nz_t7_writer;
grant insert, update, select on library.laws to nz_t7_writer;
set role nz_t7_writer;
do $$
begin
  begin
    insert into library.laws (slug, title, type, section_code, preamble) values ('t7', 'ت', 'نظام', '00', 'x');
    raise exception 'T7 FAIL: a writer without EXECUTE computed summary_brief';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T7 PASS: a writer without EXECUTE on law_summary_brief cannot write a law row (42501)';
end $$;
reset role;
revoke all on library.laws from nz_t7_writer;
revoke all on schema library from nz_t7_writer;
drop role nz_t7_writer;
