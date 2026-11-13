-- library_graph_rag.test.sql — lockdown, readiness, hybrid + 1-hop retrieval,
-- clean-wipe survival, vault relink, prune guard, unchanged-row upserts,
-- abandon_running, the never-failing dirty trigger and the multi-dimension
-- switch for 20261110_10 + 20261114_10.
--
-- Needs pgvector, so run it on the pgvector image (repo root, Git Bash):
--   M=supabase/migrations
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261114_10_library_graph_rag_fixes.sql \
--     supabase/tests/rls/library_graph_rag.test.sql
-- (article_regulations is the 14th table the dirty triggers and the wipe cover.)

-- T1: anon and authenticated reach nothing in library_graph or public.graph_rag_*
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
  raise notice 'T1 ok — anon and authenticated have zero access';
end $$;

-- Supabase grants USAGE on schema extensions to its API roles (halfvec lives
-- there); the bare pgvector image does not.
grant usage on schema extensions to service_role;

-- Library rows (as the loader would write them).
insert into library.laws (slug, title, type, section_code)
values ('labor-law', 'نظام العمل', 'نظام', '01');
insert into library.articles (id, law_slug, number, text, status)
values
  ('labor-law__art-77', 'labor-law', '77', 'ما لم يتضمن العقد تعويضا محددا مقابل إنهائه يستحق الطرف المتضرر تعويضا', 'active'),
  ('labor-law__art-80', 'labor-law', '80', 'استثناء من حكم المادة السابعة والسبعين لا يجوز لصاحب العمل فسخ العقد دون مكافأة', 'active');

-- Everything below runs as service_role, the only role the graph RPCs serve
-- (session-level SET ROLE: SET LOCAL outside a transaction does nothing).
set role service_role;

-- T2: store + retrieve, gated on a finished sync
do $$
declare
  v_q      text := '[1,' || array_to_string(array_fill(0::int, array[767]), ',') || ']';
  -- cosine 0.3 with the query: under the 0.42 primary cut, so Art 80 can only arrive by the hop
  v_80     text := '[0.3,0.9539392,' || array_to_string(array_fill(0::int, array[766]), ',') || ']';
  v_run    jsonb;
  v_res    jsonb;
  v_stored integer;
  v_80hit  jsonb;
begin
  if current_user <> 'service_role' then
    raise exception 'T2: expected to run as service_role, running as %', current_user;
  end if;

  v_run := public.graph_rag_sync_control('start_run', '{"trigger_source":"test"}'::jsonb);

  perform public.graph_rag_upsert_nodes(jsonb_build_array(
    jsonb_build_object('node_key', 'article:labor-law__art-77', 'node_type', 'article', 'source_id', 'labor-law__art-77',
      'law_slug', 'labor-law', 'article_number', 77, 'doc_status', 'active', 'item_status', 'active', 'is_embeddable', true,
      'title', 'نظام العمل — المادة 77', 'url', '/laws/labor-law#labor-law__art-77',
      'display_text', 'تعويض إنهاء عقد العمل لسبب غير مشروع', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('a', 64)),
    jsonb_build_object('node_key', 'article:labor-law__art-80', 'node_type', 'article', 'source_id', 'labor-law__art-80',
      'law_slug', 'labor-law', 'article_number', 80, 'doc_status', 'active', 'item_status', 'active', 'is_embeddable', true,
      'title', 'نظام العمل — المادة 80', 'url', '/laws/labor-law#labor-law__art-80',
      'display_text', 'حالات فسخ العقد دون مكافأة', 'contextual_header', 'نظام العمل', 'content_sha256', repeat('b', 64)),
    jsonb_build_object('node_key', 'concept:unfair-dismissal', 'node_type', 'concept', 'source_id', 'unfair-dismissal',
      'is_embeddable', true, 'title', 'الفصل التعسفي', 'url', '',
      'display_text', 'طردوني من الشركة بدون سبب إنهاء خدمات تعسفي', 'contextual_header', 'مفهوم قانوني', 'content_sha256', repeat('c', 64))
  ), (v_run->>'started_at')::timestamptz);

  perform public.graph_rag_upsert_edges(jsonb_build_array(
    jsonb_build_object('source_key', 'article:labor-law__art-80', 'target_key', 'article:labor-law__art-77',
      'edge_type', 'EXEMPTS_FROM', 'weight', 1.2, 'evidence', 'استثناء من حكم المادة السابعة والسبعين'),
    jsonb_build_object('source_key', 'concept:unfair-dismissal', 'target_key', 'article:labor-law__art-77',
      'edge_type', 'HAS_CONCEPT', 'weight', 1.1)
  ), (v_run->>'started_at')::timestamptz);

  -- 20261114_10 #1: vector_dims(halfvec) — every vector is stored (was 0: halfvec_dims does not exist).
  v_stored := public.graph_rag_store_embeddings('gemini-embedding-2-768', jsonb_build_array(
    jsonb_build_object('node_key', 'article:labor-law__art-77', 'content_sha256', repeat('a', 64), 'embedding', v_q),
    jsonb_build_object('node_key', 'article:labor-law__art-80', 'content_sha256', repeat('b', 64), 'embedding', v_80),
    jsonb_build_object('node_key', 'concept:unfair-dismissal', 'content_sha256', repeat('c', 64), 'embedding', v_q)
  ));
  if v_stored <> 3 then
    raise exception 'T2: expected 3 stored vectors, got %', v_stored;
  end if;

  -- 20261114_10 #2: nodes exist but no pass has finished → not ready.
  v_res := public.graph_rag_retrieve(array['طردوني:*'], v_q, null, null, 5, 2, 0, 0, true);
  if (v_res->>'ready')::boolean is not false then
    raise exception 'T2: ready before any finished sync: %', v_res;
  end if;

  perform public.graph_rag_sync_control('finish_run', jsonb_build_object(
    'run_id', v_run->'run_id', 'started_at', v_run->>'started_at', 'status', 'succeeded'));

  v_res := public.graph_rag_retrieve(array['طردوني:*'], v_q, null, null, 5, 2, 0, 0, true);
  if (v_res->>'ready')::boolean is not true or (v_res->>'vector_used')::boolean is not true then
    raise exception 'T2: expected ready + vector_used after a finished sync: %', v_res;
  end if;
  if not exists (select 1 from jsonb_array_elements(v_res->'articles') a where a->>'id' = 'labor-law__art-77') then
    raise exception 'T2: Art 77 (vector + concept) missing: %', v_res->'articles';
  end if;
  select a into v_80hit from jsonb_array_elements(v_res->'articles') a where a->>'id' = 'labor-law__art-80';
  if v_80hit is null or v_80hit->>'via_edge_type' is distinct from 'EXEMPTS_FROM' then
    raise exception 'T2: Art 80 must arrive by the EXEMPTS_FROM hop, got: %', v_80hit;
  end if;
  raise notice 'T2 ok — not ready before a finished sync; then vector + concept + EXEMPTS_FROM hop';
end $$;

reset role;

-- T3: a library write makes the graph not ready until the next pass
insert into library.laws (slug, title, type, section_code) values ('labor-law-2', 'نظام آخر', 'نظام', '02');
set role service_role;
do $$
declare
  v_q   text := '[1,' || array_to_string(array_fill(0::int, array[767]), ',') || ']';
  v_res jsonb;
begin
  if (select dirty from library_graph.sync_state where id = 1) is not true then
    raise exception 'T3: a library insert did not mark dirty';
  end if;
  v_res := public.graph_rag_retrieve(array['طردوني:*'], v_q, null, null, 5, 2, 0, 0, true);
  if (v_res->>'ready')::boolean is not false then
    raise exception 'T3: still ready after a library write: %', v_res;
  end if;
  raise notice 'T3 ok — a library write turns the graph off until the next pass';
end $$;
reset role;

-- T4: the clean wipe (TRUNCATE without CASCADE on all 14 tables) works, marks dirty, keeps the vault
update library_graph.sync_state set dirty = false, dirty_tables = '{}' where id = 1;
truncate table library.article_amendments, library.article_regulations, library.articles,
  library.chapters, library.laws, library.decree_pages, library.decrees_circulars,
  library.principle_paragraphs, library.principles, library.judicial_collections,
  library.feqh_blocks, library.feqh_sections, library.feqh_chapters, library.feqh_books;
do $$
begin
  if (select dirty from library_graph.sync_state where id = 1) is not true
     or not exists (select 1 from library_graph.sync_state where id = 1 and 'laws' = any (dirty_tables)) then
    raise exception 'T4: TRUNCATE did not mark dirty with its table';
  end if;
  if (select count(*) from library_graph.embedding_vault) <> 3 then
    raise exception 'T4: the vault lost vectors in the wipe';
  end if;
  raise notice 'T4 ok — clean wipe works, marks dirty, keeps the 3 vault vectors';
end $$;

set role service_role;

-- T5: prune does nothing after a pass the library changed under (the wipe above)
do $$
declare
  v_prune jsonb;
begin
  -- A pass that started just before the wipe: every node is older than it, so an
  -- unguarded prune would delete all three.
  v_prune := public.graph_rag_prune_stale(
    (select last_write_at from library_graph.sync_state where id = 1) - interval '1 millisecond');
  if (v_prune->>'skipped')::boolean is not true or (select count(*) from library_graph.nodes) <> 3 then
    raise exception 'T5: prune ran after a mid-pass library write: % (nodes %)', v_prune, (select count(*) from library_graph.nodes);
  end if;
  raise notice 'T5 ok — prune skipped, all 3 nodes kept';
end $$;

-- T6: relink only rewrites changed vectors; status counts missing vectors exactly
do $$
declare
  v_relink jsonb;
  v_status jsonb;
begin
  delete from library_graph.node_embeddings;
  v_relink := public.graph_rag_relink_vault('gemini-embedding-2-768');
  if (v_relink->>'relinked')::integer <> 3 or (v_relink->>'missing')::integer <> 0 then
    raise exception 'T6: expected 3 relinked, 0 missing: %', v_relink;
  end if;
  v_relink := public.graph_rag_relink_vault('gemini-embedding-2-768');
  if (v_relink->>'relinked')::integer <> 0 then
    raise exception 'T6: a second relink rewrote unchanged vectors: %', v_relink;
  end if;

  -- a repealed node: its vector is not "active", yet it is not missing either
  update library_graph.nodes set item_status = 'repealed' where node_key = 'article:labor-law__art-80';
  perform public.graph_rag_relink_vault('gemini-embedding-2-768');
  v_status := public.graph_rag_status();
  if (v_status->>'missing_vectors')::integer <> 0 then
    raise exception 'T6: a repealed node with a vector counted as missing: %', v_status->'missing_vectors';
  end if;
  delete from library_graph.node_embeddings where node_key = 'concept:unfair-dismissal';
  v_status := public.graph_rag_status();
  if (v_status->>'missing_vectors')::integer <> 1 then
    raise exception 'T6: expected 1 missing vector, got %', v_status->'missing_vectors';
  end if;
  raise notice 'T6 ok — relink skips unchanged vectors; missing_vectors ignores repeal';
end $$;

-- T7: an unchanged node is not rewritten, but is stamped so prune keeps it
do $$
declare
  v_touch   timestamptz := now() + interval '2 hours';
  v_changed integer;
  v_row     jsonb;
begin
  select jsonb_build_object('node_key', node_key, 'node_type', node_type, 'source_id', source_id, 'law_slug', law_slug,
           'article_number', article_number, 'doc_status', doc_status, 'item_status', item_status,
           'is_page_numbered', is_page_numbered, 'is_embeddable', is_embeddable, 'title', title, 'url', url,
           'display_text', display_text, 'contextual_header', contextual_header, 'content_sha256', content_sha256,
           'metadata', metadata)
    into v_row
    from library_graph.nodes where node_key = 'article:labor-law__art-77';
  v_changed := public.graph_rag_upsert_nodes(jsonb_build_array(v_row), v_touch);
  if v_changed <> 0 then
    raise exception 'T7: an unchanged node was rewritten (% rows)', v_changed;
  end if;
  if (select updated_at from library_graph.nodes where node_key = 'article:labor-law__art-77') <> v_touch then
    raise exception 'T7: the unchanged node was not stamped with the pass time';
  end if;
  v_changed := public.graph_rag_upsert_nodes(jsonb_build_array(v_row || '{"title":"نظام العمل — المادة 77 (معدلة)"}'::jsonb), v_touch);
  if v_changed <> 1 then
    raise exception 'T7: a changed node was not rewritten';
  end if;
  raise notice 'T7 ok — unchanged rows stamped only, changed rows rewritten';
end $$;

-- T8: abandon_running clears a run a killed watchdog left behind
do $$
declare
  v_run jsonb;
  v_out jsonb;
begin
  v_run := public.graph_rag_sync_control('start_run', '{"trigger_source":"test"}'::jsonb);
  if (public.graph_rag_sync_control('start_run', '{}'::jsonb)->>'ok')::boolean is not false then
    raise exception 'T8: a second start_run was allowed while one is running';
  end if;
  v_out := public.graph_rag_sync_control('abandon_running', '{}'::jsonb);
  if (v_out->>'abandoned')::integer <> 1
     or (select status from library_graph.sync_runs where id = (v_run->>'run_id')::bigint) <> 'failed' then
    raise exception 'T8: abandon_running did not fail the stuck run: %', v_out;
  end if;
  if (public.graph_rag_sync_control('start_run', '{}'::jsonb)->>'ok')::boolean is not true then
    raise exception 'T8: start_run still blocked after abandon_running';
  end if;
  perform public.graph_rag_sync_control('abandon_running', '{}'::jsonb);
  raise notice 'T8 ok — abandon_running unblocks start_run at once';
end $$;

-- T9: the 768 → 3072 dimension switch builds its partial HNSW index
do $$
declare
  v_switch jsonb;
begin
  v_switch := public.graph_rag_set_default_model('openai-3-large-3072');
  if to_regclass('library_graph.' || (v_switch->>'hnsw_index')) is null then
    raise exception 'T9: the 3072d partial HNSW index was not created: %', v_switch;
  end if;
  perform public.graph_rag_set_default_model('gemini-embedding-2-768');
  raise notice 'T9 ok — 3072d halfvec index created and switched back';
end $$;

reset role;

-- T10: a broken graph bookkeeping table never undoes a library write
-- (a constraint every row update violates: the trigger's upsert errors inside it)
alter table library_graph.sync_state add constraint t10_block check (false) not valid;
insert into library.laws (slug, title, type, section_code) values ('still-written', 'نظام يكتب رغم العطل', 'نظام', '03');
alter table library_graph.sync_state drop constraint t10_block;
do $$
begin
  if not exists (select 1 from library.laws where slug = 'still-written') then
    raise exception 'T10: the library write was lost';
  end if;
  raise notice 'T10 ok — the dirty trigger failed softly and the library write stood';
end $$;
