-- library_graph_rag.test.sql — RLS, privilege lockdown, clean-wipe survival,
-- zero-cost SHA-256 vault relink, hybrid + 1-hop GraphRAG retrieval, and dynamic
-- multi-dimension Partial HNSW index creation (768d -> 3072d) for 20261110_10.
--
-- Run from repo root against pgvector/pgvector:pg16 (or selfhost supabase-db):
--   M=supabase/migrations; PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql \
--     $M/20261110_10_library_graph_rag.sql \
--     supabase/tests/rls/library_graph_rag.test.sql

-- T1: Strict schema, table, and RPC lockdown against `anon` and `authenticated`
do $$
declare
  r  text;
  t  text;
  fn text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_schema_privilege(r, 'library_graph', 'USAGE') then
      raise exception 'T1: % holds USAGE on schema library_graph', r;
    end if;
    foreach t in array array[
      'embedding_models', 'embedding_vault', 'nodes', 'node_embeddings', 'edges', 'sync_state', 'sync_runs'
    ] loop
      if has_table_privilege(r, 'library_graph.' || t, 'SELECT, INSERT, UPDATE, DELETE') then
        raise exception 'T1: % holds privilege on library_graph.%', r, t;
      end if;
    end loop;
    foreach fn in array array[
      'public.graph_rag_status()',
      'public.graph_rag_relink_vault(text)',
      'public.graph_rag_set_default_model(text)',
      'public.graph_rag_upsert_nodes(jsonb, timestamptz)',
      'public.graph_rag_upsert_edges(jsonb, timestamptz)',
      'public.graph_rag_prune_stale(timestamptz)',
      'public.graph_rag_missing_embeddings(text, text, integer)',
      'public.graph_rag_store_embeddings(text, jsonb)',
      'public.graph_rag_sync_control(text, jsonb)',
      'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'
    ] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'T1: % can EXECUTE %', r, fn;
      end if;
    end loop;
  end loop;
  raise notice 'T1 ok — anon and authenticated have zero access to library_graph.* and public.graph_rag_*';
end $$;

-- T2: Seed library + GraphRAG nodes, 768d unit vectors, and EXEMPTS_FROM edge via `service_role`;
--     verify Hybrid + 1-Hop retrieval brings back BOTH primary Art. 77 AND 1-hop exception Art. 80.
insert into library.laws (slug, title, type, section_code)
values ('labor-law', 'نظام العمل', 'نظام', '01')
on conflict (slug) do nothing;

insert into library.articles (id, law_slug, number, text, status)
values
  ('labor-law__art-77', 'labor-law', '77', 'ما لم يتضمن العقد تعويضا محددا مقابل إنهائه من أحد الطرفين لسبب غير مشروع يستحق الطرف المتضرر تعويضا', 'active'),
  ('labor-law__art-80', 'labor-law', '80', 'استثناء من حكم المادة السابعة والسبعين لا يجوز لصاحب العمل فسخ العقد دون مكافأة إلا في حالات محددة', 'active')
on conflict (id) do nothing;

set local role service_role;

do $$
declare
  v_vec_77  text;
  v_vec_80  text;
  v_vec_q   text;
  v_sha_77  text := repeat('a', 64);
  v_sha_80  text := repeat('b', 64);
  v_sha_con text := repeat('c', 64);
  v_res     jsonb;
begin
  -- Construct 768d vectors ([1,0,0...] for Art 77 & query; [0.6,0.8,0...] for Art 80)
  v_vec_77 := '[1,' || array_to_string(array_fill(0::int, array[767]), ',') || ']';
  v_vec_q  := v_vec_77;
  v_vec_80 := '[0.6,0.8,' || array_to_string(array_fill(0::int, array[766]), ',') || ']';

  perform public.graph_rag_upsert_nodes(jsonb_build_array(
    jsonb_build_object(
      'node_key', 'article:labor-law__art-77',
      'node_type', 'article',
      'source_id', 'labor-law__art-77',
      'law_slug', 'labor-law',
      'article_number', 77,
      'doc_status', 'active',
      'item_status', 'active',
      'is_embeddable', true,
      'title', 'نظام العمل — المادة 77',
      'url', '/laws/labor-law#labor-law__art-77',
      'display_text', 'تعويض إنهاء عقد العمل لسبب غير مشروع والفصل التعسفي',
      'contextual_header', 'نظام العمل | الباب الخامس',
      'content_sha256', v_sha_77
    ),
    jsonb_build_object(
      'node_key', 'article:labor-law__art-80',
      'node_type', 'article',
      'source_id', 'labor-law__art-80',
      'law_slug', 'labor-law',
      'article_number', 80,
      'doc_status', 'active',
      'item_status', 'active',
      'is_embeddable', true,
      'title', 'نظام العمل — المادة 80',
      'url', '/laws/labor-law#labor-law__art-80',
      'display_text', 'حالات فسخ العقد دون مكافأة استثناء من المادة 77',
      'contextual_header', 'نظام العمل | الباب الخامس',
      'content_sha256', v_sha_80
    ),
    jsonb_build_object(
      'node_key', 'concept:unfair-dismissal',
      'node_type', 'concept',
      'source_id', 'unfair-dismissal',
      'is_embeddable', true,
      'title', 'الفصل التعسفي وإنهاء خدمات العامل بدون سبب مشروع',
      'url', '',
      'display_text', 'طردوني من الشركة بدون سبب، إنهاء خدمات تعسفي، المادة 77 والمادة 80 نظام العمل',
      'contextual_header', 'مفهوم قانوني سعودي',
      'content_sha256', v_sha_con
    )
  ));

  perform public.graph_rag_upsert_edges(jsonb_build_array(
    jsonb_build_object(
      'source_key', 'article:labor-law__art-80',
      'target_key', 'article:labor-law__art-77',
      'edge_type', 'EXEMPTS_FROM',
      'weight', 1.2,
      'evidence', 'استثناء من حكم المادة السابعة والسبعين'
    ),
    jsonb_build_object(
      'source_key', 'concept:unfair-dismissal',
      'target_key', 'article:labor-law__art-77',
      'edge_type', 'HAS_CONCEPT',
      'weight', 1.1
    )
  ));

  perform public.graph_rag_store_embeddings(
    'gemini-embedding-2-768',
    jsonb_build_array(
      jsonb_build_object('node_key', 'article:labor-law__art-77', 'content_sha256', v_sha_77, 'embedding', v_vec_77),
      jsonb_build_object('node_key', 'article:labor-law__art-80', 'content_sha256', v_sha_80, 'embedding', v_vec_80),
      jsonb_build_object('node_key', 'concept:unfair-dismissal', 'content_sha256', v_sha_con, 'embedding', v_vec_77)
    )
  );

  -- Query with colloquial text (zero FTS match on Art 77's formal wording) + semantic vector!
  v_res := public.graph_rag_retrieve(
    array['طردوني:*'],
    v_vec_q,
    null,
    null,
    5,
    2,
    0,
    0,
    true
  );

  if (v_res->>'ready')::boolean is not true or (v_res->>'vector_used')::boolean is not true then
    raise exception 'T2: graph_rag_retrieve did not activate ready+vector_used: %', v_res;
  end if;
  if jsonb_array_length(v_res->'articles') < 2 then
    raise exception 'T2: expected both primary Art 77 and 1-hop Art 80, got: %', v_res->'articles';
  end if;
  raise notice 'T2 ok — Hybrid + Concept + 1-Hop EXEMPTS_FROM retrieval returned % articles', jsonb_array_length(v_res->'articles');
end $$;

reset role;

-- T3: Exact Clean-Wipe `TRUNCATE` WITHOUT `CASCADE` across all 14 `library.*` tables MUST succeed,
--     mark `library_graph.sync_state.dirty = true`, and preserve `embedding_vault` 100%!
truncate table library.article_amendments, library.article_regulations, library.articles,
  library.chapters, library.laws, library.decree_pages, library.decrees_circulars,
  library.principle_paragraphs, library.principles, library.judicial_collections,
  library.feqh_blocks, library.feqh_sections, library.feqh_chapters, library.feqh_books;

do $$
begin
  if (select dirty from library_graph.sync_state where id = 1) is not true then
    raise exception 'T3: clean-wipe TRUNCATE did not mark sync_state.dirty = true';
  end if;
  if (select count(*) from library_graph.embedding_vault) <> 3 then
    raise exception 'T3: embedding_vault lost vectors during library clean wipe';
  end if;
  raise notice 'T3 ok — clean-wipe TRUNCATE succeeded with zero FK block, marked dirty=true, and kept all 3 vault vectors';
end $$;

-- T4: Simulate Watchdog prune + reload + zero-cost `graph_rag_relink_vault` ($0 API calls!)
set local role service_role;

do $$
declare
  v_relink jsonb;
begin
  delete from library_graph.node_embeddings;
  v_relink := public.graph_rag_relink_vault('gemini-embedding-2-768');
  if (v_relink->>'relinked')::integer <> 3 or (v_relink->>'missing')::integer <> 0 then
    raise exception 'T4: expected 3 relinked and 0 missing from vault, got: %', v_relink;
  end if;
  raise notice 'T4 ok — graph_rag_relink_vault relinked all 3 SHA-256 vectors in SQL with 0 API calls';
end $$;

-- T5: Dynamic Multi-Dimension Switch (`768d` -> `3072d` `openai-3-large-3072` exceeding pgvector's 2000d `vector` limit via `halfvec(3072)`)
do $$
declare
  v_switch jsonb;
begin
  v_switch := public.graph_rag_set_default_model('openai-3-large-3072');
  if to_regclass('library_graph.' || (v_switch->>'hnsw_index')) is null then
    raise exception 'T5: dynamic 3072d Partial HNSW index was not created: %', v_switch;
  end if;
  -- Switch back to default 768d Gemini Embedding 2
  perform public.graph_rag_set_default_model('gemini-embedding-2-768');
  raise notice 'T5 ok — dynamic 3072d halfvec Partial HNSW index created and switched cleanly';
end $$;

reset role;
