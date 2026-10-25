-- library_search_relevance.test.sql — proves 20261026_52 (owner ٢٧٧: search results by relevance).
-- Chain (run.sh, postgres:16) — the library chain with the four sibling
-- windows, the fixture, then 20261026_52 TWICE (idempotent). From the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_article_history_columns.sql $M/20260729_feqh_locator_labels.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261016_01_library_principles_text_lock.sql \
--     $M/20261017_20_library_search_principles_page.sql $M/20261018_02_library_feqh_decree_text_lock.sql \
--     $M/20261019_41_library_search_law_articles_page.sql \
--     supabase/tests/rls/prelude_search_relevance_fixture.sql \
--     $M/20261026_52_library_search_relevance.sql $M/20261026_52_library_search_relevance.sql \
--     supabase/tests/rls/library_search_relevance.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261026_52 files → T1
-- fails (the function does not exist).
--
-- 20261017_21 (larger fts statistics) is deliberately NOT in the chain: the
-- planner's word estimates are at their worst, as on a database that skipped it.
-- The file runs as the superuser; role-scoped assertions `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- helper: the ids of a window, in order, comma-joined
create function pg_temp.ids(res jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(x ->> 'id', ',' order by ord), '')
    from jsonb_array_elements(res -> 'rows') with ordinality as t(x, ord)
$$;
create function pg_temp.keys(row_ jsonb) returns text[] language sql immutable as $$
  select array_agg(k order by k) from jsonb_object_keys(row_) k
$$;

-- T1 laws: relevance order, ties by id, the sibling's row shape, the filters
set role service_role;
do $$
declare
  res jsonb;
  sib jsonb;
begin
  res := library.search_law_articles_relevance('''تحكيم''', 0, 50);
  -- 3× in 4 words; 2× in 3 (a repealed article, its wording in original_text);
  -- two identical texts (the tie: id order); 1× in 61 words last.
  if pg_temp.ids(res) is distinct from 'rel-a__art-1,rel-b__art-3,rel-b__art-1,rel-b__art-2,rel-a__art-2'
     or (res ->> 'count')::int <> 5 or (res ->> 'ranked')::boolean is not true then
    raise exception 'T1 FAIL: ids=% count=% ranked=%', pg_temp.ids(res), res ->> 'count', res ->> 'ranked';
  end if;
  sib := library.search_law_articles_page('''تحكيم''', 0, 50);
  if pg_temp.keys(res -> 'rows' -> 0) <> pg_temp.keys(sib -> 'rows' -> 0)
     or pg_temp.keys(res -> 'rows' -> 0) <> array['id', 'law_slug', 'number', 'number_text', 'original_text', 'status', 'text'] then
    raise exception 'T1 FAIL: row keys % vs the sibling''s %', pg_temp.keys(res -> 'rows' -> 0), pg_temp.keys(sib -> 'rows' -> 0);
  end if;
  if (res -> 'rows' -> 1 ->> 'original_text') <> 'تحكيم تحكيم ملغى' or (res -> 'rows' -> 1 ->> 'status') <> 'repealed' then
    raise exception 'T1 FAIL: the repealed row %', res -> 'rows' -> 1;
  end if;
  if pg_temp.ids(library.search_law_articles_relevance('''تحكيم''', 0, 50, p_status => 'repealed')) <> 'rel-b__art-3'
     or pg_temp.ids(library.search_law_articles_relevance('''تحكيم''', 0, 50, p_section_code => '05')) <> 'rel-a__art-1,rel-a__art-2'
     or pg_temp.ids(library.search_law_articles_relevance('''تحكيم''', 0, 50, p_law_type => 'لائحة تنفيذية')) <> 'rel-b__art-3,rel-b__art-1,rel-b__art-2'
     or pg_temp.ids(library.search_law_articles_relevance('''تحكيم''', 0, 50, p_section_code => '99')) <> '' then
    raise exception 'T1 FAIL: a filter';
  end if;
  -- an OR query, as parseSearchQuery writes one; an empty window past the end keeps the count
  res := library.search_law_articles_relevance('''المنازعات'' | ''الطرفين''', 0, 50);
  if pg_temp.ids(res) <> 'rel-b__art-1,rel-b__art-2,rel-a__art-1' then
    raise exception 'T1 FAIL or-query: %', pg_temp.ids(res);
  end if;
  res := library.search_law_articles_relevance('''تحكيم''', 50, 50);
  if jsonb_array_length(res -> 'rows') <> 0 or (res ->> 'count')::int <> 5 then
    raise exception 'T1 FAIL past the end: %', res;
  end if;
  if (library.search_law_articles_relevance('''تحكيم''', 0, 5000) -> 'rows') is null
     or jsonb_array_length(library.search_law_articles_relevance('''شائعة''', 0, 5000) -> 'rows') <> 1001 then
    raise exception 'T1 FAIL: the window is not capped at 1001 rows';
  end if;
  raise notice 'T1 PASS: «تحكيم» → 3× short, 2× repealed, the tie by id, 1× long; sibling row shape; status / section / type filters; OR query; past-end page; 1001-row cap';
end $$;

-- T2 every page of a ranked query continues the same order (offset paging)
do $$
declare
  full_ text;
  pages text := '';
  want text;
  off integer := 0;
  res jsonb;
begin
  res := library.search_law_articles_relevance('''متوسطة''', 0, 1001);
  full_ := pg_temp.ids(res);
  if (res ->> 'count')::int <> 120 or (res ->> 'ranked')::boolean is not true then
    raise exception 'T2 FAIL: count % ranked %', res ->> 'count', res ->> 'ranked';
  end if;
  select string_agg(id, ',' order by ts_rank_cd(fts, to_tsquery('simple', '''متوسطة'''), 1) desc, id) into want
    from library.articles where fts @@ to_tsquery('simple', '''متوسطة''');
  if full_ <> want then
    raise exception 'T2 FAIL: the window is not ts_rank_cd(fts, q, 1) desc, id';
  end if;
  if full_ = (select string_agg(id, ',' order by id) from library.articles where fts @@ to_tsquery('simple', '''متوسطة''')) then
    raise exception 'T2 FAIL: the ranked window is just the id order';
  end if;
  while off < 120 loop
    res := library.search_law_articles_relevance('''متوسطة''', off, 7);
    pages := pages || case when pages = '' then '' else ',' end || pg_temp.ids(res);
    if (res ->> 'ranked')::boolean is not true then raise exception 'T2 FAIL: page at % not ranked', off; end if;
    off := off + 7;
  end loop;
  if pages <> full_ then
    raise exception 'T2 FAIL: 18 pages of 7 do not concatenate to the window';
  end if;
  raise notice 'T2 PASS: «متوسطة» 120 matches — relevance order (not id order), 18 offset pages of 7 neither repeat nor skip';
end $$;

-- T3 above the 5,000-row cap: today's id order on every page, flagged
do $$
declare
  res jsonb;
  sib jsonb;
begin
  res := library.search_law_articles_relevance('''شائعة''', 0, 50);
  sib := library.search_law_articles_page('''شائعة''', 0, 50);
  if (res ->> 'count')::int <> 7500 or (res ->> 'ranked')::boolean is not false or pg_temp.ids(res) <> pg_temp.ids(sib) then
    raise exception 'T3 FAIL page 1: count % ranked %', res ->> 'count', res ->> 'ranked';
  end if;
  res := library.search_law_articles_relevance('''شائعة''', 950, 50);
  sib := library.search_law_articles_page('''شائعة''', 950, 50);
  if pg_temp.ids(res) <> pg_temp.ids(sib) or (res ->> 'ranked')::boolean is not false then
    raise exception 'T3 FAIL page 20';
  end if;
  res := library.search_law_articles_relevance('''نادرة''', 0, 50);
  if pg_temp.ids(res) <> 'rel-bulk__art-00011,rel-bulk__art-22222,rel-bulk__art-29999' or (res ->> 'ranked')::boolean is not true then
    raise exception 'T3 FAIL rare: %', res;
  end if;
  raise notice 'T3 PASS: «شائعة» 7,500 matches → ranked false, pages 1 and 20 = the sibling''s id windows; «نادرة» 3 rows ranked (ties by id)';
end $$;

-- T4 precedents, fiqh, orders: the same contract, their siblings' row shapes
do $$
declare
  res jsonb;
  sib jsonb;
begin
  -- precedents
  res := library.search_principles_relevance('''تعويض''', 0, 50);
  if pg_temp.ids(res) <> 'rel-p-1,rel-p-3,rel-p-4,rel-p-2' or (res ->> 'ranked')::boolean is not true or (res ->> 'count')::int <> 4 then
    raise exception 'T4 FAIL principles: %', pg_temp.ids(res);
  end if;
  sib := library.search_principles_page('''تعويض''', 0, 50);
  if pg_temp.keys(res -> 'rows' -> 0) <> pg_temp.keys(sib -> 'rows' -> 0)
     or pg_temp.keys(res -> 'rows' -> 0 -> 'judicial_collections') <> pg_temp.keys(sib -> 'rows' -> 0 -> 'judicial_collections')
     or (res -> 'rows' -> 0 -> 'judicial_collections' ->> 'court') <> 'المحكمة التجارية' then
    raise exception 'T4 FAIL principles shape: %', res -> 'rows' -> 0;
  end if;
  if pg_temp.ids(library.search_principles_relevance('''تعويض''', 0, 50, p_track => 'administrative')) <> 'rel-p-2'
     or pg_temp.ids(library.search_principles_relevance('''تعويض''', 0, 50, p_year => 1444)) <> 'rel-p-4'
     or pg_temp.ids(library.search_principles_relevance('''تعويض''', 0, 50, p_source => 'src-1', p_court => 'المحكمة التجارية')) <> 'rel-p-1,rel-p-3,rel-p-4' then
    raise exception 'T4 FAIL principles filters';
  end if;
  res := library.search_principles_relevance('''شائعة''', 0, 50);
  if (res ->> 'ranked')::boolean is not false or (res ->> 'count')::int <> 5500
     or pg_temp.ids(res) <> pg_temp.ids(library.search_principles_page('''شائعة''', 0, 50)) then
    raise exception 'T4 FAIL principles over the cap';
  end if;

  -- fiqh
  res := library.search_feqh_relevance('''خيار''', 0, 50);
  if pg_temp.ids(res) <> 'rel-f-1,rel-f-3,rel-f-4,rel-f-2' or (res ->> 'ranked')::boolean is not true then
    raise exception 'T4 FAIL fiqh: %', pg_temp.ids(res);
  end if;
  sib := library.search_feqh_page('''خيار''', 0, 50);
  if pg_temp.keys(res -> 'rows' -> 0) <> pg_temp.keys(sib -> 'rows' -> 0)
     or (res -> 'rows' -> 0 -> 'feqh_sections' -> 'feqh_chapters' -> 'feqh_books' ->> 'author') <> 'ابن قدامة' then
    raise exception 'T4 FAIL fiqh shape: %', res -> 'rows' -> 0;
  end if;
  res := library.search_feqh_relevance('''شائعة''', 0, 50);
  if (res ->> 'ranked')::boolean is not false or pg_temp.ids(res) <> pg_temp.ids(library.search_feqh_page('''شائعة''', 0, 50)) then
    raise exception 'T4 FAIL fiqh over the cap';
  end if;

  -- orders (no sibling: the route's former inline select, id order above the cap)
  res := library.search_decrees_relevance('''ترخيص''', 0, 50);
  if pg_temp.ids(res) <> '00000000-0000-0000-0000-0000000d0001,00000000-0000-0000-0000-0000000d0003,00000000-0000-0000-0000-0000000d0004,00000000-0000-0000-0000-0000000d0002'
     or (res ->> 'ranked')::boolean is not true or (res ->> 'count')::int <> 4 then
    raise exception 'T4 FAIL decrees: %', pg_temp.ids(res);
  end if;
  if pg_temp.keys(res -> 'rows' -> 0) <> array['category', 'date', 'hashtags', 'id', 'issuer', 'ref', 'summary_brief', 'title', 'type'] then
    raise exception 'T4 FAIL decrees shape: %', pg_temp.keys(res -> 'rows' -> 0);
  end if;
  if pg_temp.ids(library.search_decrees_relevance('''ترخيص''', 0, 50, p_type => 'royal'))
       <> '00000000-0000-0000-0000-0000000d0003,00000000-0000-0000-0000-0000000d0004'
     or pg_temp.ids(library.search_decrees_relevance('''ترخيص''', 0, 50, p_issuer => 'مجلس الوزراء')) <> '00000000-0000-0000-0000-0000000d0002'
     or pg_temp.ids(library.search_decrees_relevance('''ترخيص''', 0, 50, p_categories => array['08', '8']))
       <> '00000000-0000-0000-0000-0000000d0001,00000000-0000-0000-0000-0000000d0002' then
    raise exception 'T4 FAIL decrees filters';
  end if;
  res := library.search_decrees_relevance('''شائعة''', 0, 50);
  if (res ->> 'ranked')::boolean is not false
     or pg_temp.ids(res) <> (select string_agg(id::text, ',' order by id) from (
          select id from library.decrees_circulars where fts @@ to_tsquery('simple', '''شائعة''') order by id limit 50) x) then
    raise exception 'T4 FAIL decrees over the cap';
  end if;
  raise notice 'T4 PASS: principles / fiqh / decrees — relevance order with ties by id, the siblings'' row shapes, every filter, id order over the cap';
end $$;
reset role;

-- T5 the API roles cannot call them; service_role can
do $$
declare
  fn text;
  r text;
begin
  foreach fn in array array[
    'library.search_law_articles_relevance(text, integer, integer, text, text, text)',
    'library.search_principles_relevance(text, integer, integer, text, text, integer, text)',
    'library.search_feqh_relevance(text, integer, integer)',
    'library.search_decrees_relevance(text, integer, integer, text, text, text[])'] loop
    foreach r in array array['anon', 'authenticated', 'app_user'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'T5 FAIL: % can EXECUTE %', r, fn;
      end if;
    end loop;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'T5 FAIL: service_role cannot EXECUTE %', fn;
    end if;
  end loop;
end $$;
set role anon;
do $$
begin
  perform library.search_decrees_relevance('''ترخيص''', 0, 50);
  raise exception 'T5 FAIL: anon called library.search_decrees_relevance';
exception when insufficient_privilege then
  raise notice 'T5 PASS: no API role can EXECUTE the four; anon gets 42501';
end $$;
reset role;

-- T6 INVOKER, search_path '', statement_timeout 4s in proconfig (what PostgREST hoists)
do $$
declare
  fn text;
  cfg text[];
  definer boolean;
begin
  foreach fn in array array[
    'library.search_law_articles_relevance(text, integer, integer, text, text, text)',
    'library.search_principles_relevance(text, integer, integer, text, text, integer, text)',
    'library.search_feqh_relevance(text, integer, integer)',
    'library.search_decrees_relevance(text, integer, integer, text, text, text[])'] loop
    select proconfig, prosecdef into cfg, definer from pg_proc where oid = fn::regprocedure;
    if definer or not ('statement_timeout=4s' = any (cfg)) or not ('search_path=""' = any (cfg)) then
      raise exception 'T6 FAIL: % prosecdef=% proconfig=%', fn, definer, cfg;
    end if;
  end loop;
  raise notice 'T6 PASS: all four SECURITY INVOKER, proconfig {search_path="",statement_timeout=4s}';
end $$;

-- T7 the plan, for a rare and a common word in every section: the matches
-- come from the GIN index; the primary key is only probed for the rows that
-- are ranked (≤ 5,000) and the page — never walked. Two proofs:
--   (a) EXPLAIN ANALYZE of the function's own body (pg_proc.prosrc) prepared
--       as a generic plan — how a SQL function's statements are planned;
--   (b) the index counters of the real call, in the same transaction
--       (pg_stat_get_xact_numscans / _tuples_returned on the two indexes).
do $$
declare
  spec record;
  word text;
  body text;
  line text;
  plan text;
  gin_before bigint;
  gin_after bigint;
  pk_before bigint;
  pk_after bigint;
  n integer;
  args text;
begin
  for spec in
    select * from (values
      ('search_law_articles_relevance', 'articles',          'text, integer, integer, text, text, text',
         array['p_section_code', 'p_law_type', 'p_tsquery', 'p_offset', 'p_fetch', 'p_status'],
         array['$5', '$6', '$1', '$2', '$3', '$4'], ', null, null, null', 'rel-bulk'),
      ('search_principles_relevance',   'principles',        'text, integer, integer, text, text, integer, text',
         array['p_tsquery', 'p_offset', 'p_fetch', 'p_track', 'p_source', 'p_year', 'p_court'],
         array['$1', '$2', '$3', '$4', '$5', '$6', '$7'], ', null, null, null, null', 'x'),
      ('search_feqh_relevance',         'feqh_blocks',       'text, integer, integer',
         array['p_tsquery', 'p_offset', 'p_fetch'],
         array['$1', '$2', '$3'], '', 'x'),
      ('search_decrees_relevance',      'decrees_circulars', 'text, integer, integer, text, text, text[]',
         array['p_categories', 'p_tsquery', 'p_offset', 'p_fetch', 'p_issuer', 'p_type'],
         array['$6', '$1', '$2', '$3', '$4', '$5'], ', null, null, null', 'x')
    ) v(fn, tbl, sig, names, params, tail, unused)
  loop
    select p.prosrc into body from pg_proc p
     where p.oid = format('library.%s(%s)', spec.fn, spec.sig)::regprocedure;
    for i in 1 .. array_length(spec.names, 1) loop
      body := replace(body, spec.names[i], spec.params[i]);
    end loop;
    execute format('prepare t7 (%s) as %s', spec.sig, body);
    set local plan_cache_mode = force_generic_plan;

    foreach word in array array['''نادرة''', '''شائعة'''] loop
      args := format('%L, 0, 50%s', word, spec.tail);
      plan := '';
      for line in execute format('explain (analyze, costs off, timing off, summary off) execute t7(%s)', args) loop
        plan := plan || line || E'\n';
      end loop;
      if plan !~ format('Bitmap Index Scan on idx_%s_fts', spec.tbl) then
        raise exception 'T7 FAIL (a) %: % does not use the GIN index:%', spec.fn, word, E'\n' || plan;
      end if;
      if plan ~ format('Seq Scan on %s ', spec.tbl) then
        raise exception 'T7 FAIL (a) %: % scans the table:%', spec.fn, word, E'\n' || plan;
      end if;
      if plan ~ 'Rows Removed by Filter: [0-9]{4,}' then
        raise exception 'T7 FAIL (a) %: % filters thousands of rows (a primary-key walk):%', spec.fn, word, E'\n' || plan;
      end if;
      if spec.fn = 'search_law_articles_relevance' then
        raise notice 'T7 plan of % for %:%', spec.fn, word, E'\n' || plan;
      end if;

      -- (b) the real call's counters
      gin_before := pg_stat_get_xact_numscans(format('library.idx_%s_fts', spec.tbl)::regclass);
      pk_before  := pg_stat_get_xact_tuples_returned(format('library.%s_pkey', spec.tbl)::regclass);
      execute format('select (library.%s(%s) ->> ''count'')::int', spec.fn, args) into n;
      gin_after := pg_stat_get_xact_numscans(format('library.idx_%s_fts', spec.tbl)::regclass);
      pk_after  := pg_stat_get_xact_tuples_returned(format('library.%s_pkey', spec.tbl)::regclass);
      if gin_after <= gin_before then
        raise exception 'T7 FAIL (b) %: % did not scan idx_%_fts', spec.fn, word, spec.tbl;
      end if;
      if pk_after - pk_before > (case when n <= 5000 then n else 0 end) + 50 then
        raise exception 'T7 FAIL (b) %: % read % primary-key entries for % matches', spec.fn, word, pk_after - pk_before, n;
      end if;
      raise notice 'T7 % %: % matches, GIN scans +%, primary-key entries read %',
        spec.fn, word, n, gin_after - gin_before, pk_after - pk_before;
    end loop;
    deallocate t7;
  end loop;
  raise notice 'T7 PASS: rare and common words, all four sections — GIN bitmap scan, no table scan, no primary-key walk';
end $$;

select 'library_search_relevance: ALL PASS' as result;
