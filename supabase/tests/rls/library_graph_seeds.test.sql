-- library_graph_seeds.test.sql — 20261117_10: named articles (seeds) lead the
-- graph answer, are never routed away, and their legal links follow them.
-- No vectors: every non-seed result comes from the keyword leg.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql $M/20261117_10_library_graph_seeds.sql \
--     supabase/tests/rls/library_graph_seeds.test.sql

grant usage on schema extensions to service_role;

do $$
declare
  v_run jsonb;
  v_t   timestamptz;
begin
  v_run := public.graph_rag_sync_control('start_run', '{"trigger_source":"watchdog_test"}'::jsonb);
  v_t := (v_run->>'started_at')::timestamptz;

  perform public.graph_rag_upsert_nodes(jsonb_build_array(
    jsonb_build_object('node_key', 'law:civ', 'node_type', 'law', 'source_id', 'civ', 'law_slug', 'civ',
      'is_embeddable', false, 'title', 'نظام المعاملات المدنية', 'display_text', 'نظام المعاملات المدنية',
      'content_sha256', repeat('1', 64), 'metadata', '{"section_code":"03"}'::jsonb),
    jsonb_build_object('node_key', 'law:adm', 'node_type', 'law', 'source_id', 'adm', 'law_slug', 'adm',
      'is_embeddable', false, 'title', 'نظام إداري', 'display_text', 'نظام إداري',
      'content_sha256', repeat('2', 64), 'metadata', '{"section_code":"02"}'::jsonb),

    -- «فسخ» matches civ1, civ2 and adm1.
    jsonb_build_object('node_key', 'article:civ1', 'node_type', 'article', 'source_id', 'civ1', 'law_slug', 'civ',
      'article_number', 107, 'title', 'المعاملات المدنية — 107', 'display_text', 'فسخ العقد',
      'content_sha256', repeat('3', 64)),
    jsonb_build_object('node_key', 'article:civ2', 'node_type', 'article', 'source_id', 'civ2', 'law_slug', 'civ',
      'article_number', 108, 'title', 'المعاملات المدنية — 108', 'display_text', 'فسخ العقد بالتراضي',
      'content_sha256', repeat('4', 64)),
    jsonb_build_object('node_key', 'article:adm1', 'node_type', 'article', 'source_id', 'adm1', 'law_slug', 'adm',
      'article_number', 5, 'title', 'نظام إداري — 5', 'display_text', 'فسخ العقد الإداري',
      'content_sha256', repeat('5', 64)),
    -- civ3: the named article; no word of the question is in it.
    jsonb_build_object('node_key', 'article:civ3', 'node_type', 'article', 'source_id', 'civ3', 'law_slug', 'civ',
      'article_number', 300, 'title', 'المعاملات المدنية — 300', 'display_text', 'أحكام الكفالة',
      'content_sha256', repeat('6', 64)),
    -- Reached only through civ3: an exception in another section, an interpretation.
    jsonb_build_object('node_key', 'article:exc', 'node_type', 'article', 'source_id', 'exc', 'law_slug', 'adm',
      'article_number', 9, 'title', 'نظام إداري — 9', 'display_text', 'استثناء',
      'content_sha256', repeat('7', 64)),
    jsonb_build_object('node_key', 'principle:pi', 'node_type', 'principle', 'source_id', 'pi', 'collection_id', 'moj',
      'title', 'السوابق القضائية — 1', 'display_text', 'تفسير',
      'content_sha256', repeat('8', 64), 'metadata', '{"track":"ordinary","track_class":"ordinary"}'::jsonb),
    -- adm9: an administrative article no word matches.
    jsonb_build_object('node_key', 'article:adm9', 'node_type', 'article', 'source_id', 'adm9', 'law_slug', 'adm',
      'article_number', 90, 'title', 'نظام إداري — 90', 'display_text', 'مهلة التظلم',
      'content_sha256', repeat('9', 64))
  ), v_t);

  perform public.graph_rag_upsert_edges(jsonb_build_array(
    jsonb_build_object('source_key', 'article:civ3', 'target_key', 'article:exc', 'edge_type', 'EXEMPTS_FROM', 'weight', 1.1),
    jsonb_build_object('source_key', 'principle:pi', 'target_key', 'article:civ3', 'edge_type', 'INTERPRETS_ARTICLE', 'weight', 1.15)
  ), v_t);

  perform public.graph_rag_sync_control('finish_run', jsonb_build_object(
    'run_id', v_run->'run_id', 'started_at', v_run->>'started_at', 'status', 'succeeded'));
  raise notice 'S0 ok — fixture';
end $$;

set role service_role;

-- S1: no seeds — the answer is the search's; nothing is a seed.
do $$
declare
  v_res  jsonb;
  v_keys text[];
begin
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'auto');
  select array_agg(i->>'node_key') into v_keys
    from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i;
  if 'article:civ3' = any (v_keys) or 'article:exc' = any (v_keys) or 'principle:pi' = any (v_keys) then
    raise exception 'S1: civ3 and its links must not come without a seed: %', v_keys;
  end if;
  if (v_res->'routing'->>'seeds')::int <> 0
     or exists (select 1 from jsonb_array_elements(v_res->'articles') i where (i->>'seed')::boolean) then
    raise exception 'S1: no item is a seed: %', v_res;
  end if;
  -- The same with an explicit empty / null seed list.
  if public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'auto', '{}'::text[]) -> 'articles'
     is distinct from v_res->'articles'
     or public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'auto', null) -> 'articles'
     is distinct from v_res->'articles' then
    raise exception 'S1: an empty / null seed list must change nothing';
  end if;
  raise notice 'S1 ok — no seeds, same answer';
end $$;

-- S2: seed civ3 — it leads, its exception and its interpretation follow.
do $$
declare
  v_res   jsonb;
  v_first jsonb;
  v_item  jsonb;
begin
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'auto',
                                            array['article:civ3']);
  v_first := v_res->'articles'->0;
  if v_first->>'node_key' <> 'article:civ3' or (v_first->>'seed')::boolean is not true or (v_first->>'hop')::int <> 0 then
    raise exception 'S2: the seed must lead the articles: %', v_res->'articles';
  end if;
  if (v_res->'routing'->>'seeds')::int <> 1 then
    raise exception 'S2: routing must count one seed: %', v_res->'routing';
  end if;
  select i into v_item from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:exc';
  if v_item is null or v_item->>'via_edge_type' <> 'EXEMPTS_FROM' or (v_item->>'hop')::int <> 1 then
    raise exception 'S2: the seed''s exception (another section) must follow it: %', v_res->'articles';
  end if;
  select i into v_item from jsonb_array_elements(v_res->'principles') i where i->>'node_key' = 'principle:pi';
  if v_item is null or v_item->>'via_edge_type' <> 'INTERPRETS_ARTICLE' then
    raise exception 'S2: the seed''s interpretation must follow it: %', v_res->'principles';
  end if;
  raise notice 'S2 ok — the seed leads; its exception and interpretation follow';
end $$;

-- S3: a seed from another section survives scope 'section'; a non-seed hit of
-- that section does not.
do $$
declare
  v_res  jsonb;
  v_keys text[];
begin
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'section',
                                            array['article:adm9']);
  select array_agg(i->>'node_key') into v_keys from jsonb_array_elements(v_res->'articles') i;
  if v_res->'articles'->0->>'node_key' <> 'article:adm9' then
    raise exception 'S3: the other-section seed must lead even in section scope: %', v_keys;
  end if;
  if 'article:adm1' = any (v_keys) then
    raise exception 'S3: a non-seed administrative hit must still be dropped in section scope: %', v_keys;
  end if;
  if v_res->'routing'->>'section' <> '03' then
    raise exception 'S3: the pinned law still sets the section: %', v_res->'routing';
  end if;
  raise notice 'S3 ok — a seed is never routed away';
end $$;

-- S4: unknown keys, a law node and duplicates are ignored; at most four seeds; order kept.
do $$
declare
  v_res jsonb;
  v_s   numeric[];
begin
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, null, 20, 10, 0, 0, true, 'all',
    array['article:nope', 'law:civ', 'article:adm9', 'article:civ3', 'article:adm9']);
  if (v_res->'routing'->>'seeds')::int <> 2 then
    raise exception 'S4: only the two real article seeds count: %', v_res->'routing';
  end if;
  if v_res->'articles'->0->>'node_key' <> 'article:adm9' or v_res->'articles'->1->>'node_key' <> 'article:civ3' then
    raise exception 'S4: seeds keep the caller''s order, first named first: %', v_res->'articles';
  end if;
  select array_agg((i->>'score')::numeric order by ord) into v_s
    from jsonb_array_elements(v_res->'articles') with ordinality as t(i, ord)
   where ord <= 3;
  if not (v_s[1] > v_s[2] and v_s[2] > v_s[3]) then
    raise exception 'S4: both seeds score above the strongest search result: %', v_s;
  end if;

  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, null, 20, 10, 0, 0, true, 'all',
    array['article:civ1', 'article:civ2', 'article:civ3', 'article:adm1', 'article:adm9', 'article:exc']);
  if (v_res->'routing'->>'seeds')::int <> 4 then
    raise exception 'S4: at most four seeds: %', v_res->'routing';
  end if;
  raise notice 'S4 ok — junk ignored, order kept, four at most';
end $$;

-- S5: no word matches at all — the seed alone still answers, with its links.
do $$
declare
  v_res  jsonb;
  v_keys text[];
begin
  v_res := public.graph_rag_retrieve_scoped(array['زززز:*'], null, null, null, 20, 10, 0, 0, true, 'auto',
                                            array['article:civ3']);
  select array_agg(i->>'node_key') into v_keys
    from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i;
  if not v_keys @> array['article:civ3', 'article:exc', 'principle:pi'] then
    raise exception 'S5: the seed and its links must answer when the search finds nothing: %', v_keys;
  end if;
  -- Hops off: the seed alone.
  v_res := public.graph_rag_retrieve_scoped(array['زززز:*'], null, null, null, 20, 10, 0, 0, false, 'auto',
                                            array['article:civ3']);
  if jsonb_array_length(v_res->'articles') <> 1 or jsonb_array_length(v_res->'principles') <> 0 then
    raise exception 'S5: with hops off only the seed comes back: %', v_res;
  end if;
  raise notice 'S5 ok — a seed answers on its own';
end $$;

-- S6: the nine-argument wrapper is unchanged (no seeds).
do $$
declare
  v_res jsonb;
begin
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true);
  if v_res->'routing'->>'scope' <> 'auto' or (v_res->'routing'->>'seeds')::int <> 0 then
    raise exception 'S6: the wrapper routes with auto and no seeds: %', v_res->'routing';
  end if;
  raise notice 'S6 ok — wrapper unchanged';
end $$;

reset role;

-- S7: grants and one function per name.
do $$
declare
  fn text;
begin
  if to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)') is not null then
    raise exception 'S7: the old ten-argument signature must be gone';
  end if;
  foreach fn in array array[
    'public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])',
    'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'
  ] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'S7: anon / authenticated can run %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'S7: service_role cannot run %', fn;
    end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('graph_rag_retrieve', 'graph_rag_retrieve_scoped')) <> 2 then
    raise exception 'S7: exactly one function per name';
  end if;
  raise notice 'S7 ok — service_role only; one function per name';
end $$;
