-- library_graph_links.test.sql — 20261116_10: term nodes, SUBJECT_TO / PENALIZES /
-- DEFINES_TERM edges, the vector-built SIMILAR_TO / REPLACED_BY edges, and the
-- retrieve legs that walk them.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql \
--     supabase/tests/rls/library_graph_links.test.sql

grant usage on schema extensions to service_role;

insert into library.laws (slug, title, type, section_code)
values ('labor-law', 'نظام العمل', 'نظام', '01');

-- Setup runs as the migration owner: it writes vectors straight into the table.
do $$
declare
  v_run jsonb;
  v_t   timestamptz;
  -- a 768-d vector from its first three components
  z765  text := array_to_string(array_fill(0::int, array[765]), ',');
begin
  v_run := public.graph_rag_sync_control('start_run', '{"trigger_source":"watchdog_test"}'::jsonb);
  v_t := (v_run->>'started_at')::timestamptz;

  perform public.graph_rag_upsert_nodes(jsonb_build_array(
    jsonb_build_object('node_key', 'law:labor-law', 'node_type', 'law', 'source_id', 'labor-law', 'law_slug', 'labor-law',
      'is_embeddable', false, 'title', 'نظام العمل', 'display_text', 'نظام العمل', 'content_sha256', repeat('1', 64)),
    jsonb_build_object('node_key', 'law:old-law', 'node_type', 'law', 'source_id', 'old-law', 'law_slug', 'old-law',
      'doc_status', 'repealed', 'is_embeddable', false, 'title', 'النظام الملغى', 'display_text', 'النظام الملغى', 'content_sha256', repeat('2', 64)),
    jsonb_build_object('node_key', 'law:new-law', 'node_type', 'law', 'source_id', 'new-law', 'law_slug', 'new-law',
      'is_embeddable', false, 'title', 'النظام البديل', 'display_text', 'النظام البديل', 'content_sha256', repeat('3', 64)),
    -- A: the only text the query words match
    jsonb_build_object('node_key', 'article:a', 'node_type', 'article', 'source_id', 'a', 'law_slug', 'labor-law',
      'article_number', 80, 'title', 'نظام العمل — المادة 80', 'display_text', 'لا يجوز لصاحب العمل فسخ العقد دون مكافأة',
      'content_sha256', repeat('4', 64)),
    -- A2: same law, near-identical meaning (never a SIMILAR_TO: same law)
    jsonb_build_object('node_key', 'article:a2', 'node_type', 'article', 'source_id', 'a2', 'law_slug', 'labor-law',
      'article_number', 81, 'title', 'نظام العمل — المادة 81', 'display_text', 'يحق للعامل ترك العمل',
      'content_sha256', repeat('5', 64)),
    -- S: A is "subject to" S
    jsonb_build_object('node_key', 'article:s', 'node_type', 'article', 'source_id', 's', 'law_slug', 'labor-law',
      'article_number', 74, 'title', 'نظام العمل — المادة 74', 'display_text', 'ينتهي عقد العمل في الأحوال الآتية',
      'content_sha256', repeat('6', 64)),
    -- PEN: the law's penalty article
    jsonb_build_object('node_key', 'article:pen', 'node_type', 'article', 'source_id', 'pen', 'law_slug', 'labor-law',
      'article_number', 230, 'title', 'نظام العمل — المادة 230', 'display_text', 'يعاقب كل من يخالف أحكام هذا النظام بغرامة',
      'content_sha256', repeat('7', 64)),
    -- DEF: the labour law's definitions article; CIVDEF: the civil law's
    jsonb_build_object('node_key', 'article:def', 'node_type', 'article', 'source_id', 'def', 'law_slug', 'labor-law',
      'article_number', 1, 'title', 'نظام العمل — المادة 1', 'display_text', 'التعريفات',
      'content_sha256', repeat('8', 64)),
    jsonb_build_object('node_key', 'article:civdef', 'node_type', 'article', 'source_id', 'civdef', 'law_slug', 'civil-law',
      'article_number', 1, 'title', 'نظام المعاملات المدنية — المادة 1', 'display_text', 'التعريفات',
      'content_sha256', repeat('9', 64)),
    jsonb_build_object('node_key', 'term:العامل', 'node_type', 'term', 'source_id', 'العامل',
      'title', 'العامل', 'display_text', 'مصطلح نظامي معرَّف | العامل: كل شخص طبيعي يعمل لمصلحة صاحب العمل',
      'content_sha256', repeat('a', 64)),
    -- CIV: another law, close in meaning to A
    jsonb_build_object('node_key', 'article:civ', 'node_type', 'article', 'source_id', 'civ', 'law_slug', 'civil-law',
      'article_number', 120, 'title', 'نظام المعاملات المدنية — المادة 120', 'display_text', 'إنهاء العقود الملزمة للجانبين',
      'content_sha256', repeat('b', 64)),
    -- COPY: another law, a near-copy of A (>= 0.985: never linked)
    jsonb_build_object('node_key', 'article:copy', 'node_type', 'article', 'source_id', 'copy', 'law_slug', 'copy-law',
      'article_number', 5, 'title', 'لائحة — المادة 5', 'display_text', 'نص منقول',
      'content_sha256', repeat('c', 64)),
    -- P1 / P2: two principles close in meaning, in two collections; P3 closer
    -- still to P1 but in P1's own collection (never linked: a shared header
    -- alone makes one collection's principles look alike)
    jsonb_build_object('node_key', 'principle:p1', 'node_type', 'principle', 'source_id', 'p1', 'collection_id', 'col',
      'title', 'مبدأ 1', 'display_text', 'مبدأ أول', 'content_sha256', repeat('d', 64)),
    jsonb_build_object('node_key', 'principle:p2', 'node_type', 'principle', 'source_id', 'p2', 'collection_id', 'col2',
      'title', 'مبدأ 2', 'display_text', 'مبدأ ثان', 'content_sha256', repeat('e', 64)),
    jsonb_build_object('node_key', 'principle:p3', 'node_type', 'principle', 'source_id', 'p3', 'collection_id', 'col',
      'title', 'مبدأ 3', 'display_text', 'مبدأ ثالث', 'content_sha256', repeat('0', 63) || '3'),
    -- OLD: a repealed article; NEW1 in the law that replaced its law; OTHER
    -- elsewhere, closer in meaning (the successor law still wins)
    jsonb_build_object('node_key', 'article:old', 'node_type', 'article', 'source_id', 'old', 'law_slug', 'old-law',
      'article_number', 9, 'doc_status', 'repealed', 'title', 'النظام الملغى — المادة 9', 'display_text', 'حكم قديم ملغى',
      'content_sha256', repeat('f', 64)),
    jsonb_build_object('node_key', 'article:new1', 'node_type', 'article', 'source_id', 'new1', 'law_slug', 'new-law',
      'article_number', 9, 'title', 'النظام البديل — المادة 9', 'display_text', 'الحكم الساري',
      'content_sha256', repeat('0', 63) || '1'),
    jsonb_build_object('node_key', 'article:other', 'node_type', 'article', 'source_id', 'other', 'law_slug', 'x-law',
      'article_number', 3, 'title', 'نظام آخر — المادة 3', 'display_text', 'نص آخر',
      'content_sha256', repeat('0', 63) || '2')
  ), v_t);

  perform public.graph_rag_upsert_edges(jsonb_build_array(
    jsonb_build_object('source_key', 'article:a', 'target_key', 'article:s', 'edge_type', 'SUBJECT_TO', 'weight', 1.1),
    jsonb_build_object('source_key', 'article:pen', 'target_key', 'law:labor-law', 'edge_type', 'PENALIZES', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:def', 'target_key', 'term:العامل', 'edge_type', 'DEFINES_TERM', 'weight', 1.0),
    jsonb_build_object('source_key', 'article:civdef', 'target_key', 'term:العامل', 'edge_type', 'DEFINES_TERM', 'weight', 1.0),
    jsonb_build_object('source_key', 'law:new-law', 'target_key', 'law:old-law', 'edge_type', 'SUPERSEDES_LAW', 'weight', 1.0)
  ), v_t);

  insert into library_graph.node_embeddings (node_key, model_id, node_type, is_active_corpus, embedding)
  select k, 'gemini-embedding-2-768', t, act, ('[' || v || ',' || z765 || ']')::extensions.halfvec
    from (values
      ('article:a',     'article',   true,  '1,0,0'),
      ('article:a2',    'article',   true,  '0.95,0.3122,0'),
      ('article:civ',   'article',   true,  '0.9,0.4359,0'),
      ('article:copy',  'article',   true,  '0.9995,0.0316,0'),
      ('principle:p1',  'principle', true,  '0,1,0'),
      ('principle:p2',  'principle', true,  '0,0.9,0.4359'),
      ('principle:p3',  'principle', true,  '0,0.95,-0.3122'),
      ('article:old',   'article',   false, '0,0,1'),
      ('article:new1',  'article',   true,  '0,0.5,0.866'),
      ('article:other', 'article',   true,  '0.3,0,0.954'),
      ('term:العامل',   'term',      true,  '0,-1,0')
    ) as x(k, t, act, v);

  begin
    insert into library_graph.edges (source_key, target_key, edge_type, origin) values ('article:a', 'article:s', 'SIMILAR_TO', 'bogus');
    raise exception 'L1: an unknown origin was accepted';
  exception when check_violation then
    null;
  end;

  perform public.graph_rag_sync_control('finish_run', jsonb_build_object(
    'run_id', v_run->'run_id', 'started_at', v_run->>'started_at', 'status', 'succeeded'));
  raise notice 'L1 ok — term node, SUBJECT_TO / PENALIZES / DEFINES_TERM stored; unknown origin rejected';
end $$;

set role service_role;

-- L2: the vector links
do $$
declare
  v_res jsonb;
  v_e   record;
begin
  -- Four embeddable articles have no vector yet (4 of 14, far above 0.5
  -- percent): nothing is built, so no link is stamped against half the vectors.
  v_res := public.graph_rag_build_similarity(null, 500, '{}'::jsonb);
  if v_res->>'skipped' is distinct from 'vectors_incomplete' or (v_res->>'processed')::int <> 0
     or (v_res->>'missing')::int <> 4 then
    raise exception 'L2: links were built while vectors were missing: %', v_res;
  end if;
  if exists (select 1 from library_graph.similarity_state) then
    raise exception 'L2: a skipped call stamped similarity state';
  end if;
  -- Those four are outside this test: mark them not embeddable for L2 only.
  update library_graph.nodes n set is_embeddable = false
   where n.node_type in ('article', 'principle') and n.is_embeddable
     and not exists (select 1 from library_graph.node_embeddings e where e.node_key = n.node_key);

  v_res := public.graph_rag_build_similarity(null, 500, '{}'::jsonb);
  if (v_res->>'processed')::int <> 10 then
    raise exception 'L2: expected 10 article/principle nodes processed: %', v_res;
  end if;

  if (select count(*) from library_graph.edges
       where edge_type = 'SIMILAR_TO' and origin = 'auto_similarity'
         and ((source_key = 'article:a' and target_key = 'article:civ')
           or (source_key = 'article:civ' and target_key = 'article:a'))) <> 1 then
    raise exception 'L2: A ↔ CIV (another law, 0.9) must be linked exactly once: %',
      (select jsonb_agg(to_jsonb(e)) from library_graph.edges e where e.edge_type = 'SIMILAR_TO');
  end if;
  if exists (select 1 from library_graph.edges
              where edge_type = 'SIMILAR_TO'
                and ((source_key = 'article:a' and target_key = 'article:a2')
                  or (source_key = 'article:a2' and target_key = 'article:a'))) then
    raise exception 'L2: an article was linked by meaning inside its own law';
  end if;
  if exists (select 1 from library_graph.edges
              where edge_type = 'SIMILAR_TO' and 'article:copy' in (source_key, target_key)
                and 'article:a' in (source_key, target_key)) then
    raise exception 'L2: a near-copy (>= 0.985) was linked';
  end if;
  if not exists (select 1 from library_graph.edges
                  where edge_type = 'SIMILAR_TO'
                    and 'principle:p1' in (source_key, target_key) and 'principle:p2' in (source_key, target_key)) then
    raise exception 'L2: P1 ↔ P2 (0.9) must be linked';
  end if;
  if exists (select 1 from library_graph.edges
              where edge_type = 'SIMILAR_TO'
                and 'principle:p1' in (source_key, target_key) and 'principle:p3' in (source_key, target_key)) then
    raise exception 'L2: P1 ↔ P3 share a collection and must not be linked';
  end if;
  if exists (select 1 from library_graph.edges e
               join library_graph.nodes s on s.node_key = e.source_key
               join library_graph.nodes t on t.node_key = e.target_key
              where e.edge_type = 'SIMILAR_TO' and s.node_type <> t.node_type) then
    raise exception 'L2: a SIMILAR_TO edge joins two node types';
  end if;

  select * into v_e from library_graph.edges where edge_type = 'REPLACED_BY' and source_key = 'article:old';
  if v_e is null or v_e.target_key <> 'article:new1' or v_e.metadata->>'method' <> 'successor_law' then
    raise exception 'L2: OLD must be REPLACED_BY NEW1 (successor law first, even with OTHER closer): %', to_jsonb(v_e);
  end if;
  if (select count(*) from library_graph.edges where edge_type = 'REPLACED_BY') <> 1 then
    raise exception 'L2: only the repealed article gets a REPLACED_BY';
  end if;

  -- Nothing changed: the next call has nothing to do.
  v_res := public.graph_rag_build_similarity(null, 500, '{}'::jsonb);
  if (v_res->>'processed')::int <> 0 then
    raise exception 'L2: a second call with nothing changed reprocessed: %', v_res;
  end if;
  -- New thresholds: every node is redone; 0.95 drops A ↔ CIV.
  v_res := public.graph_rag_build_similarity(null, 500, '{"article_min": 0.95}'::jsonb);
  if (v_res->>'processed')::int <> 10 then
    raise exception 'L2: a threshold change did not redo every node: %', v_res;
  end if;
  if exists (select 1 from library_graph.edges where edge_type = 'SIMILAR_TO'
              and 'article:a' in (source_key, target_key) and 'article:civ' in (source_key, target_key)) then
    raise exception 'L2: A ↔ CIV survived article_min 0.95';
  end if;
  -- Out-of-range thresholds are ignored (defaults again: A ↔ CIV is back).
  v_res := public.graph_rag_build_similarity(null, 500, '{"article_min": 7, "principle_min": "x"}'::jsonb);
  if not exists (select 1 from library_graph.edges where edge_type = 'SIMILAR_TO'
                  and 'article:a' in (source_key, target_key) and 'article:civ' in (source_key, target_key)) then
    raise exception 'L2: bad thresholds were not ignored: %', v_res;
  end if;
  update library_graph.nodes n set is_embeddable = true
   where n.node_type = 'article'
     and not exists (select 1 from library_graph.node_embeddings e where e.node_key = n.node_key);
  raise notice 'L2 ok — waits for the vectors; SIMILAR_TO across laws only, once per pair, no near-copies; REPLACED_BY prefers the successor law; state skips unchanged nodes';
end $$;

-- L3: retrieve without vectors — SUBJECT_TO, the penalty leg, the terms leg, REPLACED_BY
do $$
declare
  v_res  jsonb;
  v_all  jsonb;
  v_item jsonb;
begin
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, null, 10, 4, 0, 0, true);
  v_all := (v_res->'articles') || (v_res->'principles');
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:s';
  if v_item is null or (v_item->>'hop')::int <> 1 or v_item->>'via_edge_type' <> 'SUBJECT_TO' then
    raise exception 'L3: S must arrive at hop 1 by SUBJECT_TO: %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:pen') then
    raise exception 'L3: the penalty article came without a penalty question: %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'via_edge_type' = 'SIMILAR_TO') then
    raise exception 'L3: a meaning link was walked with no vectors: %', v_all;
  end if;

  v_res := public.graph_rag_retrieve(array['فسخ:*', 'عقوبة:*'], null, null, null, 10, 4, 0, 0, true);
  v_all := (v_res->'articles') || (v_res->'principles');
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:pen';
  if v_item is null or (v_item->>'hop')::int <> 1 or v_item->>'via_edge_type' <> 'PENALIZES' then
    raise exception 'L3: a penalty question must bring the law''s penalty article by PENALIZES: %', v_all;
  end if;

  v_res := public.graph_rag_retrieve(array['فسخ:*', 'شخص:*'], null, null, null, 10, 4, 0, 0, true);
  v_all := (v_res->'articles') || (v_res->'principles');
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:def';
  if v_item is null or v_item->>'via_edge_type' <> 'DEFINES_TERM' or v_item->>'via_from_title' <> 'العامل' then
    raise exception 'L3: the matched term must bring the labour law''s definition article: %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:civdef') then
    raise exception 'L3: a definition from a law outside the results came in: %', v_all;
  end if;
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'kind' = 'term') then
    raise exception 'L3: a term node was returned: %', v_all;
  end if;

  v_res := public.graph_rag_retrieve(array['ملغى:*'], null, null, null, 10, 4, 0, 0, true);
  v_all := v_res->'articles';
  select i into v_item from jsonb_array_elements(v_all) i where i->>'node_key' = 'article:new1';
  if v_item is null or (v_item->>'hop')::int <> 1 or v_item->>'via_edge_type' <> 'REPLACED_BY' then
    raise exception 'L3: the repealed article must lead to its replacement: %', v_all;
  end if;
  raise notice 'L3 ok — SUBJECT_TO hop; penalty leg only on a penalty question; terms leg scoped to the results'' laws; REPLACED_BY';
end $$;

-- L4: with vectors — terms never come from the vector leg; a term matched by meaning brings its definition
do $$
declare
  v_q   text := '[0,-1,0,' || array_to_string(array_fill(0::int, array[765]), ',') || ']';
  v_res jsonb;
  v_all jsonb;
begin
  v_res := public.graph_rag_retrieve(array['فسخ:*'], v_q, null, null, 10, 4, 0, 0, true);
  if (v_res->>'vector_used')::boolean is not true then
    raise exception 'L4: vectors were not used: %', v_res;
  end if;
  v_all := (v_res->'articles') || (v_res->'principles');
  if exists (select 1 from jsonb_array_elements(v_all) i where i->>'kind' = 'term') then
    raise exception 'L4: a term node was returned: %', v_all;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_all) i
                  where i->>'node_key' = 'article:def' and i->>'via_edge_type' = 'DEFINES_TERM') then
    raise exception 'L4: the term matched by meaning did not bring its definition: %', v_all;
  end if;
  raise notice 'L4 ok — vector leg skips terms; terms leg works by meaning';
end $$;

-- L5: not ready → nothing built; the explorer
do $$
declare
  v_ov   jsonb;
  v_hood jsonb;
begin
  v_ov := public.graph_rag_explore_overview();
  if (v_ov->'node_counts'->>'term')::int <> 1 or (v_ov->'origin_counts'->>'auto_similarity')::int < 2 then
    raise exception 'L5: overview misses the term / vector links: %', v_ov;
  end if;
  if exists (select 1 from jsonb_array_elements(v_ov->'top_hubs') h where h->>'node_type' = 'term') then
    raise exception 'L5: a term node is a top hub: %', v_ov->'top_hubs';
  end if;

  v_hood := public.graph_rag_explore_neighborhood('article:def', 2, null, 60);
  if exists (select 1 from jsonb_array_elements(v_hood->'nodes') n where n->>'node_key' = 'article:civdef') then
    raise exception 'L5: hop 2 fanned out through a term node: %', v_hood->'nodes';
  end if;
  raise notice 'L5 ok — explorer counts terms and vector links; terms are not hubs or hop-2 fans';
end $$;

reset role;

do $$
declare
  v_res jsonb;
begin
  update library_graph.sync_state set dirty = true where id = 1;
  delete from library_graph.similarity_state;
  v_res := public.graph_rag_build_similarity(null, 500, '{}'::jsonb);
  if v_res->>'skipped' is distinct from 'graph_not_ready' or (v_res->>'processed')::int <> 0 then
    raise exception 'L6: built on a dirty graph: %', v_res;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_function_privilege('anon', 'public.graph_rag_build_similarity(text, integer, jsonb)', 'EXECUTE') then
    raise exception 'L6: anon can run the builder';
  end if;
  raise notice 'L6 ok — no building while the graph is dirty; service_role only';
end $$;

-- L7: a principle whose nearest vectors are all its own collection still finds
-- its neighbour in another collection (the neighbour scan filters inside the
-- index scan; before, the 100 nearest rows were all its own collection and
-- the filter left nothing). Forced onto the HNSW index.
do $$
declare
  v_res  jsonb;
  v_arr  real[];
  i      int;
begin
  update library_graph.sync_state set dirty = false where id = 1;
  update library_graph.nodes n set is_embeddable = false
   where n.node_type in ('article', 'principle') and n.is_embeddable
     and not exists (select 1 from library_graph.node_embeddings e where e.node_key = n.node_key);
  -- everything already there is current first
  v_res := public.graph_rag_build_similarity(null, 500, '{}'::jsonb);
  if v_res ? 'skipped' then
    raise exception 'L7: setup could not build: %', v_res;
  end if;

  -- 0q (crowd collection) = e4; 150 crowd principles at 0.97 to it; FAR (another
  -- collection) at 0.88. '0q' sorts first, so a one-node page processes it alone.
  insert into library_graph.nodes (node_key, node_type, source_id, collection_id, title, display_text, content_sha256)
  select 'principle:' || k, 'principle', k, c, 'مبدأ ' || k, 'نص ' || k, encode(sha256(convert_to(k, 'UTF8')), 'hex')
    from (select '0q' as k, 'crowd' as c
          union all select 'zfar', 'farcol'
          union all select 'crowd-' || lpad(g::text, 3, '0'), 'crowd' from generate_series(1, 150) g) x;

  for i in 0..151 loop
    v_arr := array_fill(0::real, array[768]);
    if i = 0 then
      v_arr[4] := 1;
    elsif i = 151 then
      v_arr[4] := 0.88; v_arr[5] := 0.475;
    else
      v_arr[4] := 0.97; v_arr[10 + i] := 0.2431;
    end if;
    insert into library_graph.node_embeddings (node_key, model_id, node_type, is_active_corpus, embedding)
    values (case i when 0 then 'principle:0q' when 151 then 'principle:zfar' else 'principle:crowd-' || lpad(i::text, 3, '0') end,
            'gemini-embedding-2-768', 'principle', true,
            ('[' || array_to_string(v_arr, ',') || ']')::extensions.halfvec);
  end loop;

  set local enable_seqscan = off;
  v_res := public.graph_rag_build_similarity(null, 1, '{}'::jsonb);
  if (v_res->>'processed')::int <> 1
     or not exists (select 1 from library_graph.similarity_state where node_key = 'principle:0q') then
    raise exception 'L7: the one-node page did not process 0q: %', v_res;
  end if;
  if not exists (select 1 from library_graph.edges
                  where edge_type = 'SIMILAR_TO' and source_key = 'principle:0q' and target_key = 'principle:zfar') then
    raise exception 'L7: 0q found no neighbour outside its crowded collection: %',
      (select jsonb_agg(to_jsonb(e)) from library_graph.edges e where e.source_key = 'principle:0q');
  end if;
  raise notice 'L7 ok — a crowded collection does not hide the neighbour in another collection';
end $$;
