-- law_sort_key.test.sql — proves 20261025_40 (owner-free P5, N2.5) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain of law_summary_brief.test.sql up to 20261004_01, the fixture prelude
-- (rows that exist BEFORE the column), the _verify block (must only NOTICE),
-- 20261025_40 TWICE (idempotent), the _verify block again (must pass),
-- 20261004_01 again (its own allow-list sweep must still pass with the new
-- column), then this file. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_law_sort_key_block.sql
--   sed -n '/^-- >>> verify:law_sort_key/,/^-- <<< verify:law_sort_key/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $R/prelude_law_sort_key_fixture.sql "$B" \
--     $M/20261025_40_law_sort_key.sql $M/20261025_40_law_sort_key.sql "$B" \
--     $M/20261004_01_library_column_lock.sql \
--     $R/law_sort_key.test.sql
-- 20261025_20 is independent of this file: the same chain with
-- $M/20261025_20_law_summary_brief.sql before or after the 40 pair must pass too.
--
-- NEGATIVE CONTROLS (must FAIL):
--   - the same chain without the two 20261025_40 files → "T1 FAIL: library.laws.catalogue_recency_key is missing";
--   - 20261025_40 placed BEFORE 20261004_01 (anon still holds table SELECT)
--     → "20261025_40: anon / authenticated still hold table-level SELECT …".
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the column: generated, stored, integer; the draft keys are gone
do $$
declare gen text; typ text;
begin
  select a.attgenerated::text, format_type(a.atttypid, a.atttypmod) into gen, typ
    from pg_attribute a
   where a.attrelid = 'library.laws'::regclass and a.attname = 'catalogue_recency_key' and not a.attisdropped;
  if gen is null then raise exception 'T1 FAIL: library.laws.catalogue_recency_key is missing'; end if;
  if gen <> 's' or typ <> 'integer' then
    raise exception 'T1 FAIL: catalogue_recency_key is generated=% type=% (want s / integer)', gen, typ;
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'library.laws'::regclass and not attisdropped
               and attname in ('latest_amendment_key', 'issue_date_key')) then
    raise exception 'T1 FAIL: a draft key column is on library.laws';
  end if;
  raise notice 'T1 PASS: catalogue_recency_key is a stored generated integer column';
end $$;

-- T2 rows that existed before the column were filled by the rewrite
do $$
declare f record; got integer; n int := 0;
begin
  for f in select * from public._sk_fixture order by pos loop
    select catalogue_recency_key into got from library.laws where slug = f.slug;
    if got is distinct from f.want_key then
      raise exception 'T2 FAIL: % catalogue_recency_key % (want %) from issue % / amendment %', f.slug,
        coalesce(got::text, 'NULL'), coalesce(f.want_key::text, 'NULL'), coalesce(f.issue, 'NULL'), coalesce(f.amend, 'NULL');
    end if;
    n := n + 1;
  end loop;
  if n < 19 then raise exception 'T2 FAIL: only % fixture rows', n; end if;
  raise notice 'T2 PASS: % pre-existing rows carry the later of their two dates (or NULL)', n;
end $$;

-- T3 the catalogue order (the route's ORDER BY) is the owner's: merged first,
-- then the newest date — amendment or issue, whichever is later — then
-- title, slug
do $$
declare got text; want text;
begin
  select string_agg(slug, ',' order by has_merged_regulation desc nulls last, catalogue_recency_key desc nulls last, title, slug)
    into got from library.laws where slug like 'sk-%';
  select string_agg(slug, ',' order by pos) into want from public._sk_fixture;
  if got is distinct from want then
    raise exception E'T3 FAIL: catalogue order\n got  %\n want %', got, want;
  end if;
  raise notice 'T3 PASS: merged → newest of (amendment, issue) → title → slug gives the fixture order';
end $$;

-- T3b the reason for the combined key: a law issued in 1447 and never
-- amended comes before a law amended in 1420 (and in 1426)
do $$
declare p1447 bigint; p1420 bigint; p1426 bigint;
begin
  with o as (
    select slug, row_number() over (order by has_merged_regulation desc nulls last, catalogue_recency_key desc nulls last, title, slug) as rn
      from library.laws where slug like 'sk-%'
  )
  select max(rn) filter (where slug = 'sk-issue-1447-04-16'),
         max(rn) filter (where slug = 'sk-amend-1420'),
         max(rn) filter (where slug = 'sk-amend-1426-08-02')
    into p1447, p1420, p1426 from o;
  if not (p1447 < p1426 and p1426 < p1420) then
    raise exception 'T3b FAIL: unamended 1447 at %, amended 1426 at %, amended 1420 at %', p1447, p1426, p1420;
  end if;
  raise notice 'T3b PASS: an unamended 1447 law (%) ranks above laws amended in 1426 (%) and 1420 (%)', p1447, p1426, p1420;
end $$;

-- T4 the key follows every write of the service role (the loaders' role) and
-- cannot be written
set role service_role;
insert into library.laws (slug, title, type, section_code, issue_date_hijri, latest_update)
  values ('sk-new', 'نظام جديد', 'نظام', '00', '1440/1/2', '{"date_hijri": "1445/12/4"}');
do $$
begin
  if (select catalogue_recency_key from library.laws where slug = 'sk-new') is distinct from 14451204 then
    raise exception 'T4 FAIL: an inserted row did not get its key';
  end if;
end $$;
update library.laws set latest_update = '{"date_hijri": "1447/1/1"}', issue_date_hijri = null where slug = 'sk-new';
do $$
begin
  if (select catalogue_recency_key from library.laws where slug = 'sk-new') is distinct from 14470101 then
    raise exception 'T4 FAIL: an update of the amendment did not recompute the key';
  end if;
end $$;
-- the issue date alone, later than an older amendment
update library.laws set latest_update = '{"date_hijri": "1420/1/1"}', issue_date_hijri = '1448' where slug = 'sk-new';
do $$
begin
  if (select catalogue_recency_key from library.laws where slug = 'sk-new') is distinct from 14480000 then
    raise exception 'T4 FAIL: the later issue date did not win over an older amendment';
  end if;
  begin
    update library.laws set catalogue_recency_key = 1 where slug = 'sk-new';
    raise exception 'T4 FAIL: catalogue_recency_key accepted a written value';
  exception when generated_always then null;
  end;
  begin
    insert into library.laws (slug, title, type, section_code, catalogue_recency_key) values ('sk-x', 'x', 'نظام', '00', 1);
    raise exception 'T4 FAIL: catalogue_recency_key accepted an inserted value';
  exception when generated_always then null;
  end;
  raise notice 'T4 PASS: the service role''s insert / update recompute the key from both dates; it cannot be written';
end $$;
delete from library.laws where slug = 'sk-new';
-- The service role orders by the key (what /api/library/init does).
do $$
begin
  if (select slug from library.laws where slug like 'sk-%'
       order by has_merged_regulation desc nulls last, catalogue_recency_key desc nulls last, title, slug
       limit 1) <> 'sk-m-amend-1447' then
    raise exception 'T4 FAIL: the service role does not get the catalogue order';
  end if;
end $$;
reset role;

-- T5 privileges: no API role reads the key or runs the parser
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    if has_column_privilege(r, 'library.laws', 'catalogue_recency_key', 'SELECT') then
      raise exception 'T5 FAIL: % can read catalogue_recency_key', r;
    end if;
    if has_function_privilege(r, 'library.hijri_date_sort_key(text)', 'EXECUTE') then
      raise exception 'T5 FAIL: % can EXECUTE hijri_date_sort_key', r;
    end if;
    if not has_column_privilege(r, 'library.laws', 'title', 'SELECT') then
      raise exception 'T5 FAIL: % lost SELECT on library.laws.title', r;
    end if;
  end loop;
  raise notice 'T5 PASS: anon / authenticated / app_user cannot read the key or run the parser; title stays public';
end $$;

set role anon;
do $$
begin
  begin
    perform catalogue_recency_key from library.laws limit 1;
    raise exception 'T6 FAIL: anon read catalogue_recency_key';
  exception when insufficient_privilege then null;
  end;
  -- ordering by a locked column is reading it: refused too
  begin
    perform slug from library.laws order by catalogue_recency_key desc limit 1;
    raise exception 'T6 FAIL: anon ordered by catalogue_recency_key';
  exception when insufficient_privilege then null;
  end;
  begin
    perform library.hijri_date_sort_key('1440/01/01');
    raise exception 'T6 FAIL: anon ran hijri_date_sort_key';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from library.laws where slug like 'sk-%') < 19 then
    raise exception 'T6 FAIL: anon no longer lists the laws';
  end if;
  raise notice 'T6 PASS: anon gets 42501 on the key (select and order by) and on the parser, and still lists the laws';
end $$;
reset role;

-- T7 the parser on its own: every corpus shape, boundaries, NULL
do $$
declare probe record; got integer;
begin
  for probe in
    select * from (values
      ('1440/10/29', 14401029), ('1426-08-02', 14260802), ('1443/5/26', 14430526), ('1446/11/7', 14461107),
      ('1441/3/1', 14410301), ('1444/06/25ه', 14440625), ('1447/07/30هـ', 14470730), ('1428/02/20هـ', 14280220),
      ('1424/3/11هـ', 14240311), ('1446/02', 14460200), ('1444', 14440000), ('1446 ه', 14460000),
      ('17/3/1447هـ', 14470317), ('1443/10/16 ه  الموافق : 17/05/2022 م', 14431016),
      ('1444/06/24   الموافق : 17/01/2023 م', 14440624), ('1437/07/04:11/04/2016', 14370704),
      ('1443/10/16 ه  الموا', 14431016), ('١٤٤٥/٠١/١٤', 14450114), ('۱۴۴۵/۰۱/۱۴', 14450114),
      ('''1441/10/05''', 14411005), ('"1446/09/24هـ"', 14460924), (' 1445 / 1 / 14 ', 14450114),
      ('1446/12/30', 14461230),
      -- not a Hijri date, or not a possible one
      ('2016-04-11', null), ('17/05/2022', null), ('1473-13-36', null), ('1446/00/10', null),
      ('1446/05/31', null), ('1446/05/00', null), ('21443/01/01', null), ('', null), ('   ', null),
      ('غير محدد', null), ('null', null)
    ) as v(input, want)
  loop
    got := library.hijri_date_sort_key(probe.input);
    if got is distinct from probe.want then
      raise exception 'T7 FAIL: hijri_date_sort_key(%) gave % (want %)', probe.input, coalesce(got::text, 'NULL'), coalesce(probe.want::text, 'NULL');
    end if;
  end loop;
  if library.hijri_date_sort_key(null) is not null then
    raise exception 'T7 FAIL: NULL gave a key';
  end if;
  raise notice 'T7 PASS: the parser reads every corpus shape and refuses Gregorian / impossible dates';
end $$;

-- T8 a latest_update that is not an object (a string, an array) adds nothing,
-- not an error; the issue date still counts
do $$
begin
  insert into library.laws (slug, title, type, section_code, issue_date_hijri, latest_update) values
    ('sk-lu-string', 'س', 'نظام', '00', null, '"1440/01/01"'),
    ('sk-lu-array', 'ص', 'نظام', '00', '1430/02/03', '["1440/01/01"]');
  if (select catalogue_recency_key from library.laws where slug = 'sk-lu-string') is not null then
    raise exception 'T8 FAIL: a string latest_update produced a key';
  end if;
  if (select catalogue_recency_key from library.laws where slug = 'sk-lu-array') is distinct from 14300203 then
    raise exception 'T8 FAIL: an array latest_update hid the issue date';
  end if;
  delete from library.laws where slug in ('sk-lu-string', 'sk-lu-array');
  raise notice 'T8 PASS: a non-object latest_update gives no amendment date';
end $$;

-- T9 the index is in the route's exact order, and the route's
-- ORDER BY … LIMIT / OFFSET can run on it with no sort at all (a table this
-- small never picks it unforced, so seq scans and sorts are switched off)
do $$
declare def text; plan text := ''; line text;
begin
  select pg_get_indexdef('library.idx_laws_catalogue_recency'::regclass) into def;
  if def !~ '\(has_merged_regulation DESC NULLS LAST, catalogue_recency_key DESC NULLS LAST, title, slug\)$' then
    raise exception 'T9 FAIL: index definition is %', def;
  end if;
  set local enable_seqscan = off;
  set local enable_sort = off;
  set local enable_bitmapscan = off;
  for line in execute
    'explain (costs off) select slug, title, type, section_code from library.laws
      order by has_merged_regulation desc nulls last, catalogue_recency_key desc nulls last, title, slug
      limit 50 offset 50'
  loop
    plan := plan || line || E'\n';
  end loop;
  if plan !~ 'Index (Only )?Scan using idx_laws_catalogue_recency' or plan ~ 'Sort' then
    raise exception E'T9 FAIL: the catalogue order does not run on the index:\n%', plan;
  end if;
  raise notice 'T9 PASS: % — the route''s order is an index scan, no sort', def;
end $$;
