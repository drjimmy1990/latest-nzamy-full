-- library_graph_explorer.test.sql — the four read-only explorer RPCs of
-- 20261113_10: lockdown, then each one answers on a tiny graph.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql \
--     supabase/tests/rls/library_graph_explorer.test.sql

-- X1: anon and authenticated cannot call any explorer RPC
do $$
declare
  r  text;
  fn text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach fn in array array[
      'public.graph_rag_explore_overview()',
      'public.graph_rag_explore_search(text, text[], integer)',
      'public.graph_rag_explore_neighborhood(text, integer, text[], integer)',
      'public.graph_rag_explore_node(text)'
    ] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'X1: % can EXECUTE %', r, fn;
      end if;
    end loop;
  end loop;
  raise notice 'X1 ok — explorer RPCs are service_role only';
end $$;

grant usage on schema extensions to service_role;

-- A tiny graph: two articles linked by EXEMPTS_FROM, one concept.
insert into library_graph.nodes (node_key, node_type, source_id, law_slug, article_number, title, display_text, content_sha256)
values
  ('article:labor-law__art-77', 'article', 'labor-law__art-77', 'labor-law', 77, 'نظام العمل — المادة 77',
   'ما لم يتضمن العقد تعويضاً محدداً مقابل إنهائه', repeat('a', 64)),
  ('article:labor-law__art-80', 'article', 'labor-law__art-80', 'labor-law', 80, 'نظام العمل — المادة 80',
   'لا يجوز لصاحب العمل فسخ العقد دون مكافأة', repeat('b', 64)),
  ('concept:termination', 'concept', 'termination', null, null, 'إنهاء العقد', 'إنهاء العقد', repeat('c', 64));
insert into library_graph.edges (source_key, target_key, edge_type, evidence)
values
  ('article:labor-law__art-80', 'article:labor-law__art-77', 'EXEMPTS_FROM', 'استثناء من حكم المادة السابعة والسبعين'),
  ('article:labor-law__art-77', 'concept:termination', 'HAS_CONCEPT', null);

set role service_role;

-- X2: overview, search, neighbourhood and node each answer
do $$
declare
  v jsonb;
begin
  v := public.graph_rag_explore_overview();
  if (v->'node_counts'->>'article')::int <> 2 or (v->'edge_counts'->>'EXEMPTS_FROM')::int <> 1 then
    raise exception 'X2: overview counts wrong: %', v;
  end if;
  if jsonb_array_length(v->'concepts') <> 1 then
    raise exception 'X2: overview concepts wrong: %', v->'concepts';
  end if;

  v := public.graph_rag_explore_search('المادة 80', null, 10);
  if jsonb_array_length(v) < 1 or v->0->>'node_key' <> 'article:labor-law__art-80' then
    raise exception 'X2: search did not rank Art 80 first: %', v;
  end if;
  v := public.graph_rag_explore_search('article:labor-law__art-77', array['article'], 10);
  if v->0->>'node_key' <> 'article:labor-law__art-77' then
    raise exception 'X2: exact key search failed: %', v;
  end if;
  if public.graph_rag_explore_search('   ', null, 10) <> '[]'::jsonb then
    raise exception 'X2: blank search is not empty';
  end if;

  v := public.graph_rag_explore_neighborhood('article:labor-law__art-77', 2, null, 60);
  if (v->>'found')::boolean is not true or jsonb_array_length(v->'nodes') <> 3 or jsonb_array_length(v->'edges') <> 2 then
    raise exception 'X2: neighbourhood wrong: %', v;
  end if;
  v := public.graph_rag_explore_neighborhood('article:nope', 1, null, 60);
  if (v->>'found')::boolean is not false then
    raise exception 'X2: unknown node not reported: %', v;
  end if;

  v := public.graph_rag_explore_node('article:labor-law__art-80');
  if (v->>'found')::boolean is not true or (v->'edge_counts'->'EXEMPTS_FROM'->>'out')::int <> 1 then
    raise exception 'X2: node wrong: %', v;
  end if;
  raise notice 'X2 ok — overview, search, neighbourhood and node answer';
end $$;

reset role;
