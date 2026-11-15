-- library_graph_title_search_index.test.sql — 20261120_10: the explorer's
-- title "contains" search uses the trigram index instead of reading every node,
-- and still returns the same rows.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations; B=$(mktemp -d)/verify_title_index_block.sql
--   sed -n '/^-- >>> verify:library_graph_title_search_index/,/^-- <<< verify:library_graph_title_search_index/p' $M/_verify.sql > "$B"
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql \
--     $M/20261120_10_library_graph_title_search_index.sql $M/20261120_10_library_graph_title_search_index.sql \
--     "$B" supabase/tests/rls/library_graph_title_search_index.test.sql
-- NEGATIVE CONTROL: the same chain without 20261120_10 → T2 fails (seq scan).

-- Fixture: 200k article nodes with Arabic titles, one rare title, one with tashkeel.
insert into library_graph.nodes (node_key, node_type, source_id, law_slug, title, display_text, content_sha256)
select 'law:t' || (g % 500) || ':' || g, 'article', 'src' || g, 't' || (g % 500),
       'المادة ' || g || ' من نظام رقم ' || (g % 500),
       'نص المادة ' || g,
       pg_catalog.md5(g::text) || pg_catalog.md5(g::text)
  from pg_catalog.generate_series(1, 200000) g;

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, title, display_text, content_sha256)
values
  ('law:labor:77', 'article', 'x1', 'labor', 'الفصل التعسفي والتعويض عنه', 'يستحق العامل تعويضا', pg_catalog.repeat('a', 64)),
  ('law:labor:78', 'article', 'x2', 'labor', 'الفَصْلُ التَّعَسُّفِيُّ في العقد المؤقت', 'نص', pg_catalog.repeat('b', 64));

analyze library_graph.nodes;

-- T1: the index exists, is valid, and is on the folded title
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_index i
     where i.indexrelid = to_regclass('library_graph.idx_lg_nodes_title_fold_trgm')
       and i.indisvalid
       and pg_catalog.pg_get_indexdef(i.indexrelid) like '%fold_tashkeel(title)%gin_trgm_ops%'
  ) then
    raise exception 'T1: idx_lg_nodes_title_fold_trgm missing or wrong';
  end if;
end $$;

-- T2: the search's own filter (rare phrase) is answered from the index
do $$
declare
  v_plan text := '';
  r      record;
begin
  for r in execute
    'explain select n.node_key from library_graph.nodes n
      where library_graph.fold_tashkeel(n.title) ilike ''%الفصل التعسفي%'' limit 300'
  loop
    v_plan := v_plan || r."QUERY PLAN" || E'\n';
  end loop;
  if v_plan not like '%idx_lg_nodes_title_fold_trgm%' then
    raise exception 'T2: the rare-phrase title filter does not use the trigram index:%', E'\n' || v_plan;
  end if;
end $$;

-- T3: the search function finds the rare title, including the one written with tashkeel
do $$
declare
  v_res  jsonb := public.graph_rag_explore_search('الفصل التعسفي');
  v_keys text[];
begin
  select pg_catalog.array_agg(e->>'node_key' order by e->>'node_key') into v_keys
    from pg_catalog.jsonb_array_elements(v_res) e;
  if v_keys is distinct from array['law:labor:77', 'law:labor:78'] then
    raise exception 'T3: expected both labor titles, got %', v_keys;
  end if;
end $$;

-- T4: a common phrase still answers (capped by the function's limit)
do $$
declare
  v_n integer := pg_catalog.jsonb_array_length(public.graph_rag_explore_search('من نظام رقم 7', null, 24));
begin
  if v_n <> 24 then
    raise exception 'T4: expected 24 results for a common phrase, got %', v_n;
  end if;
end $$;

select 'library_graph_title_search_index: all tests passed' as result;
