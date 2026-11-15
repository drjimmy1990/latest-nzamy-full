-- library_graph_depth.test.sql — 20261115_10: law / chapter nodes, PART_OF and
-- NEXT_ARTICLE edges, the two-hop retrieve, and the explorer ignoring outlines.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     supabase/tests/rls/library_graph_depth.test.sql

grant usage on schema extensions to service_role;

insert into library.laws (slug, title, type, section_code)
values ('labor-law', 'نظام العمل', 'نظام', '01');

set role service_role;

-- D1: the new types are accepted, an unknown one still is not
do $$
declare
  v_run jsonb;
  v_t   timestamptz;
begin
  v_run := public.graph_rag_sync_control('start_run', '{"trigger_source":"watchdog_test"}'::jsonb);
  v_t := (v_run->>'started_at')::timestamptz;

  perform public.graph_rag_upsert_nodes(jsonb_build_array(
    jsonb_build_object('node_key', 'law:labor-law', 'node_type', 'law', 'source_id', 'labor-law', 'law_slug', 'labor-law',
      'is_embeddable', false, 'title', 'نظام العمل', 'url', '/laws/labor-law',
      'display_text', 'نظام العمل' || chr(10) || 'عدد المواد: 4', 'contextual_header', 'المستند: نظام العمل', 'content_sha256', repeat('1', 64)),
    jsonb_build_object('node_key', 'chapter:ch-5', 'node_type', 'chapter', 'source_id', 'ch-5', 'law_slug', 'labor-law',
      'is_embeddable', false, 'title', 'نظام العمل — الباب الخامس', 'url', '/laws/labor-law#a',
      'display_text', 'الباب الخامس', 'contextual_header', 'المستند: نظام العمل', 'content_sha256', repeat('2', 64)),
    -- A: the only text that matches the query
    jsonb_build_object('node_key', 'article:a', 'node_type', 'article', 'source_id', 'a', 'law_slug', 'labor-law',
      'article_number', 80, 'is_embeddable', true, 'title', 'نظام العمل — المادة 80', 'url', '/laws/labor-law#a',
      'display_text', 'لا يجوز لصاحب العمل فسخ العقد دون مكافأة', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('3', 64)),
    -- A2: the article after A (arrives by NEXT_ARTICLE)
    jsonb_build_object('node_key', 'article:a2', 'node_type', 'article', 'source_id', 'a2', 'law_slug', 'labor-law',
      'article_number', 81, 'is_embeddable', true, 'title', 'نظام العمل — المادة 81', 'url', '/laws/labor-law#a2',
      'display_text', 'يحق للعامل أن يترك العمل', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('4', 64)),
    -- B: A is an exception to B (hop 1)
    jsonb_build_object('node_key', 'article:b', 'node_type', 'article', 'source_id', 'b', 'law_slug', 'labor-law',
      'article_number', 77, 'is_embeddable', true, 'title', 'نظام العمل — المادة 77', 'url', '/laws/labor-law#b',
      'display_text', 'التعويض عن الإنهاء لسبب غير مشروع', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('5', 64)),
    -- P: a principle interpreting B (hop 2, always passes)
    jsonb_build_object('node_key', 'principle:p', 'node_type', 'principle', 'source_id', 'p', 'collection_id', 'col',
      'is_embeddable', true, 'title', 'مبدأ قضائي 1', 'url', '/judicial/col#p',
      'display_text', 'يقدر التعويض بأجر خمسة عشر يوما', 'contextual_header', 'مبادئ', 'content_sha256', repeat('6', 64)),
    -- C: B cites C (hop 2 by a citation: not taken without vectors)
    jsonb_build_object('node_key', 'article:c', 'node_type', 'article', 'source_id', 'c', 'law_slug', 'labor-law',
      'article_number', 2, 'is_embeddable', true, 'title', 'نظام العمل — المادة 2', 'url', '/laws/labor-law#c',
      'display_text', 'التعريفات', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('7', 64)),
    -- Z: shares A's chapter and nothing else
    jsonb_build_object('node_key', 'article:z', 'node_type', 'article', 'source_id', 'z', 'law_slug', 'labor-law',
      'article_number', 90, 'is_embeddable', true, 'title', 'نظام العمل — المادة 90', 'url', '/laws/labor-law#z',
      'display_text', 'أحكام ختامية', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('8', 64))
  ), v_t);

  perform public.graph_rag_upsert_edges(jsonb_build_array(
    jsonb_build_object('source_key', 'article:a', 'target_key', 'article:b', 'edge_type', 'EXEMPTS_FROM', 'weight', 1.25),
    jsonb_build_object('source_key', 'principle:p', 'target_key', 'article:b', 'edge_type', 'INTERPRETS_ARTICLE', 'weight', 1.15),
    jsonb_build_object('source_key', 'article:b', 'target_key', 'article:c', 'edge_type', 'CITES_ARTICLE', 'weight', 0.9),
    jsonb_build_object('source_key', 'article:a', 'target_key', 'article:a2', 'edge_type', 'NEXT_ARTICLE', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:a', 'target_key', 'chapter:ch-5', 'edge_type', 'PART_OF', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:z', 'target_key', 'chapter:ch-5', 'edge_type', 'PART_OF', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:a2', 'target_key', 'law:labor-law', 'edge_type', 'PART_OF', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:b', 'target_key', 'law:labor-law', 'edge_type', 'PART_OF', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:c', 'target_key', 'law:labor-law', 'edge_type', 'PART_OF', 'weight', 1.0),
    jsonb_build_object('source_key', 'chapter:ch-5', 'target_key', 'law:labor-law', 'edge_type', 'PART_OF', 'weight', 1.0)
  ), v_t);

  begin
    insert into library_graph.edges (source_key, target_key, edge_type) values ('article:a', 'article:c', 'BOGUS');
    raise exception 'D1: an unknown edge_type was accepted';
  exception when check_violation then
    null;
  end;
  begin
    insert into library_graph.nodes (node_key, node_type, source_id, title, url, display_text, contextual_header, content_sha256)
    values ('book:x', 'book', 'x', 't', '', 'd', 'h', repeat('9', 64));
    raise exception 'D1: an unknown node_type was accepted';
  exception when check_violation then
    null;
  end;

  perform public.graph_rag_sync_control('finish_run', jsonb_build_object(
    'run_id', v_run->'run_id', 'started_at', v_run->>'started_at', 'status', 'succeeded'));
  raise notice 'D1 ok — law/chapter nodes and PART_OF/NEXT_ARTICLE edges stored; unknown types rejected';
end $$;

-- D2: two-hop retrieve without vectors
do $$
declare
  v_res  jsonb;
  v_all  jsonb;
  v_item jsonb;
begin
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, null, 8, 4, 0, 0, true);
  if (v_res->>'ready')::boolean is not true then
    raise exception 'D2: graph not ready after a finished pass: %', v_res;
  end if;
  v_all := (v_res->'articles') || (v_res->'principles');

  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:a';
  if v_item is null or (v_item->>'hop')::int <> 0 then
    raise exception 'D2: A must be a direct hit (hop 0): %', v_all;
  end if;
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:b';
  if v_item is null or (v_item->>'hop')::int <> 1 or v_item->>'via_edge_type' <> 'EXEMPTS_FROM' then
    raise exception 'D2: B must arrive at hop 1 by EXEMPTS_FROM: %', v_all;
  end if;
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:a2';
  if v_item is null or (v_item->>'hop')::int <> 1 or v_item->>'via_edge_type' <> 'NEXT_ARTICLE' then
    raise exception 'D2: A2 must arrive at hop 1 as the next article: %', v_all;
  end if;
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'principle:p';
  if v_item is null or (v_item->>'hop')::int <> 2 or v_item->>'via_edge_type' <> 'INTERPRETS_ARTICLE'
     or v_item->>'via_from_title' <> 'نظام العمل — المادة 77' then
    raise exception 'D2: P must arrive at hop 2 by INTERPRETS_ARTICLE from B: %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:c') then
    raise exception 'D2: a second citation hop with no vectors must not be taken: %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:z') then
    raise exception 'D2: PART_OF must never be walked (Z only shares A''s chapter): %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'kind' in ('law', 'chapter', 'concept')) then
    raise exception 'D2: a law / chapter / concept node was returned: %', v_all;
  end if;
  if (select pg_catalog.max((i->>'score')::numeric) from jsonb_array_elements(v_all) i where (i->>'hop')::int = 2)
     >= (select pg_catalog.min((i->>'score')::numeric) from jsonb_array_elements(v_all) i where (i->>'hop')::int = 0) then
    raise exception 'D2: a hop-2 result outranks a direct hit: %', v_all;
  end if;

  -- The hop switch still turns every hop off.
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, null, 8, 4, 0, 0, false);
  if exists (select 1 from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i where (i->>'hop')::int > 0) then
    raise exception 'D2: p_enable_graph_hop = false still walked: %', v_res;
  end if;
  raise notice 'D2 ok — hop 0 / NEXT_ARTICLE / hop 1 / hop 2 by interpretation; no citation hop 2 without vectors; outlines never walked or returned';
end $$;

-- D3: the explorer — no law node in top_hubs; hop 2 does not fan out through a chapter
do $$
declare
  v_ov   jsonb;
  v_hood jsonb;
begin
  v_ov := public.graph_rag_explore_overview();
  if (v_ov->'node_counts'->>'law')::int <> 1 or (v_ov->'node_counts'->>'chapter')::int <> 1 then
    raise exception 'D3: overview does not count law / chapter nodes: %', v_ov->'node_counts';
  end if;
  if exists (select 1 from jsonb_array_elements(v_ov->'top_hubs') h where h->>'node_type' in ('law', 'chapter')) then
    raise exception 'D3: a law / chapter node is a top hub by its outline edges: %', v_ov->'top_hubs';
  end if;

  v_hood := public.graph_rag_explore_neighborhood('article:a', 2, null, 60);
  if not exists (select 1 from jsonb_array_elements(v_hood->'nodes') n where n->>'node_key' = 'chapter:ch-5' and (n->>'hop')::int = 1) then
    raise exception 'D3: A''s chapter must be a direct neighbour: %', v_hood->'nodes';
  end if;
  if exists (select 1 from jsonb_array_elements(v_hood->'nodes') n where n->>'node_key' in ('article:z', 'law:labor-law')) then
    raise exception 'D3: hop 2 fanned out through the chapter: %', v_hood->'nodes';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_hood->'nodes') n where n->>'node_key' = 'principle:p' and (n->>'hop')::int = 2) then
    raise exception 'D3: the legal hop 2 (B → P) is missing: %', v_hood->'nodes';
  end if;
  raise notice 'D3 ok — outlines are not hubs; hop 2 stays on legal links';
end $$;

reset role;
