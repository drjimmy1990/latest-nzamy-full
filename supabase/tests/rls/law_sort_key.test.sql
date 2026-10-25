-- law_sort_key.test.sql — proves 20261025_40 (owner-free P5, N2.5) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain of law_summary_brief.test.sql up to 20261004_01, the fixture prelude
-- (rows that exist BEFORE the columns), the _verify block (must only NOTICE),
-- 20261025_40 TWICE (idempotent), the _verify block again (must pass),
-- 20261004_01 again (its own allow-list sweep must still pass with the new
-- columns), then this file. From the repo root, in Git Bash:
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
--   - the same chain without the two 20261025_40 files → "T1 FAIL: library.laws.latest_amendment_key is missing";
--   - 20261025_40 placed BEFORE 20261004_01 (anon still holds table SELECT)
--     → "20261025_40: anon / authenticated still hold table-level SELECT …".
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the columns: generated, stored, integer
do $$
declare c text; gen text; typ text;
begin
  foreach c in array array['latest_amendment_key', 'issue_date_key'] loop
    select a.attgenerated::text, format_type(a.atttypid, a.atttypmod) into gen, typ
      from pg_attribute a
     where a.attrelid = 'library.laws'::regclass and a.attname = c and not a.attisdropped;
    if gen is null then raise exception 'T1 FAIL: library.laws.% is missing', c; end if;
    if gen <> 's' or typ <> 'integer' then
      raise exception 'T1 FAIL: % is generated=% type=% (want s / integer)', c, gen, typ;
    end if;
  end loop;
  raise notice 'T1 PASS: latest_amendment_key and issue_date_key are stored generated integer columns';
end $$;

-- T2 rows that existed before the columns were filled by the rewrite
do $$
declare f record; gi integer; ga integer; n int := 0;
begin
  for f in select * from public._sk_fixture order by pos loop
    select issue_date_key, latest_amendment_key into gi, ga from library.laws where slug = f.slug;
    if gi is distinct from f.want_issue then
      raise exception 'T2 FAIL: % issue_date_key % (want %) from %', f.slug, coalesce(gi::text, 'NULL'), coalesce(f.want_issue::text, 'NULL'), coalesce(f.issue, 'NULL');
    end if;
    if ga is distinct from f.want_amend then
      raise exception 'T2 FAIL: % latest_amendment_key % (want %) from %', f.slug, coalesce(ga::text, 'NULL'), coalesce(f.want_amend::text, 'NULL'), coalesce(f.amend, 'NULL');
    end if;
    n := n + 1;
  end loop;
  if n < 15 then raise exception 'T2 FAIL: only % fixture rows', n; end if;
  raise notice 'T2 PASS: % pre-existing rows carry the expected keys (or NULL)', n;
end $$;

-- T3 the catalogue order (the route's ORDER BY) is the owner's: merged first,
-- then newest amendment, then newest issue, then title, slug
do $$
declare got text; want text;
begin
  select string_agg(slug, ',' order by has_merged_regulation desc nulls last, latest_amendment_key desc nulls last,
                    issue_date_key desc nulls last, title, slug)
    into got from library.laws where slug like 'sk-%';
  select string_agg(slug, ',' order by pos) into want from public._sk_fixture;
  if got is distinct from want then
    raise exception E'T3 FAIL: catalogue order\n got  %\n want %', got, want;
  end if;
  raise notice 'T3 PASS: merged → amendment desc → issue desc → title → slug gives the fixture order';
end $$;

-- T4 the keys follow every write of the service role (the loaders' role) and
-- cannot be written
set role service_role;
insert into library.laws (slug, title, type, section_code, issue_date_hijri, latest_update)
  values ('sk-new', 'نظام جديد', 'نظام', '00', '1440/1/2', '{"date_hijri": "1445/12/4"}');
do $$
begin
  if (select (issue_date_key, latest_amendment_key) from library.laws where slug = 'sk-new')
     is distinct from (14400102, 14451204) then
    raise exception 'T4 FAIL: an inserted row did not get its keys';
  end if;
end $$;
update library.laws set latest_update = '{"date_hijri": "1447/1/1"}', issue_date_hijri = null where slug = 'sk-new';
do $$
begin
  if (select (issue_date_key, latest_amendment_key) from library.laws where slug = 'sk-new')
     is distinct from (null::integer, 14470101) then
    raise exception 'T4 FAIL: an update did not recompute the keys';
  end if;
  begin
    update library.laws set issue_date_key = 1 where slug = 'sk-new';
    raise exception 'T4 FAIL: issue_date_key accepted a written value';
  exception when generated_always then null;
  end;
  begin
    insert into library.laws (slug, title, type, section_code, latest_amendment_key) values ('sk-x', 'x', 'نظام', '00', 1);
    raise exception 'T4 FAIL: latest_amendment_key accepted a written value';
  exception when generated_always then null;
  end;
  raise notice 'T4 PASS: the service role''s insert / update recompute both keys; neither can be written';
end $$;
-- The service role orders by the keys (what /api/library/init does).
do $$
begin
  if (select slug from library.laws where slug like 'sk-%'
       order by has_merged_regulation desc nulls last, latest_amendment_key desc nulls last, issue_date_key desc nulls last, title, slug
       limit 1) <> 'sk-m-amend-1447' then
    raise exception 'T4 FAIL: the service role does not get the catalogue order';
  end if;
end $$;
delete from library.laws where slug = 'sk-new';
reset role;

-- T5 privileges: no API role reads the keys or runs the parser
do $$
declare r text; c text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    foreach c in array array['latest_amendment_key', 'issue_date_key'] loop
      if has_column_privilege(r, 'library.laws', c, 'SELECT') then
        raise exception 'T5 FAIL: % can read %', r, c;
      end if;
    end loop;
    if has_function_privilege(r, 'library.hijri_date_sort_key(text)', 'EXECUTE') then
      raise exception 'T5 FAIL: % can EXECUTE hijri_date_sort_key', r;
    end if;
    if not has_column_privilege(r, 'library.laws', 'title', 'SELECT') then
      raise exception 'T5 FAIL: % lost SELECT on library.laws.title', r;
    end if;
  end loop;
  raise notice 'T5 PASS: anon / authenticated / app_user cannot read the keys or run the parser; title stays public';
end $$;

set role anon;
do $$
begin
  begin
    perform issue_date_key from library.laws limit 1;
    raise exception 'T6 FAIL: anon read issue_date_key';
  exception when insufficient_privilege then null;
  end;
  -- ordering by a locked column is reading it: refused too
  begin
    perform slug from library.laws order by latest_amendment_key desc limit 1;
    raise exception 'T6 FAIL: anon ordered by latest_amendment_key';
  exception when insufficient_privilege then null;
  end;
  begin
    perform library.hijri_date_sort_key('1440/01/01');
    raise exception 'T6 FAIL: anon ran hijri_date_sort_key';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from library.laws where slug like 'sk-%') < 15 then
    raise exception 'T6 FAIL: anon no longer lists the laws';
  end if;
  raise notice 'T6 PASS: anon gets 42501 on the keys (select and order by) and on the parser, and still lists the laws';
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

-- T8 a latest_update that is not an object (a string, an array) gives NULL, not an error
do $$
begin
  insert into library.laws (slug, title, type, section_code, latest_update) values
    ('sk-lu-string', 'س', 'نظام', '00', '"1440/01/01"'), ('sk-lu-array', 'ص', 'نظام', '00', '["1440/01/01"]');
  if exists (select 1 from library.laws where slug in ('sk-lu-string', 'sk-lu-array') and latest_amendment_key is not null) then
    raise exception 'T8 FAIL: a non-object latest_update produced a key';
  end if;
  delete from library.laws where slug in ('sk-lu-string', 'sk-lu-array');
  raise notice 'T8 PASS: a non-object latest_update gives NULL';
end $$;

-- T9 the index exists in the route's directions
do $$
declare def text;
begin
  select pg_get_indexdef('library.idx_laws_catalogue_order'::regclass) into def;
  if def !~ 'has_merged_regulation DESC NULLS LAST, latest_amendment_key DESC NULLS LAST, issue_date_key DESC NULLS LAST' then
    raise exception 'T9 FAIL: index definition is %', def;
  end if;
  raise notice 'T9 PASS: %', def;
end $$;
