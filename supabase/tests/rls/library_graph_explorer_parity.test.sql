-- library_graph_explorer_parity.test.sql — 20261119_10: the explorer's links
-- carry their metadata (owner links, vector-link score and method), meaning
-- links reach hop 2 only when named, and graph_rag_explore_status() answers
-- for service_role only.
--
-- CHAIN (needs pgvector; repo root, Git Bash): the chain of
-- library_owner_links.test.sql up to its fixture, 20261118_10 ONCE, then
-- 20261119_10 TWICE (idempotent), the _verify block, then this file:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_explorer_parity_block.sql
--   sed -n '/^-- >>> verify:library_graph_explorer_parity/,/^-- <<< verify:library_graph_explorer_parity/p' $M/_verify.sql > "$B"
--   PG_IMAGE=pgvector/pgvector:pg16 bash $R/run.sh $R/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_feqh_locator_labels.sql $M/20260729_decree_instrument_taxonomy.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql $M/20261019_40_library_decree_preamble_lock.sql \
--     $M/20261108_10_library_decree_tier_columns_lock.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql $M/20261117_10_library_graph_seeds.sql \
--     $R/prelude_owner_links_graph_fixture.sql $M/20261118_10_library_owner_links.sql \
--     $M/20261119_10_library_graph_explorer_parity.sql $M/20261119_10_library_graph_explorer_parity.sql \
--     "$B" $R/library_graph_explorer_parity.test.sql
-- NEGATIVE CONTROL: the same chain without 20261118_10 → the 20261119_10
-- precondition stops: «apply 20261118_10_library_owner_links.sql first».
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

grant usage on schema extensions to service_role;

-- The fixture's law b → law a link is an owner link. Add a chain for hop 2:
-- a2 cites b1 (hop 1), b1 is similar to c1 (a meaning link at hop 2), and a
-- library-made link that carries no metadata.
insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence, metadata)
values
  ('article:a2', 'article:b1', 'CITES_ARTICLE', 'auto_watchdog', 1.0, 'إحالة', '{}'::jsonb),
  ('article:b1', 'article:c1', 'SIMILAR_TO', 'auto_similarity', 0.91, 'تقارب في المعنى: 0.910',
   '{"sim": 0.9100, "params": "v2;a=0.8", "noise": "x"}'::jsonb),
  ('article:c1', 'article:a1', 'REPLACED_BY', 'auto_similarity', 0.88, 'أقرب مادة',
   '{"sim": 0.8800, "method": "successor_law", "params": "v2"}'::jsonb);

insert into library.laws (slug, title, type, owner_links)
values ('owner-law', 'نظام المالك', 'نظام', '[{"kind": "superseded_by", "name": "نظام ب"}]'::jsonb),
       ('plain-law', 'نظام عادي', 'نظام', null),
       ('empty-law', 'نظام فارغ', 'نظام', '[]'::jsonb);

-- Two passes: a full one that read owner links, then a later embed-only one.
insert into library_graph.sync_runs (started_at, finished_at, status, edges_upserted, details)
values (now() - interval '2 hours', now() - interval '110 minutes', 'succeeded', 7,
        '{"owner_links": {"links": 3, "edges": 1, "notFound": 1}}'::jsonb),
       (now() - interval '1 hour', now() - interval '50 minutes', 'succeeded', 0,
        '{"embed_only": true}'::jsonb);

-- One similarity state under the default model (the fixture's are 'test-model').
update library_graph.similarity_state set model_id = 'gemini-embedding-2-768' where node_key = 'article:b1';

-- T1: privileges.
do $$
declare f text; r text;
begin
  foreach f in array array['public.graph_rag_explore_status()',
                           'public.graph_rag_explore_neighborhood(text, integer, text[], integer)'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'T1 FAIL: % can execute %', r, f;
      end if;
    end loop;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'T1 FAIL: service_role cannot execute %', f;
    end if;
  end loop;
  raise notice 'T1 ok: service_role only';
end $$;

set role service_role;

-- T2: an owner link says so; a library-made link carries an empty object.
do $$
declare v jsonb; e jsonb;
begin
  v := public.graph_rag_explore_neighborhood('law:b', 1, null, 60);
  select x into e from jsonb_array_elements(v->'edges') x where x->>'target' = 'law:a';
  if e is null or e->'metadata' <> '{"source": "owner_links"}'::jsonb then
    raise exception 'T2 FAIL (owner link): %', e;
  end if;
  v := public.graph_rag_explore_neighborhood('article:a2', 1, null, 60);
  select x into e from jsonb_array_elements(v->'edges') x where x->>'edge_type' = 'CITES_ARTICLE';
  if e is null or e->'metadata' <> '{}'::jsonb then
    raise exception 'T2 FAIL (plain link): %', e;
  end if;
  raise notice 'T2 ok: link metadata = source only for owner links, {} otherwise';
end $$;

-- T3: meaning links reach hop 2 only when the types are named; their score
-- and method come through, other keys (params, noise) do not.
do $$
declare v jsonb; e jsonb;
begin
  v := public.graph_rag_explore_neighborhood('article:a2', 2, null, 60);
  if exists (select 1 from jsonb_array_elements(v->'edges') x where x->>'edge_type' = 'SIMILAR_TO') then
    raise exception 'T3 FAIL: SIMILAR_TO at hop 2 with no types named: %', v->'edges';
  end if;
  v := public.graph_rag_explore_neighborhood('article:a2', 2,
         array['CITES_ARTICLE', 'SIMILAR_TO', 'REPLACED_BY', 'DEFINES_TERM'], 60);
  select x into e from jsonb_array_elements(v->'edges') x where x->>'edge_type' = 'SIMILAR_TO';
  if e is null or (e->>'hop')::int <> 2 or e->'metadata' <> '{"sim": 0.9100}'::jsonb then
    raise exception 'T3 FAIL (named similar): %', v->'edges';
  end if;
  v := public.graph_rag_explore_neighborhood('article:c1', 1, null, 60);
  select x into e from jsonb_array_elements(v->'edges') x where x->>'edge_type' = 'REPLACED_BY';
  if e is null or e->'metadata' <> '{"sim": 0.8800, "method": "successor_law"}'::jsonb then
    raise exception 'T3 FAIL (replaced): %', e;
  end if;
  raise notice 'T3 ok: meaning links only when named; sim/method whitelisted';
end $$;

-- T4: the status answers, as service_role.
do $$
declare v jsonb;
begin
  v := public.graph_rag_explore_status();
  if v->>'default_model_id' <> 'gemini-embedding-2-768' then
    raise exception 'T4 FAIL (model): %', v;
  end if;
  -- The library.laws insert above marked the graph dirty (its trigger): shown as is.
  if (v->'sync'->>'dirty')::boolean is distinct from true or not (v->'sync'->'dirty_tables') ? 'laws'
     or v->'sync'->>'last_sync_status' <> 'succeeded' or v->'sync'->>'last_synced_at' is null then
    raise exception 'T4 FAIL (sync): %', v->'sync';
  end if;
  if v->'running_run' <> 'null'::jsonb then
    raise exception 'T4 FAIL (running): %', v->'running_run';
  end if;
  if (v->'last_run'->>'embed_only')::boolean is distinct from true then
    raise exception 'T4 FAIL (last run is the embed-only one): %', v->'last_run';
  end if;
  if v->'owner_links_run'->'stats' <> '{"links": 3, "edges": 1, "notFound": 1}'::jsonb then
    raise exception 'T4 FAIL (owner run skips the embed-only pass): %', v->'owner_links_run';
  end if;
  if (v->'owner_links'->>'laws')::int <> 1 or (v->'owner_links'->>'decrees')::int <> 0
     or v->'owner_links'->'edges' <> '{"SUPERSEDES_LAW": 1}'::jsonb then
    raise exception 'T4 FAIL (owner links): %', v->'owner_links';
  end if;
  if (v->'similarity'->>'done')::int <> 1 or (v->'similarity'->>'repealed_done')::int <> 0
     or v->'similarity'->>'last_computed_at' is null or jsonb_typeof(v->'similarity'->'with_vector') <> 'number' then
    raise exception 'T4 FAIL (similarity): %', v->'similarity';
  end if;
  if (v->>'replacement_pairs')::int <> (select count(*) from library_graph.replacement_pairs) then
    raise exception 'T4 FAIL (pairs): %', v->>'replacement_pairs';
  end if;
  raise notice 'T4 ok: status = sync, passes, owner links, vector links, pairs';
end $$;

-- T5: a running pass shows.
reset role;
insert into library_graph.sync_runs (status) values ('running');
set role service_role;
do $$
declare v jsonb;
begin
  v := public.graph_rag_explore_status();
  if v->'running_run'->>'started_at' is null then
    raise exception 'T5 FAIL: %', v->'running_run';
  end if;
  raise notice 'T5 ok: the running pass shows';
end $$;
reset role;

select 'library_graph_explorer_parity: ALL OK' as result;
